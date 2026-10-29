<?php

use App\Enums\BoardTemplate;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\AccessGrant;
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Support\Facades\DB;

/*
| Доступ через папки и несколько ролей (docs/adr/0024-rights-2.md, П2d-1): выдача на папку действует на всё внутри,
| включая созданное позже; дерево — из итоговых прав; «Доступ…» узла; инвариант «есть кто лично управляет доступом» —
| и через папку; «Переместить в…» показывает, кто получит и кто потеряет доступ, и отказывает, если пространство
| останется без управляющего; приглашение и передача доступа — с папками. Матрица маршрутов с источником «через
| папку» — AccessMatrixTest, «Доступ…» в админке — AdminAccessMatrixTest.
*/

beforeEach(function () {
    $this->admin = admin();
    $this->product = makeFolder('Продукт');
    $this->web = makeFolder('Веб', $this->product);
    $this->dev = space(['key' => 'DEV', 'name' => 'Разработка']);
    $this->front = space(['key' => 'FRONT', 'name' => 'Фронтенд']);
    $this->ops = space(['key' => 'OPS', 'name' => 'Эксплуатация']);
    placeIn(nodeOf($this->dev), $this->product);
    placeIn(nodeOf($this->front), $this->web);
    // Личный администратор у каждого пространства (инвариант)
    $this->anna = member(['name' => 'Анна']);
    foreach ([$this->dev, $this->front, $this->ops] as $space) {
        addToSpace($space, $this->anna, SpaceRole::Admin);
    }
});

describe('наследование', function () {
    it('выдача на папку — доступ ко всему внутри, в том числе к пространству, созданному позже', function () {
        $boris = member();
        grantAccess($this->product, $boris, StandardRole::Editor);

        $resolver = app(AccessResolver::class);
        expect($resolver->forSpace($boris, $this->dev)->allows(Permission::CardUpdate))->toBeTrue()
            ->and($resolver->forSpace($boris, $this->front)->isMember())->toBeTrue()
            ->and($resolver->forSpace($boris, $this->ops)->isMember())->toBeFalse();

        // Новое пространство в папке — сразу доступно
        $this->actingAs($this->admin)->postJson(adminPath().'spaces', [
            'name' => 'Новое', 'key' => 'NEWS', 'parent_id' => $this->web->id, 'admin_ids' => [$this->anna->id],
        ])->assertCreated();
        $this->actingAs($boris)->getJson('/api/v1/spaces/NEWS')->assertOk()->assertJsonPath('data.my_role', 'editor');
        $this->actingAs($boris)->getJson('/api/v1/spaces/OPS')->assertNotFound();
    });

    it('несколько ролей у одного субъекта — каждая своим источником; «через папку» в «Людях» с названием папки', function () {
        $boris = member(['name' => 'Борис']);
        grantAccess($this->product, $boris, StandardRole::Commenter);
        grantAccess($this->dev, $boris, StandardRole::EditorOwnCards);
        $analysts = addToGroup(makeGroup(['name' => 'Аналитики']), $boris);
        grantAccess($this->web, $analysts, StandardRole::Editor);

        $people = collect($this->actingAs($this->anna)->getJson('/api/v1/spaces/FRONT/members')->assertOk()->json('data'))->keyBy('user.name');
        expect($people['Борис']['personal'])->toBeNull()
            ->and($people['Борис']['sources'])->toBe([
                ['type' => 'personal', 'group' => null, 'folder' => ['id' => $this->product->id, 'name' => 'Продукт'], 'roles' => ['commenter']],
                ['type' => 'group', 'group' => ['id' => $analysts->id, 'name' => 'Аналитики'], 'folder' => ['id' => $this->web->id, 'name' => 'Веб'], 'roles' => ['editor']],
            ]);

        $people = collect($this->actingAs($this->anna)->getJson('/api/v1/spaces/DEV/members')->assertOk()->json('data'))->keyBy('user.name');
        expect($people['Борис']['personal']['roles'])->toBe(['editor_own'])
            ->and($people['Борис']['sources'])->toBe([
                ['type' => 'personal', 'group' => null, 'folder' => null, 'roles' => ['editor_own']],
                ['type' => 'personal', 'group' => null, 'folder' => ['id' => $this->product->id, 'name' => 'Продукт'], 'roles' => ['commenter']],
            ]);

        // «Группы» пространства — и унаследованные с папок, с пометкой (меняются на папке)
        $this->actingAs($this->anna)->getJson('/api/v1/spaces/FRONT/groups')->assertOk()
            ->assertJsonPath('data.0.group.name', 'Аналитики')
            ->assertJsonPath('data.0.roles', ['editor'])
            ->assertJsonPath('data.0.inherited_from', ['id' => $this->web->id, 'name' => 'Веб']);
        $this->actingAs($this->anna)->patchJson("/api/v1/spaces/FRONT/groups/{$analysts->id}", ['roles' => ['commenter']])->assertNotFound();
    });
});

describe('дерево из итоговых прав', function () {
    it('папка с правом видна и пустая; папки над ней — путь к ней; чужие папки — не видны', function () {
        $empty = makeFolder('Пустая с доступом', makeFolder('Над пустой'));
        makeFolder('Секретная-папка');
        $boris = member();
        grantAccess($empty, $boris, StandardRole::Commenter);

        $tree = flatTree(navItems($this->actingAs($boris)->getJson('/api/v1/navigation')));
        expect($tree)->toBe(['[Над пустой]', '  [Пустая с доступом]'])
            ->and($this->getJson('/api/v1/navigation')->getContent())->not->toContain('Секретная-папка')->not->toContain('Продукт');
    });

    it('выдача на папку открывает её поддерево; «доступно всем» — и через папку', function () {
        $boris = member();
        grantAccess($this->product, $boris, StandardRole::Commenter);
        grantAccess($this->product, Group::everyone(company()), StandardRole::Commenter);

        $items = navItems($this->actingAs($boris)->getJson('/api/v1/navigation'));
        // Порядок — по позициям: «Веб» создана в «Продукте» раньше, чем туда положили DEV
        expect(flatTree($items))->toBe(['[Продукт]', '  [Веб]', '    FRONT', '  DEV'])
            ->and($items[0]['everyone'])->toBeTrue()
            ->and($items[0]['children'][1]['everyone'])->toBeTrue()
            ->and($items[0]['children'][1]['can_manage'])->toBeFalse();

        // Администратор через папку — управляет пространствами внутри
        grantAccess($this->web, $boris, StandardRole::Admin);
        $items = navItems($this->getJson('/api/v1/navigation'));
        expect($items[0]['children'][0]['children'][0]['can_manage'])->toBeTrue()
            ->and($items[0]['children'][1]['can_manage'])->toBeFalse();
    });

    it('число запросов дерева и доски не зависит от числа папок с выдачами и глубины', function () {
        $boris = member();
        $board = makeBoard($this->front, $this->anna, BoardTemplate::Simple);
        grantAccess($this->product, $boris, StandardRole::Editor);
        $count = function (string $uri) use ($boris) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($boris)->getJson($uri)->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $count('/api/v1/navigation');
        [$tree, $boardQueries] = [$count('/api/v1/navigation'), $count("/api/v1/boards/{$board->id}")];
        foreach (range(1, 4) as $i) {
            $folder = makeFolder("Ещё {$i}", makeFolder("Верх {$i}"));
            placeIn(nodeOf(tap(space(), fn (Space $s) => addToSpace($s, $this->anna, SpaceRole::Admin))), $folder);
            grantAccess($folder, $boris, StandardRole::Commenter);
            grantAccess($this->web, addToGroup(makeGroup(), $boris), StandardRole::Editor);
        }

        expect($count('/api/v1/navigation'))->toBe($tree)
            ->and($count("/api/v1/boards/{$board->id}"))->toBe($boardQueries);
    });
});

describe('«Доступ…» папки и пространства (админка)', function () {
    it('выдачи на узел и унаследованные с папок выше — с папкой; человеку и группе — несколько ролей', function () {
        $boris = member(['name' => 'Борис']);
        $group = makeGroup(['name' => 'Дизайнеры']);
        $this->actingAs($this->admin);

        $this->putJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$boris->id}", ['roles' => ['commenter', 'editor_own']])
            ->assertOk()
            ->assertJsonPath('data.node', ['id' => $this->product->id, 'type' => 'folder', 'name' => 'Продукт', 'space' => null])
            ->assertJsonPath('data.grants.0.user.name', 'Борис')
            ->assertJsonPath('data.grants.0.roles', ['commenter', 'editor_own'])
            ->assertJsonPath('data.grants.0.inherited_from', null);
        $this->putJson(adminPath()."nav-nodes/{$this->web->id}/access/groups/{$group->id}", ['roles' => ['editor']])->assertOk();

        $grants = $this->getJson(adminPath().'nav-nodes/'.nodeOf($this->front)->id.'/access')->assertOk()->json('data.grants');
        expect(collect($grants)->map(fn (array $g) => [$g['user']['name'] ?? $g['group']['name'], $g['roles'], $g['inherited_from']['name'] ?? null])->all())
            ->toBe([
                ['Анна', ['admin'], null],
                ['Дизайнеры', ['editor'], 'Веб'],
                ['Борис', ['commenter', 'editor_own'], 'Продукт'],
            ]);

        // Снять — все роли субъекта на узле; журнал папки — без ПДн и названий
        $this->deleteJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$boris->id}")->assertNoContent();
        $this->deleteJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$boris->id}")->assertNotFound();
        expect(EventLogEntry::query()->where('event_type', 'like', 'folder.access_%')->orderBy('id')->get()
            ->map(fn (EventLogEntry $e) => [$e->event_type, $e->subject_id, $e->payload])->all())
            ->toEqual([
                ['folder.access_granted', $this->product->id, ['user_id' => $boris->id, 'roles' => ['commenter', 'editor_own'], 'via' => 'admin_panel']],
                ['folder.access_granted', $this->web->id, ['group_id' => $group->id, 'roles' => ['editor'], 'via' => 'admin_panel']],
                ['folder.access_revoked', $this->product->id, ['user_id' => $boris->id, 'roles' => ['commenter', 'editor_own'], 'via' => 'admin_panel']],
            ]);
        expectNoPersonalDataInEventLog();
    });

    it('проверяет роли; деактивированного и человека другой компании не выдать; «Все сотрудники» — без «Администратора»', function () {
        $this->actingAs($this->admin);
        $url = fn (string $what) => adminPath()."nav-nodes/{$this->product->id}/access/{$what}";

        $this->putJson($url('users/'.member()->id), ['roles' => []])->assertJsonValidationErrors('roles');
        $this->putJson($url('users/'.member()->id), ['roles' => ['owner']])->assertJsonValidationErrors('roles.0');
        $this->putJson($url('users/'.member(['status' => 'deactivated'])->id), ['roles' => ['editor']])
            ->assertJsonValidationErrors(['user_id' => __('selen.spaces.member_deactivated')]);
        $this->putJson($url('users/'.member(company: otherCompany())->id), ['roles' => ['editor']])->assertNotFound();
        $this->putJson($url('groups/'.Group::everyone(company())->id), ['roles' => ['admin']])
            ->assertJsonValidationErrors(['roles' => __('selen.groups.system_not_admin')]);
    });

    it('удаление пустой папки снимает выдачи на неё — событием', function () {
        $empty = makeFolder('Пустая');
        grantAccess($empty, $boris = member(), StandardRole::Editor);
        $this->actingAs($this->admin)->deleteJson(adminPath()."folders/{$empty->id}")->assertOk();

        expect(AccessGrant::query()->where('user_id', $boris->id)->exists())->toBeFalse()
            ->and(EventLogEntry::query()->where('event_type', 'folder.access_revoked')->sole()->payload)
            ->toEqual(['user_id' => $boris->id, 'roles' => ['editor'], 'via' => 'folder_deleted']);
    });
});

describe('инвариант «есть кто лично управляет доступом» (план 1.6, В19)', function () {
    it('администратор через папку — личный управляющий: последнего на пространстве можно снять, папочного — нет', function () {
        $folderAdmin = member();
        grantAccess($this->product, $folderAdmin, StandardRole::Admin);
        $this->actingAs($this->admin);

        // У DEV и FRONT есть управляющий через папку — Анну на пространствах можно снять
        $this->deleteJson(adminPath().'nav-nodes/'.nodeOf($this->dev)->id."/access/users/{$this->anna->id}")->assertNoContent();
        $this->deleteJson(adminPath().'nav-nodes/'.nodeOf($this->front)->id."/access/users/{$this->anna->id}")->assertNoContent();

        // Теперь папочный администратор — единственный для DEV и FRONT: снять или понизить — 422 со списком
        $this->deleteJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$folderAdmin->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['roles' => __('selen.access.unmanaged', ['spaces' => '«Разработка», «Фронтенд»'])]);
        $this->putJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$folderAdmin->id}", ['roles' => ['editor']])
            ->assertUnprocessable();
        // Администратор через группу — дополнительный, личного не заменяет
        grantAccess($this->product, addToGroup(makeGroup(), member()), StandardRole::Admin);
        $this->deleteJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$folderAdmin->id}")->assertUnprocessable();
        // Второй личный на папке ниже — и первого можно снять
        grantAccess($this->web, member(), StandardRole::Admin);
        grantAccess($this->dev, member(), StandardRole::Admin);
        $this->deleteJson(adminPath()."nav-nodes/{$this->product->id}/access/users/{$folderAdmin->id}")->assertNoContent();
    });

    it('пространство без управляющего и до изменения изменение не блокирует; деактивация предупреждает и про папку', function () {
        $folderAdmin = member();
        grantAccess($this->product, $folderAdmin, StandardRole::Admin);
        AccessGrant::query()->where('user_id', $this->anna->id)->delete();
        $this->actingAs($this->admin);

        $this->getJson(adminPath()."users/{$folderAdmin->id}/deactivation-impact")->assertOk()
            ->assertJsonPath('data.last_admin_spaces.*.key', ['DEV', 'FRONT'])
            ->assertJsonPath('data.last_admin_spaces.1.node_id', nodeOf($this->front)->id);

        // OPS без управляющего с самого начала — выдача и снятие ролей в нём не блокируются
        $this->putJson(adminPath().'nav-nodes/'.nodeOf($this->ops)->id.'/access/users/'.($boris = member())->id, ['roles' => ['editor']])->assertOk();
        $this->deleteJson(adminPath().'nav-nodes/'.nodeOf($this->ops)->id."/access/users/{$boris->id}")->assertNoContent();
    });
});

describe('«Переместить в…»', function () {
    it('показывает, кто получит и кто потеряет доступ; ничего не меняет', function () {
        $sales = makeFolder('Продажи');
        $boris = member(['name' => 'Борис']);
        $vera = member(['name' => 'Вера']);
        grantAccess($this->product, $boris, StandardRole::Editor);
        grantAccess($sales, $vera, StandardRole::Commenter);
        grantAccess($sales, $team = makeGroup(['name' => 'Команда продаж']), StandardRole::Editor);
        // Выдача на самой перемещаемой папке — доступ не меняется, хоть он есть и на новом месте
        grantAccess($this->web, $both = member(['name' => 'Глеб']), StandardRole::Editor);
        grantAccess($sales, $both, StandardRole::Commenter);
        $this->actingAs($this->admin);

        $impact = $this->getJson(adminPath()."nav-nodes/{$this->web->id}/move-impact?parent_id={$sales->id}")->assertOk()->json('data');
        expect($impact['gain'])->toBe([
            ['type' => 'group', 'id' => $team->id, 'name' => 'Команда продаж', 'system' => null],
            ['type' => 'user', 'id' => $vera->id, 'name' => 'Вера'],
        ])->and($impact['lose'])->toBe([['type' => 'user', 'id' => $boris->id, 'name' => 'Борис']])
            ->and($impact['unmanaged_spaces'])->toBe([]);
        // Сам узел не сдвинулся, журнал пуст
        expect($this->web->fresh()->parent_id)->toBe($this->product->id)
            ->and(EventLogEntry::query()->where('event_type', 'nav_node.moved')->exists())->toBeFalse();
        // В корень — без доступа папки «Продукт»
        $this->getJson(adminPath()."nav-nodes/{$this->web->id}/move-impact")->assertOk()
            ->assertJsonPath('data.lose.0.id', $boris->id)->assertJsonPath('data.gain', []);
        // Цикл и чужая папка — 422
        $this->getJson(adminPath()."nav-nodes/{$this->product->id}/move-impact?parent_id={$this->web->id}")->assertUnprocessable();
    });

    it('если пространство останется без управляющего — отказ 422 и в окне, и при перемещении; доступы не трогаются', function () {
        $folderAdmin = member();
        grantAccess($this->product, $folderAdmin, StandardRole::Admin);
        AccessGrant::query()->where('user_id', $this->anna->id)->onSpace($this->front)->delete();
        $this->actingAs($this->admin);

        $this->getJson(adminPath()."nav-nodes/{$this->web->id}/move-impact")->assertOk()
            ->assertJsonPath('data.unmanaged_spaces.0.key', 'FRONT');
        $this->postJson(adminPath()."nav-nodes/{$this->web->id}/move", ['parent_id' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['parent_id' => __('selen.access.move_unmanaged', ['spaces' => '«Фронтенд»'])]);
        expect($this->web->fresh()->parent_id)->toBe($this->product->id);

        // Перестановка внутри той же папки инвариант не задевает
        $this->postJson(adminPath()."nav-nodes/{$this->web->id}/move", ['parent_id' => $this->product->id])->assertOk();
        // Управляющий на новом месте — перемещение проходит
        grantAccess($sales = makeFolder('Продажи'), member(), StandardRole::Admin);
        $this->postJson(adminPath()."nav-nodes/{$this->web->id}/move", ['parent_id' => $sales->id])->assertOk();
        expect(NavNode::query()->find($this->web->id)->parent_id)->toBe($sales->id);
    });
});

describe('приглашение и передача доступа — с папками', function () {
    it('приглашение сразу с доступом к папке и несколькими ролями; список — папки и пространства по дереву', function () {
        $this->actingAs($this->admin);
        $nodes = collect($this->getJson(adminPath().'grantable-nodes')->assertOk()->json('data'));
        expect($nodes->map(fn (array $n) => [$n['type'], $n['name'], $n['depth']])->take(4)->all())
            ->toBe([['folder', 'Продукт', 1], ['folder', 'Веб', 2], ['space', 'Фронтенд', 3], ['space', 'Разработка', 2]]);

        $this->postJson(adminPath().'invitations', [
            'name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member',
            'grants' => [['node_id' => $this->product->id, 'roles' => ['commenter', 'editor_own']]],
        ])->assertCreated();
        $new = User::query()->where('email', 'new@selen.test')->sole();
        expect(AccessGrant::query()->where('user_id', $new->id)->where('nav_node_id', $this->product->id)->count())->toBe(2);
    });

    it('передача доступа при деактивации копирует и роли на папках', function () {
        $leaving = member();
        $successor = member();
        grantAccess($this->product, $leaving, StandardRole::Admin);
        grantAccess($this->web, $leaving, StandardRole::Editor);
        grantAccess($this->web, $successor, StandardRole::Commenter);

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $successor->id])->assertOk();

        $roles = fn (NavNode $node) => AccessGrant::query()->where('nav_node_id', $node->id)->where('user_id', $successor->id)->with('role')
            ->orderBy('id')->get()->map(fn (AccessGrant $g) => $g->standardRole())->all();
        expect($roles($this->product))->toBe([StandardRole::Admin])
            // Своя роль остаётся (у уходящего здесь нет «управления доступом»)
            ->and($roles($this->web))->toBe([StandardRole::Commenter])
            ->and(EventLogEntry::query()->where('event_type', 'folder.access_granted')->sole()->payload)
            ->toEqual(['user_id' => $successor->id, 'roles' => ['admin'], 'via' => 'access_transfer']);
    });
});

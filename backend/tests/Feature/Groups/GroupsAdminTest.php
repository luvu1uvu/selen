<?php

use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\EventLogEntry;
use App\Models\Group;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Группы в админке (ADR-0012): ведёт только системный администратор; архив вместо удаления;
| в журнал — только id и перечисления.
*/

beforeEach(function () {
    $this->admin = admin();
});

describe('группа', function () {
    it('создаётся, переименовывается и попадает в список со счётчиками', function () {
        $id = $this->actingAs($this->admin)->postJson(adminPath().'groups', ['name' => 'Analysts', 'description' => 'Аналитики'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Analysts')
            ->assertJsonPath('data.members_count', 0)
            ->json('data.id');

        $this->patchJson(adminPath()."groups/{$id}", ['name' => 'Аналитики'])->assertOk()->assertJsonPath('data.name', 'Аналитики');
        $this->getJson(adminPath().'groups')->assertOk()->assertJsonPath('data.0.system', 'everyone')->assertJsonPath('data.1.id', $id)->assertJsonPath('data.1.entities_count', 0);

        expect(EventLogEntry::query()->orderBy('id')->get(['event_type', 'payload'])->map(fn ($e) => [$e->event_type, $e->payload])->all())
            ->toEqual([['group.created', []], ['group.updated', ['fields' => ['name']]]]);
    });

    it('название уникально без учёта регистра, включая архивные', function () {
        makeGroup(['name' => 'Contractors', 'archived_at' => now()]);

        $this->actingAs($this->admin)->postJson(adminPath().'groups', ['name' => 'contractors'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => __('selen.groups.name_taken')]);
        $this->postJson(adminPath().'groups', ['name' => ''])->assertJsonValidationErrors('name');
    });

    it('архивируется и восстанавливается; архивная — только для чтения', function () {
        $group = makeGroup();
        $this->actingAs($this->admin);

        $this->postJson(adminPath()."groups/{$group->id}/archive")->assertOk()->assertJsonPath('data.archived_at', fn ($v) => $v !== null);
        $this->postJson(adminPath()."groups/{$group->id}/archive")->assertUnprocessable();
        $this->patchJson(adminPath()."groups/{$group->id}", ['name' => 'Новое'])->assertForbidden();
        $this->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => member()->id])->assertForbidden();

        $this->postJson(adminPath()."groups/{$group->id}/restore")->assertOk()->assertJsonPath('data.archived_at', null);
        $this->postJson(adminPath()."groups/{$group->id}/restore")->assertUnprocessable();
    });

    it('недоступна не администратору компании', function () {
        $group = makeGroup();
        $spaceAdmin = member();
        addToSpace(space(), $spaceAdmin, SpaceRole::Admin);
        $this->actingAs($spaceAdmin);

        $this->getJson(adminPath().'groups')->assertForbidden();
        $this->getJson(adminPath()."groups/{$group->id}")->assertForbidden();
        $this->postJson(adminPath().'groups', ['name' => 'X'])->assertForbidden();
        $this->patchJson(adminPath()."groups/{$group->id}", ['name' => 'X'])->assertForbidden();
        $this->postJson(adminPath()."groups/{$group->id}/archive")->assertForbidden();
        $this->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => $spaceAdmin->id])->assertForbidden();
        $this->deleteJson(adminPath()."groups/{$group->id}/members/{$spaceAdmin->id}")->assertForbidden();
        // Доступ группы к папке или пространству — «Доступ…» узла, право «управлять доступом» (П2d-1)
        $this->putJson(adminPath().'nav-nodes/'.nodeOf(space())->id."/access/groups/{$group->id}", ['roles' => ['editor']])->assertForbidden();
    });
});

describe('состав', function () {
    it('люди добавляются и исключаются; дубль и деактивированный — 422', function () {
        $group = makeGroup();
        $ivan = member(['name' => 'Иван']);
        $this->actingAs($this->admin);

        $this->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => $ivan->id])
            ->assertOk()
            ->assertJsonPath('data.members.0.id', $ivan->id)
            ->assertJsonPath('data.members_count', 1);
        $this->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => $ivan->id])->assertUnprocessable();
        // Деактивированный убран из компании (П2c) — для состава группы его нет, как человека другой компании
        $this->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => member(['status' => 'deactivated'])->id])
            ->assertJsonValidationErrors(['user_id' => __('validation.exists', ['attribute' => 'user id'])]);

        $this->deleteJson(adminPath()."groups/{$group->id}/members/{$ivan->id}")->assertNoContent();
        $this->deleteJson(adminPath()."groups/{$group->id}/members/{$ivan->id}")->assertNotFound();

        expect(EventLogEntry::query()->whereIn('event_type', ['group.member_added', 'group.member_removed'])->orderBy('id')->pluck('payload')->all())
            ->toEqual([['user_id' => $ivan->id], ['user_id' => $ivan->id]]);
    });
});

describe('«Сущности» группы из админки (П2d-1: папки и пространства, несколько ролей)', function () {
    it('выдаётся, меняется и отзывается через «Доступ…» узла; на странице группы — сущности с ролями; via=admin_panel', function () {
        $group = makeGroup();
        $space = space(['key' => 'FRONT', 'name' => 'Frontend']);
        $folder = makeFolder('Продукт');
        $node = nodeOf($space);
        $this->actingAs($this->admin);
        $access = fn (string $nodeId) => adminPath()."nav-nodes/{$nodeId}/access/groups/{$group->id}";

        $this->putJson($access($node->id), ['roles' => ['editor_own']])->assertOk()
            ->assertJsonPath('data.grants.0.group.id', $group->id)
            ->assertJsonPath('data.grants.0.roles', ['editor_own']);
        $this->putJson($access($node->id), ['roles' => ['admin', 'editor_own']])->assertOk();
        $this->putJson($access($folder->id), ['roles' => ['commenter']])->assertOk();

        $this->getJson(adminPath()."groups/{$group->id}")->assertOk()
            ->assertJsonPath('data.entities.0.node.type', 'folder')
            ->assertJsonPath('data.entities.0.node.name', 'Продукт')
            ->assertJsonPath('data.entities.0.roles', ['commenter'])
            ->assertJsonPath('data.entities.1.node.space.key', 'FRONT')
            ->assertJsonPath('data.entities.1.roles', ['admin', 'editor_own']);
        $this->getJson(adminPath().'groups')->assertJsonPath('data.1.entities_count', 2);

        $this->deleteJson($access($node->id))->assertNoContent();
        $this->deleteJson($access($folder->id))->assertNoContent();

        expect(AccessGrant::query()->whereNotNull('group_id')->count())->toBe(0)
            ->and(EventLogEntry::query()->where('event_type', 'like', 'space.group_%')->orWhere('event_type', 'like', 'folder.access_%')
                ->orderBy('id')->get(['event_type', 'payload'])->map(fn ($e) => [$e->event_type, $e->payload])->all())
            ->toEqual([
                ['space.group_added', ['group_id' => $group->id, 'roles' => ['editor_own'], 'via' => 'admin_panel']],
                ['space.group_role_changed', ['group_id' => $group->id, 'from' => ['editor_own'], 'to' => ['admin', 'editor_own'], 'via' => 'admin_panel']],
                ['folder.access_granted', ['group_id' => $group->id, 'roles' => ['commenter'], 'via' => 'admin_panel']],
                ['space.group_removed', ['group_id' => $group->id, 'roles' => ['admin', 'editor_own'], 'via' => 'admin_panel']],
                ['folder.access_revoked', ['group_id' => $group->id, 'roles' => ['commenter'], 'via' => 'admin_panel']],
            ]);
    });

    it('архивной группе доступ не выдаётся; БД защищает от admin с ограничением', function () {
        $group = makeGroup(['archived_at' => now()]);
        $space = space();

        // Архивная группа доступа не получает
        $this->actingAs($this->admin)->putJson(adminPath().'nav-nodes/'.nodeOf($space)->id."/access/groups/{$group->id}", ['roles' => ['editor']])
            ->assertJsonValidationErrors(['group_id' => __('selen.groups.archived')]);

        // «Администратор» не может стать ролью с областью «только свои карточки» (триггер roles_scope_check, ADR-0024)
        expect(fn () => DB::transaction(fn () => DB::table('roles')->where('key', 'admin')->update(['card_scope' => 'own'])))
            ->toThrow(QueryException::class);
    });
});

it('в журнале групп нет ПДн, названий и описаний групп', function () {
    $this->actingAs($this->admin);
    $id = $this->postJson(adminPath().'groups', ['name' => 'Секретный отдел', 'description' => 'Описание отдела'])->json('data.id');
    $this->patchJson(adminPath()."groups/{$id}", ['name' => 'Тайный отдел', 'description' => 'Новое описание'])->assertOk();
    $this->postJson(adminPath()."groups/{$id}/members", ['user_id' => member(['name' => 'Иван Петров'])->id])->assertOk();
    $this->putJson(adminPath().'nav-nodes/'.nodeOf(space())->id."/access/groups/{$id}", ['roles' => ['commenter']])->assertOk();
    $this->postJson(adminPath()."groups/{$id}/archive")->assertOk();

    expectNoPersonalDataInEventLog();
    $journal = DB::table('event_log')->pluck('payload')->implode("\n");
    expect(mb_strtolower($journal))->not->toContain('отдел')->not->toContain('описание');
    expect(Group::query()->whereNull('system_key')->count())->toBe(1);
});

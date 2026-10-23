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
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/groups', ['name' => 'Analysts', 'description' => 'Аналитики'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Analysts')
            ->assertJsonPath('data.members_count', 0)
            ->json('data.id');

        $this->patchJson("/api/v1/admin/groups/{$id}", ['name' => 'Аналитики'])->assertOk()->assertJsonPath('data.name', 'Аналитики');
        $this->getJson('/api/v1/admin/groups')->assertOk()->assertJsonPath('data.0.system', 'everyone')->assertJsonPath('data.1.id', $id)->assertJsonPath('data.1.spaces_count', 0);

        expect(EventLogEntry::query()->orderBy('id')->get(['event_type', 'payload'])->map(fn ($e) => [$e->event_type, $e->payload])->all())
            ->toEqual([['group.created', []], ['group.updated', ['fields' => ['name']]]]);
    });

    it('название уникально без учёта регистра, включая архивные', function () {
        makeGroup(['name' => 'Contractors', 'archived_at' => now()]);

        $this->actingAs($this->admin)->postJson('/api/v1/admin/groups', ['name' => 'contractors'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name' => __('selen.groups.name_taken')]);
        $this->postJson('/api/v1/admin/groups', ['name' => ''])->assertJsonValidationErrors('name');
    });

    it('архивируется и восстанавливается; архивная — только для чтения', function () {
        $group = makeGroup();
        $this->actingAs($this->admin);

        $this->postJson("/api/v1/admin/groups/{$group->id}/archive")->assertOk()->assertJsonPath('data.archived_at', fn ($v) => $v !== null);
        $this->postJson("/api/v1/admin/groups/{$group->id}/archive")->assertUnprocessable();
        $this->patchJson("/api/v1/admin/groups/{$group->id}", ['name' => 'Новое'])->assertForbidden();
        $this->postJson("/api/v1/admin/groups/{$group->id}/members", ['user_id' => member()->id])->assertForbidden();

        $this->postJson("/api/v1/admin/groups/{$group->id}/restore")->assertOk()->assertJsonPath('data.archived_at', null);
        $this->postJson("/api/v1/admin/groups/{$group->id}/restore")->assertUnprocessable();
    });

    it('недоступна не системному администратору', function () {
        $group = makeGroup();
        $spaceAdmin = member();
        addToSpace(space(), $spaceAdmin, SpaceRole::Admin);
        $this->actingAs($spaceAdmin);

        $this->getJson('/api/v1/admin/groups')->assertForbidden();
        $this->getJson("/api/v1/admin/groups/{$group->id}")->assertForbidden();
        $this->postJson('/api/v1/admin/groups', ['name' => 'X'])->assertForbidden();
        $this->patchJson("/api/v1/admin/groups/{$group->id}", ['name' => 'X'])->assertForbidden();
        $this->postJson("/api/v1/admin/groups/{$group->id}/archive")->assertForbidden();
        $this->postJson("/api/v1/admin/groups/{$group->id}/members", ['user_id' => $spaceAdmin->id])->assertForbidden();
        $this->deleteJson("/api/v1/admin/groups/{$group->id}/members/{$spaceAdmin->id}")->assertForbidden();
        $this->putJson("/api/v1/admin/groups/{$group->id}/spaces/".space()->id, ['role' => 'editor'])->assertForbidden();
    });
});

describe('состав', function () {
    it('люди добавляются и исключаются; дубль и деактивированный — 422', function () {
        $group = makeGroup();
        $ivan = member(['name' => 'Иван']);
        $this->actingAs($this->admin);

        $this->postJson("/api/v1/admin/groups/{$group->id}/members", ['user_id' => $ivan->id])
            ->assertOk()
            ->assertJsonPath('data.members.0.id', $ivan->id)
            ->assertJsonPath('data.members_count', 1);
        $this->postJson("/api/v1/admin/groups/{$group->id}/members", ['user_id' => $ivan->id])->assertUnprocessable();
        $this->postJson("/api/v1/admin/groups/{$group->id}/members", ['user_id' => member(['status' => 'deactivated'])->id])
            ->assertJsonValidationErrors(['user_id' => __('selen.groups.member_deactivated')]);

        $this->deleteJson("/api/v1/admin/groups/{$group->id}/members/{$ivan->id}")->assertNoContent();
        $this->deleteJson("/api/v1/admin/groups/{$group->id}/members/{$ivan->id}")->assertNotFound();

        expect(EventLogEntry::query()->whereIn('event_type', ['group.member_added', 'group.member_removed'])->orderBy('id')->pluck('payload')->all())
            ->toEqual([['user_id' => $ivan->id], ['user_id' => $ivan->id]]);
    });
});

describe('доступ группы к пространствам из админки', function () {
    it('выдаётся, меняется и отзывается; в журнале via=admin_panel', function () {
        $group = makeGroup();
        $space = space(['key' => 'FRONT', 'name' => 'Frontend']);
        $this->actingAs($this->admin);

        $this->putJson("/api/v1/admin/groups/{$group->id}/spaces/{$space->id}", ['role' => 'editor', 'own_cards_only' => true])
            ->assertOk()
            ->assertJsonPath('data.spaces.0.space.key', 'FRONT')
            ->assertJsonPath('data.spaces.0.role', 'editor')
            ->assertJsonPath('data.spaces.0.own_cards_only', true);
        $this->putJson("/api/v1/admin/groups/{$group->id}/spaces/{$space->id}", ['role' => 'admin'])
            ->assertOk()
            ->assertJsonPath('data.spaces.0.role', 'admin')
            ->assertJsonPath('data.spaces.0.own_cards_only', false);
        $this->putJson("/api/v1/admin/groups/{$group->id}/spaces/{$space->id}", ['role' => 'admin', 'own_cards_only' => true])
            ->assertJsonValidationErrors(['own_cards_only' => __('selen.spaces.admin_not_restricted')]);
        $this->deleteJson("/api/v1/admin/groups/{$group->id}/spaces/{$space->id}")->assertNoContent();

        expect(AccessGrant::query()->whereNotNull('group_id')->count())->toBe(0)
            ->and(EventLogEntry::query()->where('event_type', 'like', 'space.group_%')->orderBy('id')->get(['event_type', 'payload'])
                ->map(fn ($e) => [$e->event_type, $e->payload])->all())
            ->toEqual([
                ['space.group_added', ['group_id' => $group->id, 'role' => 'editor', 'own_cards_only' => true, 'via' => 'admin_panel']],
                ['space.group_role_changed', ['group_id' => $group->id, 'from' => 'editor', 'to' => 'admin', 'via' => 'admin_panel']],
                ['space.group_restriction_changed', ['group_id' => $group->id, 'from' => true, 'to' => false, 'via' => 'role_changed']],
                ['space.group_removed', ['group_id' => $group->id, 'role' => 'admin', 'via' => 'admin_panel']],
            ]);
    });

    it('архивной группе доступ не выдаётся; БД защищает от admin с ограничением', function () {
        $group = makeGroup(['archived_at' => now()]);
        $space = space();

        // Архивная группа — только для чтения (как в админке)
        $this->actingAs($this->admin)->putJson("/api/v1/admin/groups/{$group->id}/spaces/{$space->id}", ['role' => 'editor'])->assertForbidden();

        // «Администратор» не может стать ролью с областью «только свои карточки» (триггер roles_scope_check, ADR-0024)
        expect(fn () => DB::transaction(fn () => DB::table('roles')->where('key', 'admin')->update(['card_scope' => 'own'])))
            ->toThrow(QueryException::class);
    });
});

it('в журнале групп нет ПДн, названий и описаний групп', function () {
    $this->actingAs($this->admin);
    $id = $this->postJson('/api/v1/admin/groups', ['name' => 'Секретный отдел', 'description' => 'Описание отдела'])->json('data.id');
    $this->patchJson("/api/v1/admin/groups/{$id}", ['name' => 'Тайный отдел', 'description' => 'Новое описание'])->assertOk();
    $this->postJson("/api/v1/admin/groups/{$id}/members", ['user_id' => member(['name' => 'Иван Петров'])->id])->assertOk();
    $this->putJson("/api/v1/admin/groups/{$id}/spaces/".space()->id, ['role' => 'commenter'])->assertOk();
    $this->postJson("/api/v1/admin/groups/{$id}/archive")->assertOk();

    expectNoPersonalDataInEventLog();
    $journal = DB::table('event_log')->pluck('payload')->implode("\n");
    expect(mb_strtolower($journal))->not->toContain('отдел')->not->toContain('описание');
    expect(Group::query()->whereNull('system_key')->count())->toBe(1);
});

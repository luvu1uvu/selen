<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\EventLogEntry;
use App\Models\Label;
use Illuminate\Support\Facades\DB;

/*
| Метки — гибрид: общие метки компании (системный администратор) и метки пространства
| (администратор пространства). Архивация вместо удаления.
*/

beforeEach(function () {
    $this->sysadmin = admin();
    $this->space = space(['key' => 'DEV']);
    $this->spaceAdmin = member();
    $this->editor = member();
    addToSpace($this->space, $this->spaceAdmin, SpaceRole::Admin);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->spaceAdmin, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
});

function companyLabel(string $name = 'Безопасность', string $color = '#ef4444'): Label
{
    return Label::query()->forceCreate(['space_id' => null, 'name' => $name, 'color' => $color]);
}

function spaceLabel($space, string $name = 'Фронтенд', string $color = '#3b82f6'): Label
{
    return Label::query()->forceCreate(['space_id' => $space->id, 'name' => $name, 'color' => $color]);
}

describe('общие метки компании', function () {
    it('создаёт и меняет только системный администратор', function () {
        $this->actingAs($this->sysadmin)->postJson('/api/v1/admin/labels', ['name' => 'Безопасность', 'color' => '#EF4444'])
            ->assertCreated()
            ->assertJsonPath('data.scope', 'company')
            ->assertJsonPath('data.color', '#ef4444');
        $label = Label::query()->sole();

        $this->actingAs($this->sysadmin)->patchJson("/api/v1/labels/{$label->id}", ['name' => 'ИБ'])->assertOk();
        $this->actingAs($this->sysadmin)->getJson('/api/v1/admin/labels')->assertOk()->assertJsonPath('data.0.name', 'ИБ');

        $this->actingAs($this->spaceAdmin)->postJson('/api/v1/admin/labels', ['name' => 'X', 'color' => '#000000'])->assertForbidden();
        $this->actingAs($this->spaceAdmin)->getJson('/api/v1/admin/labels')->assertForbidden();
        $this->actingAs($this->spaceAdmin)->patchJson("/api/v1/labels/{$label->id}", ['name' => 'Y'])->assertForbidden();
        $this->actingAs($this->spaceAdmin)->postJson("/api/v1/labels/{$label->id}/archive")->assertForbidden();

        expect(EventLogEntry::query()->where('event_type', 'label.created')->sole()->payload)->toEqual(['color' => '#ef4444'])
            ->and(EventLogEntry::query()->where('event_type', 'label.updated')->sole()->payload)->toEqual(['fields' => ['name']]);
    });

    it('архивирует и восстанавливает; название уникально среди активных без учёта регистра', function () {
        $label = companyLabel();

        $this->actingAs($this->sysadmin)->postJson('/api/v1/admin/labels', ['name' => 'безопасность', 'color' => '#000000'])
            ->assertUnprocessable()->assertJsonPath('errors.name.0', __('selen.labels.name_taken'));

        $this->actingAs($this->sysadmin)->postJson("/api/v1/labels/{$label->id}/archive")->assertOk();
        $this->actingAs($this->sysadmin)->postJson("/api/v1/labels/{$label->id}/archive")->assertUnprocessable();

        // Пока метка в архиве, название свободно — и тогда восстановить её нельзя
        $this->actingAs($this->sysadmin)->postJson('/api/v1/admin/labels', ['name' => 'Безопасность', 'color' => '#000000'])->assertCreated();
        $this->actingAs($this->sysadmin)->postJson("/api/v1/labels/{$label->id}/restore")
            ->assertUnprocessable()->assertJsonPath('errors.label.0', __('selen.labels.name_taken'));
    });
});

describe('метки пространства', function () {
    it('создаёт и меняет администратор пространства; editor — нет; системный админ без роли — 404', function () {
        $this->actingAs($this->spaceAdmin)->postJson('/api/v1/spaces/DEV/labels', ['name' => 'Фронтенд', 'color' => '#3b82f6'])
            ->assertCreated()->assertJsonPath('data.scope', 'space');
        $label = Label::query()->sole();

        $this->actingAs($this->editor)->postJson('/api/v1/spaces/DEV/labels', ['name' => 'Бэкенд', 'color' => '#000000'])->assertForbidden();
        $this->actingAs($this->sysadmin)->patchJson("/api/v1/labels/{$label->id}", ['name' => 'Y'])->assertNotFound();

        $this->actingAs($this->spaceAdmin)->postJson("/api/v1/labels/{$label->id}/archive")->assertOk()
            ->assertJsonPath('data.archived_at', fn ($v) => $v !== null);
        $this->actingAs($this->spaceAdmin)->postJson("/api/v1/labels/{$label->id}/restore")->assertOk();

        expect(EventLogEntry::query()->where('event_type', 'label.created')->sole()->payload)
            ->toEqual(['space_id' => $this->space->id, 'color' => '#3b82f6']);
    });

    it('одинаковые названия допустимы в разных наборах', function () {
        companyLabel('Срочно');
        $other = space(['key' => 'OPS']);
        spaceLabel($other, 'Фронтенд');

        $this->actingAs($this->spaceAdmin)->postJson('/api/v1/spaces/DEV/labels', ['name' => 'Срочно', 'color' => '#000000'])->assertCreated();
        $this->actingAs($this->spaceAdmin)->postJson('/api/v1/spaces/DEV/labels', ['name' => 'Фронтенд', 'color' => '#000000'])->assertCreated();
        $this->actingAs($this->spaceAdmin)->postJson('/api/v1/spaces/DEV/labels', ['name' => 'фронтенд', 'color' => '#000000'])->assertUnprocessable();
    });

    it('участники видят общие метки и метки своего пространства, включая архивные', function () {
        companyLabel();
        spaceLabel($this->space)->forceFill(['archived_at' => now()])->save();
        spaceLabel(space(['key' => 'OPS']), 'Чужая');

        $this->actingAs($this->editor)->getJson('/api/v1/spaces/DEV/labels')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.scope', 'company')
            ->assertJsonPath('data.1.name', 'Фронтенд');
    });
});

describe('метки на карточке', function () {
    it('editor ставит общие метки и метки пространства; в журнал — id добавленных и снятых', function () {
        $company = companyLabel();
        $local = spaceLabel($this->space);

        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$local->id, $company->id]])
            ->assertOk()
            ->assertJsonPath('data.labels.0.id', $company->id)
            ->assertJsonPath('data.labels.1.id', $local->id);

        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$local->id]])->assertOk();
        // Тот же набор — без события
        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$local->id]])->assertOk();

        $payloads = EventLogEntry::query()->where('event_type', 'card.labels_changed')->orderBy('id')->pluck('payload')->all();
        $first = [$company->id, $local->id];
        sort($first);
        expect($payloads)->toEqual([
            ['added' => $first, 'removed' => []],
            ['added' => [], 'removed' => [$company->id]],
        ]);

        $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")
            ->assertJsonPath('data.cards.0.label_ids', [$local->id])
            ->assertJsonPath('data.labels.0.id', $local->id);
    });

    it('чужие метки и новые архивные поставить нельзя; уже стоящая архивная остаётся', function () {
        $foreign = spaceLabel(space(['key' => 'OPS']), 'Чужая');
        $archived = spaceLabel($this->space, 'Старая');
        $kept = spaceLabel($this->space, 'Остаётся');

        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$kept->id]])->assertOk();
        $archived->forceFill(['archived_at' => now()])->save();
        $kept->forceFill(['archived_at' => now()])->save();

        foreach ([$foreign, $archived] as $label) {
            $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$kept->id, $label->id]])
                ->assertUnprocessable()->assertJsonPath('errors', ['label_ids.1' => [__('selen.labels.not_available')]]);
        }

        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => [$kept->id]])->assertOk()
            ->assertJsonPath('data.labels.0.archived_at', fn ($v) => $v !== null);
        $this->actingAs($this->editor)->putJson('/api/v1/cards/DEV-1/labels', [])->assertUnprocessable();
    });

    it('commenter меток не ставит', function () {
        $commenter = member();
        addToSpace($this->space, $commenter, SpaceRole::Commenter);

        $this->actingAs($commenter)->putJson('/api/v1/cards/DEV-1/labels', ['label_ids' => []])->assertForbidden();
    });
});

it('в журнале событий меток нет названий', function () {
    $this->actingAs($this->sysadmin)->postJson('/api/v1/admin/labels', ['name' => 'Секретный проект', 'color' => '#ef4444'])->assertCreated();

    expect(DB::table('event_log')->pluck('payload')->implode("\n"))->not->toContain('Секретный');
});

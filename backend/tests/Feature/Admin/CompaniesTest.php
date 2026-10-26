<?php

use App\Enums\EventType;
use App\Models\CardType;
use App\Models\Company;
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Services\Companies\CompanyTemplate;

/*
| Экран Владельца «Компании» и выбор компании в админке («Права 2.0», П2b-2; ADR-0024): компании создаёт
| и переименовывает только Владелец, новая — со справочниками из шаблона; администраторов назначает он же в её
| «Пользователях». Админка — только своих компаний: чужая компания в адресе — 404, как несуществующая. Названия
| компаний видит только тот, у кого их несколько (решение PM 23.10, вопрос 5).
*/

beforeEach(function () {
    $this->owner = owner();
});

it('Владелец видит все компании: людей и администраторов каждой', function () {
    $admin = admin(['name' => 'Анна Админ']);
    member();
    member(['status' => 'deactivated', 'deactivated_at' => now()]);
    $second = otherCompany(['name' => 'Компания 2']);
    $secondAdmin = admin(['name' => 'Борис Админ'], $second);

    $data = $this->actingAs($this->owner)->getJson('/api/v1/admin/companies')->assertOk()->json('data');

    expect(collect($data)->pluck('name')->all())->toBe([company()->name, 'Компания 2'])
        // «Компания 1»: Владелец, администратор и участник; деактивированный не считается
        ->and($data[0]['people_count'])->toBe(3)
        ->and(collect($data[0]['admins'])->pluck('id')->all())->toBe([$admin->id])
        ->and($data[1]['people_count'])->toBe(1)
        ->and($data[1]['admins'])->toBe([['id' => $secondAdmin->id, 'name' => 'Борис Админ', 'email' => $secondAdmin->email, 'status' => 'active']]);
});

it('новая компания — со справочниками из шаблона; событие — системное, его видит только Владелец', function () {
    $this->actingAs($this->owner)->postJson('/api/v1/admin/companies', ['name' => '  Компания 2 '])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Компания 2')
        ->assertJsonPath('data.people_count', 0)
        ->assertJsonPath('data.admins', []);

    $company = Company::query()->where('name', 'Компания 2')->sole();
    expect(CardType::query()->inCompany($company)->orderBy('name')->pluck('name')->all())->toBe(['Баг', 'Задача', 'История', 'Эпик'])
        ->and(CardType::query()->inCompany($company)->where('is_default', true)->sole()->name)->toBe('Задача')
        ->and(Group::everyone($company)->name)->toBe(CompanyTemplate::EVERYONE_NAME)
        ->and($company->created_by)->toBe($this->owner->id);

    $event = EventLogEntry::query()->where('event_type', EventType::CompanyCreated->value)->sole();
    expect($event->company_id)->toBeNull()
        ->and($event->subject_type)->toBe('company')
        ->and($event->subject_id)->toBe($company->id)
        ->and($event->payload)->toBe([]);

    // Системное событие: Владельцу — в журнале любой компании, администратору — нет
    $journal = fn ($actor) => collect($this->actingAs($actor)->getJson(adminPath().'events')->assertOk()->json('data'))->pluck('id');
    expect($journal($this->owner))->toContain($event->id)
        ->and($journal(admin()))->not->toContain($event->id);
    expectNoPersonalDataInEventLog();
});

it('название компании обязательно и уникально без учёта регистра', function () {
    $this->actingAs($this->owner);
    $this->postJson('/api/v1/admin/companies', ['name' => ' '])->assertUnprocessable()->assertJsonValidationErrors('name');
    $this->postJson('/api/v1/admin/companies', ['name' => mb_strtoupper(company()->name)])
        ->assertUnprocessable()->assertJsonPath('errors.name.0', __('selen.companies.name_taken'));
    $this->postJson('/api/v1/admin/companies', ['name' => str_repeat('я', 101)])->assertUnprocessable();

    $second = otherCompany(['name' => 'Компания 2']);
    $this->patchJson("/api/v1/admin/companies/{$second->id}", ['name' => company()->name])->assertUnprocessable();
    // Своё же название (другой регистр) — можно
    $this->patchJson("/api/v1/admin/companies/{$second->id}", ['name' => 'КОМПАНИЯ 2'])->assertOk()->assertJsonPath('data.name', 'КОМПАНИЯ 2');
});

it('переименование — событие без названия; то же название — без события', function () {
    $company = otherCompany(['name' => 'Компания 2']);
    $this->actingAs($this->owner);

    $this->patchJson("/api/v1/admin/companies/{$company->id}", ['name' => 'Северный филиал'])->assertOk()
        ->assertJsonPath('data.name', 'Северный филиал');
    $this->patchJson("/api/v1/admin/companies/{$company->id}", ['name' => 'Северный филиал'])->assertOk();

    expect(loggedEventTypes())->toBe([EventType::CompanyRenamed->value])
        ->and(EventLogEntry::query()->sole()->company_id)->toBeNull();
    expectNoPersonalDataInEventLog();
});

it('компаниями управляет только Владелец: администратору — 403, чужая компания — 404', function () {
    $admin = admin();
    $other = otherCompany();
    $this->actingAs($admin);

    $this->getJson('/api/v1/admin/companies')->assertForbidden();
    $this->postJson('/api/v1/admin/companies', ['name' => 'Своя'])->assertForbidden();
    $this->patchJson('/api/v1/admin/companies/'.company()->id, ['name' => 'Своя'])->assertForbidden();
    $this->patchJson("/api/v1/admin/companies/{$other->id}", ['name' => 'Чужая'])->assertNotFound()
        ->assertExactJson(['message' => __('selen.not_found')]);
    expect(Company::query()->count())->toBe(2);
});

it('Владелец назначает администратора новой компании в её «Пользователях»: у того появляется её админка', function () {
    $company = otherCompany(['name' => 'Компания 2']);
    $person = member(['name' => 'Вера'], $company);
    $this->actingAs($this->owner)->patchJson(adminPath($company)."users/{$person->id}/role", ['role' => 'admin'])->assertOk();

    $this->actingAs($this->owner)->getJson('/api/v1/admin/companies')->assertOk()
        ->assertJsonPath('data.1.admins.0.id', $person->id);
    $this->actingAs($person)->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.role', 'admin')
        ->assertJsonCount(1, 'data.admin_companies')
        ->assertJsonPath('data.admin_companies.0.id', $company->id)
        // Компания одна — без названия
        ->assertJsonPath('data.admin_companies.0.name', null);
    $this->getJson(adminPath($company).'users')->assertOk();
    $this->getJson(adminPath().'users')->assertNotFound();
});

it('выбор компании: администратору нескольких — их названия и права; чужая компания в адресе — 404', function () {
    $second = otherCompany(['name' => 'Компания 2']);
    $third = otherCompany(['name' => 'Компания 3']);
    $admin = admin(company: $second);
    $admin->companies()->attach($third->id, ['kind' => 'home', 'is_admin' => true]);

    $companies = $this->actingAs($admin)->getJson('/api/v1/auth/me')->assertOk()->json('data.admin_companies');
    expect(collect($companies)->pluck('name', 'id')->all())->toBe([$second->id => 'Компания 2', $third->id => 'Компания 3'])
        ->and($companies[0]['permissions'])->toContain('company.manage_users')->toContain('company.invite_users')
        ->not->toContain('company.delete_users');

    foreach ([$second, $third] as $company) {
        $this->getJson(adminPath($company).'users')->assertOk();
        $this->getJson(adminPath($company).'groups')->assertOk();
    }
    foreach (['users', 'groups', 'spaces', 'navigation', 'events', 'trash/cards', 'invitations', 'labels', 'card-types'] as $section) {
        $this->getJson(adminPath().$section)->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    }
    // Несуществующая компания — так же
    $this->getJson('/api/v1/admin/companies/01JZZZZZZZZZZZZZZZZZZZZZZZ/users')->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
});

it('Владельцу — все компании с названиями; у кого компания одна, названия в /auth/me нет', function () {
    otherCompany(['name' => 'Компания 2']);

    $companies = $this->actingAs($this->owner)->getJson('/api/v1/auth/me')->assertOk()->json('data.admin_companies');
    expect(collect($companies)->pluck('name')->all())->toBe([company()->name, 'Компания 2'])
        ->and($companies[0]['permissions'])->toContain('company.delete_users');

    $this->actingAs(admin())->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.admin_companies.0.name', null)
        ->assertJsonCount(1, 'data.admin_companies');
    $this->actingAs(member())->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.admin_companies', []);
});

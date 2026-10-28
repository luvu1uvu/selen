<?php

use App\Actions\Companies\CreateCompanyAction;
use App\Enums\SpaceRole;
use App\Models\Company;
use App\Models\User;
use Database\Seeders\BoardsDemoSeeder;
use Database\Seeders\CompaniesDemoSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/*
| Режим «одна компания» (docs/adr/0026-one-team-one-copy.md): каждая команда — своя копия Selen. По умолчанию
| (SELEN_MULTI_COMPANY=false) нет «Компаний» и гостей: их маршруты — 404 всем, даже Владельцу; вторую компанию не
| создать; интерфейс узнаёт режим из /auth/me. Права и изоляция от режима не зависят (тесты идут в режиме «несколько
| компаний», phpunit.xml; полная матрица админки в этом режиме — AdminAccessMatrixTest).
*/

beforeEach(function () {
    config(['selen.multi_company' => false]);
    $this->owner = owner();
});

it('«Компании» — 404 всем, даже Владельцу: ни списка, ни создания, ни переименования', function () {
    $this->actingAs($this->owner);

    $this->getJson('/api/v1/admin/companies')->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->postJson('/api/v1/admin/companies', ['name' => 'Компания 2'])->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->patchJson('/api/v1/admin/companies/'.company()->id, ['name' => 'Новое название'])->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);

    expect(Company::query()->pluck('name')->all())->toBe([company()->name]);
});

it('вторую компанию не создать и в обход маршрута: отказ в CreateCompanyAction', function () {
    expect(fn () => app(CreateCompanyAction::class)->handle($this->owner, 'Компания 2'))
        ->toThrow(ValidationException::class, __('selen.companies.single_company'));
    expect(Company::query()->count())->toBe(1);
});

it('гости — 404 и Владельцу, и администратору компании: добавить, изменить, убрать', function () {
    // Гость мог остаться с тех пор, как режим был «несколько компаний» (ADR-0026, «Если компаний в базе несколько»)
    $guest = User::factory()->inCompany(otherCompany())->guestIn(company())->create();
    $space = space(['key' => 'DEV']);
    addToSpace($space, $guest, SpaceRole::Commenter);
    $foreign = member(company: otherCompany(['name' => 'Компания 3']));

    foreach ([$this->owner, admin()] as $actor) {
        $this->actingAs($actor);
        $this->postJson(adminPath().'guests', ['email' => $foreign->email, 'spaces' => [['space_id' => $space->id, 'role' => 'commenter']]])
            ->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
        $this->putJson(adminPath()."guests/{$guest->id}", ['expires_on' => null, 'spaces' => []])->assertNotFound();
        $this->deleteJson(adminPath()."guests/{$guest->id}")->assertNotFound();
    }

    // Доступ гостя не тронут: права от режима не зависят
    expect($space->accessOf($guest))->not->toBeNull();
});

it('в списке пользователей действия с гостем не предлагаются; остальные — как в режиме «несколько компаний»', function () {
    $guest = User::factory()->inCompany(otherCompany())->guestIn(company())->create();
    $member = member();
    $row = fn (User $user) => collect($this->actingAs($this->owner)->getJson(adminPath().'users')->assertOk()->json('data'))
        ->firstWhere('id', $user->id);

    expect($row($guest)['permissions']['manage_guest'])->toBeFalse()
        ->and($row($member)['permissions']['deactivate'])->toBeTrue()
        ->and($row($member)['permissions']['block'])->toBeTrue();

    config(['selen.multi_company' => true]);
    expect($row($guest)['permissions']['manage_guest'])->toBeTrue();
});

it('/auth/me сообщает режим копии: интерфейс берёт его из API, а не из сборки', function () {
    $this->actingAs(member())->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.multi_company', false);

    config(['selen.multi_company' => true]);
    $this->actingAs(member())->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.multi_company', true);
});

it('при одной компании её названия нет нигде: ни в админке, ни в дереве — и у Владельца', function () {
    space(['key' => 'DEV']);
    addToSpace(space(['key' => 'OPS']), $this->owner, SpaceRole::Admin);

    foreach ([$this->owner, admin()] as $actor) {
        $this->actingAs($actor)->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('data.admin_companies.*.name', [null]);
    }
    $this->actingAs($this->owner)->getJson('/api/v1/navigation')->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', null);
});

it('остальная админка работает: пользователи, приглашение, журнал', function () {
    $this->actingAs(admin());

    $this->getJson(adminPath().'users')->assertOk();
    $this->postJson(adminPath().'invitations', ['name' => 'Новый Сотрудник', 'email' => 'new@selen.test', 'role' => 'member'])->assertCreated();
    $this->getJson(adminPath().'events')->assertOk();
});

it('app:company-mode: одна компания — всё в порядке; несколько в режиме «одна компания» — предупреждение в лог', function () {
    Log::spy();
    $this->artisan('app:company-mode')->assertSuccessful();
    $this->artisan('app:company-mode', ['--warning' => true])->doesntExpectOutputToContain('Режим')->assertSuccessful();
    Log::shouldNotHaveReceived('warning');

    otherCompany(['name' => 'Компания 2']);
    $this->artisan('app:company-mode', ['--warning' => true])
        ->expectsOutputToContain('Режим «одна компания», а в базе компаний: 2')
        ->assertFailed();
    Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context) => $context === ['companies' => 2]);

    // В режиме «несколько компаний» несколько компаний — норма
    config(['selen.multi_company' => true]);
    $this->artisan('app:company-mode')->assertSuccessful();
});

it('демо make fresh — одна компания; вторая и третья — только в режиме «несколько компаний»', function (bool $multi) {
    config(['selen.multi_company' => $multi]);
    $this->app['env'] = 'local';
    // Сидеры демо не выполняются: проверяем только, какие вызываются (полное демо строится минуты)
    $this->partialMock(DemoSeeder::class)->shouldReceive('run')->once();
    $this->partialMock(BoardsDemoSeeder::class)->shouldReceive('run')->once();
    $this->partialMock(CompaniesDemoSeeder::class)->shouldReceive('run')->times($multi ? 1 : 0);

    $this->seed(DatabaseSeeder::class);
})->with(['одна компания' => false, 'несколько компаний' => true]);

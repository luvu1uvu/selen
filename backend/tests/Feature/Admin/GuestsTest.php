<?php

use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\EventLogEntry;
use App\Models\User;
use App\Notifications\AccessOpenedNotification;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/*
| Гости компании (docs/adr/0024-rights-2.md, П2c; решения PM 23.10, вопрос 4, и 28.10): сотрудник с действующим «домом»
| в другой компании получает личный доступ к пространствам — роли без «управления доступом», срок по желанию;
| «Убрать гостя» снимает его выдачи. Ведёт право «управлять пользователями». Изоляция и матрицы — CompanyIsolationTest,
| AccessMatrixTest, AdminAccessMatrixTest.
*/

beforeEach(function () {
    Notification::fake();
    $this->home = otherCompany(['name' => 'Компания 2']);
    $this->employee = member(['name' => 'Олег Сторонний', 'email' => 'oleg@selen.test'], $this->home);
    $this->admin = admin();
    $this->dev = space(['key' => 'DEV']);
    $this->ops = space(['key' => 'OPS']);
    $this->actingAs($this->admin);
});

function addGuestRequest(array $overrides = []): array
{
    return $overrides + [
        'email' => 'Oleg@Selen.test',
        'expires_on' => null,
        'spaces' => [['space_id' => test()->dev->id, 'role' => 'commenter']],
    ];
}

it('добавляет сотрудника другой компании гостем: доступ к выбранному пространству, письмо без названия компании', function () {
    $this->postJson(adminPath().'guests', addGuestRequest([
        'expires_on' => now()->addDays(10)->format('Y-m-d'),
        'spaces' => [['space_id' => $this->dev->id, 'role' => 'editor', 'own_cards_only' => true]],
    ]))->assertCreated()
        ->assertJsonPath('data.id', $this->employee->id)
        ->assertJsonPath('data.guest.expired', false)
        // Откуда он и когда входил — не показывается (минимум ПДн)
        ->assertJsonPath('data.last_login_at', null);

    $this->actingAs($this->employee)->getJson('/api/v1/spaces/DEV')->assertOk()->assertJsonPath('data.my_role', 'editor');
    $this->getJson('/api/v1/spaces/OPS')->assertNotFound();
    expect(AccessGrant::query()->where('user_id', $this->employee->id)->sole()->ownCardsOnly())->toBeTrue();

    Notification::assertSentTo($this->employee, AccessOpenedNotification::class, function (AccessOpenedNotification $n) {
        $rendered = (string) $n->toMail($this->employee)->render();

        return str_contains($rendered, 'Вам открыт доступ в Selen') && ! str_contains($rendered, 'Компания');
    });
    expect(EventLogEntry::query()->where('company_id', company()->id)->pluck('event_type')->all())
        ->toContain('user.guest_added', 'space.member_added')
        ->and(EventLogEntry::query()->where('event_type', 'user.guest_added')->sole()->payload)->not->toHaveKey('email');
    expectNoPersonalDataInEventLog();
});

it('неизвестный email и сотрудник без действующего «дома» — один ответ «нет такого сотрудника»', function () {
    User::factory()->inCompany($this->home)->deactivated()->create(['email' => 'gone@selen.test']);

    foreach (['nobody@selen.test', 'gone@selen.test'] as $email) {
        $this->postJson(adminPath().'guests', addGuestRequest(['email' => $email]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => __('selen.guests.no_employee')]);
    }
    Notification::assertNothingSent();
});

it('свой сотрудник, Владелец и уже гость — понятный отказ', function () {
    member(['email' => 'mine@selen.test']);
    owner(['email' => 'boss@selen.test']);

    $this->postJson(adminPath().'guests', addGuestRequest(['email' => 'mine@selen.test']))
        ->assertJsonValidationErrors(['email' => __('selen.guests.already_member')]);
    $this->postJson(adminPath().'guests', addGuestRequest(['email' => 'boss@selen.test']))
        ->assertJsonValidationErrors(['email' => __('selen.guests.already_member')]);
    $this->postJson(adminPath().'guests', addGuestRequest())->assertCreated();
    $this->postJson(adminPath().'guests', addGuestRequest())
        ->assertJsonValidationErrors(['email' => __('selen.guests.already_guest')]);
});

it('гостю — только роли без «Администратора» и только пространства этой компании', function () {
    $foreign = space(['key' => 'SALES', 'company_id' => $this->home->id]);

    $this->postJson(adminPath().'guests', addGuestRequest(['spaces' => [['space_id' => $this->dev->id, 'role' => 'admin']]]))
        ->assertJsonValidationErrors('spaces.0.role');
    $this->postJson(adminPath().'guests', addGuestRequest(['spaces' => [['space_id' => $foreign->id, 'role' => 'commenter']]]))
        ->assertJsonValidationErrors(['spaces.0.space_id' => __('selen.spaces.not_found')]);
    $this->postJson(adminPath().'guests', addGuestRequest(['spaces' => []]))->assertJsonValidationErrors('spaces');
});

it('изменить гостя: срок и пространства — список заменяет прежний; событие срока', function () {
    $this->postJson(adminPath().'guests', addGuestRequest())->assertCreated();

    $this->putJson(adminPath()."guests/{$this->employee->id}", [
        'expires_on' => now()->addDays(5)->format('Y-m-d'),
        'spaces' => [['space_id' => $this->ops->id, 'role' => 'editor']],
    ])->assertOk()->assertJsonPath('data.guest.expired', false);

    $this->actingAs($this->employee)->getJson('/api/v1/spaces/DEV')->assertNotFound();
    $this->getJson('/api/v1/spaces/OPS')->assertOk()->assertJsonPath('data.my_role', 'editor');
    expect(EventLogEntry::query()->where('event_type', 'user.guest_updated')->count())->toBe(1)
        ->and(EventLogEntry::query()->where('event_type', 'space.member_removed')->count())->toBe(1);
});

it('срок — до конца выбранного дня по часовому поясу того, кто задаёт; без срока — по умолчанию', function () {
    $this->admin->forceFill(['timezone' => 'Asia/Novosibirsk'])->save();
    $day = now()->addDays(3)->format('Y-m-d');
    $this->postJson(adminPath().'guests', addGuestRequest(['expires_on' => $day]))->assertCreated()
        ->assertJsonPath('data.guest.expires_at', Carbon::parse("{$day} 23:59:59", 'Asia/Novosibirsk')->utc()->toIso8601ZuluString());

    $this->postJson(adminPath().'guests', addGuestRequest(['email' => member(['email' => 'two@selen.test'], $this->home)->email]))
        ->assertCreated()->assertJsonPath('data.guest.expires_at', null);
});

it('«Убрать гостя» снимает его выдачи: при новом добавлении прежние не оживают (решение PM 28.10, п. 6)', function () {
    $this->postJson(adminPath().'guests', addGuestRequest(['spaces' => [
        ['space_id' => $this->dev->id, 'role' => 'commenter'],
        ['space_id' => $this->ops->id, 'role' => 'editor'],
    ]]))->assertCreated();

    $this->deleteJson(adminPath()."guests/{$this->employee->id}")->assertNoContent();
    expect(AccessGrant::query()->where('user_id', $this->employee->id)->count())->toBe(0)
        ->and(DB::table('company_members')->where('user_id', $this->employee->id)->where('company_id', company()->id)->exists())->toBeFalse();
    $this->actingAs($this->employee)->getJson('/api/v1/spaces/DEV')->assertNotFound();

    $this->actingAs($this->admin)->postJson(adminPath().'guests', addGuestRequest())->assertCreated();
    $this->actingAs($this->employee)->getJson('/api/v1/spaces/OPS')->assertNotFound();
    // Его больше нет в «Пользователях» другой компании и нет действий «гостя» у сотрудника
    $this->actingAs($this->admin)->deleteJson(adminPath()."guests/{$this->admin->id}")->assertUnprocessable();
});

it('гость в «Пользователях» — с бейджем и сроком; фильтр «Гости»; в «Людях» пространства — с бейджем', function () {
    $this->postJson(adminPath().'guests', addGuestRequest())->assertCreated();

    $guests = collect($this->getJson(adminPath().'users?status=guest')->assertOk()->json('data'));
    expect($guests->pluck('id')->all())->toBe([$this->employee->id])
        ->and($guests->first()['guest'])->toBe(['expires_at' => null, 'expired' => false])
        ->and($guests->first()['permissions']['manage_guest'])->toBeTrue()
        ->and($guests->first()['permissions']['deactivate'])->toBeFalse();
    // Страница человека — та же пометка, что в списке; у сотрудника — null
    expect($this->getJson(adminPath()."users/{$this->employee->id}/access")->assertOk()->json('data.user.guest'))
        ->toBe(['expires_at' => null, 'expired' => false])
        ->and($this->getJson(adminPath()."users/{$this->admin->id}/access")->assertOk()->json('data.user.guest'))->toBeNull();

    addToSpace($this->dev, $this->admin, SpaceRole::Admin);
    $person = collect($this->getJson('/api/v1/spaces/DEV/members')->assertOk()->json('data'))->firstWhere('user.id', $this->employee->id);
    expect($person['user']['guest'])->toBeTrue();
});

it('гость, у которого не осталось «дома», войти не может: гостевой доступ сам по себе вход не открывает', function () {
    $this->postJson(adminPath().'guests', addGuestRequest())->assertCreated();
    $homeAdmin = admin(company: $this->home);

    $this->actingAs($homeAdmin)->postJson(adminPath($this->home)."users/{$this->employee->id}/deactivate")->assertOk();

    expect($this->employee->fresh()->isDeactivated())->toBeTrue();
    // В этой компании он по-прежнему гость, но без «дома» — «деактивирован»
    $row = collect($this->actingAs($this->admin)->getJson(adminPath().'users')->json('data'))->firstWhere('id', $this->employee->id);
    expect($row['status'])->toBe('deactivated');
});

it('гостем управляет право «управлять пользователями»: участник без него — 403', function () {
    $this->actingAs(member())->postJson(adminPath().'guests', addGuestRequest())->assertForbidden();
});

it('«дом» не становится гостем (БД)', function () {
    $mine = member();

    expect(fn () => DB::transaction(fn () => DB::table('company_members')->where('user_id', $mine->id)
        ->where('company_id', company()->id)->update(['kind' => 'guest'])))
        ->toThrow(QueryException::class, 'cannot become a guest');
    expect(Company::query()->count())->toBe(2);
});

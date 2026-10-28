<?php

use App\Enums\SpaceRole;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use Database\Seeders\CompaniesDemoSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\Storage;

/*
| Демо «Компании 2» и «Компании 3» (П2b-2): у каждой свои пространства и люди, администратор двух компаний выбирает
| компанию в админке, человек с двумя «домами» видит в дереве обе компании, у остальных названий компаний нет.
*/

/** Ключи пространств дерева на любой глубине, по алфавиту. */
function treeSpaceKeys(array $items): array
{
    $keys = collect($items)->flatMap(fn (array $node) => $node['type'] === 'space' ? [$node['space']['key']] : treeSpaceKeys($node['children']));

    return $keys->sort()->values()->all();
}

beforeEach(function () {
    Storage::fake('attachments');
    // Из «Компании 1» сидеру нужны только Анна и DEV (Олегу — доступ в DEV): полные демо-доски (BoardsDemoSeeder)
    // строятся минуты, их проверяет BoardsDemoSeederTest
    $this->seed(DemoSeeder::class);
    addToSpace(space(['key' => 'DEV', 'name' => 'Разработка']), member(['name' => 'Анна Смирнова', 'email' => 'anna@selen.test']), SpaceRole::Admin);
    // Гости демо (П2c) — сотрудники «Компании 1» из BoardsDemoSeeder
    member(['name' => 'Борис Петров', 'email' => 'boris@selen.test']);
    member(['name' => 'Вера Соколова', 'email' => 'vera@selen.test']);
    $this->seed(CompaniesDemoSeeder::class);
    $this->user = fn (string $login) => User::query()->where('email', "{$login}@selen.test")->sole();
});

it('три компании со своими пространствами; администратор двух компаний выбирает компанию в админке', function () {
    expect(Company::query()->orderBy('created_at')->pluck('name')->all())->toBe(['Компания 1', 'Компания 2', 'Компания 3'])
        ->and(Space::query()->inCompany(Company::query()->where('name', 'Компания 2')->sole())->orderBy('key')->pluck('key')->all())->toBe(['SALES', 'SUP'])
        ->and(Space::query()->inCompany(Company::query()->where('name', 'Компания 3')->sole())->pluck('key')->all())->toBe(['STOCK']);

    $this->actingAs(($this->user)('irina'))->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.admin_companies.*.name', ['Компания 2', 'Компания 3']);
    $this->actingAs(($this->user)('admin'))->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.admin_companies.*.name', [null]);
    $this->actingAs(($this->user)('owner'))->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('data.admin_companies.*.name', ['Компания 1', 'Компания 2', 'Компания 3']);
});

it('у Олега два «дома»: в дереве заголовки обеих компаний; администратор «Компании 1» убирает его только из неё', function () {
    $oleg = ($this->user)('oleg');
    $trees = $this->actingAs($oleg)->getJson('/api/v1/navigation')->assertOk()->json('data');

    expect(collect($trees)->pluck('name')->all())->toBe(['Компания 1', 'Компания 2'])
        ->and(treeSpaceKeys($trees[0]['items']))->toBe(['DEV'])
        ->and(flatTree($trees[1]['items']))->toBe(['[Клиентский отдел]', '  SALES', '  SUP']);

    // Деактивация в компании (П2c): во «Компании 2» Олег работает дальше
    $this->actingAs(($this->user)('admin'))->postJson(adminPath()."users/{$oleg->id}/deactivate")->assertOk();
    $trees = $this->actingAs($oleg->fresh())->getJson('/api/v1/navigation')->assertOk()->json('data');
    expect($trees)->toHaveCount(1)
        ->and(flatTree($trees[0]['items']))->toBe(['[Клиентский отдел]', '  SALES', '  SUP']);
});

it('у сотрудников одной компании названий компаний нет: дерево — одно, без названия', function () {
    foreach (['nina' => ['STOCK'], 'kirill' => ['SALES', 'SUP'], 'anna' => ['DEV']] as $login => $keys) {
        $response = $this->actingAs(($this->user)($login))->getJson('/api/v1/navigation')->assertOk();

        expect($response->json('data'))->toHaveCount(1)
            ->and($response->json('data.0.name'))->toBeNull()
            ->and($response->getContent())->not->toContain('Компания 1')->not->toContain('Компания 2')->not->toContain('Компания 3')
            ->and(treeSpaceKeys($response->json('data.0.items')))->toBe($keys);
    }
    expectNoPersonalDataInEventLog();
});

it('гости (П2c): Борис — в «Поддержке» «Компании 2» без срока, Вера — в «Складе» «Компании 3» со сроком', function () {
    $boris = ($this->user)('boris');
    $trees = $this->actingAs($boris)->getJson('/api/v1/navigation')->assertOk()->json('data');
    // В тесте у Бориса нет пространств «Компании 1» — в дереве одна компания (в демо — обе, с названиями)
    expect(collect($trees)->flatMap(fn (array $tree) => treeSpaceKeys($tree['items']))->all())->toBe(['SUP']);
    $this->getJson('/api/v1/spaces/SUP')->assertOk()->assertJsonPath('data.my_role', 'commenter');
    $this->getJson('/api/v1/spaces/SALES')->assertNotFound();

    $irina = ($this->user)('irina');
    $third = Company::query()->where('name', 'Компания 3')->sole();
    $vera = collect($this->actingAs($irina)->getJson(adminPath($third).'users?status=guest')->assertOk()->json('data'))->sole();
    expect($vera['email'])->toBe('vera@selen.test')
        ->and($vera['guest']['expires_at'])->not->toBeNull();
});

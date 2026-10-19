<?php

use App\Models\AuthAuditEntry;
use Illuminate\Testing\TestResponse;

// IP клиента за прокси (LATER-61, ADR-0021). Стенд: tailscale serve на хосте ставит X-Forwarded-For с адресом
// устройства в tailnet, nginx в Docker видит хост как шлюз сети (172.18.0.1) и дописывает его к цепочке
// ($proxy_add_x_forwarded_for). Laravel читает цепочку, только если соединение — от доверенного прокси
// (TRUSTED_PROXIES), и берёт крайний правый адрес не из доверенных подсетей.

const STAND_GATEWAY = '172.18.0.1';
const TAILNET_DEVICE = '100.101.102.103';

function loginThroughProxy(string $remoteAddr, string $forwardedFor, string $email = 'nobody@selen.test'): TestResponse
{
    return test()->withServerVariables(['REMOTE_ADDR' => $remoteAddr])->postJson(
        '/api/v1/auth/login',
        ['email' => $email, 'password' => 'wrong-password'],
        ['X-Forwarded-For' => $forwardedFor],
    );
}

function trustStandProxy(): void
{
    config(['trustedproxy.proxies' => '172.16.0.0/12']);
}

it('по умолчанию никому не доверяет: IP — адрес соединения, а не X-Forwarded-For', function () {
    loginThroughProxy(STAND_GATEWAY, TAILNET_DEVICE.', '.STAND_GATEWAY)->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe(STAND_GATEWAY);
});

// Без списка прокси Laravel сам доверяет всем, если Host оканчивается на .on-forge.com / .on-vapor.com —
// а Host присылает клиент. Пустой TRUSTED_PROXIES — пустой список, а не null (точечный аудит LATER-61)
it('без TRUSTED_PROXIES не доверяет прокси и при Host хостингов Laravel', function (string $host) {
    test()->withServerVariables(['REMOTE_ADDR' => '192.0.2.50'])->postJson(
        "http://{$host}/api/v1/auth/login",
        ['email' => 'nobody@selen.test', 'password' => 'wrong-password'],
        ['X-Forwarded-For' => '10.9.9.9'],
    )->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe('192.0.2.50');
})->with(['selen.on-forge.com', 'selen.on-vapor.com']);

it('за доверенным прокси пишет в auth_audit адрес, который передал прокси', function () {
    trustStandProxy();

    loginThroughProxy(STAND_GATEWAY, TAILNET_DEVICE.', '.STAND_GATEWAY)->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe(TAILNET_DEVICE);
});

it('за доверенным прокси присланный клиентом X-Forwarded-For не становится IP', function (string $fromClient) {
    trustStandProxy();

    // Прокси дописал адрес клиента к присланному заголовку, а не заменил его
    loginThroughProxy(STAND_GATEWAY, $fromClient.', '.TAILNET_DEVICE.', '.STAND_GATEWAY)->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe(TAILNET_DEVICE);
})->with([
    'внешний адрес' => '203.0.113.7',
    'адрес из сети офиса' => '10.9.9.9',
    'адрес из сети Docker' => '172.20.5.5',
    'несколько адресов' => '10.0.0.1, 10.0.0.2',
]);

it('за доверенным прокси лимит входа не обходится сменой X-Forwarded-For клиента', function () {
    trustStandProxy();
    member(['email' => 'user@selen.test']);

    foreach (range(1, 5) as $attempt) {
        loginThroughProxy(STAND_GATEWAY, "10.0.0.{$attempt}, ".TAILNET_DEVICE.', '.STAND_GATEWAY, 'user@selen.test')
            ->assertUnprocessable();
    }

    loginThroughProxy(STAND_GATEWAY, '10.0.0.6, '.TAILNET_DEVICE.', '.STAND_GATEWAY, 'user@selen.test')
        ->assertTooManyRequests();
});

it('за доверенным прокси у каждого устройства свой лимит по IP, а не общий у шлюза', function () {
    trustStandProxy();

    // 20 попыток в минуту на IP — разные email, чтобы не сработали лимиты по email
    foreach (range(1, 20) as $attempt) {
        loginThroughProxy(STAND_GATEWAY, '100.64.0.1, '.STAND_GATEWAY, "nobody{$attempt}@selen.test")
            ->assertUnprocessable();
    }

    loginThroughProxy(STAND_GATEWAY, '100.64.0.1, '.STAND_GATEWAY, 'nobody21@selen.test')->assertTooManyRequests();
    loginThroughProxy(STAND_GATEWAY, '100.64.0.2, '.STAND_GATEWAY, 'nobody21@selen.test')->assertUnprocessable();
});

it('не читает X-Forwarded-For, если соединение не от доверенного прокси', function () {
    trustStandProxy();

    loginThroughProxy('192.0.2.50', TAILNET_DEVICE.', 192.0.2.50')->assertUnprocessable();

    expect(AuthAuditEntry::query()->sole()->ip)->toBe('192.0.2.50');
});

it('ставит cookie флаг Secure по X-Forwarded-Proto только от доверенного прокси', function (string $remoteAddr, bool $secure) {
    trustStandProxy();
    // Как на стенде (ADR-0018): флаг Secure — по протоколу запроса
    config(['session.secure' => null]);

    $response = $this->withServerVariables(['REMOTE_ADDR' => $remoteAddr])
        ->get('/sanctum/csrf-cookie', ['Referer' => 'http://localhost/', 'X-Forwarded-Proto' => 'https'])
        ->assertNoContent();

    $cookies = collect($response->headers->getCookies())->keyBy(fn ($cookie) => $cookie->getName());
    expect($cookies->get('XSRF-TOKEN')?->isSecure())->toBe($secure);
})->with([
    'tailscale serve через шлюз Docker' => [STAND_GATEWAY, true],
    'чужой адрес' => ['192.0.2.50', false],
]);

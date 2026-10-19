<?php

namespace Tests\Support;

use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;

/**
 * Имитация отдельного браузера для сквозных тестов.
 *
 * Хранит cookie между запросами (как настоящий браузер) и перед каждым запросом
 * сбрасывает закэшированные в приложении guard'ы и сессию — пользователь определяется
 * только по cookie. Это позволяет честно проверить, что сессия завершена после деактивации.
 */
class Browser
{
    /** @var array<string, string> */
    private array $cookies = [];

    /** @var array<string, string> заголовки всех следующих запросов (как их ставит SPA) */
    private array $headers = [];

    /**
     * Пользователь вкладки — как в SPA (frontend app/queryClient.ts): после входа или принятия приглашения запросы
     * несут X-Selen-User с его id, после выхода — нет (ADR-0002, «Изменения»). false — вкладка без заголовка
     * (открыта до обновления кода).
     */
    private string|false|null $tabUser = null;

    /**
     * @param  object  $test  текущий тест (Pest передаёт прокси к TestCase; нужен его метод call())
     */
    public function __construct(private readonly object $test, private readonly string $ip = '10.0.0.1') {}

    /** @param array<string, mixed> $data */
    public function get(string $uri, array $data = []): TestResponse
    {
        return $this->request('GET', $uri.($data ? '?'.http_build_query($data) : ''));
    }

    /** @param array<string, mixed> $data */
    public function post(string $uri, array $data = []): TestResponse
    {
        return $this->request('POST', $uri, $data);
    }

    /** @param array<string, mixed> $data */
    public function put(string $uri, array $data = []): TestResponse
    {
        return $this->request('PUT', $uri, $data);
    }

    /** @param array<string, mixed> $data */
    public function patch(string $uri, array $data = []): TestResponse
    {
        return $this->request('PATCH', $uri, $data);
    }

    /** @param array<string, mixed> $data */
    public function delete(string $uri, array $data = []): TestResponse
    {
        return $this->request('DELETE', $uri, $data);
    }

    /**
     * Загрузка файлов формой (multipart), как это делает браузер.
     *
     * @param  array<string, UploadedFile>  $files
     */
    public function upload(string $uri, array $files): TestResponse
    {
        return $this->request('POST', $uri, files: $files);
    }

    /** Запросы без X-Selen-User — как вкладка со старым кодом, которая его не знает. */
    public function withoutTabUser(): self
    {
        $this->tabUser = false;

        return $this;
    }

    /** Заголовок для всех следующих запросов, например X-Selen-User — чужой пользователь вкладки. */
    public function withHeader(string $name, string $value): self
    {
        $this->headers['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;

        return $this;
    }

    /** Удалить cookie (например, имитировать закрытие браузера — исчезает cookie сессии). */
    public function forgetCookie(string $prefix): void
    {
        foreach (array_keys($this->cookies) as $name) {
            if (str_starts_with($name, $prefix)) {
                unset($this->cookies[$name]);
            }
        }
    }

    public function hasCookie(string $prefix): bool
    {
        foreach (array_keys($this->cookies) as $name) {
            if (str_starts_with($name, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, UploadedFile>  $files  есть файлы — запрос формой (multipart), иначе JSON
     */
    private function request(string $method, string $uri, array $data = [], array $files = []): TestResponse
    {
        // В production каждый запрос — новый процесс php-fpm; в тестах приложение одно,
        // поэтому сбрасываем всё, что могло запомнить пользователя или сессию прошлого запроса
        app('auth')->forgetGuards();
        app()->forgetInstance('auth.driver');
        app('session')->forgetDrivers();
        app()->forgetInstance('session.store');

        $server = [
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_REFERER' => 'http://localhost/',
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest',
            'REMOTE_ADDR' => $this->ip,
            ...(is_string($this->tabUser) ? ['HTTP_X_SELEN_USER' => $this->tabUser] : []),
            ...$this->headers,
        ];

        $response = $files === []
            ? $this->test->call($method, $uri, [], $this->cookies, [], ['CONTENT_TYPE' => 'application/json', ...$server],
                $method === 'GET' ? null : (string) json_encode($data))
            : $this->test->call($method, $uri, $data, $this->cookies, $files, $server);

        $this->rememberTabUser($uri, $response);

        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->isCleared()) {
                unset($this->cookies[$cookie->getName()]);
            } else {
                $this->cookies[$cookie->getName()] = (string) $cookie->getValue();
            }
        }

        return $response;
    }

    /** Вход и принятие приглашения задают пользователя вкладки, выход — сбрасывает (как SPA). */
    private function rememberTabUser(string $uri, TestResponse $response): void
    {
        if ($this->tabUser === false || ! $response->isSuccessful()) {
            return;
        }

        $path = (string) parse_url($uri, PHP_URL_PATH);
        if ($path === '/api/v1/auth/logout') {
            $this->tabUser = null;
        } elseif ($path === '/api/v1/auth/login' || preg_match('#^/api/v1/invitations/[^/]+/accept$#', $path) === 1) {
            $id = $response->json('data.id');
            $this->tabUser = is_string($id) ? $id : null;
        }
    }
}

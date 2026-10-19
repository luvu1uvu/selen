<?php

namespace App\Console\Commands\Concerns;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Console\Command\Command;

/**
 * Команды стенда PM: ошибки проверки и прав — понятным текстом в консоль и код завершения 1, без трассировки.
 *
 * @mixin \Illuminate\Console\Command
 */
trait ReportsStandErrors
{
    /**
     * @param  callable(): int  $run
     */
    protected function reportingErrors(callable $run): int
    {
        try {
            return $run();
        } catch (ValidationException $e) {
            foreach ($e->validator->errors()->all() as $error) {
                $this->components->error($error);
            }
        } catch (AuthorizationException $e) {
            $this->components->error('Нет прав: '.$e->getMessage());
        }

        return Command::FAILURE;
    }
}

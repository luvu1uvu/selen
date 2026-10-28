<?php

namespace App\Notifications;

use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Письмо на новый адрес со ссылкой подтверждения (смена email администратором, П2c-2). Адрес получателя — явно
 * (Notification::route), а не из модели: пока ссылка не подтверждена, у учётной записи прежний email.
 *
 * Отправляется через очередь; задача шифруется (ShouldBeEncrypted), т. к. содержит токен.
 */
class EmailChangeConfirmationNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $name,
        public readonly string $timezone,
        #[\SensitiveParameter] public readonly string $token,
        public readonly CarbonInterface $expiresAt,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = config('selen.frontend_url').str_replace(
            '{token}',
            $this->token,
            (string) config('selen.frontend_paths.email_change'),
        );

        return (new MailMessage)
            ->subject(__('mail.email_change.confirm_subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $this->name]))
            ->line(__('mail.email_change.confirm_intro', ['app' => config('app.name')]))
            ->action(__('mail.email_change.confirm_action'), $url)
            ->line(__('mail.email_change.confirm_after'))
            ->line(__('mail.email_change.confirm_expires', [
                'date' => $this->expiresAt->copy()->setTimezone($this->timezone)->format('d.m.Y H:i'),
                'timezone' => $this->timezone,
            ]))
            ->line(__('mail.email_change.confirm_ignore'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

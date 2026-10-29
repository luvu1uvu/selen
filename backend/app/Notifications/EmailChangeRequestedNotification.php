<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Уведомление на прежний адрес: администратор запросил смену email (П2c-2, решение PM 28.10). Новый адрес — маской.
 * Так человек сразу узнаёт о смене, которую не просил (например, администратор поставил свой адрес). Задача очереди
 * шифруется: в ней адрес и имена (аудит П2c-2, S-3).
 */
class EmailChangeRequestedNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $name,
        public readonly string $actorName,
        public readonly string $maskedEmail,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('mail.email_change.requested_subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $this->name]))
            ->line(__('mail.email_change.requested_intro', [
                'actor' => $this->actorName,
                'app' => config('app.name'),
                'email' => $this->maskedEmail,
            ]))
            ->line(__('mail.email_change.requested_until'))
            ->line(__('mail.email_change.requested_warning'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

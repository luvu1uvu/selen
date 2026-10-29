<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Уведомление на прежний адрес: новый email подтверждён (П2c-2). Новый адрес — маской. Задача очереди шифруется: в ней
 * адрес и имя (аудит П2c-2, S-3).
 */
class EmailChangedNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $name,
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
            ->subject(__('mail.email_change.changed_subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $this->name]))
            ->line(__('mail.email_change.changed_intro', ['app' => config('app.name'), 'email' => $this->maskedEmail]))
            ->line(__('mail.email_change.changed_warning'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

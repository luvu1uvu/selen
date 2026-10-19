<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Письмо со ссылкой на страницу сброса пароля в SPA. Отправляется через очередь.
 */
class ResetPasswordNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(#[\SensitiveParameter] public readonly string $token) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        $url = config('selen.frontend_url').strtr((string) config('selen.frontend_paths.password_reset'), [
            '{token}' => $this->token,
            '{email}' => urlencode($notifiable->email),
        ]);

        return (new MailMessage)
            ->subject(__('mail.password_reset.subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $notifiable->name]))
            ->line(__('mail.password_reset.intro'))
            ->action(__('mail.password_reset.action'), $url)
            ->line(__('mail.password_reset.expires', ['minutes' => config('auth.passwords.users.expire')]))
            ->line(__('mail.password_reset.ignore'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

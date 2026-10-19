<?php

namespace App\Notifications;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Письмо-приглашение со ссылкой для установки пароля.
 *
 * Отправляется через очередь; задача шифруется (ShouldBeEncrypted), т. к. содержит токен.
 * Пароль в письмах не отправляется никогда.
 */
class InvitationNotification extends Notification implements ShouldBeEncrypted, ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly Invitation $invitation,
        #[\SensitiveParameter] public readonly string $token,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        $url = config('selen.frontend_url').str_replace(
            '{token}',
            $this->token,
            (string) config('selen.frontend_paths.invitation'),
        );

        return (new MailMessage)
            ->subject(__('mail.invitation.subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $notifiable->name]))
            ->line(__('mail.invitation.intro', ['app' => config('app.name')]))
            ->action(__('mail.invitation.action'), $url)
            ->line(__('mail.invitation.expires', [
                'date' => $this->invitation->expires_at->setTimezone($notifiable->timezone)->format('d.m.Y H:i'),
                'timezone' => $notifiable->timezone,
            ]))
            ->line(__('mail.invitation.ignore'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

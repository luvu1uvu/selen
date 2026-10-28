<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Письмо существующему сотруднику, которому открыт доступ в ещё одну компанию — «дом» по приглашению или гостевой доступ
 * (П2c). Текст тот же, что у приглашения, и без названия компании (решение PM 28.10, п. 3); вместо «задать пароль» —
 * ссылка на вход: принимать нечего, доступ уже открыт.
 */
class AccessOpenedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject(__('mail.invitation.subject', ['app' => config('app.name')]))
            ->greeting(__('mail.greeting', ['name' => $notifiable->name]))
            ->line(__('mail.invitation.intro', ['app' => config('app.name')]))
            ->line(__('mail.access_opened.sign_in', ['app' => config('app.name')]))
            ->action(__('mail.access_opened.action'), config('selen.frontend_url').config('selen.frontend_paths.login'))
            ->line(__('mail.invitation.ignore'))
            ->salutation(__('mail.salutation', ['app' => config('app.name')]));
    }
}

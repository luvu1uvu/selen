<?php

namespace App\Actions\Auth;

use App\Enums\EventType;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Auth;

class LogoutAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $user): void
    {
        $this->events->record(EventType::Logout, $user, $user);

        Auth::guard('web')->logout();
    }
}

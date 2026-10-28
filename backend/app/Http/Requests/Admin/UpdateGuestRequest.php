<?php

namespace App\Http\Requests\Admin;

use App\Enums\SpaceRole;
use App\Http\Requests\Admin\Concerns\ParsesGuestExpiry;
use App\Http\Requests\Admin\Concerns\ValidatesSpaceGrants;
use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

/** Изменить гостя: срок и пространства (список заменяет прежний там, где автор выдаёт доступ). */
class UpdateGuestRequest extends FormRequest
{
    use ParsesGuestExpiry, ValidatesSpaceGrants;

    public function authorize(): Response
    {
        return Gate::inspect('manageGuests', [User::class, $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = $this->spaceGrantRules([SpaceRole::Editor, SpaceRole::Commenter]);
        $rules['spaces'] = ['present', 'array', 'max:50'];

        return [...$this->guestExpiryRules(), ...$rules];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [fn (Validator $validator) => $validator->errors()->isEmpty() ? $this->validateSpaceGrants($validator) : null];
    }
}

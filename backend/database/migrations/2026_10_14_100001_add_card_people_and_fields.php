<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Этап 2a: люди в карточке, поля карточки, режим «только свои карточки», автоназначение.
 *
 * - Заказчик (один, по умолчанию автор), ответственный (один, может отсутствовать), участники (несколько).
 * - Срок: дата без времени (due_date) или точный момент (due_at) — не оба сразу.
 * - Режим «только свои карточки» — флаг участника пространства (docs/adr/0008-own-cards-only.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('space_members', function (Blueprint $table) {
            $table->boolean('own_cards_only')->default(false);
        });
        // Администратор пространства видит всё — ограничение к нему неприменимо
        DB::statement(<<<'SQL'
            ALTER TABLE space_members ADD CONSTRAINT space_members_admin_not_restricted
                CHECK (NOT (role = 'admin' AND own_cards_only))
            SQL);

        Schema::table('boards', function (Blueprint $table) {
            // Переместивший в «в работе»/«готово» становится участником или ответственным (как в Kaiten)
            $table->boolean('auto_assign_on_move')->default(true);
        });

        Schema::table('cards', function (Blueprint $table) {
            $table->foreignUlid('customer_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignUlid('responsible_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->date('due_date')->nullable();
            $table->timestampTz('due_at')->nullable();
            $table->boolean('is_urgent')->default(false);
            // План в часах, шаг 0,5
            $table->decimal('estimate_hours', 6, 1)->nullable();

            $table->index('customer_id');
            $table->index('responsible_id');
        });

        // Заказчик по умолчанию — автор карточки
        DB::statement('UPDATE cards SET customer_id = created_by');
        DB::statement('ALTER TABLE cards ALTER COLUMN customer_id SET NOT NULL');
        DB::statement(<<<'SQL'
            ALTER TABLE cards
                ADD CONSTRAINT cards_single_due CHECK (due_date IS NULL OR due_at IS NULL),
                ADD CONSTRAINT cards_estimate_step CHECK (estimate_hours IS NULL OR (estimate_hours >= 0 AND mod(estimate_hours * 2, 1) = 0))
            SQL);

        Schema::create('card_participants', function (Blueprint $table) {
            $table->foreignUlid('card_id')->constrained()->restrictOnDelete();
            $table->foreignUlid('user_id')->constrained()->restrictOnDelete();
            // Кто добавил; null — система
            $table->foreignUlid('added_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestampTz('created_at');

            $table->primary(['card_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_participants');

        Schema::table('cards', function (Blueprint $table) {
            $table->dropConstrainedForeignId('customer_id');
            $table->dropConstrainedForeignId('responsible_id');
            $table->dropColumn(['due_date', 'due_at', 'is_urgent', 'estimate_hours']);
        });

        Schema::table('boards', fn (Blueprint $table) => $table->dropColumn('auto_assign_on_move'));

        DB::statement('ALTER TABLE space_members DROP CONSTRAINT space_members_admin_not_restricted');
        Schema::table('space_members', fn (Blueprint $table) => $table->dropColumn('own_cards_only'));
    }
};

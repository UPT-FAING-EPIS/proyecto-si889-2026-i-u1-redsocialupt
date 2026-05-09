<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('call_signals', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('call_session_id');
            $table->unsignedBigInteger('sender_id');
            $table->string('signal_type', 50);
            $table->longText('payload')->nullable();
            $table->timestamps();

            $table->index(['call_session_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('call_signals');
    }
};

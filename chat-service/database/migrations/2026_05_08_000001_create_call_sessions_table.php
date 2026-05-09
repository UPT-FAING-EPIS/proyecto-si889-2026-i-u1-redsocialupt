<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('call_sessions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('caller_id');
            $table->unsignedBigInteger('receiver_id');
            $table->string('mode', 20)->default('audio');
            $table->string('status', 20)->default('ringing');
            $table->unsignedInteger('duration_seconds')->default(0);
            $table->timestamps();

            $table->index(['receiver_id', 'status']);
            $table->index(['caller_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('call_sessions');
    }
};

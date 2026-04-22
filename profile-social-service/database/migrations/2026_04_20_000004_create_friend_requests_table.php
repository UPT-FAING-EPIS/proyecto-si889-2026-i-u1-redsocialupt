<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('friend_requests', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('sender_id');
            $table->unsignedInteger('receiver_id');
            $table->enum('status', ['pending', 'accepted', 'rejected'])->default('pending');
            $table->timestamps();

            $table->unique(['sender_id', 'receiver_id']);
            $table->index('receiver_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('friend_requests');
    }
};

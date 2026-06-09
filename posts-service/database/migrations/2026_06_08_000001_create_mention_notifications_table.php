<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mention_notifications', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('mentioned_user_id');
            $table->unsignedInteger('actor_user_id');
            $table->unsignedInteger('post_id');
            $table->unsignedInteger('comment_id')->nullable();
            $table->unsignedInteger('group_id')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['mentioned_user_id', 'created_at'], 'mention_notifications_user_created_idx');
            $table->index(['post_id'], 'mention_notifications_post_idx');
            $table->index(['comment_id'], 'mention_notifications_comment_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mention_notifications');
    }
};

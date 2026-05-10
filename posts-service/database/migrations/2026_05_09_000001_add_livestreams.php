<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->enum('post_type', ['standard', 'livestream'])->default('standard')->after('group_id');
            $table->enum('live_status', ['live', 'ended'])->nullable()->after('visibility');
            $table->string('live_title', 180)->nullable()->after('live_status');
            $table->string('stream_key', 120)->nullable()->unique()->after('live_title');
            $table->string('playback_url', 500)->nullable()->after('stream_key');
            $table->enum('live_source', ['camera', 'screen'])->nullable()->after('playback_url');
            $table->unsignedInteger('duration_seconds')->default(0)->after('live_source');
        });

        Schema::create('livestream_reaction_events', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('post_id');
            $table->unsignedInteger('user_id');
            $table->string('reaction_type', 32);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['post_id', 'id']);
        });

        Schema::create('livestream_viewers', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('post_id');
            $table->unsignedInteger('user_id');
            $table->timestamp('last_seen_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['post_id', 'user_id']);
            $table->index(['post_id', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('livestream_viewers');
        Schema::dropIfExists('livestream_reaction_events');

        Schema::table('posts', function (Blueprint $table) {
            $table->dropUnique(['stream_key']);
            $table->dropColumn([
                'post_type',
                'live_status',
                'live_title',
                'stream_key',
                'playback_url',
                'live_source',
                'duration_seconds',
            ]);
        });
    }
};

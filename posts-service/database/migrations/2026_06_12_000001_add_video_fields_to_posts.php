<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->string('media_type', 20)->nullable()->after('image_url');
            $table->string('video_url', 500)->nullable()->after('media_type');
            $table->string('video_mime_type', 100)->nullable()->after('video_url');
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn(['media_type', 'video_url', 'video_mime_type']);
        });
    }
};

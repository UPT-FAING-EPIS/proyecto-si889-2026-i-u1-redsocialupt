<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            if (!Schema::hasColumn('posts', 'stream_aspect_ratio')) {
                $table->string('stream_aspect_ratio', 16)->nullable()->after('live_source');
            }
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            if (Schema::hasColumn('posts', 'stream_aspect_ratio')) {
                $table->dropColumn('stream_aspect_ratio');
            }
        });
    }
};

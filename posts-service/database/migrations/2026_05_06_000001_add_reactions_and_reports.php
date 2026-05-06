<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('likes', function (Blueprint $table) {
            $table->string('reaction_type', 30)->default('me_gusta')->after('post_id');
        });

        Schema::table('comment_likes', function (Blueprint $table) {
            $table->string('reaction_type', 30)->default('me_gusta')->after('comment_id');
        });

        Schema::create('content_reports', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('reporter_id');
            $table->enum('target_type', ['post', 'comment']);
            $table->unsignedInteger('target_id');
            $table->string('reason', 255);
            $table->enum('status', ['pending', 'reviewed', 'dismissed', 'sanctioned'])->default('pending');
            $table->unsignedInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('resolution_notes')->nullable();
            $table->timestamps();

            $table->index(['target_type', 'target_id']);
            $table->index(['status', 'created_at']);
            $table->unique(['reporter_id', 'target_type', 'target_id'], 'content_reports_unique_report');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_reports');

        Schema::table('comment_likes', function (Blueprint $table) {
            $table->dropColumn('reaction_type');
        });

        Schema::table('likes', function (Blueprint $table) {
            $table->dropColumn('reaction_type');
        });
    }
};

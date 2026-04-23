<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->string('user_name', 150)->nullable()->after('user_id');
            $table->string('user_school', 150)->nullable()->after('user_name');
            $table->string('user_faculty', 100)->nullable()->after('user_school');
        });

        Schema::table('comments', function (Blueprint $table) {
            $table->string('user_name', 150)->nullable()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn(['user_name', 'user_school', 'user_faculty']);
        });
        Schema::table('comments', function (Blueprint $table) {
            $table->dropColumn('user_name');
        });
    }
};

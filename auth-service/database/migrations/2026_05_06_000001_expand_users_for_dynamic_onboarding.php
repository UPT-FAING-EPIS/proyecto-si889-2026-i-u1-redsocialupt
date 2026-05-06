<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('area', 150)->nullable()->after('career');
            $table->string('position_title', 150)->nullable()->after('area');
        });

        DB::statement("ALTER TABLE users MODIFY user_type ENUM('student','teacher','administrativo') NOT NULL DEFAULT 'student'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE users MODIFY user_type ENUM('student','teacher') NOT NULL DEFAULT 'student'");

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['area', 'position_title']);
        });
    }
};

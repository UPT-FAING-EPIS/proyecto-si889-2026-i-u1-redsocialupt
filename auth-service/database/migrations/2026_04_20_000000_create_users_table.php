<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Crear la tabla users para autenticación con Google OAuth.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->increments('id');
            $table->string('google_id', 100)->unique();
            $table->string('email', 100)->unique();
            $table->string('name', 150)->nullable();
            $table->string('avatar_url', 500)->nullable();
            $table->enum('role', ['user', 'admin'])->default('user');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Eliminar la tabla users.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

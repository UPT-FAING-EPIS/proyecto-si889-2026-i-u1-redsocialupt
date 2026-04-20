<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    /**
     * Tabla asociada al modelo.
     */
    protected $table = 'users';

    /**
     * Campos que se pueden asignar masivamente.
     */
    protected $fillable = [
        'google_id',
        'email',
        'name',
        'avatar_url',
        'role',
        'is_active',
    ];

    /**
     * Campos ocultos en serialización JSON.
     */
    protected $hidden = [
        'google_id',
    ];

    /**
     * Casts de tipos.
     */
    protected $casts = [
        'is_active'  => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

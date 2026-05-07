<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    protected $table = 'users';

    protected $fillable = [
        'google_id',
        'email',
        'name',
        'avatar_url',
        'banner_url',
        // Campos del primer acceso (RF-01)
        'full_name',
        'user_type',
        'faculty',
        'career',
        'area',
        'position_title',
        'academic_cycle',
        'student_code',
        'bio',
        'blocked_reason',
        'blocked_until',
        'last_seen_at',
        // Control
        'role',
        'is_active',
        'is_profile_complete',
    ];

    protected $hidden = [
        'google_id',
    ];

    protected $casts = [
        'is_active'           => 'boolean',
        'is_profile_complete' => 'boolean',
        'blocked_until'       => 'datetime',
        'last_seen_at'        => 'datetime',
        'created_at'          => 'datetime',
        'updated_at'          => 'datetime',
    ];
}

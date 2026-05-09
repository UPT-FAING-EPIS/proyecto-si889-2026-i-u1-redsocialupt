<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CallSession extends Model
{
    protected $table = 'call_sessions';

    protected $fillable = [
        'caller_id',
        'receiver_id',
        'mode',
        'status',
        'duration_seconds',
    ];

    protected $casts = [
        'caller_id' => 'integer',
        'receiver_id' => 'integer',
        'duration_seconds' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

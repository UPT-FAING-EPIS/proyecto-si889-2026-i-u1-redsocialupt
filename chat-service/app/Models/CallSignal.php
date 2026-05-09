<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CallSignal extends Model
{
    protected $table = 'call_signals';

    protected $fillable = [
        'call_session_id',
        'sender_id',
        'signal_type',
        'payload',
    ];

    protected $casts = [
        'call_session_id' => 'integer',
        'sender_id' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

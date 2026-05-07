<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MessageReport extends Model
{
    protected $table = 'message_reports';

    protected $fillable = [
        'reporter_id',
        'message_id',
        'reason',
        'status',
        'reviewed_by',
        'reviewed_at',
        'resolution_notes',
    ];

    public function message()
    {
        return $this->belongsTo(Message::class, 'message_id');
    }

    protected $casts = [
        'reviewed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

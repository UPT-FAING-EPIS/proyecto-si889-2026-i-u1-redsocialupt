<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Message extends Model
{
    protected $table    = 'messages';
    protected $fillable = ['sender_id', 'receiver_id', 'content', 'image_url', 'is_read'];
    protected $casts    = [
        'is_read'    => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FriendRequest extends Model
{
    protected $table    = 'friend_requests';
    protected $fillable = ['sender_id', 'receiver_id', 'status'];
    protected $casts    = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

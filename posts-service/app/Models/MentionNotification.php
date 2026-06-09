<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MentionNotification extends Model
{
    protected $table = 'mention_notifications';

    protected $fillable = [
        'mentioned_user_id',
        'actor_user_id',
        'post_id',
        'comment_id',
        'group_id',
    ];

    public $timestamps = false;

    protected $casts = [
        'created_at' => 'datetime',
    ];
}

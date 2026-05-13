<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LivestreamViewer extends Model
{
    public $timestamps = false;

    protected $table = 'livestream_viewers';

    protected $fillable = [
        'post_id',
        'user_id',
        'last_seen_at',
        'created_at',
    ];

    protected $casts = [
        'last_seen_at' => 'datetime',
        'created_at' => 'datetime',
    ];
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LivestreamReactionEvent extends Model
{
    public $timestamps = false;

    protected $table = 'livestream_reaction_events';

    protected $fillable = [
        'post_id',
        'user_id',
        'reaction_type',
        'created_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];
}

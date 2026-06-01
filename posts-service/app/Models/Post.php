<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $table    = 'posts';
    protected $fillable = ['user_id', 'group_id', 'post_type', 'user_name', 'user_school', 'user_faculty', 'user_avatar', 'group_name', 'content', 'image_url', 'visibility', 'live_status', 'live_title', 'stream_key', 'playback_url', 'live_source', 'stream_aspect_ratio', 'duration_seconds'];
    protected $casts    = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function reactions()
    {
        return $this->hasMany(Like::class);
    }

    public function likes()
    {
        return $this->reactions();
    }

    public function comments()
    {
        return $this->hasMany(Comment::class);
    }

    public function livestreamReactionEvents()
    {
        return $this->hasMany(LivestreamReactionEvent::class);
    }

    public function livestreamViewers()
    {
        return $this->hasMany(LivestreamViewer::class);
    }
}

<?php

namespace App\Models;

use App\Support\VideoOptimizer;
use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $table    = 'posts';
    protected $fillable = ['user_id', 'group_id', 'post_type', 'user_name', 'user_school', 'user_faculty', 'user_avatar', 'group_name', 'content', 'image_url', 'media_type', 'video_url', 'video_mime_type', 'visibility', 'live_status', 'live_title', 'stream_key', 'playback_url', 'live_source', 'stream_aspect_ratio', 'duration_seconds'];
    protected $appends  = ['video_poster_url'];
    protected $casts    = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function getVideoPosterUrlAttribute(): ?string
    {
        $videoUrl = trim((string) ($this->attributes['video_url'] ?? ''));
        if ($videoUrl === '') {
            return null;
        }

        $path = parse_url($videoUrl, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            $path = $videoUrl;
        }

        $posterUrl = preg_replace('/\.[^.\/]+$/', '.jpg', $path);
        if (!is_string($posterUrl) || $posterUrl === '') {
            return null;
        }

        $absolutePath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . ltrim(str_replace('/', DIRECTORY_SEPARATOR, $posterUrl), DIRECTORY_SEPARATOR);
        if (!is_file($absolutePath)) {
            $videoAbsolutePath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . ltrim(str_replace('/', DIRECTORY_SEPARATOR, $path), DIRECTORY_SEPARATOR);
            VideoOptimizer::ensurePosterForExistingVideo($videoAbsolutePath, $absolutePath);
        }

        return is_file($absolutePath) ? $posterUrl : null;
    }

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

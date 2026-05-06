<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $table    = 'posts';
    protected $fillable = ['user_id', 'user_name', 'user_school', 'user_faculty', 'user_avatar', 'content', 'image_url', 'visibility'];
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
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    protected $table      = 'comments';
    protected $fillable   = ['user_id', 'post_id', 'content', 'user_name', 'user_avatar', 'user_faculty'];
    public    $timestamps = false;
    protected $casts      = ['created_at' => 'datetime'];

    public function reactions()
    {
        return $this->hasMany(CommentLike::class, 'comment_id');
    }

    public function likes()
    {
        return $this->reactions();
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommentLike extends Model
{
    protected $table      = 'comment_likes';
    protected $fillable   = ['user_id', 'comment_id', 'reaction_type'];
    public    $timestamps = false;
}

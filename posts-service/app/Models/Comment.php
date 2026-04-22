<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    protected $table      = 'comments';
    protected $fillable   = ['user_id', 'post_id', 'content'];
    public    $timestamps = false;
    protected $casts      = ['created_at' => 'datetime'];
}

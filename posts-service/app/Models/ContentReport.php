<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ContentReport extends Model
{
    protected $table = 'content_reports';

    protected $fillable = [
        'reporter_id',
        'target_type',
        'target_id',
        'reason',
        'status',
        'reviewed_by',
        'reviewed_at',
        'resolution_notes',
    ];

    public function post()
    {
        return $this->belongsTo(Post::class, 'target_id');
    }

    public function comment()
    {
        return $this->belongsTo(Comment::class, 'target_id');
    }

    protected $casts = [
        'reviewed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}

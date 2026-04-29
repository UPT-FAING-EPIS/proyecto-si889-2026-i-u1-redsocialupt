<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Comment;
use App\Models\CommentLike;

class CommentLikeService
{
    public function toggle(int $userId, int $commentId): array
    {
        if (!Comment::find($commentId)) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }

        $existing = CommentLike::where('user_id', $userId)
            ->where('comment_id', $commentId)
            ->first();

        if ($existing) {
            $existing->delete();
            $liked = false;
        } else {
            CommentLike::create([
                'user_id' => $userId,
                'comment_id' => $commentId,
            ]);
            $liked = true;
        }

        $count = CommentLike::where('comment_id', $commentId)->count();

        return ['liked' => $liked, 'count' => $count];
    }

    public function count(int $commentId): int
    {
        return CommentLike::where('comment_id', $commentId)->count();
    }
}

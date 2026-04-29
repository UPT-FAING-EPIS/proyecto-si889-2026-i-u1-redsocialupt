<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Like;
use App\Models\Post;

class LikeService
{
    /**
     * Alterna like/unlike en una publicación (RF-04).
     * Retorna si quedó liked o unliked.
     */
    public function toggle(int $userId, int $postId): array
    {
        // Verificar que el post exista
        if (!Post::find($postId)) {
            throw new PostsServiceException('Publicación no encontrada', 404);
        }

        $existing = Like::where('user_id', $userId)
                        ->where('post_id', $postId)
                        ->first();

        if ($existing) {
            $existing->delete();
            $liked = false;
        } else {
            Like::create(['user_id' => $userId, 'post_id' => $postId]);
            $liked = true;
        }

        $count = Like::where('post_id', $postId)->count();

        return ['liked' => $liked, 'count' => $count];
    }

    /**
     * Conteo de likes de un post.
     */
    public function count(int $postId): int
    {
        return Like::where('post_id', $postId)->count();
    }
}

<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\Post;

class CommentService
{
    /**
     * Agrega un comentario a una publicación (RF-05).
     */
    public function store(int $userId, int $postId, string $content): Comment
    {
        if (!Post::find($postId)) {
            throw new \Exception('Publicación no encontrada', 404);
        }

        return Comment::create([
            'user_id' => $userId,
            'post_id' => $postId,
            'content' => $content,
        ]);
    }

    /**
     * Lista los comentarios de una publicación.
     */
    public function getByPost(int $postId): \Illuminate\Support\Collection
    {
        return Comment::where('post_id', $postId)
                      ->orderBy('created_at', 'asc')
                      ->get();
    }

    /**
     * Elimina un comentario propio.
     */
    public function destroy(int $userId, int $commentId): void
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new \Exception('Comentario no encontrado', 404);
        }
        if ($comment->user_id !== $userId) {
            throw new \Exception('No autorizado para eliminar este comentario', 403);
        }
        $comment->delete();
    }

    /**
     * Admin elimina cualquier comentario (RF-09).
     */
    public function adminDestroy(int $commentId): void
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new \Exception('Comentario no encontrado', 404);
        }
        $comment->delete();
    }
}

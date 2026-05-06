<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Comment;
use App\Models\Post;

class CommentService
{
    private CommentLikeService $commentReactionService;

    public function __construct()
    {
        $this->commentReactionService = new CommentLikeService();
    }

    public function store(int $userId, int $postId, string $content, array $meta = []): Comment
    {
        if (!Post::find($postId)) {
            throw new PostsServiceException('Publicacion no encontrada', 404);
        }

        return Comment::create([
            'user_id' => $userId,
            'post_id' => $postId,
            'content' => $content,
            'user_name' => $meta['user_name'] ?? 'Usuario',
            'user_avatar' => $meta['user_avatar'] ?? null,
            'user_faculty' => $meta['user_faculty'] ?? '',
        ]);
    }

    public function getByPost(int $postId, string $sort = 'oldest', ?int $userId = null): \Illuminate\Support\Collection
    {
        $direction = $sort === 'newest' ? 'desc' : 'asc';

        $comments = Comment::where('post_id', $postId)
            ->orderBy('created_at', $direction)
            ->orderBy('id', $direction)
            ->get();

        $comments->each(function (Comment $comment) use ($userId) {
            $comment->reactions_total = $comment->reactions()->count();
            $comment->reactions_count = $this->commentReactionService->getReactionSummary($comment->id);
            $comment->current_reaction = $userId ? $this->commentReactionService->currentReaction($userId, $comment->id) : null;
        });

        return $comments;
    }

    public function destroy(int $userId, int $commentId): void
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }
        if ($comment->user_id !== $userId) {
            throw new PostsServiceException('No autorizado para eliminar este comentario', 403);
        }
        $comment->delete();
    }

    public function adminDestroy(int $commentId): void
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }
        $comment->delete();
    }
}

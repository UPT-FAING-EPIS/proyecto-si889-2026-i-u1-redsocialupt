<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Comment;
use App\Models\Post;

class CommentService
{
    private CommentLikeService $commentReactionService;
    private SocialBlockService $socialBlockService;

    public function __construct()
    {
        $this->commentReactionService = new CommentLikeService();
        $this->socialBlockService = new SocialBlockService();
    }

    public function store(int $userId, int $postId, string $content, array $meta = [], string $jwt = ''): Comment
    {
        $post = Post::find($postId);
        if (!$post) {
            throw new PostsServiceException('Publicacion no encontrada', 404);
        }

        if ($this->socialBlockService->isBlockedBetween($jwt, (int) $post->user_id)) {
            throw new PostsServiceException('No puedes interactuar con el contenido de este usuario', 403);
        }

        if ($post->group_id !== null && !$this->socialBlockService->canPostInGroup($jwt, (int) $post->group_id)) {
            throw new PostsServiceException('No puedes comentar en este grupo', 403);
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

    public function getByPost(int $postId, string $sort = 'oldest', ?int $userId = null, string $jwt = ''): \Illuminate\Support\Collection
    {
        $post = Post::find($postId);
        if (!$post) {
            throw new PostsServiceException('Publicacion no encontrada', 404);
        }

        if ($post->group_id !== null && !$this->socialBlockService->canViewGroupConversation($jwt, (int) $post->group_id)) {
            throw new PostsServiceException('No tienes acceso a la conversacion de este grupo', 403);
        }

        $direction = $sort === 'newest' ? 'desc' : 'asc';
        $hiddenIds = $this->socialBlockService->getHiddenUserIds($jwt);

        $comments = Comment::where('post_id', $postId)
            ->when(!empty($hiddenIds), fn($query) => $query->whereNotIn('user_id', $hiddenIds))
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
        $this->destroyWithAccess($userId, $commentId);
    }

    public function destroyWithAccess(int $userId, int $commentId, string $jwt = ''): void
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }
        if ($comment->user_id === $userId) {
            $comment->delete();
            return;
        }

        $post = Post::find($comment->post_id);
        if ($post && $post->group_id !== null && $this->socialBlockService->canManageGroup($jwt, (int) $post->group_id)) {
            $comment->delete();
            return;
        }

        throw new PostsServiceException('No autorizado para eliminar este comentario', 403);
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

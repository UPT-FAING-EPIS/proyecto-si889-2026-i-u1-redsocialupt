<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Comment;
use App\Models\CommentLike;

class CommentLikeService
{
    private SocialBlockService $socialBlockService;

    public function __construct()
    {
        $this->socialBlockService = new SocialBlockService();
    }

    public function react(int $userId, int $commentId, string $reactionType = 'me_gusta', string $jwt = ''): array
    {
        $comment = Comment::find($commentId);
        if (!$comment) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }

        if ($this->socialBlockService->isBlockedBetween($jwt, (int) $comment->user_id)) {
            throw new PostsServiceException('No puedes interactuar con el contenido de este usuario', 403);
        }

        if (!in_array($reactionType, LikeService::REACTION_TYPES, true)) {
            throw new PostsServiceException('Tipo de reaccion invalido', 422);
        }

        $existing = CommentLike::where('user_id', $userId)
            ->where('comment_id', $commentId)
            ->first();

        if ($existing && $existing->reaction_type === $reactionType) {
            $existing->delete();
            $currentReaction = null;
        } else {
            CommentLike::updateOrCreate(
                ['user_id' => $userId, 'comment_id' => $commentId],
                ['reaction_type' => $reactionType]
            );
            $currentReaction = $reactionType;
        }

        return [
            'current_reaction' => $currentReaction,
            'reactions_count' => $this->getReactionSummary($commentId),
            'reactions_total' => $this->count($commentId),
        ];
    }

    public function count(int $commentId): int
    {
        return CommentLike::where('comment_id', $commentId)->count();
    }

    public function currentReaction(int $userId, int $commentId): ?string
    {
        return CommentLike::where('user_id', $userId)
            ->where('comment_id', $commentId)
            ->value('reaction_type');
    }

    public function getReactionSummary(int $commentId): array
    {
        $counts = CommentLike::where('comment_id', $commentId)
            ->selectRaw('reaction_type, COUNT(*) as total')
            ->groupBy('reaction_type')
            ->pluck('total', 'reaction_type')
            ->toArray();

        $summary = [];
        foreach (LikeService::REACTION_TYPES as $type) {
            $summary[$type] = (int) ($counts[$type] ?? 0);
        }

        return $summary;
    }
}

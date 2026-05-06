<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Like;
use App\Models\Post;

class LikeService
{
    public const REACTION_TYPES = ['me_gusta', 'me_encanta', 'me_divierte', 'me_sorprende', 'me_enoja'];

    public function react(int $userId, int $postId, string $reactionType = 'me_gusta'): array
    {
        if (!Post::find($postId)) {
            throw new PostsServiceException('Publicación no encontrada', 404);
        }

        if (!in_array($reactionType, self::REACTION_TYPES, true)) {
            throw new PostsServiceException('Tipo de reacción inválido', 422);
        }

        $existing = Like::where('user_id', $userId)
            ->where('post_id', $postId)
            ->first();

        if ($existing && $existing->reaction_type === $reactionType) {
            $existing->delete();
            $currentReaction = null;
        } else {
            Like::updateOrCreate(
                ['user_id' => $userId, 'post_id' => $postId],
                ['reaction_type' => $reactionType]
            );
            $currentReaction = $reactionType;
        }

        return [
            'current_reaction' => $currentReaction,
            'reactions_count' => $this->getReactionSummary($postId),
            'reactions_total' => $this->count($postId),
        ];
    }

    public function count(int $postId): int
    {
        return Like::where('post_id', $postId)->count();
    }

    public function currentReaction(int $userId, int $postId): ?string
    {
        return Like::where('user_id', $userId)
            ->where('post_id', $postId)
            ->value('reaction_type');
    }

    public function getReactionSummary(int $postId): array
    {
        $counts = Like::where('post_id', $postId)
            ->selectRaw('reaction_type, COUNT(*) as total')
            ->groupBy('reaction_type')
            ->pluck('total', 'reaction_type')
            ->toArray();

        $summary = [];
        foreach (self::REACTION_TYPES as $type) {
            $summary[$type] = (int) ($counts[$type] ?? 0);
        }

        return $summary;
    }
}

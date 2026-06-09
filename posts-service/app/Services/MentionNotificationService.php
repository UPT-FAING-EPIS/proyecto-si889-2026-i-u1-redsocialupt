<?php

namespace App\Services;

use App\Models\Comment;
use App\Models\MentionNotification;
use App\Models\Post;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class MentionNotificationService
{
    /**
     * @param array<int|string> $mentionedUserIds
     */
    public function createForPost(Post $post, int $actorUserId, array $mentionedUserIds): void
    {
        $this->storeMentions($mentionedUserIds, [
            'actor_user_id' => $actorUserId,
            'post_id' => (int) $post->id,
            'comment_id' => null,
            'group_id' => $post->group_id !== null ? (int) $post->group_id : null,
        ]);
    }

    /**
     * @param array<int|string> $mentionedUserIds
     */
    public function createForComment(Comment $comment, Post $post, int $actorUserId, array $mentionedUserIds): void
    {
        $this->storeMentions($mentionedUserIds, [
            'actor_user_id' => $actorUserId,
            'post_id' => (int) $post->id,
            'comment_id' => (int) $comment->id,
            'group_id' => $post->group_id !== null ? (int) $post->group_id : null,
        ]);
    }

    public function listForUser(int $userId, int $limit = 40): Collection
    {
        $rows = MentionNotification::query()
            ->where('mentioned_user_id', $userId)
            ->orderByDesc('created_at')
            ->limit(max(1, min($limit, 100)))
            ->get();

        if ($rows->isEmpty()) {
            return collect();
        }

        $postIds = $rows->pluck('post_id')
            ->map(static fn ($value) => (int) $value)
            ->filter(static fn (int $value) => $value > 0)
            ->unique()
            ->values();

        $commentIds = $rows->pluck('comment_id')
            ->map(static fn ($value) => (int) $value)
            ->filter(static fn (int $value) => $value > 0)
            ->unique()
            ->values();

        $postsById = Post::query()
            ->whereIn('id', $postIds)
            ->get()
            ->keyBy(static fn (Post $post) => (int) $post->id);

        $commentsById = Comment::query()
            ->whereIn('id', $commentIds)
            ->get()
            ->keyBy(static fn (Comment $comment) => (int) $comment->id);

        return $rows
            ->map(function (MentionNotification $notification) use ($postsById, $commentsById) {
                $post = $postsById->get((int) $notification->post_id);
                if (!$post) {
                    return null;
                }

                $comment = $notification->comment_id ? $commentsById->get((int) $notification->comment_id) : null;
                if ($notification->comment_id && !$comment) {
                    return null;
                }

                return [
                    'id' => (int) $notification->id,
                    'actor_user_id' => (int) $notification->actor_user_id,
                    'post_id' => (int) $notification->post_id,
                    'comment_id' => $notification->comment_id ? (int) $notification->comment_id : null,
                    'group_id' => $post->group_id !== null ? (int) $post->group_id : null,
                    'post_type' => (string) ($post->post_type ?? 'standard'),
                    'post_excerpt' => $this->buildExcerpt((string) ($post->content ?? ''), 120),
                    'comment_excerpt' => $comment ? $this->buildExcerpt((string) ($comment->content ?? ''), 120) : null,
                    'created_at' => optional($notification->created_at)->toIso8601String(),
                ];
            })
            ->filter()
            ->values();
    }

    /**
     * @param array<int|string> $mentionedUserIds
     * @param array<string, int|null> $payload
     */
    private function storeMentions(array $mentionedUserIds, array $payload): void
    {
        $actorUserId = (int) ($payload['actor_user_id'] ?? 0);
        if ($actorUserId <= 0) {
            return;
        }

        $normalizedMentionedUserIds = collect($mentionedUserIds)
            ->map(static fn ($value) => (int) $value)
            ->filter(static fn (int $value) => $value > 0)
            ->reject(static fn (int $value) => $value === $actorUserId)
            ->unique()
            ->values();

        if ($normalizedMentionedUserIds->isEmpty()) {
            return;
        }

        $rows = $normalizedMentionedUserIds->map(static fn (int $mentionedUserId) => [
            'mentioned_user_id' => $mentionedUserId,
            'actor_user_id' => $actorUserId,
            'post_id' => (int) ($payload['post_id'] ?? 0),
            'comment_id' => $payload['comment_id'] ? (int) $payload['comment_id'] : null,
            'group_id' => $payload['group_id'] ? (int) $payload['group_id'] : null,
            'created_at' => Carbon::now(),
        ])->all();

        MentionNotification::query()->insert($rows);
    }

    private function buildExcerpt(string $value, int $limit = 120): string
    {
        $normalized = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        if ($normalized === '') {
            return '';
        }

        if (mb_strlen($normalized) <= $limit) {
            return $normalized;
        }

        return rtrim(mb_substr($normalized, 0, max(1, $limit - 1))) . '…';
    }
}

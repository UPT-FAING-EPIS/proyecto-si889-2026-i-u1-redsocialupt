<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\LivestreamReactionEvent;
use App\Models\LivestreamViewer;
use App\Models\Like;
use App\Models\Post;
use Carbon\Carbon;

class LivestreamService
{
    private const VIEWER_WINDOW_SECONDS = 35;

    private SocialBlockService $socialBlockService;

    public function __construct()
    {
        $this->socialBlockService = new SocialBlockService();
    }

    public function create(int $userId, array $data): Post
    {
        $source = $this->normalizeSource($data['live_source'] ?? 'camera');
        $streamKey = $data['stream_key'] ?? $this->generateStreamKey($userId);

        return Post::create([
            'user_id' => $userId,
            'post_type' => 'livestream',
            'user_name' => $data['user_name'] ?? 'Usuario',
            'user_school' => $data['user_school'] ?? '',
            'user_faculty' => $data['user_faculty'] ?? '',
            'user_avatar' => $data['user_avatar'] ?? null,
            'visibility' => $data['visibility'] ?? 'all',
            'live_status' => 'live',
            'live_title' => trim((string) ($data['live_title'] ?? '')) ?: 'Directo UPT',
            'stream_key' => $streamKey,
            'playback_url' => $data['playback_url'] ?? null,
            'live_source' => $source,
            'duration_seconds' => 0,
        ]);
    }

    public function listActive(int $userId, array $friendIds, ?string $userFaculty, string $jwt = '')
    {
        $hiddenIds = $this->socialBlockService->getHiddenUserIds($jwt);

        return Post::where('post_type', 'livestream')
            ->where('live_status', 'live')
            ->orderBy('created_at', 'desc')
            ->get()
            ->filter(function (Post $post) use ($userId, $friendIds, $userFaculty, $hiddenIds) {
                if (in_array((int) $post->user_id, $hiddenIds, true)) {
                    return false;
                }

                if ((int) $post->user_id === $userId) {
                    return true;
                }

                return match ($post->visibility) {
                    'all' => true,
                    'friends' => in_array((int) $post->user_id, $friendIds, true),
                    'faculty' => $userFaculty !== null
                        && trim((string) $userFaculty) !== ''
                        && trim((string) $post->user_faculty) === trim((string) $userFaculty),
                    default => false,
                };
            })
            ->values();
    }

    public function getById(int $postId): Post
    {
        $post = Post::find($postId);
        if (!$post || $post->post_type !== 'livestream') {
            throw new PostsServiceException('Directo no encontrado', 404);
        }

        return $post;
    }

    public function end(int $userId, int $postId, ?int $durationSeconds = null): Post
    {
        $post = $this->getById($postId);
        if ((int) $post->user_id !== $userId) {
            throw new PostsServiceException('No autorizado para finalizar este directo', 403);
        }

        $post->live_status = 'ended';
        if ($durationSeconds !== null && $durationSeconds >= 0) {
            $post->duration_seconds = $durationSeconds;
        }
        $post->save();

        return $post->fresh();
    }

    public function heartbeat(int $userId, int $postId): int
    {
        $post = $this->getById($postId);
        if ($post->live_status !== 'live') {
            return 0;
        }
        $now = Carbon::now();

        LivestreamViewer::updateOrCreate(
            ['post_id' => $post->id, 'user_id' => $userId],
            ['last_seen_at' => $now, 'created_at' => $now]
        );

        return $this->getViewerCount($post->id);
    }

    public function getViewerCount(int $postId): int
    {
        if (!Post::whereKey($postId)->where('live_status', 'live')->exists()) {
            return 0;
        }

        return LivestreamViewer::where('post_id', $postId)
            ->where('last_seen_at', '>=', Carbon::now()->subSeconds(self::VIEWER_WINDOW_SECONDS))
            ->count();
    }

    public function getRecentEvents(int $postId, int $afterId = 0): array
    {
        return LivestreamReactionEvent::where('post_id', $postId)
            ->where('id', '>', $afterId)
            ->orderBy('id', 'asc')
            ->get()
            ->map(fn (LivestreamReactionEvent $event) => [
                'id' => $event->id,
                'post_id' => $event->post_id,
                'user_id' => $event->user_id,
                'reaction_type' => $event->reaction_type,
                'created_at' => optional($event->created_at)?->toIso8601String(),
            ])
            ->toArray();
    }

    public function react(int $userId, int $postId, string $reactionType, string $jwt = ''): array
    {
        $post = $this->getById($postId);

        if ($this->socialBlockService->isBlockedBetween($jwt, (int) $post->user_id)) {
            throw new PostsServiceException('No puedes interactuar con el contenido de este usuario', 403);
        }

        if (!in_array($reactionType, LikeService::REACTION_TYPES, true)) {
            throw new PostsServiceException('Tipo de reaccion invalido', 422);
        }

        Like::updateOrCreate(
            ['user_id' => $userId, 'post_id' => $post->id],
            ['reaction_type' => $reactionType]
        );

        $event = LivestreamReactionEvent::create([
            'post_id' => $post->id,
            'user_id' => $userId,
            'reaction_type' => $reactionType,
            'created_at' => Carbon::now(),
        ]);

        $likeService = new LikeService();

        return [
            'event_id' => $event->id,
            'current_reaction' => $reactionType,
            'reactions_count' => $likeService->getReactionSummary($post->id),
            'reactions_total' => $likeService->count($post->id),
        ];
    }

    private function normalizeSource(string $source): string
    {
        return in_array($source, ['camera', 'screen'], true) ? $source : 'camera';
    }

    private function generateStreamKey(int $userId): string
    {
        return sprintf('live-%d-%s', $userId, bin2hex(random_bytes(8)));
    }
}

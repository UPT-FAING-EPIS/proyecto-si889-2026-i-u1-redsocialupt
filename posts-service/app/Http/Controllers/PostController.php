<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use App\Services\LivestreamService;
use App\Services\MentionNotificationService;
use App\Services\PostService;
use App\Support\ImageOptimizer;
use App\Support\VideoOptimizer;
use App\Models\Like;
use App\Models\LivestreamViewer;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class PostController extends BaseController
{
    private PostService $postService;
    private LikeService $reactionService;
    private LivestreamService $livestreamService;
    private MentionNotificationService $mentionNotificationService;

    private function publicUploadsPath(string $directory): string
    {
        return app()->basePath('public/' . trim($directory, '/'));
    }

    public function __construct()
    {
        $this->postService = new PostService();
        $this->reactionService = new LikeService();
        $this->livestreamService = new LivestreamService();
        $this->mentionNotificationService = new MentionNotificationService();
    }

    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'content' => 'nullable|string|max:2000',
            'image' => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'video' => 'nullable|file|mimes:mp4,webm|max:30720',
            'visibility' => 'nullable|in:all,friends,faculty',
            'mention_user_ids' => 'nullable|array|max:20',
            'mention_user_ids.*' => 'integer|min:1',
        ]);

        if ($request->hasFile('image') && $request->hasFile('video')) {
            return response()->json(['error' => 'Solo puedes adjuntar una imagen o un video por publicacion'], 422);
        }

        if (empty($request->input('content')) && !$request->hasFile('image') && !$request->hasFile('video')) {
            return response()->json(['error' => 'Se requiere contenido o archivo multimedia'], 422);
        }

        $mediaPayload = $this->storeUploadedMedia($request);

        try {
            $post = $this->postService->create(
                (int) $request->auth->sub,
                [
                    'content' => $request->input('content'),
                    ...$mediaPayload,
                    'visibility' => $request->input('visibility', 'all'),
                    'user_name' => $request->auth->name ?? 'Usuario',
                    'user_school' => $request->auth->school ?? $request->auth->career ?? '',
                    'user_faculty' => $request->auth->faculty ?? '',
                    'user_avatar' => $request->auth->avatar_url ?? null,
                ]
            );

            $this->mentionNotificationService->createForPost(
                $post,
                (int) $request->auth->sub,
                $request->input('mention_user_ids', [])
            );

            return response()->json($this->hydratePost($post, (int) $request->auth->sub), 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function storeGroup(Request $request, int $groupId): JsonResponse
    {
        $this->validate($request, [
            'content' => 'nullable|string|max:2000',
            'image' => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'video' => 'nullable|file|mimes:mp4,webm|max:30720',
            'mention_user_ids' => 'nullable|array|max:20',
            'mention_user_ids.*' => 'integer|min:1',
        ]);

        if ($request->hasFile('image') && $request->hasFile('video')) {
            return response()->json(['error' => 'Solo puedes adjuntar una imagen o un video por publicacion'], 422);
        }

        if (empty($request->input('content')) && !$request->hasFile('image') && !$request->hasFile('video')) {
            return response()->json(['error' => 'Se requiere contenido o archivo multimedia'], 422);
        }

        $mediaPayload = $this->storeUploadedMedia($request);

        try {
            $post = $this->postService->createGroupPost(
                (int) $request->auth->sub,
                $groupId,
                [
                    'content' => $request->input('content'),
                    ...$mediaPayload,
                    'user_name' => $request->auth->name ?? 'Usuario',
                    'user_school' => $request->auth->school ?? $request->auth->career ?? '',
                    'user_faculty' => $request->auth->faculty ?? '',
                    'user_avatar' => $request->auth->avatar_url ?? null,
                ],
                $request->bearerToken() ?? ''
            );

            $this->mentionNotificationService->createForPost(
                $post,
                (int) $request->auth->sub,
                $request->input('mention_user_ids', [])
            );

            return response()->json($this->hydratePost($post, (int) $request->auth->sub), 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $friendIds = json_decode($request->header('X-Friend-Ids', '[]'), true) ?? [];
        $userFaculty = $request->header('X-User-Faculty');
        $perPage = (int) $request->query('per_page', 0);
        $page = max(1, (int) $request->query('page', 1));

        $posts = $this->postService->getFeed(
            (int) $request->auth->sub,
            $friendIds,
            $userFaculty ?: null,
            $request->bearerToken() ?? '',
            $perPage > 0 ? min($perPage, 50) : null,
            $page
        );

        if ($posts instanceof \Illuminate\Contracts\Pagination\LengthAwarePaginator) {
            $items = collect($posts->items());
            $this->hydratePosts($items, (int) $request->auth->sub);
            $payload = $posts->toArray();
            $payload['data'] = $items->values()->all();
            return response()->json($payload, 200);
        }

        $this->hydratePosts($posts, (int) $request->auth->sub);

        return response()->json($posts, 200);
    }

    public function adminIndex(Request $request): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        $posts = $this->postService->adminListAll();
        $this->hydratePosts($posts, (int) $request->auth->sub);

        return response()->json($posts, 200);
    }

    public function groupIndex(Request $request, int $groupId): JsonResponse
    {
        try {
            $posts = $this->postService->getGroupPosts($groupId, (int) $request->auth->sub, $request->bearerToken() ?? '');
            $this->hydratePosts($posts, (int) $request->auth->sub);
            return response()->json($posts, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function groupMedia(Request $request, int $groupId): JsonResponse
    {
        try {
            return response()->json(
                $this->postService->getGroupMedia($groupId, (int) $request->auth->sub, $request->bearerToken() ?? ''),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            $post = $this->postService->findOrFail($id);
            return response()->json($this->hydratePost($post, (int) $request->auth->sub), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            $this->postService->destroyWithAccess((int) $request->auth->sub, $id, $request->bearerToken() ?? '');
            return response()->json(['message' => 'Publicacion eliminada'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function adminDestroy(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        try {
            $this->postService->adminDestroy($id);
            return response()->json(['message' => 'Publicacion eliminada por admin'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    private function hydratePost($post, int $userId)
    {
        $this->hydratePosts(collect([$post]), $userId);
        return $post;
    }

    public function mentions(Request $request): JsonResponse
    {
        try {
            return response()->json(
                $this->mentionNotificationService->listForUser((int) $request->auth->sub),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    private function hydratePosts(Collection $posts, int $userId): void
    {
        if ($posts->isEmpty()) {
            return;
        }

        $postIds = $posts->pluck('id')
            ->map(static fn ($value) => (int) $value)
            ->filter(static fn (int $value) => $value > 0)
            ->values()
            ->all();

        if (empty($postIds)) {
            return;
        }

        $reactionRows = Like::query()
            ->whereIn('post_id', $postIds)
            ->selectRaw('post_id, reaction_type, COUNT(*) as total')
            ->groupBy('post_id', 'reaction_type')
            ->get();

        $reactionSummaries = [];
        foreach ($postIds as $postId) {
            $reactionSummaries[$postId] = array_fill_keys(LikeService::REACTION_TYPES, 0);
        }

        foreach ($reactionRows as $reactionRow) {
            $postId = (int) $reactionRow->post_id;
            $reactionType = (string) $reactionRow->reaction_type;
            if (!isset($reactionSummaries[$postId][$reactionType])) {
                continue;
            }
            $reactionSummaries[$postId][$reactionType] = (int) $reactionRow->total;
        }

        $currentReactions = Like::query()
            ->where('user_id', $userId)
            ->whereIn('post_id', $postIds)
            ->pluck('reaction_type', 'post_id')
            ->mapWithKeys(static fn ($reactionType, $postId) => [(int) $postId => $reactionType])
            ->toArray();

        $livePostIds = $posts
            ->filter(static fn ($post) => ($post->post_type ?? 'standard') === 'livestream' && ($post->live_status ?? '') === 'live')
            ->pluck('id')
            ->map(static fn ($value) => (int) $value)
            ->filter(static fn (int $value) => $value > 0)
            ->values()
            ->all();

        $viewerCounts = [];
        if (!empty($livePostIds)) {
            $viewerCounts = LivestreamViewer::query()
                ->whereIn('post_id', $livePostIds)
                ->where('last_seen_at', '>=', Carbon::now()->subSeconds(35))
                ->selectRaw('post_id, COUNT(*) as total')
                ->groupBy('post_id')
                ->pluck('total', 'post_id')
                ->mapWithKeys(static fn ($total, $postId) => [(int) $postId => (int) $total])
                ->toArray();
        }

        $posts->each(function ($post) use ($reactionSummaries, $currentReactions, $viewerCounts) {
            $postId = (int) $post->id;
            $post->reactions_total = (int) ($post->reactions_total ?? 0);
            $post->comments_count = (int) ($post->comments_count ?? 0);
            $post->reactions_count = $reactionSummaries[$postId] ?? array_fill_keys(LikeService::REACTION_TYPES, 0);
            $post->current_reaction = $currentReactions[$postId] ?? null;
            if (($post->post_type ?? 'standard') === 'livestream') {
                $post->viewer_count = (int) ($viewerCounts[$postId] ?? 0);
            }
        });
    }

    private function storeUploadedMedia(Request $request): array
    {
        if ($request->hasFile('video') && $request->file('video')->isValid()) {
            $uploadDir = $this->publicUploadsPath('uploads');
            $stored = VideoOptimizer::store($request->file('video'), $uploadDir, 'post_video', 1280, 720, 1800);

            return [
                'media_type' => 'video',
                'image_url' => null,
                'video_url' => '/uploads/' . $stored['filename'],
                'video_mime_type' => $stored['mime_type'] ?? 'video/mp4',
            ];
        }

        if (!$request->hasFile('image') || !$request->file('image')->isValid()) {
            return [
                'media_type' => null,
                'image_url' => null,
                'video_url' => null,
                'video_mime_type' => null,
            ];
        }

        $uploadDir = $this->publicUploadsPath('uploads');
        $filename = ImageOptimizer::store($request->file('image'), $uploadDir, 'post', 1600, 1600, 82);
        return [
            'media_type' => 'image',
            'image_url' => '/uploads/' . $filename,
            'video_url' => null,
            'video_mime_type' => null,
        ];
    }
}

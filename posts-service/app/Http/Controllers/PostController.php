<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use App\Services\LivestreamService;
use App\Services\PostService;
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

    private function publicUploadsPath(string $directory): string
    {
        return app()->basePath('public/' . trim($directory, '/'));
    }

    public function __construct()
    {
        $this->postService = new PostService();
        $this->reactionService = new LikeService();
        $this->livestreamService = new LivestreamService();
    }

    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'content' => 'nullable|string|max:2000',
            'image' => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'visibility' => 'nullable|in:all,friends,faculty',
        ]);

        if (empty($request->input('content')) && !$request->hasFile('image')) {
            return response()->json(['error' => 'Se requiere contenido o imagen'], 422);
        }

        $imageUrl = $this->storeUploadedImage($request);

        try {
            $post = $this->postService->create(
                (int) $request->auth->sub,
                [
                    'content' => $request->input('content'),
                    'image_url' => $imageUrl,
                    'visibility' => $request->input('visibility', 'all'),
                    'user_name' => $request->auth->name ?? 'Usuario',
                    'user_school' => $request->auth->school ?? $request->auth->career ?? '',
                    'user_faculty' => $request->auth->faculty ?? '',
                    'user_avatar' => $request->auth->avatar_url ?? null,
                ]
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
        ]);

        if (empty($request->input('content')) && !$request->hasFile('image')) {
            return response()->json(['error' => 'Se requiere contenido o imagen'], 422);
        }

        $imageUrl = $this->storeUploadedImage($request);

        try {
            $post = $this->postService->createGroupPost(
                (int) $request->auth->sub,
                $groupId,
                [
                    'content' => $request->input('content'),
                    'image_url' => $imageUrl,
                    'user_name' => $request->auth->name ?? 'Usuario',
                    'user_school' => $request->auth->school ?? $request->auth->career ?? '',
                    'user_faculty' => $request->auth->faculty ?? '',
                    'user_avatar' => $request->auth->avatar_url ?? null,
                ],
                $request->bearerToken() ?? ''
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

        $posts = $this->postService->getFeed(
            (int) $request->auth->sub,
            $friendIds,
            $userFaculty ?: null,
            $request->bearerToken() ?? ''
        );

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

    private function storeUploadedImage(Request $request): ?string
    {
        if (!$request->hasFile('image') || !$request->file('image')->isValid()) {
            return null;
        }

        $file = $request->file('image');
        $filename = time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
        $uploadDir = $this->publicUploadsPath('uploads');

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        $file->move($uploadDir, $filename);
        return '/uploads/' . $filename;
    }
}

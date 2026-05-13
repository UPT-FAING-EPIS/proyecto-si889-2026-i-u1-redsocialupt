<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use App\Services\LivestreamService;
use App\Services\PostService;
use Illuminate\Http\JsonResponse;
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

        $userId = (int) $request->auth->sub;
        $posts->each(fn ($post) => $this->hydratePost($post, $userId));

        return response()->json($posts, 200);
    }

    public function groupIndex(Request $request, int $groupId): JsonResponse
    {
        try {
            $posts = $this->postService->getGroupPosts($groupId, (int) $request->auth->sub, $request->bearerToken() ?? '');
            $userId = (int) $request->auth->sub;
            $posts->each(fn ($post) => $this->hydratePost($post, $userId));
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
        $post->reactions_total = $post->reactions()->count();
        $post->reactions_count = $this->reactionService->getReactionSummary($post->id);
        $post->comments_count = $post->comments()->count();
        $post->current_reaction = $this->reactionService->currentReaction($userId, $post->id);
        if (($post->post_type ?? 'standard') === 'livestream') {
            $post->viewer_count = $this->livestreamService->getViewerCount((int) $post->id);
        }
        return $post;
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

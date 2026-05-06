<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use App\Services\PostService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class PostController extends BaseController
{
    private PostService $postService;
    private LikeService $reactionService;

    private function publicUploadsPath(string $directory): string
    {
        return app()->basePath('public/' . trim($directory, '/'));
    }

    public function __construct()
    {
        $this->postService = new PostService();
        $this->reactionService = new LikeService();
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

        $imageUrl = null;
        if ($request->hasFile('image') && $request->file('image')->isValid()) {
            $file = $request->file('image');
            $filename = time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $uploadDir = $this->publicUploadsPath('uploads');

            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0775, true);
            }

            $file->move($uploadDir, $filename);
            $imageUrl = '/uploads/' . $filename;
        }

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

            $post->reactions_count = $this->reactionService->getReactionSummary($post->id);
            $post->reactions_total = 0;
            $post->current_reaction = null;
            $post->comments_count = 0;

            return response()->json($post, 201);
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
            $userFaculty ?: null
        );

        $userId = (int) $request->auth->sub;
        $posts->each(function ($post) use ($userId) {
            $post->reactions_total = $post->reactions()->count();
            $post->reactions_count = $this->reactionService->getReactionSummary($post->id);
            $post->comments_count = $post->comments()->count();
            $post->current_reaction = $this->reactionService->currentReaction($userId, $post->id);
        });

        return response()->json($posts, 200);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            $post = $this->postService->findOrFail($id);
            $userId = (int) $request->auth->sub;
            $post->reactions_total = $post->reactions()->count();
            $post->reactions_count = $this->reactionService->getReactionSummary($post->id);
            $post->comments_count = $post->comments()->count();
            $post->current_reaction = $this->reactionService->currentReaction($userId, $post->id);
            return response()->json($post, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            $this->postService->destroy((int) $request->auth->sub, $id);
            return response()->json(['message' => 'Publicación eliminada'], 200);
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
            return response()->json(['message' => 'Publicación eliminada por admin'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use App\Services\LivestreamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class LivestreamController extends BaseController
{
    private LivestreamService $livestreamService;
    private LikeService $likeService;

    public function __construct()
    {
        $this->livestreamService = new LivestreamService();
        $this->likeService = new LikeService();
    }

    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'live_title' => 'required|string|max:180',
            'visibility' => 'nullable|in:all,friends,faculty',
            'live_source' => 'nullable|in:camera,screen',
            'stream_key' => 'nullable|string|max:120',
            'playback_url' => 'nullable|string|max:500',
        ]);

        try {
            $live = $this->livestreamService->create((int) $request->auth->sub, [
                'live_title' => $request->input('live_title'),
                'visibility' => $request->input('visibility', 'all'),
                'live_source' => $request->input('live_source', 'camera'),
                'stream_key' => $request->input('stream_key'),
                'playback_url' => $request->input('playback_url'),
                'user_name' => $request->auth->name ?? 'Usuario',
                'user_school' => $request->auth->school ?? $request->auth->career ?? '',
                'user_faculty' => $request->auth->faculty ?? '',
                'user_avatar' => $request->auth->avatar_url ?? null,
            ]);

            return response()->json($this->hydrate($live, (int) $request->auth->sub), 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function active(Request $request): JsonResponse
    {
        $friendIds = json_decode($request->header('X-Friend-Ids', '[]'), true) ?? [];
        $userFaculty = $request->header('X-User-Faculty');

        try {
            $lives = $this->livestreamService->listActive(
                (int) $request->auth->sub,
                $friendIds,
                $userFaculty ?: null,
                $request->bearerToken() ?? ''
            );
            $userId = (int) $request->auth->sub;
            $lives->each(fn ($post) => $this->hydrate($post, $userId));
            return response()->json($lives, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json($this->hydrate($this->livestreamService->getById($id), (int) $request->auth->sub), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function heartbeat(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json([
                'viewer_count' => $this->livestreamService->heartbeat((int) $request->auth->sub, $id),
            ], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function end(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json(
                $this->hydrate(
                    $this->livestreamService->end((int) $request->auth->sub, $id, $request->input('duration_seconds')),
                    (int) $request->auth->sub
                ),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function react(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'reaction_type' => 'required|in:me_gusta,me_encanta,me_divierte,me_sorprende,me_enoja',
        ]);

        try {
            return response()->json(
                $this->livestreamService->react(
                    (int) $request->auth->sub,
                    $id,
                    $request->input('reaction_type'),
                    $request->bearerToken() ?? ''
                ),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function events(Request $request, int $id): JsonResponse
    {
        try {
            $this->livestreamService->getById($id);
            return response()->json(
                $this->livestreamService->getRecentEvents($id, (int) $request->query('after', 0)),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    private function hydrate($post, int $userId)
    {
        $post->viewer_count = $this->livestreamService->getViewerCount((int) $post->id);
        $post->reactions_total = $post->reactions()->count();
        $post->reactions_count = $this->likeService->getReactionSummary((int) $post->id);
        $post->comments_count = $post->comments()->count();
        $post->current_reaction = $this->likeService->currentReaction($userId, (int) $post->id);
        return $post;
    }
}

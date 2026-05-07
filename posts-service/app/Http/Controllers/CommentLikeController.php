<?php

namespace App\Http\Controllers;

use App\Services\CommentLikeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class CommentLikeController extends BaseController
{
    private CommentLikeService $commentLikeService;

    public function __construct()
    {
        $this->commentLikeService = new CommentLikeService();
    }

    public function react(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'reaction_type' => 'nullable|in:me_gusta,me_encanta,me_divierte,me_sorprende,me_enoja',
        ]);

        try {
            $result = $this->commentLikeService->react(
                (int) $request->auth->sub,
                $id,
                $request->input('reaction_type', 'me_gusta'),
                $request->bearerToken() ?? ''
            );
            return response()->json($result, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function count(int $id): JsonResponse
    {
        return response()->json([
            'count' => $this->commentLikeService->count($id),
            'reactions_count' => $this->commentLikeService->getReactionSummary($id),
        ], 200);
    }
}

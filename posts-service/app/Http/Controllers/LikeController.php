<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class LikeController extends BaseController
{
    private LikeService $likeService;

    public function __construct()
    {
        $this->likeService = new LikeService();
    }

    public function react(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'reaction_type' => 'nullable|in:me_gusta,me_encanta,me_divierte,me_sorprende,me_enoja',
        ]);

        try {
            $result = $this->likeService->react(
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
            'count' => $this->likeService->count($id),
            'reactions_count' => $this->likeService->getReactionSummary($id),
        ], 200);
    }
}

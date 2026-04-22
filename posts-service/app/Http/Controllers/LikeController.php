<?php

namespace App\Http\Controllers;

use App\Services\LikeService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class LikeController extends BaseController
{
    private LikeService $likeService;

    public function __construct()
    {
        $this->likeService = new LikeService();
    }

    /**
     * POST /api/posts/{id}/like
     * Dar o quitar like (toggle) (RF-04).
     */
    public function toggle(Request $request, int $id): JsonResponse
    {
        try {
            $result = $this->likeService->toggle($request->auth->sub, $id);
            return response()->json($result, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/posts/{id}/likes
     * Conteo de likes de una publicación.
     */
    public function count(int $id): JsonResponse
    {
        return response()->json(['count' => $this->likeService->count($id)], 200);
    }
}

<?php

namespace App\Http\Controllers;

use App\Services\CommentService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class CommentController extends BaseController
{
    private CommentService $commentService;

    public function __construct()
    {
        $this->commentService = new CommentService();
    }

    /**
     * POST /api/posts/{id}/comments
     * Comentar una publicación (RF-05).
     */
    public function store(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'content' => 'required|string',
        ]);

        try {
            $comment = $this->commentService->store(
                $request->auth->sub,
                $id,
                $request->input('content'),
                [
                    'user_name'    => $request->auth->full_name ?? $request->auth->name ?? 'Usuario',
                    'user_avatar'  => $request->auth->avatar_url ?? null,
                    'user_faculty' => $request->auth->faculty ?? '',
                ],
                $request->bearerToken() ?? ''
            );
            $comment->reactions_count = array_fill_keys(\App\Services\LikeService::REACTION_TYPES, 0);
            $comment->reactions_total = 0;
            $comment->current_reaction = null;
            return response()->json($comment, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/posts/{id}/comments
     * Listar comentarios de una publicación.
     */
    public function index(Request $request, int $id): JsonResponse
    {
        $sort = $request->query('sort', 'oldest');
        if (!in_array($sort, ['oldest', 'newest'], true)) {
            $sort = 'oldest';
        }

        return response()->json($this->commentService->getByPost($id, $sort, $request->auth->sub, $request->bearerToken() ?? ''), 200);
    }

    /**
     * DELETE /api/comments/{id}
     * Eliminar comentario propio.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            $this->commentService->destroyWithAccess((int) $request->auth->sub, $id, $request->bearerToken() ?? '');
            return response()->json(['message' => 'Comentario eliminado'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * DELETE /api/comments/{id}/admin
     * Admin elimina cualquier comentario (RF-09).
     */
    public function adminDestroy(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        try {
            $this->commentService->adminDestroy($id);
            return response()->json(['message' => 'Comentario eliminado por admin'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

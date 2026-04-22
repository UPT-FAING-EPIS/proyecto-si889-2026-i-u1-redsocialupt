<?php

namespace App\Http\Controllers;

use App\Services\PostService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class PostController extends BaseController
{
    private PostService $postService;

    public function __construct()
    {
        $this->postService = new PostService();
    }

    /**
     * POST /api/posts
     * Crear publicación con visibilidad (RF-02).
     */
    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'content'    => 'nullable|string',
            'image_url'  => 'nullable|string|max:500',
            'visibility' => 'required|in:all,friends,faculty',
        ]);

        // Al menos content o image_url debe existir
        if (empty($request->input('content')) && empty($request->input('image_url'))) {
            return response()->json(['error' => 'Se requiere contenido o imagen'], 422);
        }

        try {
            $post = $this->postService->create(
                $request->auth->sub,
                $request->only(['content', 'image_url', 'visibility'])
            );
            return response()->json($post, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/posts
     * Feed filtrado por visibilidad (RF-03).
     * Espera header X-Friend-Ids (JSON array) y X-User-Faculty del API Gateway/frontend.
     */
    public function index(Request $request): JsonResponse
    {
        $friendIds   = json_decode($request->header('X-Friend-Ids', '[]'), true) ?? [];
        $userFaculty = $request->header('X-User-Faculty');

        $posts = $this->postService->getFeed(
            $request->auth->sub,
            $friendIds,
            $userFaculty ?: null
        );

        return response()->json($posts, 200);
    }

    /**
     * GET /api/posts/{id}
     * Ver una publicación.
     */
    public function show(int $id): JsonResponse
    {
        try {
            $post = $this->postService->findOrFail($id);
            return response()->json($post, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * DELETE /api/posts/{id}
     * Eliminar publicación propia.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        try {
            $this->postService->destroy($request->auth->sub, $id);
            return response()->json(['message' => 'Publicación eliminada'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * DELETE /api/posts/{id}/admin
     * Admin elimina cualquier publicación (RF-09).
     */
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

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
     * Crear publicación con imagen opcional (RF-02).
     * Soporta multipart/form-data (con archivo) o JSON puro.
     */
    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'content'    => 'nullable|string|max:2000',
            'image'      => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'visibility' => 'nullable|in:all,friends,faculty',
        ]);

        // Contenido o imagen requerido
        if (empty($request->input('content')) && !$request->hasFile('image')) {
            return response()->json(['error' => 'Se requiere contenido o imagen'], 422);
        }

        $imageUrl = null;

        // Procesar imagen si viene adjunta
        if ($request->hasFile('image') && $request->file('image')->isValid()) {
            $file      = $request->file('image');
            $filename  = time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $uploadDir = public_path('uploads');

            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0775, true);
            }

            $file->move($uploadDir, $filename);
            $imageUrl = '/uploads/' . $filename;
        }

        try {
            $post = $this->postService->create(
                $request->auth->sub,
                [
                    'content'      => $request->input('content'),
                    'image_url'    => $imageUrl,
                    'visibility'   => $request->input('visibility', 'all'),
                    'user_name'    => $request->auth->name ?? 'Usuario',
                    'user_school'  => $request->auth->school ?? $request->auth->career ?? '',
                    'user_faculty' => $request->auth->faculty ?? '',
                    'user_avatar'  => $request->auth->avatar_url ?? null,
                ]
            );
            // Devolver con conteos
            $post->likes_count    = 0;
            $post->comments_count = 0;
            return response()->json($post, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/posts
     * Feed filtrado por visibilidad (RF-03).
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

        $userId = $request->auth->sub;
        // Agregar conteos de likes y comentarios e indicador de si dio like
        $posts->each(function ($post) use ($userId) {
            $post->likes_count    = $post->likes()->count();
            $post->comments_count = $post->comments()->count();
            $post->is_liked       = $post->likes()->where('user_id', $userId)->exists();
        });

        return response()->json($posts, 200);
    }

    /**
     * GET /api/posts/{id}
     */
    public function show(Request $request, int $id): JsonResponse
    {
        try {
            $post = $this->postService->findOrFail($id);
            $userId = $request->auth->sub;
            $post->likes_count    = $post->likes()->count();
            $post->comments_count = $post->comments()->count();
            $post->is_liked       = $post->likes()->where('user_id', $userId)->exists();
            return response()->json($post, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * DELETE /api/posts/{id}
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

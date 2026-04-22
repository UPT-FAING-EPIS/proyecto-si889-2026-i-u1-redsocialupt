<?php

namespace App\Services;

use App\Models\Post;

class PostService
{
    /**
     * Crea una publicación (RF-02).
     */
    public function create(int $userId, array $data): Post
    {
        return Post::create([
            'user_id'    => $userId,
            'content'    => $data['content']   ?? null,
            'image_url'  => $data['image_url'] ?? null,
            'visibility' => $data['visibility'] ?? 'all',
        ]);
    }

    /**
     * Feed filtrado por visibilidad (RF-03).
     *
     * - 'all'     → cualquier usuario lo ve
     * - 'friends' → solo si el autor está en $friendIds
     * - 'faculty' → solo si el autor tiene la misma facultad ($userFaculty)
     */
    public function getFeed(int $userId, array $friendIds, ?string $userFaculty): \Illuminate\Support\Collection
    {
        return Post::orderBy('created_at', 'desc')
            ->get()
            ->filter(function (Post $post) use ($userId, $friendIds, $userFaculty) {
                if ($post->user_id === $userId) {
                    return true; // siempre ve sus propias publicaciones
                }
                return match ($post->visibility) {
                    'all'     => true,
                    'friends' => in_array($post->user_id, $friendIds),
                    'faculty' => $userFaculty !== null,
                    default   => false,
                };
            })
            ->values();
    }

    /**
     * Obtiene una publicación por ID.
     */
    public function findOrFail(int $postId): Post
    {
        $post = Post::find($postId);
        if (!$post) {
            throw new \Exception('Publicación no encontrada', 404);
        }
        return $post;
    }

    /**
     * Elimina una publicación propia.
     */
    public function destroy(int $userId, int $postId): void
    {
        $post = $this->findOrFail($postId);
        if ($post->user_id !== $userId) {
            throw new \Exception('No autorizado para eliminar esta publicación', 403);
        }
        $post->delete();
    }

    /**
     * Admin elimina cualquier publicación (RF-09).
     */
    public function adminDestroy(int $postId): void
    {
        $post = $this->findOrFail($postId);
        $post->delete();
    }
}

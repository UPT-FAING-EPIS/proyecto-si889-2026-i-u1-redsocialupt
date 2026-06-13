<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Post;

class PostService
{
    private ModerationService $moderationService;
    private SocialBlockService $socialBlockService;

    public function __construct()
    {
        $this->moderationService = new ModerationService();
        $this->socialBlockService = new SocialBlockService();
    }

    public function create(int $userId, array $data): Post
    {
        $this->moderationService->ensureClean($data['content'] ?? null, 'post');

        return Post::create([
            'user_id' => $userId,
            'group_id' => $data['group_id'] ?? null,
            'post_type' => $data['post_type'] ?? 'standard',
            'user_name' => $data['user_name'] ?? 'Usuario',
            'user_school' => $data['user_school'] ?? '',
            'user_faculty' => $data['user_faculty'] ?? '',
            'user_avatar' => $data['user_avatar'] ?? null,
            'group_name' => $data['group_name'] ?? null,
            'content' => $data['content'] ?? null,
            'image_url' => $data['image_url'] ?? null,
            'media_type' => $data['media_type'] ?? null,
            'video_url' => $data['video_url'] ?? null,
            'video_mime_type' => $data['video_mime_type'] ?? null,
            'visibility' => $data['visibility'] ?? 'all',
        ]);
    }

    public function getFeed(int $userId, array $friendIds, ?string $userFaculty, string $jwt = '', ?int $perPage = null, int $page = 1)
    {
        $hiddenIds = $this->socialBlockService->getHiddenUserIds($jwt);
        $normalizedFriendIds = array_values(array_unique(array_map(
            static fn ($value) => (int) $value,
            array_filter($friendIds, static fn ($value) => is_numeric($value))
        )));
        $normalizedFaculty = trim((string) ($userFaculty ?? ''));

        $query = Post::query()
            ->whereNull('group_id')
            ->when(!empty($hiddenIds), fn ($query) => $query->whereNotIn('user_id', $hiddenIds))
            ->where(function ($query) use ($userId, $normalizedFriendIds, $normalizedFaculty) {
                $query
                    ->where('user_id', $userId)
                    ->orWhere('visibility', 'all');

                if (!empty($normalizedFriendIds)) {
                    $query->orWhere(function ($friendQuery) use ($normalizedFriendIds) {
                        $friendQuery
                            ->where('visibility', 'friends')
                            ->whereIn('user_id', $normalizedFriendIds);
                    });
                }

                if ($normalizedFaculty !== '') {
                    $query->orWhere(function ($facultyQuery) use ($normalizedFaculty) {
                        $facultyQuery
                            ->where('visibility', 'faculty')
                            ->where('user_faculty', $normalizedFaculty);
                    });
                }
            })
            ->withCount([
                'comments',
                'reactions as reactions_total',
            ])
            ->orderBy('created_at', 'desc');

        if ($perPage !== null && $perPage > 0) {
            return $query->paginate($perPage, ['*'], 'page', max(1, $page));
        }

        return $query->get();
    }

    public function getGroupPosts(int $groupId, int $userId, string $jwt): \Illuminate\Support\Collection
    {
        if (!$this->socialBlockService->canViewGroupConversation($jwt, $groupId)) {
            throw new PostsServiceException('No tienes acceso a la conversacion de este grupo', 403);
        }

        $hiddenIds = $this->socialBlockService->getHiddenUserIds($jwt);

        return Post::where('group_id', $groupId)
            ->withCount([
                'comments',
                'reactions as reactions_total',
            ])
            ->orderBy('created_at', 'desc')
            ->get()
            ->filter(fn (Post $post) => !in_array((int) $post->user_id, $hiddenIds, true))
            ->values();
    }

    public function getGroupMedia(int $groupId, int $userId, string $jwt): \Illuminate\Support\Collection
    {
        return $this->getGroupPosts($groupId, $userId, $jwt)
            ->filter(fn (Post $post) => !empty($post->image_url) || !empty($post->video_url))
            ->values();
    }

    public function adminListAll(): \Illuminate\Support\Collection
    {
        return Post::query()
            ->withCount([
                'comments',
                'reactions as reactions_total',
            ])
            ->orderBy('created_at', 'desc')
            ->get();
    }

    public function createGroupPost(int $userId, int $groupId, array $data, string $jwt): Post
    {
        $access = $this->socialBlockService->getGroupAccess($jwt, $groupId);
        $postsLocked = (bool) ($access['posts_locked'] ?? false);
        $isGroupAdmin = (bool) ($access['is_admin'] ?? false);
        $isSuperAdmin = (bool) ($access['can_manage'] ?? false) && !$isGroupAdmin;

        if ($postsLocked && !$isGroupAdmin && !$isSuperAdmin) {
            throw new PostsServiceException('Las nuevas publicaciones estan bloqueadas temporalmente en este grupo', 403);
        }

        if (!(bool) ($access['can_post'] ?? false)) {
            throw new PostsServiceException('No puedes publicar en este grupo', 403);
        }

        return $this->create($userId, array_merge($data, [
            'group_id' => $groupId,
            'group_name' => $access['group_name'] ?? null,
            'visibility' => 'all',
        ]));
    }

    public function findOrFail(int $postId): Post
    {
        $post = Post::find($postId);
        if (!$post) {
            throw new PostsServiceException('Publicacion no encontrada', 404);
        }

        return $post;
    }

    public function findShareablePublicPostOrFail(int $postId): Post
    {
        $post = Post::query()
            ->whereKey($postId)
            ->whereNull('group_id')
            ->where('post_type', 'standard')
            ->where('visibility', 'all')
            ->withCount([
                'comments',
                'reactions as reactions_total',
            ])
            ->first();

        if (!$post) {
            throw new PostsServiceException('Publicacion publica no encontrada', 404);
        }

        return $post;
    }

    public function destroy(int $userId, int $postId): void
    {
        $this->destroyWithAccess($userId, $postId);
    }

    public function destroyWithAccess(int $userId, int $postId, string $jwt = ''): void
    {
        $post = $this->findOrFail($postId);
        if ($post->user_id === $userId) {
            $post->delete();
            return;
        }

        if ($post->group_id !== null && $this->socialBlockService->canManageGroup($jwt, (int) $post->group_id)) {
            $post->delete();
            return;
        }

        throw new PostsServiceException('No autorizado para eliminar esta publicacion', 403);
    }

    public function adminDestroy(int $postId): void
    {
        $post = $this->findOrFail($postId);
        $post->delete();
    }
}

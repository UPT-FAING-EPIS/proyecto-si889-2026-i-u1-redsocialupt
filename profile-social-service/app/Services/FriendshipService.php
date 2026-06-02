<?php

namespace App\Services;

use App\Exceptions\FriendshipServiceException;
use App\Models\FriendRequest;
use App\Models\UserBlock;

class FriendshipService
{
    /**
     * Enviar solicitud de amistad (RF-07).
     */
    public function sendRequest(int $senderId, int $receiverId): FriendRequest
    {
        if ($senderId === $receiverId) {
            throw new FriendshipServiceException('No puedes enviarte una solicitud a ti mismo', 422);
        }

        if ($this->isBlockedBetween($senderId, $receiverId)) {
            throw new FriendshipServiceException('No puedes enviar solicitudes a este usuario', 403);
        }

        // Verificar si ya existe una solicitud en cualquier dirección
        $existing = FriendRequest::where(function ($q) use ($senderId, $receiverId) {
            $q->where('sender_id', $senderId)->where('receiver_id', $receiverId);
        })->orWhere(function ($q) use ($senderId, $receiverId) {
            $q->where('sender_id', $receiverId)->where('receiver_id', $senderId);
        })->first();

        if ($existing) {
            if ($existing->status === 'accepted') {
                throw new FriendshipServiceException('Ya son compañeros', 409);
            }
            if ($existing->status === 'pending') {
                throw new FriendshipServiceException('Ya existe una solicitud pendiente', 409);
            }
            if ($existing->status === 'rejected') {
                // Reenviar: actualizar la existente
                $existing->update([
                    'sender_id'   => $senderId,
                    'receiver_id' => $receiverId,
                    'status'      => 'pending',
                ]);
                return $existing->fresh();
            }
        }

        return FriendRequest::create([
            'sender_id'   => $senderId,
            'receiver_id' => $receiverId,
            'status'      => 'pending',
        ]);
    }

    /**
     * Aceptar solicitud (RF-07).
     */
    public function accept(int $userId, int $requestId): FriendRequest
    {
        $request = $this->findOrFail($requestId);

        if ($this->isBlockedBetween($userId, (int) $request->sender_id)) {
            throw new FriendshipServiceException('No puedes aceptar solicitudes de este usuario', 403);
        }

        if ($request->receiver_id !== $userId) {
            throw new FriendshipServiceException('Solo el destinatario puede aceptar', 403);
        }
        if ($request->status !== 'pending') {
            throw new FriendshipServiceException('Esta solicitud ya fue procesada', 409);
        }

        $request->update(['status' => 'accepted']);
        return $request->fresh();
    }

    /**
     * Rechazar solicitud (RF-07).
     */
    public function reject(int $userId, int $requestId): FriendRequest
    {
        $request = $this->findOrFail($requestId);

        if ($request->receiver_id !== $userId) {
            throw new FriendshipServiceException('Solo el destinatario puede rechazar', 403);
        }
        if ($request->status !== 'pending') {
            throw new FriendshipServiceException('Esta solicitud ya fue procesada', 409);
        }

        $request->update(['status' => 'rejected']);
        return $request->fresh();
    }

    /**
     * Eliminar compañero (RF-07).
     */
    public function remove(int $userId, int $friendId): void
    {
        $friendship = FriendRequest::where('status', 'accepted')
            ->where(function ($q) use ($userId, $friendId) {
                $q->where(function ($q2) use ($userId, $friendId) {
                    $q2->where('sender_id', $userId)->where('receiver_id', $friendId);
                })->orWhere(function ($q2) use ($userId, $friendId) {
                    $q2->where('sender_id', $friendId)->where('receiver_id', $userId);
                });
            })->first();

        if (!$friendship) {
            throw new FriendshipServiceException('No son compañeros', 404);
        }

        $friendship->delete();
    }

    /**
     * Lista de compañeros aceptados (RF-07).
     * Retorna array de user_ids.
     */
    public function listFriends(int $userId): array
    {
        $sent = FriendRequest::where('sender_id', $userId)
            ->where('status', 'accepted')
            ->pluck('receiver_id')
            ->toArray();

        $received = FriendRequest::where('receiver_id', $userId)
            ->where('status', 'accepted')
            ->pluck('sender_id')
            ->toArray();

        $friendIds = array_values(array_unique(array_merge($sent, $received)));
        $hiddenIds = $this->getHiddenUserIds($userId);

        return array_values(array_filter(
            $friendIds,
            fn($friendId) => !in_array((int) $friendId, $hiddenIds, true)
        ));
    }

    /**
     * Solicitudes pendientes recibidas — para badge (RF-07).
     */
    public function pending(int $userId)
    {
        $hiddenIds = $this->getHiddenUserIds($userId);

        return FriendRequest::where('receiver_id', $userId)
            ->where('status', 'pending')
            ->when(!empty($hiddenIds), fn($query) => $query->whereNotIn('sender_id', $hiddenIds))
            ->orderBy('created_at', 'desc')
            ->get();
    }

    public function relationshipStatus(int $userId, int $otherUserId): array
    {
        if ($userId === $otherUserId) {
            return [
                'is_friend' => false,
                'incoming_request_id' => null,
                'outgoing_request_pending' => false,
            ];
        }

        $request = FriendRequest::where(function ($q) use ($userId, $otherUserId) {
            $q->where('sender_id', $userId)->where('receiver_id', $otherUserId);
        })->orWhere(function ($q) use ($userId, $otherUserId) {
            $q->where('sender_id', $otherUserId)->where('receiver_id', $userId);
        })
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();

        $isFriend = $request && $request->status === 'accepted';
        $incomingRequestId = null;
        $outgoingRequestPending = false;

        if ($request && $request->status === 'pending') {
            if ((int) $request->receiver_id === $userId) {
                $incomingRequestId = (int) $request->id;
            }
            if ((int) $request->sender_id === $userId) {
                $outgoingRequestPending = true;
            }
        }

        return [
            'is_friend' => $isFriend,
            'incoming_request_id' => $incomingRequestId,
            'outgoing_request_pending' => $outgoingRequestPending,
        ];
    }

    public function blockUser(int $blockerId, int $blockedId): UserBlock
    {
        if ($blockerId === $blockedId) {
            throw new FriendshipServiceException('No puedes bloquearte a ti mismo', 422);
        }

        FriendRequest::where(function ($query) use ($blockerId, $blockedId) {
            $query->where('sender_id', $blockerId)->where('receiver_id', $blockedId);
        })->orWhere(function ($query) use ($blockerId, $blockedId) {
            $query->where('sender_id', $blockedId)->where('receiver_id', $blockerId);
        })->delete();

        return UserBlock::firstOrCreate([
            'blocker_id' => $blockerId,
            'blocked_id' => $blockedId,
        ]);
    }

    public function unblockUser(int $blockerId, int $blockedId): void
    {
        $block = UserBlock::where('blocker_id', $blockerId)
            ->where('blocked_id', $blockedId)
            ->first();

        if (!$block) {
            throw new FriendshipServiceException('Este usuario no esta bloqueado', 404);
        }

        $block->delete();
    }

    public function listBlockedIds(int $userId): array
    {
        return UserBlock::where('blocker_id', $userId)
            ->pluck('blocked_id')
            ->map(fn($id) => (int) $id)
            ->values()
            ->toArray();
    }

    public function getBlockedByIds(int $userId): array
    {
        return UserBlock::where('blocked_id', $userId)
            ->pluck('blocker_id')
            ->map(fn($id) => (int) $id)
            ->values()
            ->toArray();
    }

    public function getHiddenUserIds(int $userId): array
    {
        return array_values(array_unique(array_merge(
            $this->listBlockedIds($userId),
            $this->getBlockedByIds($userId)
        )));
    }

    public function getBlockContext(int $userId): array
    {
        $blockedIds = $this->listBlockedIds($userId);
        $blockedByIds = $this->getBlockedByIds($userId);

        return [
            'blocked_ids' => $blockedIds,
            'blocked_by_ids' => $blockedByIds,
            'hidden_user_ids' => array_values(array_unique(array_merge($blockedIds, $blockedByIds))),
        ];
    }

    public function isBlockedBetween(int $userId, int $otherUserId): bool
    {
        return UserBlock::where(function ($query) use ($userId, $otherUserId) {
            $query->where('blocker_id', $userId)->where('blocked_id', $otherUserId);
        })->orWhere(function ($query) use ($userId, $otherUserId) {
            $query->where('blocker_id', $otherUserId)->where('blocked_id', $userId);
        })->exists();
    }

    private function findOrFail(int $id): FriendRequest
    {
        $request = FriendRequest::find($id);
        if (!$request) {
            throw new FriendshipServiceException('Solicitud no encontrada', 404);
        }
        return $request;
    }
}


<?php

namespace App\Services;

use App\Exceptions\FriendshipServiceException;
use App\Models\FriendRequest;

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

        return array_values(array_unique(array_merge($sent, $received)));
    }

    /**
     * Solicitudes pendientes recibidas — para badge (RF-07).
     */
    public function pending(int $userId)
    {
        return FriendRequest::where('receiver_id', $userId)
            ->where('status', 'pending')
            ->orderBy('created_at', 'desc')
            ->get();
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


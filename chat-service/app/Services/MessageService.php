<?php

namespace App\Services;

use App\Exceptions\MessageServiceException;
use App\Models\Message;

class MessageService
{
    private ?array $friendIdsCache = null;

    /**
     * Enviar mensaje a un companero (RF-08).
     */
    public function send(int $senderId, int $receiverId, ?string $content, ?string $imageUrl, string $jwt): Message
    {
        if ($senderId === $receiverId) {
            throw new MessageServiceException('No puedes enviarte un mensaje a ti mismo', 422);
        }

        if (empty($content) && empty($imageUrl)) {
            throw new MessageServiceException('El mensaje debe tener contenido o imagen', 422);
        }

        $this->assertFriendship($receiverId, $jwt);

        return Message::create([
            'sender_id'   => $senderId,
            'receiver_id' => $receiverId,
            'content'     => $content,
            'image_url'   => $imageUrl,
            'is_read'     => false,
        ]);
    }

    /**
     * Obtener conversacion entre dos usuarios (RF-08).
     * Retorna mensajes ordenados cronologicamente.
     */
    public function getConversation(int $userId, int $otherUserId, int $limit = 50, string $jwt = ''): array
    {
        $this->assertFriendship($otherUserId, $jwt);

        $messages = Message::where(function ($q) use ($userId, $otherUserId) {
            $q->where('sender_id', $userId)->where('receiver_id', $otherUserId);
        })->orWhere(function ($q) use ($userId, $otherUserId) {
            $q->where('sender_id', $otherUserId)->where('receiver_id', $userId);
        })
            ->orderBy('created_at', 'asc')
            ->limit($limit)
            ->get()
            ->toArray();

        Message::where('sender_id', $otherUserId)
            ->where('receiver_id', $userId)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        return $messages;
    }

    /**
     * Inbox: lista de conversaciones recientes con ultimo mensaje (RF-08).
     */
    public function getInbox(int $userId, string $jwt = ''): array
    {
        $friendIds = $this->fetchFriendIds($jwt);
        if ($friendIds === null) {
            throw new MessageServiceException('No se pudo validar la lista de amigos', 503);
        }

        $sentTo = Message::where('sender_id', $userId)->pluck('receiver_id');
        $receivedFrom = Message::where('receiver_id', $userId)->pluck('sender_id');

        $contactIds = $sentTo->merge($receivedFrom)
            ->map(fn($id) => (int) $id)
            ->filter(fn($id) => in_array($id, $friendIds, true))
            ->unique()
            ->values();

        $conversations = [];
        foreach ($contactIds as $contactId) {
            $lastMessage = Message::where(function ($q) use ($userId, $contactId) {
                $q->where('sender_id', $userId)->where('receiver_id', $contactId);
            })->orWhere(function ($q) use ($userId, $contactId) {
                $q->where('sender_id', $contactId)->where('receiver_id', $userId);
            })
                ->orderBy('created_at', 'desc')
                ->first();

            $unreadCount = Message::where('sender_id', $contactId)
                ->where('receiver_id', $userId)
                ->where('is_read', false)
                ->count();

            if ($lastMessage) {
                $conversations[] = [
                    'contact_id'   => $contactId,
                    'last_message' => $lastMessage->toArray(),
                    'unread_count' => $unreadCount,
                ];
            }
        }

        usort($conversations, fn($a, $b) =>
            strtotime($b['last_message']['created_at']) - strtotime($a['last_message']['created_at'])
        );

        return $conversations;
    }

    private function assertFriendship(int $otherUserId, string $jwt): void
    {
        $friendIds = $this->fetchFriendIds($jwt);
        if ($friendIds === null) {
            throw new MessageServiceException('No se pudo validar la amistad', 503);
        }

        if (!in_array($otherUserId, $friendIds, true)) {
            throw new MessageServiceException('Solo puedes chatear con tus amigos', 403);
        }
    }

    private function fetchFriendIds(string $jwt): ?array
    {
        if ($this->friendIdsCache !== null) {
            return $this->friendIdsCache;
        }

        $friendIds = null;
        if ($jwt !== '') {
            $url = rtrim(env('SOCIAL_SERVICE_URL', 'http://profile-social-service:8000'), '/') . '/api/social/friends';
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'header' => "Accept: application/json\r\nAuthorization: Bearer {$jwt}\r\n",
                    'timeout' => 5,
                    'ignore_errors' => true,
                ],
            ]);

            $response = @file_get_contents($url, false, $context);
            $statusLine = $http_response_header[0] ?? '';
            preg_match('/\s(\d{3})\s/', $statusLine, $matches);
            $status = isset($matches[1]) ? (int) $matches[1] : 0;
            $isSuccess = $response !== false && $status >= 200 && $status < 300;

            if ($isSuccess) {
                $decoded = json_decode($response, true);
                if (is_array($decoded)) {
                    $friendIds = array_values(array_unique(array_map('intval', $decoded)));
                }
            }
        }

        $this->friendIdsCache = $friendIds;
        return $this->friendIdsCache;
    }
}

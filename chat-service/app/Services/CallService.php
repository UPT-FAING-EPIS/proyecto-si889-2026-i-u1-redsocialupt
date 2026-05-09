<?php

namespace App\Services;

use App\Exceptions\MessageServiceException;
use App\Models\CallSession;
use App\Models\CallSignal;

class CallService
{
    private ?array $friendIdsCache = null;
    private SocialBlockService $socialBlockService;

    public function __construct()
    {
        $this->socialBlockService = new SocialBlockService();
    }

    public function startCall(int $callerId, int $receiverId, string $mode, string $jwt): CallSession
    {
        if ($callerId === $receiverId) {
            throw new MessageServiceException('No puedes llamarte a ti mismo', 422);
        }

        $normalizedMode = $this->normalizeMode($mode);

        if ($this->socialBlockService->isBlockedBetween($jwt, $receiverId)) {
            throw new MessageServiceException('No puedes interactuar con este usuario', 403);
        }

        $this->assertFriendship($receiverId, $jwt);

        CallSession::where(function ($query) use ($callerId, $receiverId) {
            $query->where('caller_id', $callerId)->where('receiver_id', $receiverId);
        })->orWhere(function ($query) use ($callerId, $receiverId) {
            $query->where('caller_id', $receiverId)->where('receiver_id', $callerId);
        })->whereIn('status', ['ringing', 'accepted'])->update([
            'status' => 'ended',
        ]);

        return CallSession::create([
            'caller_id' => $callerId,
            'receiver_id' => $receiverId,
            'mode' => $normalizedMode,
            'status' => 'ringing',
            'duration_seconds' => 0,
        ]);
    }

    public function getPendingCalls(int $userId, string $jwt): array
    {
        $hiddenIds = $this->socialBlockService->getHiddenUserIds($jwt);
        $query = CallSession::where('receiver_id', $userId)
            ->where('status', 'ringing')
            ->orderBy('created_at', 'desc');

        if ($hiddenIds) {
            $query->whereNotIn('caller_id', $hiddenIds);
        }

        return $query->get()
            ->map(fn (CallSession $call) => $call->toArray())
            ->values()
            ->all();
    }

    public function getSession(int $userId, int $sessionId): CallSession
    {
        $session = CallSession::find($sessionId);
        if (!$session) {
            throw new MessageServiceException('La llamada no existe', 404);
        }

        if ((int) $session->caller_id !== $userId && (int) $session->receiver_id !== $userId) {
            throw new MessageServiceException('No tienes acceso a esta llamada', 403);
        }

        return $session;
    }

    public function acceptCall(int $userId, int $sessionId): CallSession
    {
        $session = $this->getSession($userId, $sessionId);

        if ((int) $session->receiver_id !== $userId) {
            throw new MessageServiceException('Solo el receptor puede aceptar esta llamada', 403);
        }

        if ($session->status === 'accepted') {
            return $session->fresh();
        }

        if ($session->status !== 'ringing') {
            throw new MessageServiceException('La llamada ya no esta disponible', 409);
        }

        $session->status = 'accepted';
        $session->save();

        return $session->fresh();
    }

    public function rejectCall(int $userId, int $sessionId): CallSession
    {
        $session = $this->getSession($userId, $sessionId);

        if ((int) $session->receiver_id !== $userId) {
            throw new MessageServiceException('Solo el receptor puede rechazar esta llamada', 403);
        }

        if ($session->status !== 'ringing') {
            throw new MessageServiceException('La llamada ya no esta disponible', 409);
        }

        $session->status = 'rejected';
        $session->save();

        return $session->fresh();
    }

    public function endCall(int $userId, int $sessionId, ?int $durationSeconds = null): CallSession
    {
        $session = $this->getSession($userId, $sessionId);

        if (!in_array($session->status, ['ringing', 'accepted'], true)) {
            return $session;
        }

        $session->status = 'ended';
        if ($durationSeconds !== null && $durationSeconds >= 0) {
            $session->duration_seconds = $durationSeconds;
        }
        $session->save();

        return $session->fresh();
    }

    public function addSignal(int $userId, int $sessionId, string $signalType, $payload): CallSignal
    {
        $session = $this->getSession($userId, $sessionId);

        if (!in_array($session->status, ['ringing', 'accepted'], true)) {
            throw new MessageServiceException('La llamada ya no permite intercambio de senales', 409);
        }

        return CallSignal::create([
            'call_session_id' => $session->id,
            'sender_id' => $userId,
            'signal_type' => trim($signalType) !== '' ? trim($signalType) : 'unknown',
            'payload' => $payload === null ? null : json_encode($payload),
        ]);
    }

    public function getSignals(int $userId, int $sessionId, int $afterId = 0): array
    {
        $session = $this->getSession($userId, $sessionId);

        return CallSignal::where('call_session_id', $session->id)
            ->where('id', '>', $afterId)
            ->where('sender_id', '!=', $userId)
            ->orderBy('id', 'asc')
            ->get()
            ->map(function (CallSignal $signal) {
                return [
                    'id' => $signal->id,
                    'call_session_id' => $signal->call_session_id,
                    'sender_id' => $signal->sender_id,
                    'signal_type' => $signal->signal_type,
                    'payload' => $signal->payload ? json_decode($signal->payload, true) : null,
                    'created_at' => optional($signal->created_at)?->toIso8601String(),
                ];
            })
            ->toArray();
    }

    public function updateMode(int $userId, int $sessionId, string $mode): CallSession
    {
        $session = $this->getSession($userId, $sessionId);

        if ($session->status !== 'accepted') {
            throw new MessageServiceException('Solo puedes cambiar el modo durante una llamada activa', 409);
        }

        $session->mode = $this->normalizeMode($mode);
        $session->save();

        return $session->fresh();
    }

    private function normalizeMode(string $mode): string
    {
        return in_array($mode, ['audio', 'video'], true) ? $mode : 'audio';
    }

    private function assertFriendship(int $otherUserId, string $jwt): void
    {
        $friendIds = $this->fetchFriendIds($jwt);
        if ($friendIds === null) {
            throw new MessageServiceException('No se pudo validar la amistad', 503);
        }

        if (!in_array($otherUserId, $friendIds, true)) {
            throw new MessageServiceException('Solo puedes llamar a tus amigos', 403);
        }
    }

    private function fetchFriendIds(string $jwt): ?array
    {
        if ($this->friendIdsCache !== null) {
            return $this->friendIdsCache;
        }

        $friendIds = null;
        if ($jwt !== '') {
            $url = $this->getSocialServiceBaseUrl() . '/api/social/friends';
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

    private function getSocialServiceBaseUrl(): string
    {
        $configuredUrl = trim((string) env('SOCIAL_SERVICE_URL', ''));
        if ($configuredUrl !== '') {
            return rtrim($configuredUrl, '/');
        }

        $scheme = trim((string) env('SOCIAL_SERVICE_SCHEME', 'http'));
        $host = trim((string) env('SOCIAL_SERVICE_HOST', 'profile-social-service'));
        $port = trim((string) env('SOCIAL_SERVICE_PORT', '8000'));

        return sprintf('%s://%s:%s', $scheme, $host, $port);
    }
}

<?php

namespace App\Services;

class SocialBlockService
{
    public function getGroupAccess(string $jwt, int $groupId): array
    {
        if ($jwt === '' || $groupId <= 0) {
            return [];
        }

        return $this->fetchJson($this->getSocialServiceBaseUrl() . "/api/social/groups/{$groupId}/access", $jwt);
    }

    public function getHiddenUserIds(string $jwt): array
    {
        $context = $this->fetchBlockContext($jwt);
        $hiddenIds = $context['hidden_user_ids'] ?? [];

        return array_values(array_unique(array_map('intval', is_array($hiddenIds) ? $hiddenIds : [])));
    }

    public function isBlockedBetween(string $jwt, int $otherUserId): bool
    {
        return in_array($otherUserId, $this->getHiddenUserIds($jwt), true);
    }

    public function canViewGroupConversation(string $jwt, int $groupId): bool
    {
        return (bool) ($this->getGroupAccess($jwt, $groupId)['can_view_conversation'] ?? false);
    }

    public function canPostInGroup(string $jwt, int $groupId): bool
    {
        return (bool) ($this->getGroupAccess($jwt, $groupId)['can_post'] ?? false);
    }

    public function canManageGroup(string $jwt, int $groupId): bool
    {
        return (bool) ($this->getGroupAccess($jwt, $groupId)['can_manage'] ?? false);
    }

    private function fetchBlockContext(string $jwt): array
    {
        return $this->fetchJson($this->getSocialServiceBaseUrl() . '/api/social/blocks/context', $jwt);
    }

    private function fetchJson(string $url, string $jwt): array
    {
        if ($jwt === '') {
            return [];
        }

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

        if ($response === false || $status < 200 || $status >= 300) {
            return [];
        }

        $decoded = json_decode($response, true);
        return is_array($decoded) ? $decoded : [];
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

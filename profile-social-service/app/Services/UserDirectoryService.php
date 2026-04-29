<?php

namespace App\Services;

class UserDirectoryService
{
    /**
     * Lista usuarios del auth-service con filtros opcionales (RF-07).
     * Consulta GET /api/auth/admin/users del auth-service internamente.
     * Para simplificar, el directorio consulta el auth-service vía HTTP.
     */
    public function listUsers(string $jwt, ?string $faculty = null, ?string $career = null)
    {
        $users = $this->fetchUsersFromAuth($jwt, array_filter([
            'faculty' => $faculty,
            'career' => $career,
        ], fn($value) => $value !== null && $value !== ''));
        $users = array_filter($users, fn($u) => (bool) ($u['is_profile_complete'] ?? false));

        return array_values($users);
    }

    /**
     * Buscar usuarios por nombre (RF-07).
     */
    public function search(string $jwt, string $query)
    {
        $users = $this->fetchUsersFromAuth($jwt, [
            'q' => $query,
            'limit' => 12,
        ]);
        $users = array_filter($users, fn($u) => (bool) ($u['is_profile_complete'] ?? false));

        return array_values($users);
    }

    /**
     * Obtiene la lista de usuarios desde auth-service.
     */
    private function fetchUsersFromAuth(string $jwt, array $query = []): array
    {
        try {
            $baseUrl = $this->getAuthServiceBaseUrl();
            $url = $baseUrl . '/api/auth/users';

            if (!empty($query)) {
                $url .= '?' . http_build_query($query);
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
        } catch (\Exception $e) {
            return [];
        }
    }

    private function getAuthServiceBaseUrl(): string
    {
        $configuredUrl = trim((string) env('AUTH_SERVICE_URL', ''));
        if ($configuredUrl !== '') {
            return rtrim($configuredUrl, '/');
        }

        $scheme = trim((string) env('AUTH_SERVICE_SCHEME', 'http'));
        $host = trim((string) env('AUTH_SERVICE_HOST', 'auth-service'));
        $port = trim((string) env('AUTH_SERVICE_PORT', '8000'));

        return sprintf('%s://%s:%s', $scheme, $host, $port);
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtMiddleware
{
    private const ACCOUNT_BLOCKED_PREFIX = 'ACCOUNT_BLOCKED::';

    public function handle($request, Closure $next)
    {
        $token = $request->bearerToken();
        $errorResponse = null;

        if (!$token) {
            $errorResponse = response()->json(['error' => 'Token no proporcionado'], 401);
        } else {
            try {
                $decoded = JWT::decode(
                    $token,
                    new Key(env('JWT_SECRET'), env('JWT_ALGORITHM', 'HS256'))
                );
                $request->auth = $this->hydrateAuthPayload($decoded, $token);
            } catch (\RuntimeException $e) {
                if (str_starts_with($e->getMessage(), self::ACCOUNT_BLOCKED_PREFIX)) {
                    $payload = json_decode(substr($e->getMessage(), strlen(self::ACCOUNT_BLOCKED_PREFIX)), true);
                    $payload = is_array($payload) ? $payload : [];
                    $errorResponse = response()->json(array_filter([
                        'error' => 'Tu cuenta ha sido bloqueada',
                        'code' => 'ACCOUNT_BLOCKED',
                        'reason' => $payload['reason'] ?? null,
                        'blocked_until' => $payload['blocked_until'] ?? null,
                        'is_indefinite' => $payload['is_indefinite'] ?? false,
                    ], fn ($value) => $value !== null), 403);
                } else {
                    $errorResponse = response()->json(['error' => 'No autorizado'], 401);
                }
            } catch (ExpiredException $e) {
                $errorResponse = response()->json(['error' => 'Token expirado'], 401);
            } catch (\Exception $e) {
                $errorResponse = response()->json(['error' => 'Token invalido'], 401);
            }
        }

        if ($errorResponse) {
            return $errorResponse;
        }

        return $next($request);
    }

    private function hydrateAuthPayload(object $decoded, string $token): object
    {
        $basePayload = (array) $decoded;
        $profileLookup = $this->fetchProfileFromAuthService($token);
        if ($profileLookup['status'] === 'blocked') {
            throw new \RuntimeException(self::ACCOUNT_BLOCKED_PREFIX . json_encode([
                'reason' => $profileLookup['data']['reason'] ?? null,
                'blocked_until' => $profileLookup['data']['blocked_until'] ?? null,
                'is_indefinite' => $profileLookup['data']['is_indefinite'] ?? false,
            ]));
        }

        $freshProfile = $profileLookup['data'];
        if (!$freshProfile) {
            return $decoded;
        }

        $basePayload['email'] = $freshProfile['email'] ?? ($basePayload['email'] ?? null);
        $basePayload['name'] = $freshProfile['full_name'] ?? $freshProfile['name'] ?? ($basePayload['name'] ?? null);
        $basePayload['full_name'] = $freshProfile['full_name'] ?? ($basePayload['full_name'] ?? null);
        $basePayload['school'] = $freshProfile['school'] ?? $freshProfile['career'] ?? ($basePayload['school'] ?? null);
        $basePayload['career'] = $freshProfile['career'] ?? $freshProfile['school'] ?? ($basePayload['career'] ?? null);
        $basePayload['area'] = $freshProfile['area'] ?? ($basePayload['area'] ?? null);
        $basePayload['position_title'] = $freshProfile['position_title'] ?? ($basePayload['position_title'] ?? null);
        $basePayload['faculty'] = $freshProfile['faculty'] ?? ($basePayload['faculty'] ?? null);
        $basePayload['role'] = $freshProfile['role'] ?? ($basePayload['role'] ?? null);
        $basePayload['avatar_url'] = $freshProfile['avatar_url'] ?? ($basePayload['avatar_url'] ?? null);

        return (object) $basePayload;
    }

    private function fetchProfileFromAuthService(string $token): array
    {
        $url = $this->getAuthServiceBaseUrl() . '/api/auth/me';
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Accept: application/json\r\nAuthorization: Bearer {$token}\r\n",
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            return ['status' => 'unavailable', 'data' => null];
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            return ['status' => 'unavailable', 'data' => null];
        }

        if (!isset($decoded['error'])) {
            return ['status' => 'ok', 'data' => $decoded];
        }

        $code = $decoded['code'] ?? null;
        if ($code === 'ACCOUNT_BLOCKED') {
            return ['status' => 'blocked', 'code' => 'ACCOUNT_BLOCKED', 'data' => $decoded];
        }

        return ['status' => 'fallback', 'code' => 'UNAUTHORIZED', 'data' => null];
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

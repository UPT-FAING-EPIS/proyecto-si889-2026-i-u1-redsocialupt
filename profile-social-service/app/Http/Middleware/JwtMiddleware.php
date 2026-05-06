<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtMiddleware
{
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
                if (str_starts_with($e->getMessage(), 'ACCOUNT_BLOCKED|')) {
                    $errorResponse = response()->json(array_filter([
                        'error' => 'Tu cuenta ha sido bloqueada',
                        'code' => 'ACCOUNT_BLOCKED',
                        'reason' => trim(substr($e->getMessage(), strlen('ACCOUNT_BLOCKED|'))) ?: null,
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
        if ($profileLookup['status'] === 'error') {
            $errorCode = $profileLookup['code'] ?? 'UNAUTHORIZED';
            $errorReason = trim((string) ($profileLookup['data']['reason'] ?? ''));
            throw new \RuntimeException($errorCode === 'ACCOUNT_BLOCKED' ? 'ACCOUNT_BLOCKED|' . $errorReason : $errorCode);
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
            return ['status' => 'error', 'code' => 'ACCOUNT_BLOCKED', 'data' => $decoded];
        }

        return ['status' => 'error', 'code' => 'UNAUTHORIZED', 'data' => $decoded];
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

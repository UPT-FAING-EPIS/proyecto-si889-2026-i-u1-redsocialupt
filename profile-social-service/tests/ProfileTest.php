<?php

namespace Tests;

use Firebase\JWT\JWT;
use PHPUnit\Framework\Attributes\TestDox;

class ProfileTest extends TestCase
{
    // ── Helpers ───────────────────────────────────────────────────────

    private function generateToken(array $overrides = []): string
    {
        $payload = array_merge([
            'sub'   => 1,
            'email' => 'test@virtual.upt.pe',
            'role'  => 'user',
            'iat'   => time(),
            'exp'   => time() + 3600,
        ], $overrides);

        return JWT::encode($payload, env('JWT_SECRET'), 'HS256');
    }

    private function authHeader(string $token): array
    {
        return ['Authorization' => 'Bearer ' . $token];
    }

    // ── Health check ──────────────────────────────────────────────────

    #[TestDox('Endpoint raíz')]
    public function testRootEndpoint(): void
    {
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'profile-social-service']);
    }

    #[TestDox('Preflight CORS permite origen confiable')]
    public function testCorsPreflightAllowsTrustedOrigin(): void
    {
        $this->call('OPTIONS', '/api/social/friends', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);
        $this->seeStatusCode(204);
    }

    // ── JWT middleware ────────────────────────────────────────────────

    #[TestDox('Amigos requieren JWT')]
    public function testFriendsRequireJwt(): void
    {
        $this->get('/api/social/friends');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    #[TestDox('Amigos rechazan JWT inválido')]
    public function testFriendsWithInvalidJwt(): void
    {
        $this->get('/api/social/friends', ['Authorization' => 'Bearer invalid']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token invalido']);
    }

    #[TestDox('Token expirado es rechazado')]
    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $this->get('/api/social/friends', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Friendship endpoints ──────────────────────────────────────────

    #[TestDox('Enviar solicitud requiere receptor')]
    public function testSendRequestRequiresReceiverId(): void
    {
        $token    = $this->generateToken();
        $this->post('/api/social/friends/request', [], $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    #[TestDox('Directorio requiere JWT')]
    public function testDirectoryRequiresJwt(): void
    {
        $this->get('/api/social/directory');
        $this->seeStatusCode(401);
    }

    #[TestDox('Búsqueda requiere consulta')]
    public function testSearchRequiresQuery(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/directory/search', $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    #[TestDox('Pendientes responde con JWT válido')]
    public function testPendingEndpointWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/friends/pending', $this->authHeader($token));
        // Debería funcionar (200) aunque esté vacío — solo verifica que la ruta existe
        $this->seeStatusCode(200);
    }

    #[TestDox('Lista de amigos responde con JWT válido')]
    public function testFriendsListWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/friends', $this->authHeader($token));
        $this->seeStatusCode(200);
    }
}

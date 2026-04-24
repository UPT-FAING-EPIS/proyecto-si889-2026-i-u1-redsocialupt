<?php

namespace Tests;

use Firebase\JWT\JWT;

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

    public function testRootEndpoint(): void
    {
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'profile-social-service']);
    }

    // ── JWT middleware ────────────────────────────────────────────────

    public function testFriendsRequireJwt(): void
    {
        $this->get('/api/social/friends');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    public function testFriendsWithInvalidJwt(): void
    {
        $this->get('/api/social/friends', ['Authorization' => 'Bearer invalid']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token inválido']);
    }

    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $this->get('/api/social/friends', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Friendship endpoints ──────────────────────────────────────────

    public function testSendRequestRequiresReceiverId(): void
    {
        $token    = $this->generateToken();
        $this->post('/api/social/friends/request', [], $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    public function testDirectoryRequiresJwt(): void
    {
        $this->get('/api/social/directory');
        $this->seeStatusCode(401);
    }

    public function testSearchRequiresQuery(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/directory/search', $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    public function testPendingEndpointWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/friends/pending', $this->authHeader($token));
        // Debería funcionar (200) aunque esté vacío — solo verifica que la ruta existe
        $this->seeStatusCode(200);
    }

    public function testFriendsListWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/social/friends', $this->authHeader($token));
        $this->seeStatusCode(200);
    }
}

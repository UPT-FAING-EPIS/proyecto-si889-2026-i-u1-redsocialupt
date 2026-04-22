<?php

namespace Tests;

use Firebase\JWT\JWT;

class ChatTest extends TestCase
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
        $response = $this->get('/');
        $this->assertEquals(200, $response->status());
        $this->seeJson(['service' => 'chat-service']);
    }

    // ── JWT middleware ────────────────────────────────────────────────

    public function testInboxRequiresJwt(): void
    {
        $response = $this->get('/api/chat/inbox');
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    public function testSendRequiresJwt(): void
    {
        $response = $this->post('/api/chat/messages', []);
        $this->assertEquals(401, $response->status());
    }

    public function testConversationRequiresJwt(): void
    {
        $response = $this->get('/api/chat/messages/2');
        $this->assertEquals(401, $response->status());
    }

    public function testInvalidToken(): void
    {
        $response = $this->get('/api/chat/inbox', ['Authorization' => 'Bearer fake']);
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token inválido']);
    }

    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $response = $this->get('/api/chat/inbox', $this->authHeader($token));
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Endpoints ─────────────────────────────────────────────────────

    public function testSendRequiresReceiverId(): void
    {
        $token    = $this->generateToken();
        $response = $this->post('/api/chat/messages', [], $this->authHeader($token));
        $this->assertEquals(422, $response->status());
    }

    public function testInboxWithJwt(): void
    {
        $token    = $this->generateToken();
        $response = $this->get('/api/chat/inbox', $this->authHeader($token));
        $this->assertEquals(200, $response->status());
    }

    public function testConversationWithJwt(): void
    {
        $token    = $this->generateToken();
        $response = $this->get('/api/chat/messages/2', $this->authHeader($token));
        $this->assertEquals(200, $response->status());
    }
}

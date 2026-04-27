<?php

namespace Tests;

use Firebase\JWT\JWT;
use PHPUnit\Framework\Attributes\TestDox;

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

    #[TestDox('Endpoint raíz')]
    public function testRootEndpoint(): void
    {
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'chat-service']);
    }

    #[TestDox('Preflight CORS permite origen confiable')]
    public function testCorsPreflightAllowsTrustedOrigin(): void
    {
        $this->call('OPTIONS', '/api/chat/inbox', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);
        $this->seeStatusCode(204);
    }

    // ── JWT middleware ────────────────────────────────────────────────

    #[TestDox('Bandeja requiere JWT')]
    public function testInboxRequiresJwt(): void
    {
        $this->get('/api/chat/inbox');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    #[TestDox('Enviar mensaje requiere JWT')]
    public function testSendRequiresJwt(): void
    {
        $this->post('/api/chat/messages', []);
        $this->seeStatusCode(401);
    }

    #[TestDox('Conversación requiere JWT')]
    public function testConversationRequiresJwt(): void
    {
        $this->get('/api/chat/messages/2');
        $this->seeStatusCode(401);
    }

    #[TestDox('JWT inválido es rechazado')]
    public function testInvalidToken(): void
    {
        $this->get('/api/chat/inbox', ['Authorization' => 'Bearer fake']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token invalido']);
    }

    #[TestDox('Token expirado es rechazado')]
    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $this->get('/api/chat/inbox', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Endpoints ─────────────────────────────────────────────────────

    #[TestDox('Enviar mensaje requiere receptor')]
    public function testSendRequiresReceiverId(): void
    {
        $token    = $this->generateToken();
        $this->post('/api/chat/messages', [], $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    #[TestDox('Bandeja responde con JWT válido')]
    public function testInboxWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/chat/inbox', $this->authHeader($token));
        $this->seeStatusCode(503);
        $this->seeJson(['error' => 'No se pudo validar la lista de amigos']);
    }

    #[TestDox('Conversación responde con JWT válido')]
    public function testConversationWithJwt(): void
    {
        $token    = $this->generateToken();
        $this->get('/api/chat/messages/2', $this->authHeader($token));
        $this->seeStatusCode(503);
        $this->seeJson(['error' => 'No se pudo validar la amistad']);
    }
}

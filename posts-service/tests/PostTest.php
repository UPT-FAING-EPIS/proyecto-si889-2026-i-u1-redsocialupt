<?php

namespace Tests;

use Firebase\JWT\JWT;

class PostTest extends TestCase
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
        $this->seeJson(['service' => 'posts-service']);
    }

    // ── Middleware JWT ────────────────────────────────────────────────

    public function testPostsRequireJwt(): void
    {
        $response = $this->get('/api/posts');
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    public function testPostsWithInvalidJwt(): void
    {
        $response = $this->get('/api/posts', ['Authorization' => 'Bearer invalid']);
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token inválido']);
    }

    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $response = $this->get('/api/posts', $this->authHeader($token));
        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Validación de creación de post ────────────────────────────────

    public function testCreatePostRequiresVisibility(): void
    {
        $token    = $this->generateToken();
        $response = $this->post(
            '/api/posts',
            ['content' => 'Hola mundo'],
            $this->authHeader($token)
        );
        $this->assertEquals(422, $response->status());
    }

    public function testCreatePostRequiresContentOrImage(): void
    {
        $token    = $this->generateToken();
        $response = $this->post(
            '/api/posts',
            ['visibility' => 'all'],
            $this->authHeader($token)
        );
        $this->assertEquals(422, $response->status());
    }

    // ── Validación de comentarios ─────────────────────────────────────

    public function testCommentRequiresContent(): void
    {
        $token    = $this->generateToken();
        $response = $this->post(
            '/api/posts/1/comments',
            [],
            $this->authHeader($token)
        );
        $this->assertEquals(422, $response->status());
    }

    // ── Protección admin ──────────────────────────────────────────────

    public function testAdminDestroyPostAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $response = $this->delete('/api/posts/1/admin', [], $this->authHeader($token));
        $this->assertEquals(403, $response->status());
        $this->seeJson(['error' => 'No autorizado']);
    }

    public function testAdminDestroyCommentAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $response = $this->delete('/api/comments/1/admin', [], $this->authHeader($token));
        $this->assertEquals(403, $response->status());
        $this->seeJson(['error' => 'No autorizado']);
    }
}

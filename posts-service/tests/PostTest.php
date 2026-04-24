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
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'posts-service']);
    }

    // ── Middleware JWT ────────────────────────────────────────────────

    public function testPostsRequireJwt(): void
    {
        $this->get('/api/posts');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    public function testPostsWithInvalidJwt(): void
    {
        $this->get('/api/posts', ['Authorization' => 'Bearer invalid']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token inválido']);
    }

    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $this->get('/api/posts', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Validación de creación de post ────────────────────────────────

    public function testCreatePostRejectsInvalidVisibility(): void
    {
        $token    = $this->generateToken();
        $this->post(
            '/api/posts',
            ['content' => 'Hola mundo', 'visibility' => 'private'],
            $this->authHeader($token)
        );
        $this->seeStatusCode(422);
    }

    public function testCreatePostRequiresContentOrImage(): void
    {
        $token    = $this->generateToken();
        $this->post(
            '/api/posts',
            ['visibility' => 'all'],
            $this->authHeader($token)
        );
        $this->seeStatusCode(422);
    }

    // ── Validación de comentarios ─────────────────────────────────────

    public function testCommentRequiresContent(): void
    {
        $token    = $this->generateToken();
        $this->post(
            '/api/posts/1/comments',
            [],
            $this->authHeader($token)
        );
        $this->seeStatusCode(422);
    }

    // ── Protección admin ──────────────────────────────────────────────

    public function testAdminDestroyPostAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $this->delete('/api/posts/1/admin', [], $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson(['error' => 'No autorizado']);
    }

    public function testAdminDestroyCommentAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $this->delete('/api/comments/1/admin', [], $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson(['error' => 'No autorizado']);
    }
}

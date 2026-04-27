<?php

namespace Tests;

use Firebase\JWT\JWT;
use PHPUnit\Framework\Attributes\TestDox;

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

    #[TestDox('Endpoint raíz')]
    public function testRootEndpoint(): void
    {
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'posts-service']);
    }

    #[TestDox('Preflight CORS permite origen confiable')]
    public function testCorsPreflightAllowsTrustedOrigin(): void
    {
        $this->call('OPTIONS', '/api/posts', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);
        $this->seeStatusCode(204);
    }

    // ── Middleware JWT ────────────────────────────────────────────────

    #[TestDox('Publicaciones requieren JWT')]
    public function testPostsRequireJwt(): void
    {
        $this->get('/api/posts');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    #[TestDox('Publicaciones rechazan JWT inválido')]
    public function testPostsWithInvalidJwt(): void
    {
        $this->get('/api/posts', ['Authorization' => 'Bearer invalid']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token invalido']);
    }

    #[TestDox('Token expirado es rechazado')]
    public function testExpiredToken(): void
    {
        $token    = $this->generateToken(['exp' => time() - 100]);
        $this->get('/api/posts', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    // ── Validación de creación de post ────────────────────────────────

    #[TestDox('Crear publicación rechaza visibilidad inválida')]
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

    #[TestDox('Crear publicación requiere contenido o imagen')]
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

    #[TestDox('Comentar requiere contenido')]
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

    #[TestDox('Eliminar publicación como admin requiere rol admin')]
    public function testAdminDestroyPostAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $this->delete('/api/posts/1/admin', [], $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson(['error' => 'No autorizado']);
    }

    #[TestDox('Eliminar comentario como admin requiere rol admin')]
    public function testAdminDestroyCommentAsNonAdmin(): void
    {
        $token    = $this->generateToken(['role' => 'user']);
        $this->delete('/api/comments/1/admin', [], $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson(['error' => 'No autorizado']);
    }
}

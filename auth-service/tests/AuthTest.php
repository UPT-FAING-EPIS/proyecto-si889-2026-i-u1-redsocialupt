<?php

namespace Tests;

use Firebase\JWT\JWT;

class AuthTest extends TestCase
{
    /**
     * Helper: genera un JWT válido para tests.
     */
    private function generateTestToken(array $overrides = []): string
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

    /**
     * Helper: genera un JWT de admin.
     */
    private function generateAdminToken(): string
    {
        return $this->generateTestToken(['role' => 'admin', 'sub' => 99]);
    }

    /**
     * Test: el endpoint raíz responde correctamente.
     */
    public function testRootEndpoint(): void
    {
        $response = $this->get('/');

        $this->assertEquals(200, $response->status());
        $this->seeJson(['service' => 'auth-service']);
    }

    /**
     * Test: POST /api/auth/google sin token retorna error.
     */
    public function testGoogleAuthWithoutToken(): void
    {
        $response = $this->post('/api/auth/google', []);

        $this->assertEquals(422, $response->status());
    }

    /**
     * Test: GET /api/auth/me sin JWT retorna 401.
     */
    public function testMeWithoutJwt(): void
    {
        $response = $this->get('/api/auth/me');

        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    /**
     * Test: GET /api/auth/me con JWT inválido retorna 401.
     */
    public function testMeWithInvalidJwt(): void
    {
        $response = $this->get('/api/auth/me', [
            'Authorization' => 'Bearer token-invalido',
        ]);

        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token inválido']);
    }

    /**
     * Test: GET /api/auth/verify con JWT válido retorna datos.
     */
    public function testVerifyWithValidJwt(): void
    {
        $token = $this->generateTestToken();

        $response = $this->get('/api/auth/verify', [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $this->assertEquals(200, $response->status());
        $this->seeJson([
            'valid'   => true,
            'user_id' => 1,
            'email'   => 'test@virtual.upt.pe',
            'role'    => 'user',
        ]);
    }

    /**
     * Test: POST /api/auth/logout con JWT válido cierra sesión.
     */
    public function testLogout(): void
    {
        $token = $this->generateTestToken();

        $response = $this->post('/api/auth/logout', [], [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $this->assertEquals(200, $response->status());
        $this->seeJson(['message' => 'Sesión cerrada correctamente']);
    }

    /**
     * Test: GET /api/auth/admin/users sin ser admin retorna 403.
     */
    public function testListUsersAsNonAdmin(): void
    {
        $token = $this->generateTestToken(['role' => 'user']);

        $response = $this->get('/api/auth/admin/users', [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $this->assertEquals(403, $response->status());
        $this->seeJson(['error' => 'No autorizado']);
    }

    /**
     * Test: JWT expirado retorna 401.
     */
    public function testExpiredToken(): void
    {
        $token = $this->generateTestToken(['exp' => time() - 100]);

        $response = $this->get('/api/auth/verify', [
            'Authorization' => 'Bearer ' . $token,
        ]);

        $this->assertEquals(401, $response->status());
        $this->seeJson(['error' => 'Token expirado']);
    }
}

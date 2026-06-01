<?php

namespace Tests;

use App\Models\User;
use Firebase\JWT\JWT;
use PHPUnit\Framework\Attributes\TestDox;

class AuthTest extends TestCase
{
    private function generateTestToken(array $overrides = []): string
    {
        $payload = array_merge([
            'sub' => 1,
            'email' => 'test@virtual.upt.pe',
            'role' => 'user',
            'iat' => time(),
            'exp' => time() + 3600,
        ], $overrides);

        return JWT::encode($payload, env('JWT_SECRET'), 'HS256');
    }

    private function authHeader(string $token): array
    {
        return ['Authorization' => 'Bearer ' . $token];
    }

    private function createUser(array $overrides = []): User
    {
        $sequence = User::count() + 1;

        $user = new User(array_merge([
            'google_id' => 'google-' . $sequence,
            'email' => 'test' . $sequence . '@virtual.upt.pe',
            'name' => 'Usuario Test ' . $sequence,
            'role' => 'user',
            'is_active' => true,
        ], $overrides));

        $user->save();

        return $user->fresh();
    }

    #[TestDox('Endpoint raíz')]
    public function testRootEndpoint(): void
    {
        $this->get('/');
        $this->seeStatusCode(200);
        $this->seeJson(['service' => 'auth-service']);
    }

    #[TestDox('Google Auth requiere token')]
    public function testGoogleAuthRequiresToken(): void
    {
        $this->post('/api/auth/google', []);
        $this->seeStatusCode(422);
    }

    #[TestDox('Preflight CORS permite origen confiable')]
    public function testCorsPreflightAllowsTrustedOrigin(): void
    {
        $this->call('OPTIONS', '/api/auth/google', [], [], [], [
            'HTTP_ORIGIN' => 'http://localhost',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'POST',
        ]);
        $this->seeStatusCode(204);
    }

    #[TestDox('Perfil propio requiere JWT')]
    public function testMeWithoutJwt(): void
    {
        $this->get('/api/auth/me');
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token no proporcionado']);
    }

    #[TestDox('Perfil propio rechaza JWT inválido')]
    public function testMeWithInvalidJwt(): void
    {
        $this->get('/api/auth/me', ['Authorization' => 'Bearer token-invalido']);
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token invalido']);
    }

    #[TestDox('Token expirado es rechazado')]
    public function testExpiredToken(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email, 'exp' => time() - 100]);
        $this->get('/api/auth/verify', $this->authHeader($token));
        $this->seeStatusCode(401);
        $this->seeJson(['error' => 'Token expirado']);
    }

    #[TestDox('Verificación acepta JWT válido')]
    public function testVerifyWithValidJwt(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);

        $this->get('/api/auth/verify', $this->authHeader($token));
        $this->seeStatusCode(200);
        $this->seeJson([
            'valid' => true,
            'user_id' => $user->id,
            'email' => $user->email,
            'role' => 'user',
        ]);
    }

    #[TestDox('Cerrar sesión responde correctamente')]
    public function testLogout(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);
        $this->post('/api/auth/logout', [], $this->authHeader($token));
        $this->seeStatusCode(200);
        $this->seeJson(['message' => 'Sesión cerrada correctamente']);
    }

    #[TestDox('Completar perfil requiere nombre completo')]
    public function testCompleteProfileRequiresFullName(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);
        $this->post('/api/auth/complete-profile', [], $this->authHeader($token));
        $this->seeStatusCode(422);
    }

    #[TestDox('Administrativo puede completar perfil con area y cargo')]
    public function testAdministrativoCanCompleteProfile(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);

        $this->post('/api/auth/complete-profile', [
            'full_name' => 'Admin Institucional',
            'user_type' => 'administrativo',
            'faculty' => 'FACEM',
            'area' => 'Tesoreria',
            'position_title' => 'Asistente',
        ], $this->authHeader($token));

        $this->seeStatusCode(200);
        $this->seeJson([
            'message' => 'Perfil completado',
            'user_type' => 'administrativo',
            'area' => 'Tesoreria',
            'position_title' => 'Asistente',
        ]);
    }

    #[TestDox('Docente requiere area y cargo en onboarding')]
    public function testTeacherRequiresAreaAndPosition(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);

        $this->post('/api/auth/complete-profile', [
            'full_name' => 'Docente Prueba',
            'user_type' => 'teacher',
            'faculty' => 'FAING',
        ], $this->authHeader($token));

        $this->seeStatusCode(422);
    }

    #[TestDox('Correo institucional de estudiante bloquea rol y autocompleta codigo y nombre')]
    public function testInstitutionalStudentEmailLocksRoleAndAutocompletesData(): void
    {
        $user = $this->createUser([
            'email' => 'rc9912345601@virtual.upt.pe',
            'name' => 'Ricardo Cutipa',
        ]);
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);

        $this->post('/api/auth/complete-profile', [
            'full_name' => 'Nombre Manipulado',
            'user_type' => 'teacher',
            'faculty' => 'FAING',
            'career' => 'Ingenieria de Sistemas',
            'academic_cycle' => '5',
            'student_code' => '000',
        ], $this->authHeader($token));

        $this->seeStatusCode(200);
        $this->seeJson([
            'full_name' => 'Ricardo Cutipa',
            'user_type' => 'student',
            'student_code' => '9912345601',
        ]);
    }

    #[TestDox('Correo con iniciales que no coinciden no puede registrarse como estudiante')]
    public function testMismatchedStudentEmailCannotChooseStudentRole(): void
    {
        $user = $this->createUser([
            'email' => 'xx9912345602@virtual.upt.pe',
            'name' => 'Ricardo Cutipa',
        ]);
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email]);

        $this->post('/api/auth/complete-profile', [
            'full_name' => 'Ricardo Cutipa',
            'user_type' => 'student',
            'faculty' => 'FAING',
            'career' => 'Ingenieria de Sistemas',
            'academic_cycle' => '5',
            'student_code' => '9912345602',
        ], $this->authHeader($token));

        $this->seeStatusCode(422);
        $this->seeJson([
            'error' => 'El correo institucional no corresponde al patron de estudiante',
        ]);
    }

    #[TestDox('Actualizar perfil sin JWT es rechazado')]
    public function testUpdateProfileWithoutJwt(): void
    {
        $this->put('/api/auth/profile', ['bio' => 'Hola']);
        $this->seeStatusCode(401);
    }

    #[TestDox('Perfil propio responde con usuario existente')]
    public function testMeWithExistingUser(): void
    {
        $user = $this->createUser([
            'full_name' => 'Prueba Auth',
            'is_profile_complete' => true,
        ]);

        $token = $this->generateTestToken([
            'sub' => $user->id,
            'email' => $user->email,
        ]);

        $this->get('/api/auth/me', $this->authHeader($token));
        $this->seeStatusCode(200);
        $this->seeJson([
            'id' => $user->id,
            'email' => $user->email,
        ]);
    }

    #[TestDox('Usuario bloqueado no puede acceder a su perfil')]
    public function testBlockedUserCannotAccessProfile(): void
    {
        $user = $this->createUser([
            'is_active' => false,
            'blocked_reason' => 'Incumplio las reglas',
        ]);

        $token = $this->generateTestToken([
            'sub' => $user->id,
            'email' => $user->email,
        ]);

        $this->get('/api/auth/me', $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson([
            'error' => 'Tu cuenta ha sido bloqueada',
            'code' => 'ACCOUNT_BLOCKED',
            'reason' => 'Incumplio las reglas',
        ]);
    }

    #[TestDox('Listar usuarios como no admin es rechazado')]
    public function testListUsersAsNonAdmin(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email, 'role' => 'user']);
        $this->get('/api/auth/admin/users', $this->authHeader($token));
        $this->seeStatusCode(403);
        $this->seeJson(['error' => 'No autorizado']);
    }

    #[TestDox('Desactivar usuario como no admin es rechazado')]
    public function testToggleUserAsNonAdmin(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email, 'role' => 'user']);
        $this->put('/api/auth/admin/users/1', [], $this->authHeader($token));
        $this->seeStatusCode(403);
    }

    #[TestDox('Actualizar datos académicos como no admin es rechazado')]
    public function testUpdateAcademicAsNonAdmin(): void
    {
        $user = $this->createUser();
        $token = $this->generateTestToken(['sub' => $user->id, 'email' => $user->email, 'role' => 'user']);
        $this->put('/api/auth/admin/users/1/academic', [], $this->authHeader($token));
        $this->seeStatusCode(403);
    }

    #[TestDox('Admin no puede desactivarse a sí mismo')]
    public function testAdminCannotDeactivateSelf(): void
    {
        $admin = $this->createUser(['role' => 'admin']);
        $token = $this->generateTestToken([
            'sub' => $admin->id,
            'role' => 'admin',
            'email' => $admin->email,
        ]);

        $this->put('/api/auth/admin/users/' . $admin->id, ['blocked_reason' => 'Prueba'], $this->authHeader($token));
        $this->seeStatusCode(422);
        $this->seeJson(['error' => 'No puedes desactivar tu propia cuenta']);
    }

    #[TestDox('Admin puede promover a otro usuario')]
    public function testAdminCanPromoteAnotherUser(): void
    {
        $admin = $this->createUser(['role' => 'admin']);
        $target = $this->createUser();
        $token = $this->generateTestToken([
            'sub' => $admin->id,
            'role' => 'admin',
            'email' => $admin->email,
        ]);

        $this->put('/api/auth/admin/users/' . $target->id . '/role', ['role' => 'admin'], $this->authHeader($token));
        $this->seeStatusCode(200);
        $this->seeJson([
            'message' => 'Usuario promovido a admin',
            'role' => 'admin',
        ]);
    }
}

<?php

namespace App\Services;

use App\Models\User;
use Firebase\JWT\JWT;
use Google\Client as GoogleClient;

class AuthService
{
    /**
     * Autentica con Google OAuth.
     * Verifica el ID Token, comprueba @virtual.upt.pe, crea o encuentra el usuario.
     */
    public function googleAuth(string $idToken): array
    {
        $client  = new GoogleClient(['client_id' => env('GOOGLE_CLIENT_ID')]);
        $payload = $client->verifyIdToken($idToken);

        if (!$payload) {
            throw new \Exception('Token de Google inválido', 401);
        }

        $email    = $payload['email'];
        $googleId = $payload['sub'];
        $name     = $payload['name'] ?? '';
        $avatar   = $payload['picture'] ?? '';

        // Validar dominio
        if (substr(strrchr($email, '@'), 1) !== 'virtual.upt.pe') {
            throw new \Exception('Solo se permiten cuentas @virtual.upt.pe', 403);
        }

        $user = User::firstOrCreate(
            ['google_id' => $googleId],
            [
                'email'      => $email,
                'name'       => $name,
                'avatar_url' => $avatar,
                'role'       => 'user',
                'is_active'  => true,
            ]
        );

        if (!$user->is_active) {
            throw new \Exception('Tu cuenta ha sido desactivada', 403);
        }

        return [
            'token'               => $this->generateJwt($user),
            'is_profile_complete' => $user->is_profile_complete,
            'user'                => $this->formatUser($user),
        ];
    }

    /**
     * Completa el perfil en el primer acceso (RF-01).
     */
    public function completeProfile(int $userId, array $data): array
    {
        $user = $this->findOrFail($userId);

        $user->update([
            'full_name'      => $data['full_name'],
            'user_type'      => $data['user_type']      ?? 'student',
            'faculty'        => $data['faculty']         ?? null,
            'career'         => $data['career']          ?? null,
            'academic_cycle' => $data['academic_cycle']  ?? null,
            'student_code'   => $data['student_code']    ?? null,
            'is_profile_complete' => true,
        ]);

        return ['user' => $this->formatUser($user->fresh()), 'token' => $this->generateJwt($user->fresh())];
    }

    /**
     * Actualiza avatar y bio del perfil (RF-06).
     */
    public function updateProfile(int $userId, array $data): array
    {
        $user = $this->findOrFail($userId);

        $user->update(array_filter([
            'avatar_url'     => $data['avatar_url'] ?? null,
            'banner_url'     => $data['banner_url'] ?? null,
            'bio'            => $data['bio']        ?? null,
            'academic_cycle' => $data['academic_cycle'] ?? null,
        ], fn($v) => $v !== null));

        return ['user' => $this->formatUser($user->fresh()), 'token' => $this->generateJwt($user->fresh())];
    }

    /**
     * Retorna los datos del usuario autenticado.
     */
    public function getAuthenticatedUser(int $userId): User
    {
        return $this->findOrFail($userId);
    }

    /**
     * Lista todos los usuarios (RF-09 — solo admin).
     */
    public function listUsers()
    {
        return User::orderBy('created_at', 'desc')->get();
    }

    /**
     * Obtiene el perfil público de un usuario por su ID.
     */
    public function getUserById(int $userId): array
    {
        $user = $this->findOrFail($userId);
        return $this->formatUser($user);
    }

    /**
     * Lista pública de usuarios (sin paginación compleja por simplicidad).
     */
    public function listUsersPublic(): array
    {
        $users = User::where('is_active', true)->orderBy('created_at', 'desc')->get();
        $formatted = [];
        foreach ($users as $user) {
            $formatted[] = $this->formatUser($user);
        }
        return $formatted;
    }

    /**
     * Activa o desactiva un usuario (RF-09 — solo admin).
     */
    public function toggleUser(int $userId): User
    {
        $user = $this->findOrFail($userId);
        $user->is_active = !$user->is_active;
        $user->save();

        return $user;
    }

    /**
     * Actualiza datos académicos de un usuario (RF-09 — solo admin).
     */
    public function updateAcademic(int $userId, array $data): User
    {
        $user = $this->findOrFail($userId);

        $user->update(array_filter([
            'faculty'        => $data['faculty']        ?? null,
            'career'         => $data['career']         ?? null,
            'academic_cycle' => $data['academic_cycle'] ?? null,
            'student_code'   => $data['student_code']   ?? null,
            'user_type'      => $data['user_type']      ?? null,
        ], fn($v) => $v !== null));

        return $user->fresh();
    }

    // ─── Privados ─────────────────────────────────────────

    private function findOrFail(int $userId): User
    {
        $user = User::find($userId);
        if (!$user) {
            throw new \Exception('Usuario no encontrado', 404);
        }
        return $user;
    }

    private function generateJwt(User $user): string
    {
        $payload = [
            'sub'        => $user->id,
            'email'      => $user->email,
            'name'       => $user->name,
            'school'     => $user->school,
            'faculty'    => $user->faculty,
            'role'       => $user->role,
            'avatar_url' => $user->avatar_url,
            'iat'        => time(),
            'exp'        => time() + (env('JWT_EXPIRATION_MINUTES', 60) * 60),
        ];

        return JWT::encode($payload, env('JWT_SECRET'), env('JWT_ALGORITHM', 'HS256'));
    }

    private function formatUser(User $user): array
    {
        return [
            'id'                  => $user->id,
            'email'               => $user->email,
            'name'                => $user->name,
            'full_name'           => $user->full_name,
            'avatar_url'          => $user->avatar_url,
            'banner_url'          => $user->banner_url,
            'faculty'             => $user->faculty,
            'career'              => $user->career,
            'school'              => $user->school,
            'student_code'        => $user->student_code,
            'academic_cycle'      => $user->academic_cycle,
            'bio'                 => $user->bio,
            'user_type'           => $user->user_type,
            'role'                => $user->role,
            'is_profile_complete' => $user->is_profile_complete,
        ];
    }
}

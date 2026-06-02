<?php

namespace App\Services;

use App\Exceptions\AuthServiceException;
use App\Models\User;
use Carbon\Carbon;
use Firebase\JWT\JWT;
use Google\Client as GoogleClient;

class AuthService
{
    private const ONLINE_WINDOW_SECONDS = 120;
    private const ACCOUNT_BLOCKED_PREFIX = 'ACCOUNT_BLOCKED::';

    /**
     * Autentica con Google OAuth.
     * Verifica el ID Token, comprueba @virtual.upt.pe, crea o encuentra el usuario.
     */
    public function googleAuth(string $idToken): array
    {
        $client  = new GoogleClient(['client_id' => env('GOOGLE_CLIENT_ID')]);
        $payload = $client->verifyIdToken($idToken);

        if (!$payload) {
            throw new AuthServiceException('Token de Google inválido', 401);
        }

        $email    = $payload['email'];
        $googleId = $payload['sub'];
        $name     = $payload['name'] ?? '';
        $avatar   = $payload['picture'] ?? '';

        $this->releaseExpiredBlocks();

        // Validar dominio
        if (substr(strrchr($email, '@'), 1) !== 'virtual.upt.pe') {
            throw new AuthServiceException('Solo se permiten cuentas @virtual.upt.pe', 403);
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

        $shouldRefreshGoogleAvatar = empty($user->avatar_url)
            || str_contains((string) $user->avatar_url, 'googleusercontent.com');

        $updates = [];
        if ($user->email !== $email) {
            $updates['email'] = $email;
        }
        if ($name !== '' && $user->name !== $name) {
            $updates['name'] = $name;
        }
        if ($avatar !== '' && $shouldRefreshGoogleAvatar && $user->avatar_url !== $avatar) {
            $updates['avatar_url'] = $avatar;
        }

        if ($updates !== []) {
            $user->update($updates);
            $user = $user->fresh();
        }

        $user = $this->refreshBlockState($user);
        if (!$user->is_active) {
            $blocked = $this->buildBlockedPayload($user);
            return [
                'blocked' => true,
                'reason' => $blocked['reason'],
                'blocked_until' => $blocked['blocked_until'],
                'is_indefinite' => $blocked['is_indefinite'],
            ];
        }

        $user = $this->markPresence($user);

        return [
            'token'               => $this->generateJwt($user),
            'is_profile_complete' => $user->is_profile_complete,
            'user'                => $this->formatUser($user),
        ];
    }

    public function devLogin(string $role = 'user'): array
    {
        $this->releaseExpiredBlocks();

        $normalizedRole = in_array($role, ['user', 'admin'], true) ? $role : 'user';
        $isAdmin = $normalizedRole === 'admin';

        $payload = [
            'google_id' => $isAdmin ? 'dev-local-admin' : 'dev-local-user',
            'email' => $isAdmin ? 'dev.admin@virtual.upt.pe' : 'dev.local@virtual.upt.pe',
            'name' => $isAdmin ? 'Admin Prueba Local' : 'Usuario Prueba Local',
            'full_name' => $isAdmin ? 'Admin Prueba Local' : 'Usuario Prueba Local',
            'user_type' => 'student',
            'faculty' => 'FAING',
            'career' => 'Ingenieria de Sistemas',
            'area' => null,
            'position_title' => null,
            'academic_cycle' => 'X',
            'student_code' => '999999',
            'role' => $normalizedRole,
            'is_active' => true,
            'is_profile_complete' => true,
            'blocked_reason' => null,
            'blocked_until' => null,
        ];

        $user = User::where('google_id', $payload['google_id'])
            ->orWhere('email', $payload['email'])
            ->first();

        if ($user) {
            $user->forceFill($payload)->save();
            $user = $user->fresh();
        } else {
            $user = User::create($payload);
        }

        $user = $this->markPresence($user);

        return [
            'token' => $this->generateJwt($user),
            'is_profile_complete' => true,
            'user' => $this->formatUser($user),
        ];
    }

    /**
     * Completa el perfil en el primer acceso (RF-01).
     */
    public function completeProfile(int $userId, array $data): array
    {
        $user = $this->findOrFail($userId);
        $studentIdentity = $this->detectStudentIdentity($user->email, $user->name ?: ($data['full_name'] ?? ''));
        $userType = $data['user_type'] ?? 'student';

        if ($studentIdentity !== null) {
            $userType = 'student';
            $data['full_name'] = $user->name ?: ($data['full_name'] ?? '');
            $data['student_code'] = $studentIdentity['student_code'];
        } elseif ($userType === 'student') {
            throw new AuthServiceException('El correo institucional no corresponde al patron de estudiante', 422);
        }

        if (empty(trim((string) ($data['faculty'] ?? '')))) {
            throw new AuthServiceException('La facultad o dependencia es obligatoria', 422);
        }

        if ($userType === 'student' && empty(trim((string) ($data['career'] ?? '')))) {
            throw new AuthServiceException('La escuela profesional es obligatoria para estudiantes', 422);
        }

        if ($userType === 'student' && !preg_match('/^\d{10}$/', (string) ($data['student_code'] ?? ''))) {
            throw new AuthServiceException('El codigo de estudiante debe tener exactamente 10 digitos numericos', 422);
        }

        if ($userType === 'student' && empty(trim((string) ($data['academic_cycle'] ?? '')))) {
            throw new AuthServiceException('El ciclo academico es obligatorio para estudiantes', 422);
        }

        if (in_array($userType, ['teacher', 'administrativo'], true)) {
            if (empty(trim((string) ($data['area'] ?? '')))) {
                throw new AuthServiceException('El area es obligatoria para este tipo de usuario', 422);
            }
            if (empty(trim((string) ($data['position_title'] ?? '')))) {
                throw new AuthServiceException('El cargo es obligatorio para este tipo de usuario', 422);
            }
        }

        $user->update([
            'full_name'      => $data['full_name'],
            'user_type'      => $userType,
            'faculty'        => $data['faculty'] ?? null,
            'career'         => $userType === 'student' ? ($data['career'] ?? null) : null,
            'area'           => $userType === 'student' ? null : ($data['area'] ?? null),
            'position_title' => $userType === 'student' ? null : ($data['position_title'] ?? null),
            'academic_cycle' => $userType === 'student' ? ($data['academic_cycle'] ?? null) : null,
            'student_code'   => $userType === 'student' ? ($data['student_code'] ?? null) : null,
            'is_profile_complete' => true,
        ]);

        $user = $this->markPresence($user);

        return ['user' => $this->formatUser($user), 'token' => $this->generateJwt($user)];
    }

    private function detectStudentIdentity(?string $email, ?string $fullName): ?array
    {
        if (!preg_match('/^([a-zA-Z]{2})(\d{10})@virtual\.upt\.pe$/', (string) $email, $matches)) {
            return null;
        }

        return ['student_code' => $matches[2]];
    }

    private function normalizeInitial(string $value): string
    {
        $normalized = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        $normalized = strtolower((string) $normalized);
        return preg_match('/[a-z]/', $normalized, $match) ? $match[0] : '';
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

        $user = $this->markPresence($user);

        return ['user' => $this->formatUser($user), 'token' => $this->generateJwt($user)];
    }

    /**
     * Retorna los datos del usuario autenticado.
     */
    public function getAuthenticatedUser(int $userId): User
    {
        return $this->ensureUserIsActive($this->findOrFail($userId));
    }

    public function getAuthenticatedUserProfile(int $userId): array
    {
        $user = $this->markPresence($this->ensureUserIsActive($this->findOrFail($userId)));
        return $this->formatUser($user);
    }

    public function touchPresence(int $userId): array
    {
        return $this->getAuthenticatedUserProfile($userId);
    }

    /**
     * Renueva el JWT del usuario autenticado (si sigue activo).
     */
    public function refreshToken(int $userId): array
    {
        $user = $this->markPresence($this->ensureUserIsActive($this->findOrFail($userId)));
        return [
            'token' => $this->generateJwt($user),
            'user'  => $this->formatUser($user),
        ];
    }

    /**
     * Lista todos los usuarios (RF-09 — solo admin).
     */
    public function listUsers()
    {
        $this->releaseExpiredBlocks();
        return User::orderBy('created_at', 'desc')->get();
    }

    /**
     * Obtiene el perfil público de un usuario por su ID.
     */
    public function getUserById(int $userId): array
    {
        $this->releaseExpiredBlocks();
        $user = $this->findOrFail($userId);
        return $this->formatUser($user);
    }

    /**
     * Lista pública de usuarios (sin paginación compleja por simplicidad).
     */
    public function listUsersPublic(?string $query = null, ?string $faculty = null, ?string $career = null, ?int $limit = null): array
    {
        $this->releaseExpiredBlocks();
        $usersQuery = User::query()->where('is_active', true);

        $query = trim((string) $query);
        if ($query !== '') {
            $usersQuery->where(function ($builder) use ($query) {
                $like = '%' . $query . '%';
                $builder
                    ->where('name', 'like', $like)
                    ->orWhere('full_name', 'like', $like)
                    ->orWhere('career', 'like', $like)
                    ->orWhere('area', 'like', $like)
                    ->orWhere('position_title', 'like', $like)
                    ->orWhere('faculty', 'like', $like)
                    ->orWhere('student_code', 'like', $like);
            });
        }

        if ($faculty) {
            $usersQuery->where('faculty', $faculty);
        }

        if ($career) {
            $usersQuery->where('career', $career);
        }

        $usersQuery->orderBy('created_at', 'desc');

        if ($limit && $limit > 0) {
            $usersQuery->limit($limit);
        }

        $users = $usersQuery->get();
        $formatted = [];
        foreach ($users as $user) {
            $formatted[] = $this->formatUser($user);
        }
        return $formatted;
    }

    /**
     * Activa o desactiva un usuario (RF-09 — solo admin).
     */
    public function toggleUser(
        int $userId,
        ?int $actorUserId = null,
        ?string $blockedReason = null,
        ?string $blockedUntil = null,
        bool $isIndefinite = false
    ): User
    {
        $this->releaseExpiredBlocks();
        $user = $this->findOrFail($userId);
        $user = $this->refreshBlockState($user);

        if ($actorUserId !== null && $user->id === $actorUserId) {
            throw new AuthServiceException('No puedes bloquear tu propia cuenta', 422);
        }

        if (!$user->is_active) {
            $user->forceFill([
                'is_active' => true,
                'blocked_reason' => null,
                'blocked_until' => null,
            ])->save();

            return $user->fresh();
        }

        $normalizedBlockedReason = null;
        $trimmedReason = trim((string) $blockedReason);
        if ($trimmedReason !== '') {
            $normalizedBlockedReason = $trimmedReason;
        }

        $normalizedBlockedUntil = null;
        if (!$isIndefinite && trim((string) $blockedUntil) !== '') {
            try {
                $normalizedBlockedUntil = Carbon::parse($blockedUntil);
            } catch (\Throwable $e) {
                throw new AuthServiceException('La fecha de fin del bloqueo es invalida', 422);
            }

            if ($normalizedBlockedUntil->lessThanOrEqualTo(Carbon::now())) {
                throw new AuthServiceException('La fecha de fin del bloqueo debe ser futura', 422);
            }
        }

        $user->forceFill([
            'is_active' => false,
            'blocked_reason' => $normalizedBlockedReason,
            'blocked_until' => $isIndefinite ? null : $normalizedBlockedUntil,
        ])->save();

        return $user->fresh();
    }

    /**
     * Actualiza datos académicos de un usuario (RF-09 — solo admin).
     */
    public function updateAcademic(int $userId, array $data): User
    {
        $user = $this->findOrFail($userId);
        $userType = $data['user_type'] ?? $user->user_type;

        if (array_key_exists('faculty', $data) && trim((string) $data['faculty']) === '') {
            throw new AuthServiceException('La facultad o dependencia es obligatoria', 422);
        }

        if ($userType === 'student' && array_key_exists('career', $data) && trim((string) $data['career']) === '') {
            throw new AuthServiceException('La escuela profesional es obligatoria para estudiantes', 422);
        }

        if ($userType === 'student' && !empty($data['student_code']) && !preg_match('/^\d{10}$/', (string) $data['student_code'])) {
            throw new AuthServiceException('El codigo de estudiante debe tener exactamente 10 digitos numericos', 422);
        }

        if ($userType === 'student' && array_key_exists('academic_cycle', $data) && trim((string) $data['academic_cycle']) === '') {
            throw new AuthServiceException('El ciclo academico es obligatorio para estudiantes', 422);
        }

        if (in_array($userType, ['teacher', 'administrativo'], true)) {
            if (array_key_exists('area', $data) && trim((string) $data['area']) === '') {
                throw new AuthServiceException('El area es obligatoria para este tipo de usuario', 422);
            }
            if (array_key_exists('position_title', $data) && trim((string) $data['position_title']) === '') {
                throw new AuthServiceException('El cargo es obligatorio para este tipo de usuario', 422);
            }
        }

        $user->update(array_filter([
            'faculty'        => $data['faculty']        ?? null,
            'career'         => $userType === 'student' ? ($data['career'] ?? null) : null,
            'area'           => $userType === 'student' ? null : ($data['area'] ?? null),
            'position_title' => $userType === 'student' ? null : ($data['position_title'] ?? null),
            'academic_cycle' => $userType === 'student' ? ($data['academic_cycle'] ?? null) : null,
            'student_code'   => $userType === 'student' ? ($data['student_code'] ?? null) : null,
            'user_type'      => $userType,
        ], fn($v) => $v !== null));

        return $user->fresh();
    }

    /**
     * Actualiza el rol de un usuario (solo admin).
     */
    public function updateRole(int $targetUserId, string $role, int $actorUserId): User
    {
        $user = $this->findOrFail($targetUserId);

        if (!in_array($role, ['user', 'admin'], true)) {
            throw new AuthServiceException('Rol invalido', 422);
        }

        if ($user->id === $actorUserId && $role !== 'admin') {
            throw new AuthServiceException('No puedes quitarte tus propios permisos de administrador', 422);
        }

        if ($user->role === 'admin' && $role !== 'admin') {
            $adminCount = User::where('role', 'admin')->count();
            if ($adminCount <= 1) {
                throw new AuthServiceException('Debe existir al menos un administrador activo', 422);
            }
        }

        $user->role = $role;
        $user->save();

        return $user->fresh();
    }

    // ─── Privados ─────────────────────────────────────────

    private function findOrFail(int $userId): User
    {
        $user = User::find($userId);
        if (!$user) {
            throw new AuthServiceException('Usuario no encontrado', 404);
        }
        return $user;
    }

    private function markPresence(User $user): User
    {
        $user->forceFill([
            'last_seen_at' => Carbon::now(),
        ])->save();

        return $user->fresh();
    }

    private function isUserOnline(User $user): bool
    {
        if (!$user->last_seen_at) {
            return false;
        }

        return $user->last_seen_at->greaterThanOrEqualTo(Carbon::now()->subSeconds(self::ONLINE_WINDOW_SECONDS));
    }

    private function generateJwt(User $user): string
    {
        $payload = [
            'sub'        => $user->id,
            'email'      => $user->email,
            'name'       => $user->full_name ?: $user->name,
            'full_name'  => $user->full_name,
            'school'     => $user->career,
            'career'     => $user->career,
            'area'       => $user->area,
            'position_title' => $user->position_title,
            'faculty'    => $user->faculty,
            'role'       => $user->role,
            'avatar_url' => $user->avatar_url,
            'blocked_until' => $user->blocked_until?->toIso8601String(),
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
            'school'              => $user->career,
            'area'                => $user->area,
            'position_title'      => $user->position_title,
            'student_code'        => $user->student_code,
            'academic_cycle'      => $user->academic_cycle,
            'bio'                 => $user->bio,
            'last_seen_at'        => $user->last_seen_at?->toIso8601String(),
            'is_online'           => $this->isUserOnline($user),
            'user_type'           => $user->user_type,
            'role'                => $user->role,
            'is_active'           => (bool) $user->is_active,
            'blocked_reason'      => $user->blocked_reason,
            'blocked_until'       => $user->blocked_until?->toIso8601String(),
            'is_blocked_indefinitely' => !$user->is_active && $user->blocked_until === null,
            'is_profile_complete' => $user->is_profile_complete,
        ];
    }

    private function ensureUserIsActive(User $user): User
    {
        $user = $this->refreshBlockState($user);
        if (!$user->is_active) {
            throw new AuthServiceException(self::ACCOUNT_BLOCKED_PREFIX . json_encode($this->buildBlockedPayload($user)), 403);
        }

        return $user;
    }

    private function refreshBlockState(User $user): User
    {
        if ($user->is_active || !$user->blocked_until) {
            return $user;
        }

        if ($user->blocked_until->greaterThan(Carbon::now())) {
            return $user;
        }

        $user->forceFill([
            'is_active' => true,
            'blocked_reason' => null,
            'blocked_until' => null,
        ])->save();

        return $user->fresh();
    }

    private function releaseExpiredBlocks(): void
    {
        User::query()
            ->where('is_active', false)
            ->whereNotNull('blocked_until')
            ->where('blocked_until', '<=', Carbon::now())
            ->update([
                'is_active' => true,
                'blocked_reason' => null,
                'blocked_until' => null,
                'updated_at' => Carbon::now(),
            ]);
    }

    private function buildBlockedPayload(User $user): array
    {
        return [
            'reason' => $user->blocked_reason ?: null,
            'blocked_until' => $user->blocked_until?->toIso8601String(),
            'is_indefinite' => $user->blocked_until === null,
        ];
    }
}

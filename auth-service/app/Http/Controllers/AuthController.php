<?php

namespace App\Http\Controllers;

use App\Services\AuthService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class AuthController extends BaseController
{
    private AuthService $authService;

    public function __construct()
    {
        $this->authService = new AuthService();
    }

    /**
     * POST /api/auth/google
     * Verifica ID Token de Google, crea/encuentra usuario, retorna JWT.
     */
    public function googleAuth(Request $request): JsonResponse
    {
        $this->validate($request, [
            'id_token' => 'required|string',
        ]);

        try {
            $result = $this->authService->googleAuth($request->input('id_token'));
            return response()->json($result, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * POST /api/auth/complete-profile
     * Guarda los datos del formulario de primer acceso (RF-01).
     */
    public function completeProfile(Request $request): JsonResponse
    {
        $this->validate($request, [
            'full_name'      => 'required|string|max:150',
            'user_type'      => 'required|in:student,teacher',
            'faculty'        => 'nullable|string|max:150',
            'career'         => 'nullable|string|max:150',
            'academic_cycle' => 'nullable|string|max:20',
            'student_code'   => 'nullable|string|max:20',
        ]);

        try {
            $user = $this->authService->completeProfile(
                $request->auth->sub,
                $request->only(['full_name', 'user_type', 'faculty', 'career', 'academic_cycle', 'student_code'])
            );
            return response()->json(['message' => 'Perfil completado', 'user' => $user['user'], 'token' => $user['token']], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * PUT /api/auth/profile
     * Editar avatar y bio del perfil (RF-06).
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $this->validate($request, [
            'avatar'         => 'nullable|image|max:2048',
            'banner'         => 'nullable|image|max:2048',
            'avatar_url'     => 'nullable|string|max:500',
            'banner_url'     => 'nullable|string|max:500',
            'bio'            => 'nullable|string',
            'academic_cycle' => 'nullable|string',
        ]);

        $data = $request->only(['bio', 'avatar_url', 'banner_url', 'academic_cycle']);
        
        $uploadDir = public_path('auth-uploads');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0775, true);
        }

        if ($request->hasFile('avatar') && $request->file('avatar')->isValid()) {
            $file = $request->file('avatar');
            $filename = time() . '_avatar_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);
            $data['avatar_url'] = '/auth-uploads/' . $filename;
        }

        if ($request->hasFile('banner') && $request->file('banner')->isValid()) {
            $file = $request->file('banner');
            $filename = time() . '_banner_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);
            $data['banner_url'] = '/auth-uploads/' . $filename;
        }

        try {
            $user = $this->authService->updateProfile(
                $request->auth->sub,
                $data
            );
            return response()->json(['message' => 'Perfil actualizado', 'user' => $user['user'], 'token' => $user['token']], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * POST /api/auth/logout
     * El frontend descarta el JWT.
     */
    public function logout(): JsonResponse
    {
        return response()->json(['message' => 'Sesión cerrada correctamente'], 200);
    }

    /**
     * GET /api/auth/me
     * Datos del usuario autenticado.
     */
    public function me(Request $request): JsonResponse
    {
        try {
            $user = $this->authService->getAuthenticatedUser($request->auth->sub);
            return response()->json($user, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * GET /api/auth/verify
     * Verifica validez del JWT (uso inter-servicio).
     */
    public function verify(Request $request): JsonResponse
    {
        return response()->json([
            'valid'   => true,
            'user_id' => $request->auth->sub,
            'email'   => $request->auth->email,
            'role'    => $request->auth->role,
        ], 200);
    }

    /**
     * GET /api/auth/users
     * Lista todos los usuarios (público para autenticados).
     */
    public function listUsersPublic(): JsonResponse
    {
        return response()->json($this->authService->listUsersPublic(), 200);
    }

    /**
     * GET /api/auth/users/{id}
     * Obtiene el perfil de un usuario por id.
     */
    public function getUser(int $id): JsonResponse
    {
        try {
            $user = $this->authService->getUserById($id);
            return response()->json($user, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * GET /api/auth/admin/users
     * Lista todos los usuarios (RF-09 — solo admin).
     */
    public function listUsers(Request $request): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        return response()->json($this->authService->listUsers(), 200);
    }

    /**
     * PUT /api/auth/admin/users/{id}
     * Activa o desactiva un usuario (RF-09 — solo admin).
     */
    public function toggleUser(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        try {
            $user = $this->authService->toggleUser($id);
            return response()->json([
                'message' => $user->is_active ? 'Usuario activado' : 'Usuario desactivado',
                'user'    => $user,
            ], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }

    /**
     * PUT /api/auth/admin/users/{id}/academic
     * Edita info académica de un usuario (RF-09 — solo admin).
     */
    public function updateAcademic(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        $this->validate($request, [
            'user_type'      => 'nullable|in:student,teacher',
            'faculty'        => 'nullable|string|max:150',
            'career'         => 'nullable|string|max:150',
            'academic_cycle' => 'nullable|string|max:20',
            'student_code'   => 'nullable|string|max:20',
        ]);

        try {
            $user = $this->authService->updateAcademic($id, $request->only([
                'user_type', 'faculty', 'career', 'academic_cycle', 'student_code',
            ]));
            return response()->json(['message' => 'Datos académicos actualizados', 'user' => $user], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], is_int($e->getCode()) && $e->getCode() >= 100 && $e->getCode() < 600 ? $e->getCode() : 500);
        }
    }
}

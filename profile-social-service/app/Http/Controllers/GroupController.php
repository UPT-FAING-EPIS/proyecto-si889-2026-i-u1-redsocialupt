<?php

namespace App\Http\Controllers;

use App\Services\GroupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class GroupController extends BaseController
{
    private GroupService $groupService;

    private function publicUploadsPath(string $directory): string
    {
        return app()->basePath('public/' . trim($directory, '/'));
    }

    public function __construct()
    {
        $this->groupService = new GroupService();
    }

    public function discover(Request $request): JsonResponse
    {
        return response()->json(
            $this->groupService->discover($request->bearerToken() ?? '', (int) $request->auth->sub, (string) $request->query('q', '')),
            200
        );
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json(
            $this->groupService->myGroups($request->bearerToken() ?? '', (int) $request->auth->sub),
            200
        );
    }

    public function store(Request $request): JsonResponse
    {
        $this->validate($request, [
            'name' => 'required|string|max:150',
            'description' => 'nullable|string|max:5000',
            'privacy' => 'required|in:public,private',
            'cover' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $coverUrl = null;
        if ($request->hasFile('cover') && $request->file('cover')->isValid()) {
            $uploadDir = $this->publicUploadsPath('group-covers');
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0775, true);
            }

            $file = $request->file('cover');
            $filename = time() . '_group_cover_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);
            $coverUrl = '/group-covers/' . $filename;
        }

        try {
            $group = $this->groupService->create($request->bearerToken() ?? '', (int) $request->auth->sub, [
                'name' => $request->input('name'),
                'description' => $request->input('description'),
                'privacy' => $request->input('privacy'),
                'cover_url' => $coverUrl,
            ]);

            return response()->json($group, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            return response()->json(
                $this->groupService->findDetailed($jwt, $id, (int) $request->auth->sub, $role),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function join(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json($this->groupService->join((int) $request->auth->sub, $id), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function leave(Request $request, int $id): JsonResponse
    {
        try {
            $this->groupService->leave((int) $request->auth->sub, $id);
            return response()->json(['message' => 'Saliste del grupo'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'name' => 'nullable|string|max:150',
            'description' => 'nullable|string|max:5000',
            'privacy' => 'nullable|in:public,private',
            'cover' => 'nullable|file|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $payload = $request->only(['name', 'description', 'privacy']);
        if ($request->hasFile('cover') && $request->file('cover')->isValid()) {
            $uploadDir = $this->publicUploadsPath('group-covers');
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0775, true);
            }

            $file = $request->file('cover');
            $filename = time() . '_group_cover_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);
            $payload['cover_url'] = '/group-covers/' . $filename;
        }

        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            return response()->json(
                $this->groupService->update($jwt, (int) $request->auth->sub, $id, $payload, $role),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function members(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json(
                $this->groupService->members($request->bearerToken() ?? '', $id, (int) $request->auth->sub),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function pending(Request $request, int $id): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            return response()->json(
                $this->groupService->pendingRequests($jwt, $id, (int) $request->auth->sub, $role),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function approve(Request $request, int $id, int $membershipId): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            $this->groupService->approveRequest((int) $request->auth->sub, $id, $membershipId, $role);
            return response()->json(['message' => 'Solicitud aprobada'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function reject(Request $request, int $id, int $membershipId): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            $this->groupService->rejectRequest((int) $request->auth->sub, $id, $membershipId, $role);
            return response()->json(['message' => 'Solicitud rechazada'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function updateRole(Request $request, int $id, int $memberUserId): JsonResponse
    {
        $this->validate($request, [
            'role' => 'required|in:admin,member',
        ]);

        try {
            $jwt = $request->bearerToken() ?? '';
            $roleSys = $request->auth->role ?? '';
            if (empty($roleSys)) {
                $roleSys = $this->groupService->decodeJwtRole($jwt);
            }
            $this->groupService->updateMemberRole((int) $request->auth->sub, $id, $memberUserId, (string) $request->input('role'), $roleSys);
            return response()->json(['message' => 'Rol actualizado'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function removeMember(Request $request, int $id, int $memberUserId): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            $this->groupService->removeMember((int) $request->auth->sub, $id, $memberUserId, $role);
            return response()->json(['message' => 'Miembro expulsado'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function access(Request $request, int $id): JsonResponse
    {
        try {
            $jwt = $request->bearerToken() ?? '';
            $role = $request->auth->role ?? '';
            if (empty($role)) {
                $role = $this->groupService->decodeJwtRole($jwt);
            }
            return response()->json($this->groupService->accessContext((int) $request->auth->sub, $id, $jwt, $role), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

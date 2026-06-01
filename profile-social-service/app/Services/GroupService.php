<?php

namespace App\Services;

use App\Models\Group;
use App\Models\GroupMembership;
use Carbon\Carbon;

class GroupService
{
    private UserDirectoryService $userDirectoryService;

    public function __construct()
    {
        $this->userDirectoryService = new UserDirectoryService();
    }

    public function discover(string $jwt, int $userId, string $query = ''): array
    {
        $groups = Group::orderBy('created_at', 'desc')->get();
        $query = trim($query);

        if ($query !== '') {
            $groups = $groups->filter(function (Group $group) use ($query) {
                return str_contains(mb_strtolower($group->name), mb_strtolower($query))
                    || str_contains(mb_strtolower((string) $group->description), mb_strtolower($query));
            })->values();
        }

        return $groups->map(fn (Group $group) => $this->formatGroup($group, $userId, $jwt, $this->decodeJwtRole($jwt)))->values()->all();
    }

    public function myGroups(string $jwt, int $userId): array
    {
        $groupIds = GroupMembership::where('user_id', $userId)
            ->where('status', 'approved')
            ->pluck('group_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->toArray();

        if (empty($groupIds)) {
            return [];
        }

        return Group::whereIn('id', $groupIds)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn (Group $group) => $this->formatGroup($group, $userId, $jwt, $this->decodeJwtRole($jwt)))
            ->values()
            ->all();
    }

    public function create(string $jwt, int $userId, array $data): array
    {
        $group = Group::create([
            'creator_id' => $userId,
            'name' => trim((string) $data['name']),
            'description' => trim((string) ($data['description'] ?? '')),
            'cover_url' => $data['cover_url'] ?? null,
            'privacy' => $data['privacy'] ?? 'public',
        ]);

        GroupMembership::create([
            'group_id' => $group->id,
            'user_id' => $userId,
            'role' => 'creator',
            'status' => 'approved',
            'reviewed_by' => $userId,
            'reviewed_at' => Carbon::now(),
        ]);

        return $this->formatGroup($group->fresh(), $userId, $jwt, $this->decodeJwtRole($jwt));
    }

    public function findDetailed(string $jwt, int $groupId, int $userId, string $role = ''): array
    {
        $group = $this->findOrFail($groupId);
        return $this->formatGroup($group, $userId, $jwt, $role);
    }

    public function join(int $userId, int $groupId): array
    {
        $group = $this->findOrFail($groupId);
        $membership = GroupMembership::where('group_id', $groupId)
            ->where('user_id', $userId)
            ->first();

        if ($membership && $membership->status === 'approved') {
            return ['status' => 'approved', 'message' => 'Ya perteneces al grupo'];
        }

        if ($group->privacy === 'public') {
            $membership = GroupMembership::updateOrCreate(
                ['group_id' => $groupId, 'user_id' => $userId],
                [
                    'role' => $membership?->role === 'creator' ? 'creator' : 'member',
                    'status' => 'approved',
                    'reviewed_by' => $userId,
                    'reviewed_at' => Carbon::now(),
                ]
            );

            return ['status' => 'approved', 'message' => 'Te uniste al grupo', 'membership' => $membership];
        }

        $membership = GroupMembership::updateOrCreate(
            ['group_id' => $groupId, 'user_id' => $userId],
            [
                'role' => 'member',
                'status' => 'pending',
                'reviewed_by' => null,
                'reviewed_at' => null,
            ]
        );

        return ['status' => 'pending', 'message' => 'Solicitud enviada', 'membership' => $membership];
    }

    public function leave(int $userId, int $groupId): void
    {
        $membership = $this->getMembership($groupId, $userId);
        if (!$membership || $membership->status !== 'approved') {
            throw new \RuntimeException('No perteneces a este grupo', 404);
        }
        if ($membership->role === 'creator') {
            throw new \RuntimeException('El creador no puede abandonar el grupo', 422);
        }

        $membership->delete();
    }

    public function update(string $jwt, int $actorId, int $groupId, array $data, string $sysRole = ''): array
    {
        $group = $this->findOrFail($groupId);
        if (!$this->isAdmin($actorId, $groupId, $sysRole)) {
            throw new \RuntimeException('No tienes permisos para editar este grupo', 403);
        }

        $group->fill(array_filter([
            'name' => isset($data['name']) ? trim((string) $data['name']) : null,
            'description' => array_key_exists('description', $data) ? trim((string) ($data['description'] ?? '')) : null,
            'cover_url' => $data['cover_url'] ?? null,
            'privacy' => $data['privacy'] ?? null,
        ], fn ($value) => $value !== null));
        $group->save();

        return $this->formatGroup($group->fresh(), $actorId, $jwt);
    }

    public function members(string $jwt, int $groupId, int $userId): array
    {
        $group = $this->findOrFail($groupId);
        $memberships = GroupMembership::where('group_id', $group->id)
            ->where('status', 'approved')
            ->orderByRaw("FIELD(role, 'creator', 'admin', 'member')")
            ->orderBy('created_at')
            ->get();

        $usersById = $this->indexUsersById($jwt, $memberships->pluck('user_id')->map(fn ($id) => (int) $id)->all());

        return $memberships->map(function (GroupMembership $membership) use ($usersById) {
            $user = $usersById[(int) $membership->user_id] ?? null;

            return [
                'membership_id' => $membership->id,
                'group_id' => (int) $membership->group_id,
                'user_id' => (int) $membership->user_id,
                'role' => $membership->role,
                'status' => $membership->status,
                'joined_at' => optional($membership->created_at)->toIso8601String(),
                'user' => $user,
            ];
        })->values()->all();
    }

    public function pendingRequests(string $jwt, int $groupId, int $actorId, string $sysRole = ''): array
    {
        if (!$this->isAdmin($actorId, $groupId, $sysRole)) {
            throw new \RuntimeException('No tienes permisos para revisar solicitudes', 403);
        }

        $memberships = GroupMembership::where('group_id', $groupId)
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->get();

        $usersById = $this->indexUsersById($jwt, $memberships->pluck('user_id')->map(fn ($id) => (int) $id)->all());

        return $memberships->map(function (GroupMembership $membership) use ($usersById) {
            return [
                'membership_id' => $membership->id,
                'group_id' => (int) $membership->group_id,
                'user_id' => (int) $membership->user_id,
                'requested_at' => optional($membership->created_at)->toIso8601String(),
                'user' => $usersById[(int) $membership->user_id] ?? null,
            ];
        })->values()->all();
    }

    public function approveRequest(int $actorId, int $groupId, int $membershipId, string $sysRole = ''): void
    {
        if (!$this->isAdmin($actorId, $groupId, $sysRole)) {
            throw new \RuntimeException('No tienes permisos para aprobar solicitudes', 403);
        }

        $membership = GroupMembership::where('group_id', $groupId)->find($membershipId);
        if (!$membership || $membership->status !== 'pending') {
            throw new \RuntimeException('Solicitud no encontrada', 404);
        }

        $membership->update([
            'status' => 'approved',
            'reviewed_by' => $actorId,
            'reviewed_at' => Carbon::now(),
        ]);
    }

    public function rejectRequest(int $actorId, int $groupId, int $membershipId, string $sysRole = ''): void
    {
        if (!$this->isAdmin($actorId, $groupId, $sysRole)) {
            throw new \RuntimeException('No tienes permisos para rechazar solicitudes', 403);
        }

        $membership = GroupMembership::where('group_id', $groupId)->find($membershipId);
        if (!$membership || $membership->status !== 'pending') {
            throw new \RuntimeException('Solicitud no encontrada', 404);
        }

        $membership->update([
            'status' => 'rejected',
            'reviewed_by' => $actorId,
            'reviewed_at' => Carbon::now(),
        ]);
    }

    public function updateMemberRole(int $actorId, int $groupId, int $targetUserId, string $role, string $sysRole = ''): void
    {
        if (!in_array($role, ['admin', 'member'], true)) {
            throw new \RuntimeException('Rol invalido', 422);
        }

        $isSuperAdmin = trim($sysRole) === 'admin';
        $actorMembership = $this->getMembership($groupId, $actorId);
        if (!$isSuperAdmin && (!$actorMembership || $actorMembership->role !== 'creator')) {
            throw new \RuntimeException('Solo el creador puede cambiar roles', 403);
        }

        $membership = $this->getMembership($groupId, $targetUserId);
        if (!$membership || $membership->status !== 'approved') {
            throw new \RuntimeException('Miembro no encontrado', 404);
        }
        if ($membership->role === 'creator') {
            throw new \RuntimeException('No puedes cambiar el rol del creador', 422);
        }

        $membership->update(['role' => $role]);
    }

    public function removeMember(int $actorId, int $groupId, int $targetUserId, string $sysRole = ''): void
    {
        $isSuperAdmin = trim($sysRole) === 'admin';
        $actorMembership = $this->getMembership($groupId, $actorId);
        if (!$isSuperAdmin && (!$actorMembership || $actorMembership->status !== 'approved' || !in_array($actorMembership->role, ['creator', 'admin'], true))) {
            throw new \RuntimeException('No tienes permisos para expulsar miembros', 403);
        }

        $membership = $this->getMembership($groupId, $targetUserId);
        if (!$membership) {
            throw new \RuntimeException('Miembro no encontrado', 404);
        }
        if ($membership->role === 'creator') {
            throw new \RuntimeException('No puedes expulsar al creador', 422);
        }
        if (!$isSuperAdmin && $actorMembership?->role === 'admin' && $membership->role === 'admin') {
            throw new \RuntimeException('Solo el creador puede expulsar a otro admin', 403);
        }

        $membership->delete();
    }

    public function accessContext(int $userId, int $groupId, string $jwt = '', string $role = ''): array
    {
        $group = $this->findOrFail($groupId);
        $membership = $this->getMembership($groupId, $userId);
        $isApproved = $membership && $membership->status === 'approved';
        $isAdmin = $isApproved && in_array($membership->role, ['creator', 'admin'], true);

        $isSuperAdmin = trim($role) === 'admin';

        return [
            'group_id' => (int) $group->id,
            'privacy' => $group->privacy,
            'is_member' => $isApproved,
            'is_admin' => $isAdmin,
            'membership_status' => $membership?->status,
            'membership_role' => $membership?->role,
            'can_view_conversation' => $isApproved || $isSuperAdmin,
            'can_post' => $isApproved || $isSuperAdmin,
            'can_manage' => $isAdmin || $isSuperAdmin,
            'group_name' => $group->name,
        ];
    }

    public function isApprovedMember(int $userId, int $groupId): bool
    {
        return GroupMembership::where('group_id', $groupId)
            ->where('user_id', $userId)
            ->where('status', 'approved')
            ->exists();
    }

    public function isAdmin(int $userId, int $groupId, string $sysRole = ''): bool
    {
        if (trim($sysRole) === 'admin') {
            return true;
        }
        return GroupMembership::where('group_id', $groupId)
            ->where('user_id', $userId)
            ->where('status', 'approved')
            ->whereIn('role', ['creator', 'admin'])
            ->exists();
    }

    private function formatGroup(Group $group, int $userId, string $jwt, string $role = ''): array
    {
        $membership = $this->getMembership($group->id, $userId);
        $approvedMembership = $membership && $membership->status === 'approved';
        $memberCount = GroupMembership::where('group_id', $group->id)
            ->where('status', 'approved')
            ->count();
        $creatorUser = $this->indexUsersById($jwt, [$group->creator_id])[(int) $group->creator_id] ?? null;

        $isSuperAdmin = trim($role) === 'admin';

        return [
            'id' => (int) $group->id,
            'creator_id' => (int) $group->creator_id,
            'creator' => $creatorUser,
            'name' => $group->name,
            'description' => $group->description,
            'cover_url' => $group->cover_url,
            'privacy' => $group->privacy,
            'member_count' => $memberCount,
            'created_at' => optional($group->created_at)->toIso8601String(),
            'current_membership_status' => $membership?->status,
            'current_role' => $membership?->role,
            'is_member' => $approvedMembership,
            'is_admin' => ($approvedMembership && in_array($membership->role, ['creator', 'admin'], true)) || $isSuperAdmin,
            'can_view_conversation' => $approvedMembership || $isSuperAdmin,
            'can_post' => $approvedMembership || $isSuperAdmin,
        ];
    }

    private function findOrFail(int $groupId): Group
    {
        $group = Group::find($groupId);
        if (!$group) {
            throw new \RuntimeException('Grupo no encontrado', 404);
        }

        return $group;
    }

    private function getMembership(int $groupId, int $userId): ?GroupMembership
    {
        return GroupMembership::where('group_id', $groupId)
            ->where('user_id', $userId)
            ->first();
    }

    private function indexUsersById(string $jwt, array $userIds): array
    {
        if (empty($userIds)) {
            return [];
        }

        $users = $this->userDirectoryService->listUsersByIds($jwt, $userIds);
        $indexed = [];
        foreach ($users as $user) {
            $indexed[(int) ($user['id'] ?? 0)] = $user;
        }

        return $indexed;
    }

    private function decodeJwtPayload(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return [];
        }
        // JWT uses base64url encoding (no padding, - instead of +, _ instead of /)
        $segment = strtr($parts[1], '-_', '+/');
        $segment = base64_decode(str_pad($segment, strlen($segment) + (4 - strlen($segment) % 4) % 4, '='));
        $payload = json_decode($segment, true);
        return is_array($payload) ? $payload : [];
    }

    /**
     * Convenience helper: extract the role claim from a JWT string without full validation.
     * Used only for informational purposes (UI hints). Always falls back to empty string.
     */
    public function decodeJwtRole(string $jwt): string
    {
        return (string) ($this->decodeJwtPayload($jwt)['role'] ?? '');
    }
}

<?php

namespace App\Http\Controllers;

use App\Services\UserDirectoryService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class UserDirectoryController extends BaseController
{
    private UserDirectoryService $directoryService;

    public function __construct()
    {
        $this->directoryService = new UserDirectoryService();
    }

    /**
     * GET /api/social/directory
     * Listar usuarios con filtros opcionales: faculty, career (RF-07).
     */
    public function index(Request $request): JsonResponse
    {
        $jwt = $request->bearerToken();

        $users = $this->directoryService->listUsers(
            $jwt,
            $request->query('faculty'),
            $request->query('career')
        );

        return response()->json($users, 200);
    }

    /**
     * GET /api/social/directory/search?q=nombre
     * Buscar usuarios por nombre (RF-07).
     */
    public function search(Request $request): JsonResponse
    {
        $this->validate($request, [
            'q' => 'required|string|min:1',
        ]);

        $jwt   = $request->bearerToken();
        $users = $this->directoryService->search($jwt, $request->query('q'));

        return response()->json($users, 200);
    }

    public function blocked(Request $request): JsonResponse
    {
        $jwt = $request->bearerToken();
        $users = $this->directoryService->listBlockedUsers($jwt, (int) $request->auth->sub);

        return response()->json($users, 200);
    }
}

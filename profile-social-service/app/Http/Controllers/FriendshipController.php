<?php

namespace App\Http\Controllers;

use App\Services\FriendshipService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class FriendshipController extends BaseController
{
    private FriendshipService $friendshipService;

    public function __construct()
    {
        $this->friendshipService = new FriendshipService();
    }

    /**
     * POST /api/social/friends/request
     * Enviar solicitud de amistad (RF-07).
     */
    public function sendRequest(Request $request): JsonResponse
    {
        $this->validate($request, [
            'receiver_id' => 'required|integer',
        ]);

        try {
            $friendRequest = $this->friendshipService->sendRequest(
                $request->auth->sub,
                $request->input('receiver_id')
            );
            return response()->json($friendRequest, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * PUT /api/social/friends/{id}/accept
     * Aceptar solicitud (RF-07).
     */
    public function accept(Request $request, int $id): JsonResponse
    {
        try {
            $friendRequest = $this->friendshipService->accept($request->auth->sub, $id);
            return response()->json(['message' => 'Solicitud aceptada', 'request' => $friendRequest], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * PUT /api/social/friends/{id}/reject
     * Rechazar solicitud (RF-07).
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        try {
            $friendRequest = $this->friendshipService->reject($request->auth->sub, $id);
            return response()->json(['message' => 'Solicitud rechazada', 'request' => $friendRequest], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * DELETE /api/social/friends/{id}
     * Eliminar compañero (RF-07).
     */
    public function remove(Request $request, int $id): JsonResponse
    {
        try {
            $this->friendshipService->remove($request->auth->sub, $id);
            return response()->json(['message' => 'Compañero eliminado'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/social/friends
     * Lista de compañeros aceptados (RF-07).
     */
    public function index(Request $request): JsonResponse
    {
        $friendIds = $this->friendshipService->listFriends($request->auth->sub);
        return response()->json($friendIds, 200);
    }

    /**
     * GET /api/social/friends/pending
     * Solicitudes pendientes recibidas — para badge (RF-07).
     */
    public function pending(Request $request): JsonResponse
    {
        $pending = $this->friendshipService->pending($request->auth->sub);
        return response()->json($pending, 200);
    }

    public function listBlocked(Request $request): JsonResponse
    {
        return response()->json($this->friendshipService->listBlockedIds((int) $request->auth->sub), 200);
    }

    public function blockContext(Request $request): JsonResponse
    {
        return response()->json($this->friendshipService->getBlockContext((int) $request->auth->sub), 200);
    }

    public function block(Request $request, int $id): JsonResponse
    {
        try {
            $block = $this->friendshipService->blockUser((int) $request->auth->sub, $id);
            return response()->json(['message' => 'Usuario bloqueado', 'block' => $block], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function unblock(Request $request, int $id): JsonResponse
    {
        try {
            $this->friendshipService->unblockUser((int) $request->auth->sub, $id);
            return response()->json(['message' => 'Usuario desbloqueado'], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

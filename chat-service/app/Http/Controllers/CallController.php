<?php

namespace App\Http\Controllers;

use App\Services\CallService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class CallController extends BaseController
{
    private CallService $callService;

    public function __construct()
    {
        $this->callService = new CallService();
    }

    public function start(Request $request): JsonResponse
    {
        $this->validate($request, [
            'receiver_id' => 'required|integer',
            'mode' => 'nullable|string|in:audio,video',
        ]);

        try {
            $session = $this->callService->startCall(
                (int) $request->auth->sub,
                (int) $request->input('receiver_id'),
                (string) $request->input('mode', 'audio'),
                $request->bearerToken() ?? ''
            );

            return response()->json($session, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function pending(Request $request): JsonResponse
    {
        try {
            return response()->json(
                $this->callService->getPendingCalls((int) $request->auth->sub, $request->bearerToken() ?? ''),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function missed(Request $request): JsonResponse
    {
        try {
            return response()->json(
                $this->callService->getMissedCalls((int) $request->auth->sub, $request->bearerToken() ?? ''),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function show(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json($this->callService->getSession((int) $request->auth->sub, $id), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json($this->callService->acceptCall((int) $request->auth->sub, $id), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        try {
            return response()->json($this->callService->rejectCall((int) $request->auth->sub, $id), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function end(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'duration_seconds' => 'nullable|integer|min:0',
        ]);

        try {
            return response()->json(
                $this->callService->endCall((int) $request->auth->sub, $id, $request->input('duration_seconds')),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function signal(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'signal_type' => 'required|string|max:50',
            'payload' => 'nullable',
        ]);

        try {
            return response()->json(
                $this->callService->addSignal(
                    (int) $request->auth->sub,
                    $id,
                    (string) $request->input('signal_type'),
                    $request->input('payload')
                ),
                201
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function signals(Request $request, int $id): JsonResponse
    {
        try {
            $afterId = max(0, (int) $request->query('after', 0));
            return response()->json($this->callService->getSignals((int) $request->auth->sub, $id, $afterId), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function updateMode(Request $request, int $id): JsonResponse
    {
        $this->validate($request, [
            'mode' => 'required|string|in:audio,video',
        ]);

        try {
            return response()->json(
                $this->callService->updateMode((int) $request->auth->sub, $id, (string) $request->input('mode')),
                200
            );
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

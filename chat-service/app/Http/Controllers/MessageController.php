<?php

namespace App\Http\Controllers;

use App\Services\MessageService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Laravel\Lumen\Routing\Controller as BaseController;

class MessageController extends BaseController
{
    private MessageService $messageService;

    private function publicUploadsPath(string $directory): string
    {
        return app()->basePath('public/' . trim($directory, '/'));
    }

    public function __construct()
    {
        $this->messageService = new MessageService();
    }

    /**
     * POST /api/chat/messages
     * Enviar mensaje a un compañero (RF-08).
     */
    public function send(Request $request): JsonResponse
    {
        $this->validate($request, [
            'receiver_id' => 'required|integer',
            'content'     => 'nullable|string',
            'image'       => 'nullable|file|mimes:jpg,jpeg,png,gif,webp|max:5120',
            'image_url'   => 'nullable|string|max:500',
        ]);

        try {
            $imageUrl = $request->input('image_url');

            if ($request->hasFile('image') && $request->file('image')->isValid()) {
                $file = $request->file('image');
                $filename = time() . '_chat_' . uniqid() . '.' . $file->getClientOriginalExtension();
                $uploadDir = $this->publicUploadsPath('chat-uploads');

                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0775, true);
                }

                $file->move($uploadDir, $filename);
                $imageUrl = '/chat-uploads/' . $filename;
            }

            $message = $this->messageService->send(
                $request->auth->sub,
                $request->input('receiver_id'),
                $request->input('content'),
                $imageUrl,
                $request->bearerToken() ?? ''
            );
            return response()->json($message, 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/chat/messages/{userId}
     * Obtener conversación con un usuario (RF-08).
     * Frontend usa polling cada 3s sobre este endpoint.
     */
    public function conversation(Request $request, int $userId): JsonResponse
    {
        try {
            $limit    = (int) $request->query('limit', 50);
            $messages = $this->messageService->getConversation($request->auth->sub, $userId, $limit, $request->bearerToken() ?? '');

            return response()->json($messages, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    /**
     * GET /api/chat/inbox
     * Lista de conversaciones recientes con último mensaje (RF-08).
     */
    public function inbox(Request $request): JsonResponse
    {
        try {
            $conversations = $this->messageService->getInbox($request->auth->sub, $request->bearerToken() ?? '');
            return response()->json($conversations, 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

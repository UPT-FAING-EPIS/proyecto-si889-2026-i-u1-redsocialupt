<?php

namespace App\Http\Controllers;

use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class ReportController extends BaseController
{
    private ReportService $reportService;

    public function __construct()
    {
        $this->reportService = new ReportService();
    }

    public function reportPost(Request $request, int $id): JsonResponse
    {
        try {
            $report = $this->reportService->createPostReport((int) $request->auth->sub, $id, $request->input('reason'));
            return response()->json(['message' => 'Publicacion reportada', 'report' => $report], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function reportComment(Request $request, int $id): JsonResponse
    {
        try {
            $report = $this->reportService->createCommentReport((int) $request->auth->sub, $id, $request->input('reason'));
            return response()->json(['message' => 'Comentario reportado', 'report' => $report], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function list(Request $request): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        return response()->json($this->reportService->listReports($request->query('status')), 200);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        try {
            return response()->json($this->reportService->getReportDetail($id), 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        if ($request->auth->role !== 'admin') {
            return response()->json(['error' => 'No autorizado'], 403);
        }

        $this->validate($request, [
            'status' => 'required|in:reviewed,dismissed,sanctioned',
            'resolution_notes' => 'nullable|string|max:1000',
        ]);

        try {
            $report = $this->reportService->updateStatus(
                $id,
                (int) $request->auth->sub,
                $request->input('status'),
                $request->input('resolution_notes')
            );
            return response()->json(['message' => 'Reporte actualizado', 'report' => $report], 200);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], $e->getCode() ?: 500);
        }
    }
}

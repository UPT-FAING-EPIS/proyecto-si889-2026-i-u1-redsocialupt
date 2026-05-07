<?php

namespace App\Http\Controllers;

use App\Services\MessageReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class MessageReportController extends BaseController
{
    private MessageReportService $reportService;

    public function __construct()
    {
        $this->reportService = new MessageReportService();
    }

    public function report(Request $request, int $id): JsonResponse
    {
        try {
            $report = $this->reportService->create((int) $request->auth->sub, $id, $request->input('reason'));
            return response()->json(['message' => 'Mensaje reportado', 'report' => $report], 201);
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

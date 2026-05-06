<?php

namespace App\Services;

use App\Exceptions\MessageServiceException;
use App\Models\Message;
use App\Models\MessageReport;
use Carbon\Carbon;

class MessageReportService
{
    public function create(int $reporterId, int $messageId, string $reason): MessageReport
    {
        if (!Message::find($messageId)) {
            throw new MessageServiceException('Mensaje no encontrado', 404);
        }

        $trimmedReason = trim($reason);
        if ($trimmedReason === '') {
            throw new MessageServiceException('El motivo del reporte es obligatorio', 422);
        }

        return MessageReport::updateOrCreate(
            [
                'reporter_id' => $reporterId,
                'message_id' => $messageId,
            ],
            [
                'reason' => $trimmedReason,
                'status' => 'pending',
                'reviewed_by' => null,
                'reviewed_at' => null,
                'resolution_notes' => null,
            ]
        );
    }

    public function listReports(?string $status = null): array
    {
        $query = MessageReport::query()->orderBy('created_at', 'desc');
        if ($status && in_array($status, ['pending', 'reviewed', 'dismissed', 'sanctioned'], true)) {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (MessageReport $report) => [
            'id' => $report->id,
            'reporter_id' => $report->reporter_id,
            'message_id' => $report->message_id,
            'reason' => $report->reason,
            'status' => $report->status,
            'reviewed_by' => $report->reviewed_by,
            'reviewed_at' => $report->reviewed_at?->toIso8601String(),
            'resolution_notes' => $report->resolution_notes,
            'created_at' => $report->created_at?->toIso8601String(),
        ])->all();
    }

    public function updateStatus(int $reportId, int $reviewerId, string $status, ?string $notes = null): MessageReport
    {
        if (!in_array($status, ['reviewed', 'dismissed', 'sanctioned'], true)) {
            throw new MessageServiceException('Estado de reporte invalido', 422);
        }

        $report = MessageReport::find($reportId);
        if (!$report) {
            throw new MessageServiceException('Reporte no encontrado', 404);
        }

        $report->status = $status;
        $report->reviewed_by = $reviewerId;
        $report->reviewed_at = Carbon::now();
        $report->resolution_notes = $notes !== null ? trim($notes) : $report->resolution_notes;
        $report->save();

        return $report->fresh();
    }
}

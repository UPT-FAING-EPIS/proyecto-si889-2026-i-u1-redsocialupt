<?php

namespace App\Services;

use App\Exceptions\MessageServiceException;
use App\Models\Message;
use App\Models\MessageReport;
use Carbon\Carbon;

class MessageReportService
{
    public function create(int $reporterId, int $messageId, ?string $reason = null): MessageReport
    {
        if (!Message::find($messageId)) {
            throw new MessageServiceException('Mensaje no encontrado', 404);
        }

        $trimmedReason = trim((string) $reason);

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

        return $query->get()->map(fn (MessageReport $report) => $this->formatReport($report))->all();
    }

    public function getReportDetail(int $reportId): array
    {
        $report = MessageReport::find($reportId);
        if (!$report) {
            throw new MessageServiceException('Reporte no encontrado', 404);
        }

        return $this->formatReport($report, true);
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

    private function formatReport(MessageReport $report, bool $full = false): array
    {
        $message = Message::find($report->message_id);
        $content = trim((string) ($message->content ?? ''));
        $preview = mb_strimwidth($content !== '' ? $content : 'Sin contenido de texto', 0, 140, '...');

        return [
            'id' => $report->id,
            'reporter_id' => $report->reporter_id,
            'message_id' => $report->message_id,
            'reason' => $report->reason,
            'status' => $report->status,
            'reviewed_by' => $report->reviewed_by,
            'reviewed_at' => $report->reviewed_at?->toIso8601String(),
            'resolution_notes' => $report->resolution_notes,
            'created_at' => $report->created_at?->toIso8601String(),
            'reported_user_id' => $message->sender_id ?? null,
            'content_preview' => $preview,
            'content' => $full ? $content : null,
            'image_url' => $full ? ($message->image_url ?? null) : null,
            'receiver_id' => $message->receiver_id ?? null,
        ];
    }
}

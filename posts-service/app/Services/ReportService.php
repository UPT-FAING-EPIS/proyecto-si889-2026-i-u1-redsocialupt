<?php

namespace App\Services;

use App\Exceptions\PostsServiceException;
use App\Models\Comment;
use App\Models\ContentReport;
use App\Models\Post;
use Carbon\Carbon;

class ReportService
{
    public function createPostReport(int $reporterId, int $postId, ?string $reason = null): ContentReport
    {
        if (!Post::find($postId)) {
            throw new PostsServiceException('Publicacion no encontrada', 404);
        }

        return $this->createReport($reporterId, 'post', $postId, $reason);
    }

    public function createCommentReport(int $reporterId, int $commentId, ?string $reason = null): ContentReport
    {
        if (!Comment::find($commentId)) {
            throw new PostsServiceException('Comentario no encontrado', 404);
        }

        return $this->createReport($reporterId, 'comment', $commentId, $reason);
    }

    public function listReports(?string $status = null): array
    {
        $query = ContentReport::query()->orderBy('created_at', 'desc');
        if ($status && in_array($status, ['pending', 'reviewed', 'dismissed', 'sanctioned'], true)) {
            $query->where('status', $status);
        }

        return $query->get()->map(fn (ContentReport $report) => $this->formatReport($report))->all();
    }

    public function getReportDetail(int $reportId): array
    {
        $report = ContentReport::find($reportId);
        if (!$report) {
            throw new PostsServiceException('Reporte no encontrado', 404);
        }

        return $this->formatReport($report, true);
    }

    public function updateStatus(int $reportId, int $reviewerId, string $status, ?string $notes = null): ContentReport
    {
        if (!in_array($status, ['reviewed', 'dismissed', 'sanctioned'], true)) {
            throw new PostsServiceException('Estado de reporte invalido', 422);
        }

        $report = ContentReport::find($reportId);
        if (!$report) {
            throw new PostsServiceException('Reporte no encontrado', 404);
        }

        $report->status = $status;
        $report->reviewed_by = $reviewerId;
        $report->reviewed_at = Carbon::now();
        $report->resolution_notes = $notes !== null ? trim($notes) : $report->resolution_notes;
        $report->save();

        return $report->fresh();
    }

    private function createReport(int $reporterId, string $targetType, int $targetId, ?string $reason = null): ContentReport
    {
        $trimmedReason = trim((string) $reason);

        return ContentReport::updateOrCreate(
            [
                'reporter_id' => $reporterId,
                'target_type' => $targetType,
                'target_id' => $targetId,
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

    private function formatReport(ContentReport $report, bool $full = false): array
    {
        $target = $report->target_type === 'post'
            ? Post::find($report->target_id)
            : Comment::find($report->target_id);

        $post = null;
        if ($report->target_type === 'post') {
            $post = $target;
        } elseif ($target?->post_id) {
            $post = Post::find($target->post_id);
        }

        $isLivestream = ($post->post_type ?? '') === 'livestream';
        $liveTitle = trim((string) ($post->live_title ?? ''));
        $content = trim((string) ($target->content ?? ''));
        $fallbackText = $isLivestream
            ? ($liveTitle !== '' ? $liveTitle : 'Stream sin titulo')
            : 'Sin contenido de texto';
        $preview = mb_strimwidth($content !== '' ? $content : $fallbackText, 0, 140, '...');

        return [
            'id' => $report->id,
            'reporter_id' => $report->reporter_id,
            'target_type' => $report->target_type,
            'target_id' => $report->target_id,
            'status' => $report->status,
            'reviewed_by' => $report->reviewed_by,
            'reviewed_at' => $report->reviewed_at?->toIso8601String(),
            'resolution_notes' => $report->resolution_notes,
            'created_at' => $report->created_at?->toIso8601String(),
            'reason' => $report->reason,
            'reported_user_id' => $target->user_id ?? null,
            'reported_user_name' => $target->user_name ?? 'Usuario',
            'reported_user_faculty' => $target->user_faculty ?? '',
            'post_type' => $post->post_type ?? null,
            'live_title' => $liveTitle !== '' ? $liveTitle : null,
            'content_preview' => $preview,
            'content' => $full ? ($content !== '' ? $content : $fallbackText) : null,
            'image_url' => $full && $report->target_type === 'post' ? ($target->image_url ?? null) : null,
            'post_id' => $report->target_type === 'comment' ? ($target->post_id ?? null) : null,
        ];
    }
}

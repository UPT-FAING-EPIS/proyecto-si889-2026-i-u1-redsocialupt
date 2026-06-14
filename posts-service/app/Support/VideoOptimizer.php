<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use RuntimeException;

class VideoOptimizer
{
    public static function store(
        UploadedFile $file,
        string $destinationDir,
        string $prefix = 'post_video',
        int $maxWidth = 1280,
        int $maxHeight = 1280,
        int $targetBitrateKbps = 3500
    ): array {
        if (!$file->isValid()) {
            throw new RuntimeException('No se pudo procesar el video subido');
        }

        if (!is_dir($destinationDir) && !mkdir($destinationDir, 0775, true) && !is_dir($destinationDir)) {
            throw new RuntimeException('No se pudo preparar el directorio de videos');
        }

        $baseName = time() . '_' . $prefix . '_' . uniqid();
        $fallbackExtension = self::normalizeExtension($file);
        $fallbackPath = rtrim($destinationDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $baseName . '.' . $fallbackExtension;

        if (!self::ffmpegAvailable()) {
            if (!copy($file->getRealPath(), $fallbackPath)) {
                throw new RuntimeException('No se pudo guardar el video subido');
            }

            return [
                'filename' => basename($fallbackPath),
                'mime_type' => self::guessMimeType($file, $fallbackExtension),
                'poster_filename' => null,
            ];
        }

        $optimizedPath = rtrim($destinationDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $baseName . '.mp4';
        $posterPath = rtrim($destinationDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $baseName . '.jpg';
        $bufferSizeKbps = max(7000, $targetBitrateKbps * 2);
        $scaleFilter = sprintf(
            "fps=30,scale='trunc(min(%d,iw)/2)*2':'trunc(min(%d,ih)/2)*2':force_original_aspect_ratio=decrease",
            $maxWidth,
            $maxHeight
        );

        $command = sprintf(
            'ffmpeg -y -i %s -map 0:v:0 -map 0:a? -vf %s -c:v libx264 -preset faster -profile:v main -pix_fmt yuv420p -movflags +faststart -crf 23 -maxrate %dk -bufsize %dk -g 60 -keyint_min 30 -sc_threshold 0 -c:a aac -b:a 128k -ac 2 %s 2>&1',
            escapeshellarg($file->getRealPath()),
            escapeshellarg($scaleFilter),
            $targetBitrateKbps,
            $bufferSizeKbps,
            escapeshellarg($optimizedPath)
        );

        exec($command, $output, $exitCode);

        if ($exitCode !== 0 || !is_file($optimizedPath) || filesize($optimizedPath) <= 0) {
            if (is_file($optimizedPath)) {
                @unlink($optimizedPath);
            }
            if (is_file($posterPath)) {
                @unlink($posterPath);
            }
            if (!copy($file->getRealPath(), $fallbackPath)) {
                throw new RuntimeException('No se pudo optimizar ni guardar el video subido');
            }

            return [
                'filename' => basename($fallbackPath),
                'mime_type' => self::guessMimeType($file, $fallbackExtension),
                'poster_filename' => null,
            ];
        }

        self::generatePosterFrame($optimizedPath, $posterPath);

        return [
            'filename' => basename($optimizedPath),
            'mime_type' => 'video/mp4',
            'poster_filename' => is_file($posterPath) ? basename($posterPath) : null,
        ];
    }

    public static function ensurePosterForExistingVideo(string $videoPath, string $posterPath): bool
    {
        if (!is_file($videoPath)) {
            return false;
        }
        if (is_file($posterPath) && filesize($posterPath) > 0) {
            return true;
        }
        if (!self::ffmpegAvailable()) {
            return false;
        }

        self::generatePosterFrame($videoPath, $posterPath);
        return is_file($posterPath) && filesize($posterPath) > 0;
    }

    private static function ffmpegAvailable(): bool
    {
        $path = trim((string) shell_exec('command -v ffmpeg 2>/dev/null'));
        return $path !== '';
    }

    private static function normalizeExtension(UploadedFile $file): string
    {
        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: 'mp4'));
        return in_array($extension, ['mp4', 'webm'], true) ? $extension : 'mp4';
    }

    private static function guessMimeType(UploadedFile $file, string $extension): string
    {
        $mime = strtolower((string) $file->getMimeType());
        if (in_array($mime, ['video/mp4', 'video/webm'], true)) {
            return $mime;
        }

        return $extension === 'webm' ? 'video/webm' : 'video/mp4';
    }

    private static function generatePosterFrame(string $videoPath, string $posterPath): void
    {
        $command = sprintf(
            'ffmpeg -y -ss 0.15 -i %s -frames:v 1 -q:v 3 %s 2>&1',
            escapeshellarg($videoPath),
            escapeshellarg($posterPath)
        );

        exec($command, $output, $exitCode);
        if ($exitCode !== 0 || !is_file($posterPath) || filesize($posterPath) <= 0) {
            if (is_file($posterPath)) {
                @unlink($posterPath);
            }
        }
    }
}

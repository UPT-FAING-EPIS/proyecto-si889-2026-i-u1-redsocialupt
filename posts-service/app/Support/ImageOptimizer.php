<?php

namespace App\Support;

use Illuminate\Http\UploadedFile;
use RuntimeException;

class ImageOptimizer
{
    public static function store(
        UploadedFile $file,
        string $targetDir,
        string $prefix,
        int $maxWidth,
        int $maxHeight,
        int $quality = 82
    ): string {
        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0775, true);
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        if ($extension === 'gif') {
            $filename = time() . '_' . $prefix . '_' . uniqid() . '.gif';
            $file->move($targetDir, $filename);
            return $filename;
        }

        if (!function_exists('imagewebp') || !function_exists('getimagesize')) {
            $filename = time() . '_' . $prefix . '_' . uniqid() . '.' . ($extension ?: 'jpg');
            $file->move($targetDir, $filename);
            return $filename;
        }

        [$sourceImage, $mime] = self::createImageResource($file->getPathname());
        if (!$sourceImage) {
            $filename = time() . '_' . $prefix . '_' . uniqid() . '.' . ($extension ?: 'jpg');
            $file->move($targetDir, $filename);
            return $filename;
        }

        self::applyExifOrientation($file->getPathname(), $sourceImage, $mime);

        $sourceWidth = imagesx($sourceImage);
        $sourceHeight = imagesy($sourceImage);
        [$targetWidth, $targetHeight] = self::fitInside($sourceWidth, $sourceHeight, $maxWidth, $maxHeight);

        $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
        imagefill($canvas, 0, 0, $transparent);

        imagecopyresampled(
            $canvas,
            $sourceImage,
            0,
            0,
            0,
            0,
            $targetWidth,
            $targetHeight,
            $sourceWidth,
            $sourceHeight
        );

        $filename = time() . '_' . $prefix . '_' . uniqid() . '.webp';
        $destination = rtrim($targetDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $filename;
        $saved = imagewebp($canvas, $destination, $quality);

        imagedestroy($canvas);
        imagedestroy($sourceImage);

        if (!$saved) {
            throw new RuntimeException('No se pudo optimizar la imagen');
        }

        return $filename;
    }

    private static function createImageResource(string $path): array
    {
        $imageInfo = @getimagesize($path);
        $mime = strtolower((string) ($imageInfo['mime'] ?? ''));

        $image = match ($mime) {
            'image/jpeg', 'image/jpg' => function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($path) : null,
            'image/png' => function_exists('imagecreatefrompng') ? @imagecreatefrompng($path) : null,
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : null,
            default => null,
        };

        return [$image, $mime];
    }

    private static function fitInside(int $width, int $height, int $maxWidth, int $maxHeight): array
    {
        if ($width <= $maxWidth && $height <= $maxHeight) {
            return [$width, $height];
        }

        $scale = min($maxWidth / max($width, 1), $maxHeight / max($height, 1));
        return [
            max(1, (int) round($width * $scale)),
            max(1, (int) round($height * $scale)),
        ];
    }

    private static function applyExifOrientation(string $path, &$image, string $mime): void
    {
        if ($mime !== 'image/jpeg' || !function_exists('exif_read_data')) {
            return;
        }

        $exif = @exif_read_data($path);
        $orientation = (int) ($exif['Orientation'] ?? 1);

        switch ($orientation) {
            case 3:
                $image = imagerotate($image, 180, 0);
                break;
            case 6:
                $image = imagerotate($image, -90, 0);
                break;
            case 8:
                $image = imagerotate($image, 90, 0);
                break;
        }
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Lumen\Routing\Controller as BaseController;

class TranscodeWebhookController extends BaseController
{
    private const AUDIO_BITRATE = 128000;
    private const AUDIO_SAMPLE_RATE = 48000;
    private const AUDIO_CHANNELS = 2;
    private const MIN_VIDEO_BITRATE = 350000;

    public function profiles(Request $request): JsonResponse
    {
        $stream = (array) $request->input('stream', []);
        $tracks = (array) ($stream['tracks'] ?? []);

        [$width, $height, $framerate, $sourceBitrate] = $this->resolveVideoTrack($tracks);
        $isPortrait = $height > $width;

        $profiles = $this->buildProfiles($width, $height, $framerate, $sourceBitrate, $isPortrait);

        return response()->json([
            'allowed' => true,
            'outputProfiles' => [
                'outputProfile' => [
                    [
                        'name' => 'adaptive_web_rtc',
                        'outputStreamName' => '${OriginStreamName}',
                        'encodes' => $profiles['encodes'],
                        'playlists' => [
                            [
                                'name' => 'master',
                                'fileName' => 'master',
                                'options' => [
                                    'enableTsPackaging' => true,
                                    'webRtcAutoAbr' => true,
                                ],
                                'renditions' => $profiles['renditions'],
                            ],
                        ],
                    ],
                ],
            ],
        ], 200);
    }

    private function resolveVideoTrack(array $tracks): array
    {
        foreach ($tracks as $track) {
            if (($track['type'] ?? '') !== 'Video' || !isset($track['video']) || !is_array($track['video'])) {
                continue;
            }

            $video = $track['video'];
            $width = max(1, (int) ($video['width'] ?? 1280));
            $height = max(1, (int) ($video['height'] ?? 720));
            $framerate = max(24, min(30, (int) round((float) ($video['framerate'] ?? 30))));
            $bitrate = max(0, (int) ($video['bitrate'] ?? 0));

            return [$width, $height, $framerate, $bitrate];
        }

        return [1280, 720, 30, 0];
    }

    private function buildProfiles(int $sourceWidth, int $sourceHeight, int $framerate, int $sourceBitrate, bool $isPortrait): array
    {
        $normalizedSourceBitrate = max(self::MIN_VIDEO_BITRATE, $sourceBitrate);
        $videoEncodes = [
            [
                'name' => 'video_original',
                'bypass' => true,
            ],
        ];

        $audioEncodes = [
            [
                'name' => 'audio_main',
                'codec' => 'opus',
                'bitrate' => self::AUDIO_BITRATE,
                'samplerate' => self::AUDIO_SAMPLE_RATE,
                'channel' => self::AUDIO_CHANNELS,
            ],
        ];

        $targets = $isPortrait
            ? [
                ['name' => 'high', 'width' => 720, 'height' => 1280, 'bitrate' => 2600000],
                ['name' => 'medium', 'width' => 540, 'height' => 960, 'bitrate' => 1400000],
                ['name' => 'low', 'width' => 360, 'height' => 640, 'bitrate' => 700000],
            ]
            : [
                ['name' => 'high', 'width' => 1280, 'height' => 720, 'bitrate' => 2800000],
                ['name' => 'medium', 'width' => 854, 'height' => 480, 'bitrate' => 1500000],
                ['name' => 'low', 'width' => 640, 'height' => 360, 'bitrate' => 800000],
            ];

        $renditions = [
            [
                'name' => 'original',
                'video' => 'video_original',
                'audio' => 'audio_main',
            ],
        ];

        foreach ($targets as $target) {
            if ($target['width'] >= $sourceWidth || $target['height'] >= $sourceHeight) {
                continue;
            }

            $videoName = 'video_' . $target['name'];
            $targetBitrate = min($target['bitrate'], $this->deriveSafeBitrate($sourceBitrate, $target['bitrate']));
            $videoEncodes[] = [
                'name' => $videoName,
                'codec' => 'h264',
                'width' => $target['width'],
                'height' => $target['height'],
                'bitrate' => $targetBitrate,
                'framerate' => $framerate,
                'keyFrameInterval' => $framerate,
                'bFrames' => 0,
                'preset' => 'faster',
            ];

            $renditions[] = [
                'name' => $target['name'],
                'video' => $videoName,
                'audio' => 'audio_main',
            ];
        }

        if (count($renditions) === 1) {
            $fallbackName = 'video_safe_low';
            [$fallbackWidth, $fallbackHeight] = $this->buildSafeFallbackDimensions($sourceWidth, $sourceHeight, $isPortrait);
            $videoEncodes[] = [
                'name' => $fallbackName,
                'codec' => 'h264',
                'width' => $fallbackWidth,
                'height' => $fallbackHeight,
                'bitrate' => min($normalizedSourceBitrate, $this->deriveSafeBitrate($sourceBitrate, $normalizedSourceBitrate)),
                'framerate' => $framerate,
                'keyFrameInterval' => $framerate,
                'bFrames' => 0,
                'preset' => 'faster',
            ];
            $renditions[] = [
                'name' => 'safe',
                'video' => $fallbackName,
                'audio' => 'audio_main',
            ];
        }

        return [
            'encodes' => [
                'videos' => $videoEncodes,
                'audios' => $audioEncodes,
            ],
            'renditions' => $renditions,
        ];
    }

    private function deriveSafeBitrate(int $sourceBitrate, int $targetBitrate): int
    {
        if ($sourceBitrate <= 0) {
            return $targetBitrate;
        }

        return max(self::MIN_VIDEO_BITRATE, min($targetBitrate, (int) floor($sourceBitrate * 0.92)));
    }

    private function buildSafeFallbackDimensions(int $sourceWidth, int $sourceHeight, bool $isPortrait): array
    {
        $maxLongEdge = $isPortrait ? 960 : 960;
        $maxShortEdge = $isPortrait ? 540 : 540;

        if ($isPortrait) {
            if ($sourceHeight <= $maxLongEdge && $sourceWidth <= $maxShortEdge) {
                return [$sourceWidth, $sourceHeight];
            }
            $scale = min($maxShortEdge / max(1, $sourceWidth), $maxLongEdge / max(1, $sourceHeight));
            return [
                max(2, (int) floor(($sourceWidth * $scale) / 2) * 2),
                max(2, (int) floor(($sourceHeight * $scale) / 2) * 2),
            ];
        }

        if ($sourceWidth <= $maxLongEdge && $sourceHeight <= $maxShortEdge) {
            return [$sourceWidth, $sourceHeight];
        }

        $scale = min($maxLongEdge / max(1, $sourceWidth), $maxShortEdge / max(1, $sourceHeight));
        return [
            max(2, (int) floor(($sourceWidth * $scale) / 2) * 2),
            max(2, (int) floor(($sourceHeight * $scale) / 2) * 2),
        ];
    }
}

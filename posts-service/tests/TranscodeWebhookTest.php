<?php

namespace Tests;

use PHPUnit\Framework\Attributes\TestDox;

class TranscodeWebhookTest extends TestCase
{
    private function buildPayload(int $width, int $height, int $bitrate = 3200000): array
    {
        return [
            'source' => 'WHIP://test',
            'stream' => [
                'name' => 'upt-live-test',
                'application' => 'app',
                'tracks' => [
                    [
                        'id' => 0,
                        'name' => 'Video',
                        'type' => 'Video',
                        'video' => [
                            'codec' => 'H264',
                            'bitrate' => $bitrate,
                            'framerate' => 30.0,
                            'width' => $width,
                            'height' => $height,
                        ],
                    ],
                ],
            ],
        ];
    }

    #[TestDox('Webhook de transcodificacion devuelve perfiles landscape')]
    public function testLandscapeProfiles(): void
    {
        $this->post('/api/internal/ome/transcode', $this->buildPayload(1920, 1080));
        $this->seeStatusCode(200);
        $this->seeJson([
            'allowed' => true,
        ]);
        $this->seeJsonContains([
            'name' => 'high',
            'width' => 1280,
            'height' => 720,
        ]);
        $this->seeJsonContains([
            'name' => 'medium',
            'width' => 854,
            'height' => 480,
        ]);
        $this->seeJsonContains([
            'name' => 'low',
            'width' => 640,
            'height' => 360,
        ]);
    }

    #[TestDox('Webhook de transcodificacion devuelve perfiles portrait')]
    public function testPortraitProfiles(): void
    {
        $this->post('/api/internal/ome/transcode', $this->buildPayload(1080, 1920));
        $this->seeStatusCode(200);
        $this->seeJson([
            'allowed' => true,
        ]);
        $this->seeJsonContains([
            'name' => 'high',
            'width' => 720,
            'height' => 1280,
        ]);
        $this->seeJsonContains([
            'name' => 'medium',
            'width' => 540,
            'height' => 960,
        ]);
        $this->seeJsonContains([
            'name' => 'low',
            'width' => 360,
            'height' => 640,
        ]);
    }
}

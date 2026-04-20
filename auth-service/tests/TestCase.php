<?php

namespace Tests;

use Laravel\Lumen\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Crea la aplicación para los tests.
     */
    public function createApplication()
    {
        return require __DIR__.'/../bootstrap/app.php';
    }
}

<?php

require_once __DIR__.'/../vendor/autoload.php';

(new Laravel\Lumen\Bootstrap\LoadEnvironmentVariables(
    dirname(__DIR__)
))->bootstrap();

date_default_timezone_set(env('APP_TIMEZONE', 'America/Lima'));

/*
|--------------------------------------------------------------------------
| Crear la aplicación
|--------------------------------------------------------------------------
*/

$app = new Laravel\Lumen\Application(
    dirname(__DIR__)
);

$app->withFacades();
$app->withEloquent();

/*
|--------------------------------------------------------------------------
| Registrar Middleware
|--------------------------------------------------------------------------
*/

$app->routeMiddleware([
    'jwt' => App\Http\Middleware\JwtMiddleware::class,
]);

/*
|--------------------------------------------------------------------------
| Registrar Rutas
|--------------------------------------------------------------------------
*/

$app->router->group([
    'namespace' => 'App\Http\Controllers',
], function ($router) {
    require __DIR__.'/../routes/web.php';
});

return $app;

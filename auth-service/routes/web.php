<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () {
    return response()->json([
        'service' => 'auth-service',
        'status'  => 'running',
        'version' => '1.0.0',
    ]);
});

$router->group(['prefix' => 'api/auth'], function () use ($router) {
    // Público
    $router->post('/google', 'AuthController@googleAuth');

    // Protegido con JWT
    $router->group(['middleware' => 'jwt'], function () use ($router) {
        $router->post('/logout', 'AuthController@logout');
        $router->get('/me',      'AuthController@me');
        $router->get('/verify',  'AuthController@verify');
    });

    // Admin
    $router->group(['prefix' => 'admin', 'middleware' => 'jwt'], function () use ($router) {
        $router->get('/users',       'AuthController@listUsers');
        $router->put('/users/{id}',  'AuthController@toggleUser');
    });
});

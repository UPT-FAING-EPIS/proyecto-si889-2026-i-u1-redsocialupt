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

    // ── Público ──────────────────────────────────────────────
    $router->post('/google', 'AuthController@googleAuth');

    // ── Protegido con JWT ────────────────────────────────────
    $router->group(['middleware' => 'jwt'], function () use ($router) {
        $router->post('/logout',            'AuthController@logout');
        $router->post('/complete-profile',  'AuthController@completeProfile');
        $router->get('/me',                 'AuthController@me');
        $router->get('/users',              'AuthController@listUsersPublic');
        $router->get('/users/{id}',         'AuthController@getUser');
        $router->put('/profile',            'AuthController@updateProfile');
        $router->post('/profile',           'AuthController@updateProfile');
        $router->get('/verify',             'AuthController@verify');
    });

    // ── Admin (JWT requerido — rol verificado inline en el controlador) ──
    $router->group(['prefix' => 'admin', 'middleware' => 'jwt'], function () use ($router) {
        $router->get('/users',                  'AuthController@listUsers');
        $router->put('/users/{id}',             'AuthController@toggleUser');
        $router->put('/users/{id}/academic',    'AuthController@updateAcademic');
    });
});

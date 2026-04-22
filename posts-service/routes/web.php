<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () {
    return response()->json([
        'service' => 'posts-service',
        'status'  => 'running',
        'version' => '1.0.0',
    ]);
});

$router->group(['prefix' => 'api', 'middleware' => 'jwt'], function () use ($router) {

    // ── Publicaciones (RF-02, RF-03) ──────────────────────────────────
    $router->post('/posts',              'PostController@store');
    $router->get('/posts',               'PostController@index');
    $router->get('/posts/{id}',          'PostController@show');
    $router->delete('/posts/{id}',       'PostController@destroy');
    $router->delete('/posts/{id}/admin', 'PostController@adminDestroy');

    // ── Likes (RF-04) ─────────────────────────────────────────────────
    $router->post('/posts/{id}/like',    'LikeController@toggle');
    $router->get('/posts/{id}/likes',    'LikeController@count');

    // ── Comentarios (RF-05) ───────────────────────────────────────────
    $router->post('/posts/{id}/comments',    'CommentController@store');
    $router->get('/posts/{id}/comments',     'CommentController@index');
    $router->delete('/comments/{id}',        'CommentController@destroy');
    $router->delete('/comments/{id}/admin',  'CommentController@adminDestroy');
});

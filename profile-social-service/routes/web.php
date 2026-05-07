<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () {
    return response()->json([
        'service' => 'profile-social-service',
        'status'  => 'running',
        'version' => '1.0.0',
    ]);
});

$router->group(['prefix' => 'api/social', 'middleware' => 'jwt'], function () use ($router) {

    // ── Directorio de compañeros (RF-07) ──────────────────────────────
    $router->get('/directory',          'UserDirectoryController@index');
    $router->get('/directory/search',   'UserDirectoryController@search');
    $router->get('/directory/blocked',  'UserDirectoryController@blocked');

    // ── Amistades (RF-07) ─────────────────────────────────────────────
    $router->get('/friends',            'FriendshipController@index');
    $router->get('/friends/pending',    'FriendshipController@pending');
    $router->post('/friends/request',   'FriendshipController@sendRequest');
    $router->put('/friends/{id}/accept', 'FriendshipController@accept');
    $router->put('/friends/{id}/reject', 'FriendshipController@reject');
    $router->delete('/friends/{id}',    'FriendshipController@remove');
    $router->get('/blocks',             'FriendshipController@listBlocked');
    $router->get('/blocks/context',     'FriendshipController@blockContext');
    $router->post('/blocks/{id}',       'FriendshipController@block');
    $router->delete('/blocks/{id}',     'FriendshipController@unblock');
});

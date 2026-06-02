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
    $router->get('/friends/status/{id}', 'FriendshipController@status');
    $router->post('/friends/request',   'FriendshipController@sendRequest');
    $router->put('/friends/{id}/accept', 'FriendshipController@accept');
    $router->put('/friends/{id}/reject', 'FriendshipController@reject');
    $router->delete('/friends/{id}',    'FriendshipController@remove');
    $router->get('/blocks',             'FriendshipController@listBlocked');
    $router->get('/blocks/context',     'FriendshipController@blockContext');
    $router->post('/blocks/{id}',       'FriendshipController@block');
    $router->delete('/blocks/{id}',     'FriendshipController@unblock');

    $router->get('/groups/discover',                  'GroupController@discover');
    $router->get('/groups/mine',                      'GroupController@mine');
    $router->post('/groups',                          'GroupController@store');
    $router->get('/groups/{id}',                      'GroupController@show');
    $router->post('/groups/{id}/join',                'GroupController@join');
    $router->post('/groups/{id}/leave',               'GroupController@leave');
    $router->put('/groups/{id}',                      'GroupController@update');
    $router->post('/groups/{id}',                     'GroupController@update');
    $router->get('/groups/{id}/members',              'GroupController@members');
    $router->get('/groups/{id}/requests',             'GroupController@pending');
    $router->put('/groups/{id}/requests/{membershipId}/approve', 'GroupController@approve');
    $router->put('/groups/{id}/requests/{membershipId}/reject',  'GroupController@reject');
    $router->put('/groups/{id}/members/{memberUserId}/role', 'GroupController@updateRole');
    $router->delete('/groups/{id}/members/{memberUserId}',   'GroupController@removeMember');
    $router->get('/groups/{id}/access',               'GroupController@access');
});

<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () {
    return response()->json([
        'service' => 'posts-service',
        'status' => 'running',
        'version' => '1.0.0',
    ]);
});

$router->group(['prefix' => 'api', 'middleware' => 'jwt'], function () use ($router) {
    $router->post('/posts', 'PostController@store');
    $router->get('/posts', 'PostController@index');
    $router->get('/posts/admin/all', 'PostController@adminIndex');
    $router->get('/posts/{id}', 'PostController@show');
    $router->get('/mentions', 'PostController@mentions');
    $router->post('/livestreams', 'LivestreamController@store');
    $router->get('/livestreams/active', 'LivestreamController@active');
    $router->get('/livestreams/{id}', 'LivestreamController@show');
    $router->put('/livestreams/{id}/source', 'LivestreamController@source');
    $router->put('/livestreams/{id}/end', 'LivestreamController@end');
    $router->post('/livestreams/{id}/heartbeat', 'LivestreamController@heartbeat');
    $router->post('/livestreams/{id}/reaction', 'LivestreamController@react');
    $router->get('/livestreams/{id}/events', 'LivestreamController@events');
    $router->get('/group-posts/{groupId}', 'PostController@groupIndex');
    $router->post('/group-posts/{groupId}', 'PostController@storeGroup');
    $router->get('/group-posts/{groupId}/media', 'PostController@groupMedia');
    $router->delete('/posts/{id}/admin', 'PostController@adminDestroy');
    $router->delete('/posts/{id}', 'PostController@destroy');

    $router->post('/posts/{id}/reaction', 'LikeController@react');
    $router->post('/posts/{id}/like', 'LikeController@react');
    $router->get('/posts/{id}/likes', 'LikeController@count');

    $router->post('/posts/{id}/comments', 'CommentController@store');
    $router->get('/posts/{id}/comments', 'CommentController@index');
    $router->delete('/comments/{id}/admin', 'CommentController@adminDestroy');
    $router->delete('/comments/{id}', 'CommentController@destroy');
    $router->post('/comments/{id}/reaction', 'CommentLikeController@react');
    $router->post('/comments/{id}/like', 'CommentLikeController@react');
    $router->get('/comments/{id}/likes', 'CommentLikeController@count');

    $router->post('/posts/{id}/report', 'ReportController@reportPost');
    $router->post('/comments/{id}/report', 'ReportController@reportComment');
    $router->get('/posts/admin/reports', 'ReportController@list');
    $router->get('/posts/admin/reports/{id}', 'ReportController@show');
    $router->put('/posts/admin/reports/{id}', 'ReportController@updateStatus');
});

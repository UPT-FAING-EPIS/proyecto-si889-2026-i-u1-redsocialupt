<?php

/** @var \Laravel\Lumen\Routing\Router $router */

$router->get('/', function () {
    return response()->json([
        'service' => 'chat-service',
        'status' => 'running',
        'version' => '1.0.0',
    ]);
});

$router->group(['prefix' => 'api/chat', 'middleware' => 'jwt'], function () use ($router) {
    $router->post('/messages', 'MessageController@send');
    $router->get('/messages/{userId}', 'MessageController@conversation');
    $router->get('/inbox', 'MessageController@inbox');

    $router->post('/calls', 'CallController@start');
    $router->get('/calls/pending', 'CallController@pending');
    $router->get('/calls/missed', 'CallController@missed');
    $router->get('/calls/{id}', 'CallController@show');
    $router->put('/calls/{id}/accept', 'CallController@accept');
    $router->put('/calls/{id}/reject', 'CallController@reject');
    $router->put('/calls/{id}/end', 'CallController@end');
    $router->put('/calls/{id}/mode', 'CallController@updateMode');
    $router->post('/calls/{id}/signal', 'CallController@signal');
    $router->get('/calls/{id}/signals', 'CallController@signals');

    $router->post('/messages/{id}/report', 'MessageReportController@report');
    $router->get('/admin/reports', 'MessageReportController@list');
    $router->get('/admin/reports/{id}', 'MessageReportController@show');
    $router->put('/admin/reports/{id}', 'MessageReportController@updateStatus');
});

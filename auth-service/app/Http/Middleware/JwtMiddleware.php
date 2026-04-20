<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;

class JwtMiddleware
{
    /**
     * Intercepta la request y valida el JWT.
     *
     * Si el token es válido, inyecta los datos del usuario
     * en $request->auth para que el controlador los use.
     */
    public function handle($request, Closure $next)
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['error' => 'Token no proporcionado'], 401);
        }

        try {
            $decoded = JWT::decode(
                $token,
                new Key(env('JWT_SECRET'), env('JWT_ALGORITHM', 'HS256'))
            );

            $request->auth = $decoded;
        } catch (ExpiredException $e) {
            return response()->json(['error' => 'Token expirado'], 401);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Token inválido'], 401);
        }

        return $next($request);
    }
}

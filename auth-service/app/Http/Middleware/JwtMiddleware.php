<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtMiddleware
{
    /**
     * Intercepta la request y valida el JWT.
     *
     * Si el token es valido, inyecta los datos del usuario
     * en $request->auth para que el controlador los use.
     */
    public function handle($request, Closure $next)
    {
        $token = $request->bearerToken();
        $errorResponse = null;

        if (!$token) {
            $errorResponse = response()->json(['error' => 'Token no proporcionado'], 401);
        } else {
            try {
                $decoded = JWT::decode(
                    $token,
                    new Key(env('JWT_SECRET'), env('JWT_ALGORITHM', 'HS256'))
                );
                $request->auth = $decoded;
            } catch (ExpiredException $e) {
                $errorResponse = response()->json(['error' => 'Token expirado'], 401);
            } catch (\Exception $e) {
                $errorResponse = response()->json(['error' => 'Token invalido'], 401);
            }
        }

        if ($errorResponse) {
            return $errorResponse;
        }

        return $next($request);
    }
}

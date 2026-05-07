<?php

namespace App\Http\Middleware;

use App\Models\User;
use Carbon\Carbon;
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
                $user = User::find((int) ($decoded->sub ?? 0));
                if (!$user) {
                    $errorResponse = response()->json(['error' => 'Usuario no encontrado'], 401);
                } elseif ($this->shouldReleaseExpiredBlock($user)) {
                    $user->forceFill([
                        'is_active' => true,
                        'blocked_reason' => null,
                        'blocked_until' => null,
                    ])->save();
                    $user = $user->fresh();
                    $request->auth = $this->buildAuthPayload($decoded, $user);
                } elseif (!$user->is_active) {
                    $errorResponse = response()->json(array_filter([
                        'error' => 'Tu cuenta ha sido bloqueada',
                        'code' => 'ACCOUNT_BLOCKED',
                        'reason' => $user->blocked_reason,
                        'blocked_until' => $user->blocked_until?->toIso8601String(),
                        'is_indefinite' => $user->blocked_until === null,
                    ], fn ($value) => $value !== null), 403);
                } else {
                    $request->auth = $this->buildAuthPayload($decoded, $user);
                }
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

    private function shouldReleaseExpiredBlock(User $user): bool
    {
        return !$user->is_active
            && $user->blocked_until !== null
            && $user->blocked_until->lessThanOrEqualTo(Carbon::now());
    }

    private function buildAuthPayload(object $decoded, User $user): object
    {
        $authPayload = (array) $decoded;
        $authPayload['email'] = $user->email;
        $authPayload['name'] = $user->full_name ?: $user->name;
        $authPayload['full_name'] = $user->full_name;
        $authPayload['school'] = $user->career;
        $authPayload['career'] = $user->career;
        $authPayload['area'] = $user->area;
        $authPayload['position_title'] = $user->position_title;
        $authPayload['faculty'] = $user->faculty;
        $authPayload['role'] = $user->role;
        $authPayload['avatar_url'] = $user->avatar_url;

        return (object) $authPayload;
    }
}

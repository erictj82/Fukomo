<?php
// CSRF token untuk semua form POST.

namespace App\Core;

class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf_token'];
    }

    public static function field(): string
    {
        return '<input type="hidden" name="csrf_token" value="' . htmlspecialchars(self::token()) . '">';
    }

    // CSRF field + method override (PUT/PATCH/DELETE) buat form HTML.
    public static function fieldWithMethod(string $method): string
    {
        $m = htmlspecialchars(strtoupper($method), ENT_QUOTES);
        return self::field() . '<input type="hidden" name="_method" value="' . $m . '">';
    }

    public static function verify(?string $token): bool
    {
        return !empty($token)
            && !empty($_SESSION['csrf_token'])
            && hash_equals($_SESSION['csrf_token'], $token);
    }

    // Panggil di awal tiap handler POST; mati kalau gagal.
    public static function check(): void
    {
        if (!self::verify($_POST['csrf_token'] ?? null)) {
            http_response_code(419);
            exit('CSRF token invalid. Refresh halaman dan coba lagi.');
        }
    }
}

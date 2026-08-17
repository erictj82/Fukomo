<?php
// Auth — login/logout PHP-native vs MySQL platform_admins. Rate-limit login.

namespace App\Core;

use App\Core\Db;

class Auth
{
    private const MAX_ATTEMPTS = 5;      // per username+ip
    private const WINDOW_MINUTES = 15;

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_set_cookie_params([
                'httponly' => true,
                'samesite' => 'Lax',
                'secure'   => (($_SERVER['HTTPS'] ?? '') === 'on'),
            ]);
            session_start();
        }
    }

    public static function check(): bool
    {
        return !empty($_SESSION['admin_id']);
    }

    public static function user(): ?array
    {
        if (!self::check()) return null;
        return [
            'id'       => $_SESSION['admin_id'],
            'username' => $_SESSION['admin_username'] ?? '',
            'name'     => $_SESSION['admin_name'] ?? '',
            'role'     => $_SESSION['admin_role'] ?? 'staff',
        ];
    }

    // Guard: paksa login. Panggil di awal handler yang butuh auth.
    public static function requireLogin(): void
    {
        self::start();
        if (!self::check()) {
            header('Location: /login');
            exit;
        }
    }

    // Guard: super_admin only.
    public static function requireSuperAdmin(): void
    {
        self::requireLogin();
        if (($_SESSION['admin_role'] ?? '') !== 'super_admin') {
            http_response_code(403);
            exit('403 — butuh hak akses super_admin.');
        }
    }

    // Return ['ok'=>bool, 'error'=>string|null]
    public static function attempt(string $username, string $password, string $ip): array
    {
        $pdo = Db::connect();

        if (self::isRateLimited($username, $ip)) {
            return ['ok' => false, 'error' => 'Terlalu banyak percobaan gagal. Coba lagi dalam ' . self::WINDOW_MINUTES . ' menit.'];
        }

        $stmt = $pdo->prepare('SELECT * FROM platform_admins WHERE username = ? AND is_active = 1 LIMIT 1');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();

        $ok = $admin && password_verify($password, $admin['password_hash']);
        self::recordAttempt($username, $ip, $ok);

        if (!$ok) {
            return ['ok' => false, 'error' => 'Username atau password salah.'];
        }

        // Sukses — set session
        session_regenerate_id(true);
        $_SESSION['admin_id']       = $admin['id'];
        $_SESSION['admin_username'] = $admin['username'];
        $_SESSION['admin_name']     = $admin['name'];
        $_SESSION['admin_role']     = $admin['role'];

        $pdo->prepare('UPDATE platform_admins SET last_login_at = NOW() WHERE id = ?')
            ->execute([$admin['id']]);

        return ['ok' => true, 'error' => null];
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    private static function isRateLimited(string $username, string $ip): bool
    {
        $pdo = Db::connect();
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE success = 0 AND (username = ? OR ip = ?)
             AND created_at > (NOW() - INTERVAL ? MINUTE)'
        );
        $stmt->execute([$username, $ip, self::WINDOW_MINUTES]);
        return (int) $stmt->fetchColumn() >= self::MAX_ATTEMPTS;
    }

    private static function recordAttempt(string $username, string $ip, bool $success): void
    {
        $pdo = Db::connect();
        $pdo->prepare('INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)')
            ->execute([$username, $ip, $success ? 1 : 0]);
    }
}

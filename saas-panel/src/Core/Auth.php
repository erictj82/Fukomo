<?php
// Auth — login/logout PHP-native vs MySQL platform_admins. Rate-limit login.

namespace App\Core;

use App\Core\Db;

class Auth
{
    private const MAX_ATTEMPTS = 5;      // per IP
    private const WINDOW_MINUTES = 15;
    private const IDLE_TIMEOUT = 1800;   // 30 menit tanpa aktivitas -> auto-logout
    private const REVALIDATE_EVERY = 60; // detik: interval re-cek is_active/role ke DB

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

        $now = time();

        // Idle timeout — sesi nganggur lebih dari IDLE_TIMEOUT dianggap kadaluarsa.
        if (isset($_SESSION['last_activity']) && ($now - (int) $_SESSION['last_activity']) > self::IDLE_TIMEOUT) {
            self::logout();
            header('Location: /login?expired=1');
            exit;
        }
        $_SESSION['last_activity'] = $now;

        // Re-validate ke DB: admin yang dinonaktifkan / didemote HARUS langsung kehilangan
        // akses tanpa nunggu logout manual. Cuma dicek pas login itu gak cukup (sesi bisa
        // hidup berhari-hari). Di-throttle REVALIDATE_EVERY detik biar gak query tiap hit.
        $lastCheck = (int) ($_SESSION['last_revalidate'] ?? 0);
        if (($now - $lastCheck) >= self::REVALIDATE_EVERY) {
            if (!self::revalidate()) {
                self::logout();
                header('Location: /login?revoked=1');
                exit;
            }
            $_SESSION['last_revalidate'] = $now;
        }
    }

    // Cek ulang admin masih aktif + sinkronin role terbaru dari DB ke session.
    // Return false kalau admin sudah tidak ada / dinonaktifkan (paksa logout).
    private static function revalidate(): bool
    {
        try {
            $pdo = Db::connect();
            $stmt = $pdo->prepare('SELECT is_active, role FROM platform_admins WHERE id = ? LIMIT 1');
            $stmt->execute([$_SESSION['admin_id']]);
            $row = $stmt->fetch();
        } catch (\Throwable $e) {
            // DB error saat revalidate -> fail-closed (jangan kasih akses dgn data basi).
            return false;
        }

        if (!$row || (int) $row['is_active'] !== 1) {
            return false;
        }
        // Role bisa berubah (promote/demote) — refresh biar requireSuperAdmin() akurat.
        $_SESSION['admin_role'] = $row['role'];
        return true;
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
        // Hitung kegagalan per-IP saja, BUKAN per-username. Kalau ikut username, penyerang
        // bisa nembak username korban dari IP mana pun buat ngunci akun korban (lockout-DoS).
        // Per-IP: brute-force dari 1 IP tetap kejegal, dan attacker cuma bisa ngunci IP-nya
        // sendiri. Brute-force terdistribusi butuh mitigasi lain (WAF/CAPTCHA — ranah ops).
        $pdo = Db::connect();
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE success = 0 AND ip = ?
             AND created_at > (NOW() - INTERVAL ? MINUTE)'
        );
        $stmt->execute([$ip, self::WINDOW_MINUTES]);
        return (int) $stmt->fetchColumn() >= self::MAX_ATTEMPTS;
    }

    private static function recordAttempt(string $username, string $ip, bool $success): void
    {
        $pdo = Db::connect();
        $pdo->prepare('INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)')
            ->execute([$username, $ip, $success ? 1 : 0]);
    }
}

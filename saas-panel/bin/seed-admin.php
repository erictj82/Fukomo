<?php
// Seed admin pertama ke MySQL panel (platform_admins).
// Password di-hash pakai password_hash() PHP (bcrypt) — cocok dengan
// password_verify() di src/Core/Auth.php. Jalankan SEKALI saat setup:
//
//   php bin/seed-admin.php
//   php bin/seed-admin.php --username=owner --name="Owner" --role=super_admin
//
// Password diminta interaktif (tidak muncul di shell history / process list).

declare(strict_types=1);

require __DIR__ . '/../config/config.php';
require __DIR__ . '/../src/Core/Db.php';

use App\Config;
use App\Core\Db;

Config::load();

// --- Parse args ---
$opts = getopt('', ['username::', 'name::', 'role::', 'password::']);
$username = trim($opts['username'] ?? '');
$name     = trim($opts['name'] ?? '');
$role     = trim($opts['role'] ?? 'super_admin');
$password = $opts['password'] ?? null; // opsional; kalau kosong -> prompt

function ask(string $q): string {
    fwrite(STDOUT, $q);
    return trim((string) fgets(STDIN));
}

function askSecret(string $q): string {
    fwrite(STDOUT, $q);
    // Matikan echo terminal biar password gak keliatan
    if (function_exists('shell_exec') && stripos(PHP_OS, 'WIN') === false) {
        shell_exec('stty -echo 2>/dev/null');
        $val = trim((string) fgets(STDIN));
        shell_exec('stty echo 2>/dev/null');
        fwrite(STDOUT, "\n");
        return $val;
    }
    return trim((string) fgets(STDIN));
}

if ($username === '') $username = ask('Username: ');
if ($name === '')     $name = ask('Nama lengkap: ');
if ($password === null) {
    $password = askSecret('Password (min 8 char): ');
    $confirm  = askSecret('Ulangi password: ');
    if ($password !== $confirm) {
        fwrite(STDERR, "Password tidak cocok. Batal.\n");
        exit(1);
    }
}

// --- Validasi ---
$errors = [];
if (strlen($username) < 3) $errors[] = 'username minimal 3 karakter';
if ($name === '')          $errors[] = 'nama wajib diisi';
if (strlen((string)$password) < 8) $errors[] = 'password minimal 8 karakter';
if (!in_array($role, ['super_admin', 'staff'], true)) $errors[] = "role harus 'super_admin' atau 'staff'";
if ($errors) {
    fwrite(STDERR, "Gagal:\n - " . implode("\n - ", $errors) . "\n");
    exit(1);
}

// --- Insert ---
try {
    $pdo = Db::connect();
} catch (\Throwable $e) {
    fwrite(STDERR, "Koneksi MySQL gagal: {$e->getMessage()}\n");
    fwrite(STDERR, "Pastikan .env sudah benar dan migration 001_init.sql sudah dijalankan.\n");
    exit(1);
}

$exists = $pdo->prepare('SELECT id FROM platform_admins WHERE username = ? LIMIT 1');
$exists->execute([$username]);
if ($exists->fetch()) {
    fwrite(STDERR, "Username '$username' sudah ada. Batal.\n");
    exit(1);
}

$hash = password_hash((string)$password, PASSWORD_BCRYPT);
$stmt = $pdo->prepare(
    'INSERT INTO platform_admins (username, password_hash, name, role, is_active)
     VALUES (?, ?, ?, ?, 1)'
);
$stmt->execute([$username, $hash, $name, $role]);

fwrite(STDOUT, "OK — admin '{$username}' ({$role}) berhasil dibuat.\n");
exit(0);

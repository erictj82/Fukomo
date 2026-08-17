<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\Csrf;
use App\Core\Db;

// Kelola platform_admins. Beda dari controller lain: data admin panel itu
// operasional LOKAL, jadi langsung ke MySQL via Db — BUKAN lewat internal API Mongo.
// Semua aksi butuh super_admin.
class AdminController
{
    public function index(): void
    {
        Auth::requireSuperAdmin();

        $admins = Db::connect()
            ->query('SELECT id, username, name, role, is_active, last_login_at, created_at
                     FROM platform_admins ORDER BY created_at ASC')
            ->fetchAll();

        View::render('admins/index', [
            'admins'  => $admins,
            'meId'    => (int) (Auth::user()['id'] ?? 0),
        ], 'Admin Panel');
    }

    public function create(): void
    {
        Auth::requireSuperAdmin();
        View::render('admins/form', ['admin' => null, 'error' => null], 'Tambah Admin');
    }

    public function store(): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $data = self::input($_POST);
        $password = (string) ($_POST['password'] ?? '');

        $err = self::validate($data, $password, true);
        if ($err) {
            View::render('admins/form', ['admin' => $data, 'error' => $err], 'Tambah Admin');
            return;
        }

        $pdo = Db::connect();
        $exists = $pdo->prepare('SELECT id FROM platform_admins WHERE username = ? LIMIT 1');
        $exists->execute([$data['username']]);
        if ($exists->fetch()) {
            View::render('admins/form', ['admin' => $data, 'error' => "Username \"{$data['username']}\" sudah dipakai."], 'Tambah Admin');
            return;
        }

        $pdo->prepare(
            'INSERT INTO platform_admins (username, password_hash, name, role, is_active)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([
            $data['username'],
            password_hash($password, PASSWORD_BCRYPT),
            $data['name'],
            $data['role'],
            $data['is_active'],
        ]);

        $_SESSION['flash_success'] = "Admin \"{$data['username']}\" berhasil dibuat.";
        header('Location: /admins');
        exit;
    }

    public function edit(string $id): void
    {
        Auth::requireSuperAdmin();

        $admin = self::find((int) $id);
        if (!$admin) {
            $_SESSION['flash_error'] = 'Admin tidak ditemukan.';
            header('Location: /admins');
            exit;
        }

        View::render('admins/form', ['admin' => $admin, 'error' => null], 'Edit Admin');
    }

    public function update(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $id = (int) $id;
        $admin = self::find($id);
        if (!$admin) {
            $_SESSION['flash_error'] = 'Admin tidak ditemukan.';
            header('Location: /admins');
            exit;
        }

        // Username immutable — pakai nilai lama, abaikan input.
        $data = self::input($_POST);
        $data['username'] = $admin['username'];
        $password = (string) ($_POST['password'] ?? '');

        // password opsional saat edit: string kosong = jangan ganti.
        $err = self::validate($data, $password, false);
        if ($err) {
            $data['id'] = $id;
            View::render('admins/form', ['admin' => $data, 'error' => $err], 'Edit Admin');
            return;
        }

        // Safety: jangan sampai super_admin aktif terakhir di-nonaktifkan / diturunkan.
        $losesSuper = $admin['role'] === 'super_admin'
            && ($data['role'] !== 'super_admin' || $data['is_active'] === 0);
        if ($losesSuper && self::activeSuperAdminCount() <= 1) {
            $data['id'] = $id;
            View::render('admins/form', ['admin' => $data,
                'error' => 'Tidak bisa menurunkan/menonaktifkan super_admin aktif terakhir.'], 'Edit Admin');
            return;
        }

        // Diri sendiri tidak boleh menonaktifkan / menurunkan role sendiri (hindari kekunci).
        if ($id === (int) Auth::user()['id'] && ($data['role'] !== 'super_admin' || $data['is_active'] === 0)) {
            $data['id'] = $id;
            View::render('admins/form', ['admin' => $data,
                'error' => 'Tidak bisa menurunkan atau menonaktifkan akun sendiri.'], 'Edit Admin');
            return;
        }

        $sql = 'UPDATE platform_admins SET name = ?, role = ?, is_active = ?';
        $params = [$data['name'], $data['role'], $data['is_active']];
        if ($password !== '') {
            $sql .= ', password_hash = ?';
            $params[] = password_hash($password, PASSWORD_BCRYPT);
        }
        $sql .= ' WHERE id = ?';
        $params[] = $id;

        Db::connect()->prepare($sql)->execute($params);

        $_SESSION['flash_success'] = "Admin \"{$admin['username']}\" berhasil diperbarui.";
        header('Location: /admins');
        exit;
    }

    public function destroy(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $id = (int) $id;
        $admin = self::find($id);
        if (!$admin) {
            $_SESSION['flash_error'] = 'Admin tidak ditemukan.';
            header('Location: /admins');
            exit;
        }

        // Safety: gak bisa hapus diri sendiri.
        if ($id === (int) Auth::user()['id']) {
            $_SESSION['flash_error'] = 'Tidak bisa menghapus akun sendiri.';
            header('Location: /admins');
            exit;
        }

        // Safety: gak bisa hapus super_admin aktif terakhir.
        if ($admin['role'] === 'super_admin' && (int) $admin['is_active'] === 1
            && self::activeSuperAdminCount() <= 1) {
            $_SESSION['flash_error'] = 'Tidak bisa menghapus super_admin aktif terakhir.';
            header('Location: /admins');
            exit;
        }

        Db::connect()->prepare('DELETE FROM platform_admins WHERE id = ?')->execute([$id]);

        $_SESSION['flash_success'] = "Admin \"{$admin['username']}\" dihapus.";
        header('Location: /admins');
        exit;
    }

    // --- Helpers ---

    private static function input(array $post): array
    {
        $role = ($post['role'] ?? 'staff') === 'super_admin' ? 'super_admin' : 'staff';
        return [
            'username'  => trim((string) ($post['username'] ?? '')),
            'name'      => trim((string) ($post['name'] ?? '')),
            'role'      => $role,
            'is_active' => isset($post['is_active']) && $post['is_active'] === '1' ? 1 : 0,
        ];
    }

    private static function validate(array $d, string $password, bool $requirePassword): ?string
    {
        if (strlen($d['username']) < 3) return 'Username minimal 3 karakter.';
        if (!preg_match('/^[a-zA-Z0-9_.-]+$/', $d['username'])) {
            return 'Username hanya boleh huruf, angka, titik, strip, underscore.';
        }
        if ($d['name'] === '') return 'Nama wajib diisi.';
        if ($requirePassword || $password !== '') {
            if (strlen($password) < 8) return 'Password minimal 8 karakter.';
        }
        return null;
    }

    private static function find(int $id): ?array
    {
        $stmt = Db::connect()->prepare(
            'SELECT id, username, name, role, is_active, last_login_at, created_at
             FROM platform_admins WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function activeSuperAdminCount(): int
    {
        return (int) Db::connect()
            ->query("SELECT COUNT(*) FROM platform_admins WHERE role = 'super_admin' AND is_active = 1")
            ->fetchColumn();
    }
}

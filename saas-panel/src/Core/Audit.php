<?php
// Audit trail — nulis ke tabel audit_logs (MySQL panel). Dipanggil dari aksi
// high-impact: approve/reject registration, mutasi plan, suspend/aktifkan toko.
// Tabelnya udah ada sejak migrations/001_init.sql tapi sebelumnya gak ada yang nulis.

namespace App\Core;

use App\Core\Db;
use App\Core\Auth;

class Audit
{
    /**
     * Catat satu aksi. Best-effort: kegagalan nulis audit TIDAK boleh nggagalin
     * aksi utamanya (cukup ke error_log), tapi tetep di-log biar ketahuan.
     *
     * @param string      $action     mis. 'approve_registration', 'update_plan', 'suspend_store'
     * @param string|null $targetType 'store' | 'plan' | 'registration' | 'admin'
     * @param string|null $targetId   id objek (Mongo _id string / MySQL id) yang disentuh
     * @param array|null  $meta       detail tambahan (jangan taruh secret di sini)
     */
    public static function log(string $action, ?string $targetType = null, ?string $targetId = null, ?array $meta = null): void
    {
        try {
            $admin = Auth::user();
            $pdo = Db::connect();
            $stmt = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, target_type, target_id, meta, ip)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $admin['id'] ?? null,
                $action,
                $targetType,
                $targetId,
                $meta !== null ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
            ]);
        } catch (\Throwable $e) {
            error_log('[Audit] gagal nulis audit_logs (' . $action . '): ' . $e->getMessage());
        }
    }
}

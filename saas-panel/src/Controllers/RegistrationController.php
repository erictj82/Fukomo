<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\Csrf;
use App\Core\ApiClient;
use App\Core\Audit;

class RegistrationController
{
    public function index(): void
    {
        Auth::requireLogin();

        $status = $_GET['status'] ?? '';
        $query = in_array($status, ['pending', 'approved', 'rejected'], true)
            ? ['status' => $status] : [];

        $api = new ApiClient();
        $res = $api->get('/api/internal/saas/registrations', $query);

        View::render('registrations/index', [
            'registrations' => $res['ok'] ? $res['data'] : [],
            'status'        => $status,
            'error'         => $res['ok'] ? null : $res['error'],
        ], 'Pendaftaran');
    }

    public function show(string $id): void
    {
        Auth::requireLogin();

        $reg = self::findById($id, $err);
        if (!$reg) {
            $_SESSION['flash_error'] = $err;
            header('Location: /registrations');
            exit;
        }

        // Plan aktif buat dropdown approve (cuma perlu kalau masih pending).
        $plans = [];
        if (($reg['status'] ?? '') === 'pending') {
            $planRes = (new ApiClient())->get('/api/internal/saas/plans');
            $plans = $planRes['ok'] ? $planRes['data'] : [];
        }

        View::render('registrations/show', [
            'reg'   => $reg,
            'plans' => $plans,
            'error' => null,
        ], 'Detail Pendaftaran');
    }

    public function approve(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $planId = trim((string) ($_POST['planId'] ?? ''));
        $billingPeriod = trim((string) ($_POST['billingPeriod'] ?? ''));

        if ($planId === '' || $billingPeriod === '') {
            $_SESSION['flash_error'] = 'Plan dan periode langganan wajib dipilih sebelum approve.';
            header("Location: /registrations/$id");
            exit;
        }

        // Efek keluar: approve provision toko + kirim WA ke owner. Sekali jalan.
        $res = (new ApiClient())->post("/api/internal/saas/registrations/$id/approve", [
            'planId'        => $planId,
            'billingPeriod' => $billingPeriod,
        ]);

        if (!$res['ok']) {
            $_SESSION['flash_error'] = $res['error'];
            header("Location: /registrations/$id");
            exit;
        }

        $d = $res['data'] ?? [];
        Audit::log('approve_registration', 'registration', $id, [
            'slug'          => $d['slug'] ?? null,
            'storeId'       => $d['storeId'] ?? null,
            'planId'        => $planId,
            'billingPeriod' => $billingPeriod,
        ]);
        $_SESSION['flash_success'] = sprintf(
            'Toko "%s" di-approve. Slug: %s. WA konfirmasi dikirim ke owner.',
            $d['storeName'] ?? '-',
            $d['slug'] ?? '-'
        );
        header('Location: /registrations');
        exit;
    }

    public function reject(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $reason = trim((string) ($_POST['rejectionReason'] ?? ''));
        if ($reason === '') {
            $_SESSION['flash_error'] = 'Alasan penolakan wajib diisi.';
            header("Location: /registrations/$id");
            exit;
        }

        $res = (new ApiClient())->post("/api/internal/saas/registrations/$id/reject", [
            'rejectionReason' => $reason,
        ]);

        if ($res['ok']) {
            Audit::log('reject_registration', 'registration', $id, ['reason' => $reason]);
        }

        $_SESSION[$res['ok'] ? 'flash_success' : 'flash_error'] =
            $res['ok'] ? 'Pendaftaran ditolak. WA notifikasi dikirim ke pendaftar.' : $res['error'];

        header('Location: /registrations');
        exit;
    }

    // Tidak ada endpoint GET single; ambil dari list lalu cari by _id.
    // Volume pendaftaran kecil, jadi aman.
    private static function findById(string $id, ?string &$err): ?array
    {
        $res = (new ApiClient())->get('/api/internal/saas/registrations');
        if (!$res['ok']) {
            $err = $res['error'];
            return null;
        }
        foreach (($res['data'] ?? []) as $reg) {
            if (($reg['_id'] ?? '') === $id) return $reg;
        }
        $err = 'Pendaftaran tidak ditemukan.';
        return null;
    }
}

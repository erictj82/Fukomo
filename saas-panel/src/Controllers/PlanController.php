<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\Csrf;
use App\Core\ApiClient;
use App\Core\Audit;

class PlanController
{
    public function index(): void
    {
        Auth::requireLogin();

        $api = new ApiClient();
        $res = $api->get('/api/internal/saas/plans', ['includeInactive' => 'true']);

        View::render('plans/index', [
            'plans' => $res['ok'] ? $res['data'] : [],
            'error' => $res['ok'] ? null : $res['error'],
        ], 'Paket / Plan');
    }

    public function create(): void
    {
        Auth::requireSuperAdmin();
        View::render('plans/form', [
            'plan' => null,
            'error' => null,
        ], 'Buat Plan');
    }

    public function store(): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $payload = self::buildPayload($_POST);
        $err = self::validate($payload, true);
        if ($err) {
            $_SESSION['flash_error'] = $err;
            View::render('plans/form', ['plan' => $payload, 'error' => $err], 'Buat Plan');
            return;
        }

        $api = new ApiClient();
        $res = $api->post('/api/internal/saas/plans', $payload);

        if (!$res['ok']) {
            View::render('plans/form', ['plan' => $payload, 'error' => $res['error']], 'Buat Plan');
            return;
        }

        Audit::log('create_plan', 'plan', $res['data']['_id'] ?? null, [
            'code' => $payload['code'],
            'name' => $payload['name'],
        ]);
        $_SESSION['flash_success'] = 'Plan berhasil dibuat.';
        header('Location: /plans');
        exit;
    }

    public function edit(string $id): void
    {
        Auth::requireSuperAdmin();

        $api = new ApiClient();
        $res = $api->get("/api/internal/saas/plans/$id");

        if (!$res['ok']) {
            $_SESSION['flash_error'] = $res['error'];
            header('Location: /plans');
            exit;
        }

        View::render('plans/form', [
            'plan' => $res['data'],
            'error' => null,
        ], 'Edit Plan');
    }

    public function update(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        // code immutable — server juga strip, tapi kita gak kirim biar konsisten.
        $payload = self::buildPayload($_POST);
        unset($payload['code']);

        $err = self::validate($payload, false);
        if ($err) {
            $payload['_id'] = $id;
            View::render('plans/form', ['plan' => $payload, 'error' => $err], 'Edit Plan');
            return;
        }

        $api = new ApiClient();
        $res = $api->put("/api/internal/saas/plans/$id", $payload);

        if (!$res['ok']) {
            $payload['_id'] = $id;
            View::render('plans/form', ['plan' => $payload, 'error' => $res['error']], 'Edit Plan');
            return;
        }

        Audit::log('update_plan', 'plan', $id, ['name' => $payload['name']]);
        $_SESSION['flash_success'] = 'Plan berhasil diperbarui.';
        header('Location: /plans');
        exit;
    }

    public function destroy(string $id): void
    {
        Auth::requireSuperAdmin();
        Csrf::check();

        $api = new ApiClient();
        $res = $api->delete("/api/internal/saas/plans/$id");

        if ($res['ok']) {
            Audit::log('delete_plan', 'plan', $id);
        }

        // 409 = masih dipakai subscription aktif → sarankan nonaktifkan.
        $_SESSION[$res['ok'] ? 'flash_success' : 'flash_error'] =
            $res['ok'] ? 'Plan dihapus.' : $res['error'];

        header('Location: /plans');
        exit;
    }

    // --- Helpers ---

    // Rakit payload dari form POST. Repeater dikirim sebagai array paralel:
    // po_billingPeriod[], po_billingPeriodDays[], po_price[], po_discountLabel[]
    // ao_name[], ao_limitType[], ao_extraAmount[], ao_price[], ao_isActive[]
    private static function buildPayload(array $post): array
    {
        $pricingOptions = [];
        $periods = $post['po_billingPeriod'] ?? [];
        foreach ($periods as $i => $bp) {
            if (trim((string) $bp) === '') continue;
            $opt = [
                'billingPeriod'     => $bp,
                'billingPeriodDays' => (int) ($post['po_billingPeriodDays'][$i] ?? 0),
                'price'             => (float) ($post['po_price'][$i] ?? 0),
            ];
            $label = trim((string) ($post['po_discountLabel'][$i] ?? ''));
            if ($label !== '') $opt['discountLabel'] = $label;
            $pricingOptions[] = $opt;
        }

        $availableAddOns = [];
        $names = $post['ao_name'] ?? [];
        foreach ($names as $i => $nm) {
            if (trim((string) $nm) === '') continue;
            $availableAddOns[] = [
                'name'        => trim((string) $nm),
                'limitType'   => $post['ao_limitType'][$i] ?? 'wa',
                'extraAmount' => (int) ($post['ao_extraAmount'][$i] ?? 0),
                'price'       => (float) ($post['ao_price'][$i] ?? 0),
                'isActive'    => isset($post['ao_isActive'][$i]) && $post['ao_isActive'][$i] === '1',
            ];
        }

        return [
            'name'        => trim((string) ($post['name'] ?? '')),
            'code'        => trim((string) ($post['code'] ?? '')),
            'description' => trim((string) ($post['description'] ?? '')),
            'limits'      => [
                'maxStaff'                => (int) ($post['maxStaff'] ?? 0),
                'maxTransactionsPerMonth' => (int) ($post['maxTransactionsPerMonth'] ?? 0),
                'maxWaMessagesPerMonth'   => (int) ($post['maxWaMessagesPerMonth'] ?? 0),
            ],
            'pricingOptions'  => $pricingOptions,
            'availableAddOns' => $availableAddOns,
            'isActive'        => isset($post['isActive']) && $post['isActive'] === '1',
            'sortOrder'       => (int) ($post['sortOrder'] ?? 0),
        ];
    }

    private static function validate(array $p, bool $requireCode): ?string
    {
        if ($p['name'] === '') return 'Nama plan wajib diisi.';
        if ($requireCode) {
            if ($p['code'] === '') return 'Kode plan wajib diisi.';
            if (!preg_match('/^[a-z0-9-]+$/', $p['code'])) {
                return 'Kode hanya boleh huruf kecil, angka, dan strip.';
            }
        }
        if (empty($p['pricingOptions'])) return 'Minimal 1 opsi harga (billing period) wajib diisi.';
        return null;
    }
}

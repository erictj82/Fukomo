<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\ApiClient;

class StoreController
{
    public function index(): void
    {
        Auth::requireLogin();

        $api = new ApiClient();
        $search = $_GET['search'] ?? '';
        $stores = $api->get('/api/internal/saas/stores', $search ? ['search' => $search] : []);

        if (!$stores['ok']) {
            View::render('stores/index', [
                'error' => $stores['error'],
                'stores' => [],
                'search' => $search,
            ], 'Stores');
            return;
        }

        View::render('stores/index', [
            'stores' => $stores['data'],
            'search' => $search,
            'error' => null,
        ], 'Stores');
    }

    public function show(string $id): void
    {
        Auth::requireLogin();

        $api = new ApiClient();
        $detail = $api->get("/api/internal/saas/stores/$id");

        if (!$detail['ok']) {
            View::render('stores/show', [
                'error' => $detail['error'],
                'store' => null,
            ], 'Store Detail');
            return;
        }

        View::render('stores/show', [
            'store' => $detail['data'],
            'error' => null,
        ], 'Store Detail');
    }
}

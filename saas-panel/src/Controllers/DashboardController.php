<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\ApiClient;

class DashboardController
{
    public function index(): void
    {
        Auth::requireLogin();

        $api = new ApiClient();
        $stats = $api->get('/api/internal/saas/stats');

        if (!$stats['ok']) {
            View::render('dashboard/index', [
                'error' => $stats['error'],
                'stats' => null,
            ], 'Dashboard');
            return;
        }

        View::render('dashboard/index', [
            'stats' => $stats['data'],
            'error' => null,
        ], 'Dashboard');
    }
}

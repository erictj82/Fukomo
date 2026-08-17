<?php
// Front controller — semua request masuk sini (via .htaccess rewrite).

declare(strict_types=1);

// Autoload PSR-4 sederhana (tanpa composer): App\ -> src/
spl_autoload_register(function (string $class) {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) return;
    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/../src/' . str_replace('\\', '/', $relative) . '.php';
    if (file_exists($file)) require $file;
});

// Config class ada di config/config.php (bukan src/), require manual.
require __DIR__ . '/../config/config.php';

use App\Config;
use App\Core\Router;
use App\Core\Auth;
use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\StoreController;
use App\Controllers\PlanController;
use App\Controllers\RegistrationController;
use App\Controllers\AdminController;

Config::load();
Auth::start();

$router = new Router();

// Auth
$router->get('/login', [AuthController::class, 'showLogin']);
$router->post('/login', [AuthController::class, 'login']);
$router->post('/logout', [AuthController::class, 'logout']);

// Dashboard
$router->get('/', [DashboardController::class, 'index']);
$router->get('/dashboard', [DashboardController::class, 'index']);

// Stores
$router->get('/stores', [StoreController::class, 'index']);
$router->get('/stores/{id}', [StoreController::class, 'show']);

// Plans
$router->get('/plans', [PlanController::class, 'index']);
$router->get('/plans/create', [PlanController::class, 'create']);
$router->post('/plans', [PlanController::class, 'store']);
$router->get('/plans/{id}/edit', [PlanController::class, 'edit']);
$router->put('/plans/{id}', [PlanController::class, 'update']);
$router->delete('/plans/{id}', [PlanController::class, 'destroy']);

// Registrations (approve/reject punya efek keluar: provision toko + kirim WA).
$router->get('/registrations', [RegistrationController::class, 'index']);
$router->get('/registrations/{id}', [RegistrationController::class, 'show']);
$router->post('/registrations/{id}/approve', [RegistrationController::class, 'approve']);
$router->post('/registrations/{id}/reject', [RegistrationController::class, 'reject']);

// Admin panel (platform_admins di MySQL) — super_admin only, di-guard di controller.
$router->get('/admins', [AdminController::class, 'index']);
$router->get('/admins/create', [AdminController::class, 'create']);
$router->post('/admins', [AdminController::class, 'store']);
$router->get('/admins/{id}/edit', [AdminController::class, 'edit']);
$router->put('/admins/{id}', [AdminController::class, 'update']);
$router->delete('/admins/{id}', [AdminController::class, 'destroy']);

$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);

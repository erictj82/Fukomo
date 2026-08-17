<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\View;
use App\Core\Csrf;

class AuthController
{
    public function showLogin(): void
    {
        Auth::start();
        if (Auth::check()) {
            header('Location: /dashboard');
            exit;
        }
        View::renderBare('auth/login');
    }

    public function login(): void
    {
        Auth::start();
        Csrf::check();

        $username = trim($_POST['username'] ?? '');
        $password = $_POST['password'] ?? '';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';

        $result = Auth::attempt($username, $password, $ip);

        if (!$result['ok']) {
            $_SESSION['flash_error'] = $result['error'];
            header('Location: /login');
            exit;
        }

        header('Location: /dashboard');
        exit;
    }

    public function logout(): void
    {
        Auth::logout();
        header('Location: /login');
        exit;
    }
}

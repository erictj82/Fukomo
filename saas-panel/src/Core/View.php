<?php
// View — render template PHP + layout AdminLTE.

namespace App\Core;

class View
{
    private static string $viewPath = __DIR__ . '/../Views/';

    // Render view di dalam layout utama. $data di-extract jadi variabel lokal.
    public static function render(string $view, array $data = [], ?string $title = null): void
    {
        extract($data, EXTR_SKIP);
        $viewFile = self::$viewPath . $view . '.php';
        if (!file_exists($viewFile)) {
            throw new \RuntimeException("View not found: $view");
        }

        ob_start();
        require $viewFile;
        $content = ob_get_clean();

        $pageTitle = $title ?? 'Panel SaaS';
        require self::$viewPath . 'layout/main.php';
    }

    // Render tanpa layout (mis. halaman login).
    public static function renderBare(string $view, array $data = []): void
    {
        extract($data, EXTR_SKIP);
        require self::$viewPath . $view . '.php';
    }

    // Escape helper.
    public static function e($value): string
    {
        return htmlspecialchars((string) ($value ?? ''), ENT_QUOTES, 'UTF-8');
    }
}

<?php
// Router mikro — daftar rute (method + path) -> [Controller, action].
// Path support param sederhana: /stores/{id}

namespace App\Core;

class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, array $handler): void
    {
        $this->routes[] = [strtoupper($method), $pattern, $handler];
    }

    public function get(string $p, array $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, array $h): void { $this->add('POST', $p, $h); }
    public function put(string $p, array $h): void { $this->add('PUT', $p, $h); }
    public function patch(string $p, array $h): void { $this->add('PATCH', $p, $h); }
    public function delete(string $p, array $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(string $method, string $uri): void
    {
        $method = strtoupper($method);

        // HTML form cuma bisa GET/POST. Untuk PUT/PATCH/DELETE, form kirim POST
        // dengan hidden field _method. Terjemahkan di sini.
        if ($method === 'POST' && !empty($_POST['_method'])) {
            $override = strtoupper((string) $_POST['_method']);
            if (in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) {
                $method = $override;
            }
        }

        $path = parse_url($uri, PHP_URL_PATH);
        $path = rtrim($path, '/') ?: '/';

        foreach ($this->routes as [$rMethod, $pattern, $handler]) {
            if ($rMethod !== strtoupper($method)) continue;

            $regex = '#^' . preg_replace('#\{[a-zA-Z_]+\}#', '([^/]+)', $pattern) . '$#';
            if (preg_match($regex, $path, $m)) {
                array_shift($m);
                [$class, $action] = $handler;
                $controller = new $class();
                $controller->$action(...$m);
                return;
            }
        }

        http_response_code(404);
        echo '404 — halaman tidak ditemukan';
    }
}

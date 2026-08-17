<?php
// Config loader — reads .env file and exposes via Config::get()

namespace App;

class Config
{
    private static $data = [];
    private static $loaded = false;

    public static function load(string $envPath = __DIR__ . '/../.env'): void
    {
        if (self::$loaded) return;

        if (!file_exists($envPath)) {
            throw new \RuntimeException('.env file not found. Copy .env.example to .env and configure it.');
        }

        $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (str_starts_with(trim($line), '#')) continue;
            if (!str_contains($line, '=')) continue;
            [$key, $value] = explode('=', $line, 2);
            self::$data[trim($key)] = trim($value);
        }
        self::$loaded = true;
    }

    public static function get(string $key, $default = null)
    {
        return self::$data[$key] ?? $default;
    }
}

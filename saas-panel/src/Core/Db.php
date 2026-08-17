<?php
// PDO connection to MySQL panel database (operational data only)

namespace App\Core;

use PDO;
use App\Config;

class Db
{
    private static ?PDO $pdo = null;

    public static function connect(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        Config::load();
        $host = Config::get('DB_HOST', '127.0.0.1');
        $port = Config::get('DB_PORT', '3306');
        $name = Config::get('DB_NAME', 'saas_panel');
        $user = Config::get('DB_USER', 'root');
        $pass = Config::get('DB_PASS', '');

        $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
        self::$pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        return self::$pdo;
    }
}

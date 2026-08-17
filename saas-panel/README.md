# Panel SaaS — PHP Native + AdminLTE

Panel admin untuk mengelola langganan & toko SalonNext. Ini adalah **client** yang
mengonsumsi API `/api/internal/saas/*` di aplikasi Next.js — **tidak** menyentuh MongoDB
langsung. MySQL lokal hanya untuk data operasional panel (akun admin, sesi, audit,
rate-limit login).

Lihat `../IMPLEMENTATION_PLAN_SaaS_Admin_Panel.md` untuk desain lengkap.

## Prasyarat

- PHP 8.2+ (dengan ekstensi `pdo_mysql`, `curl`)
- MySQL 8 (atau MariaDB 10.6+)
- Nginx + PHP-FPM (produksi)
- Sisi Next.js: `INTERNAL_API_KEY` sudah di-set (kalau kosong, semua endpoint internal → 503)

## Setup (di host panel)

```bash
# 1. Konfigurasi environment
cp .env.example .env
# edit .env: API_BASE_URL, INTERNAL_API_KEY (sama persis dgn Next.js), DB_*, SESSION_SECRET

# 2. Buat database + jalankan migration
mysql -u root -p -e "CREATE DATABASE saas_panel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p saas_panel < migrations/001_init.sql

# 3. Seed admin pertama (password di-hash bcrypt, cocok dgn Auth.php)
php bin/seed-admin.php
#   atau non-interaktif sebagian:
#   php bin/seed-admin.php --username=owner --name="Owner" --role=super_admin

# 4. (opsional) composer install — Guzzle. ApiClient saat ini pakai cURL native,
#    jadi ini tidak wajib untuk menjalankan panel.
composer install
```

## Menjalankan (development)

```bash
php -S 127.0.0.1:8080 -t public
# buka http://127.0.0.1:8080/login
```

## Menjalankan (produksi — Nginx + PHP-FPM)

Root Nginx diarahkan ke `public/`. Contoh server block:

```nginx
server {
    listen 443 ssl;
    server_name panel.domain.com;

    root /var/www/saas-panel/public;
    index index.php;

    # (disarankan) allowlist IP admin
    # allow 1.2.3.4;
    # deny all;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    # jangan expose file sensitif
    location ~ \.(env|sql|md)$ { deny all; }
    location ^~ /src/    { deny all; }
    location ^~ /config/ { deny all; }
    location ^~ /bin/    { deny all; }
}
```

> **Penting:** transport panel ↔ Next.js **harus HTTPS**. `INTERNAL_API_KEY` bocor =
> akses penuh ke API internal. Idealnya `/api/internal/saas/*` juga di-allowlist ke IP
> server panel (lapis kedua di atas API key).

## Status implementasi

| Modul | Status |
|---|---|
| Core (Router, ApiClient, Auth, Db, Csrf, View) | ✅ |
| A — Login/Logout + rate-limit + session | ✅ |
| B — Dashboard metrik + expiring soon | ✅ |
| C — Stores list + search + detail | ✅ |
| D — Plans (list/CRUD) | ⏳ belum |
| E — Registrations (approve/reject) | ⏳ belum |
| F — Admin management | ⏳ belum |

Sidebar sudah menampilkan menu Pendaftaran & Paket, tapi route/controller/view-nya
belum dibuat (Fase 3–4). Menu tersebut akan menghasilkan 404 sampai diimplementasikan.

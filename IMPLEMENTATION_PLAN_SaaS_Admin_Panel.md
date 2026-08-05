# Implementation Plan — Panel Admin SaaS (PHP Native + AdminLTE)

> Status: **DRAFT / usulan**. Dokumen ini desain ulang panel kontrol SaaS untuk SalonNext.
> Panel dibuat **PHP native** (bukan framework berat) supaya ringan di server, tampilan
> pakai **AdminLTE 3**. Panel ini adalah *client* yang mengonsumsi API `/api/internal/saas/*`
> yang **sudah ada** di aplikasi Next.js — bukan menyentuh Master DB langsung.

Tanggal: 2026-08-05

---

## 1. Konteks & Keputusan Arsitektur

### 1.1 Kenapa PHP terpisah, bukan halaman Next.js

- **Beban server**: instance Next.js (`next start`, PM2 `next-salon`) fokus melayani tenant/POS.
  Panel admin yang jarang diakses tidak perlu menambah memori Node. PHP-FPM + Nginx jauh lebih
  ringan untuk dashboard internal yang low-traffic.
- **Isolasi keamanan**: panel bisa ditaruh di subdomain/host terpisah (mis. `panel.domain.com`)
  dengan firewall/IP allowlist sendiri, tanpa menyentuh permukaan publik aplikasi tenant.
- **Sudah dirancang begitu**: kode Next.js secara eksplisit menyebut "panel PHP" di komentar
  (`lib/provisioning.ts`, `models/PlatformAdmin.ts`, `app/api/internal/saas/*`). API internal
  memang sengaja dibuat *headless*.

### 1.2 Pembagian tanggung jawab

| Lapisan | Tanggung jawab |
|---|---|
| **Next.js (existing)** | Sumber kebenaran data. Semua tulis/baca ke Master DB lewat `/api/internal/saas/*`. Validasi bisnis, bcrypt compare, enforcement. |
| **PHP panel (baru)** | UI (AdminLTE), session admin manusia, orkestrasi pemanggilan API internal, render tabel/form. **Tidak** konek MongoDB sendiri. |

**Prinsip kunci**: PHP **tidak pernah** memegang koneksi MongoDB. Semua data lewat HTTP ke
API internal, diautentikasi dengan header `x-internal-api-key` (shared secret antar-server).

### 1.3 Diagram alur (tingkat tinggi)

```
[Admin manusia] --browser--> [PHP Panel + AdminLTE]  (session PHP)
                                     |
                                     |  HTTPS + header x-internal-api-key
                                     v
                        [Next.js /api/internal/saas/*]
                                     |
                                     v
                             [Master MongoDB]
                        (Store, SaasPlan, TenantSubscription,
                         TenantUsageCounter, PlatformAdmin, Registration)
```

Dua lapis autentikasi yang HARUS dibedakan:
1. **Antar-server**: `x-internal-api-key` (shared secret, `timingSafeCompare` di `lib/internalAuth.ts`). Kalau salah → `401`; kalau env belum di-set di sisi Next → `503` (fail-closed).
2. **Admin manusia**: username + password → di-`POST` ke `/api/internal/saas/admins/login`, bcrypt compare jalan di Next.js. PHP hanya membuat session-nya sendiri kalau balikan `success:true`.

---

## 2. Kontrak API Internal (yang SUDAH ADA — verified dari kode)

Semua endpoint di bawah butuh header `x-internal-api-key: <INTERNAL_API_KEY>`.
Base URL = origin aplikasi Next.js (mis. `https://app.domain.com`).

### 2.1 Auth admin
| Method | Path | Body | Balikan sukses |
|---|---|---|---|
| POST | `/api/internal/saas/admins/login` | `{username, password}` | `{success, data:{id,username,name,role}}` |
| GET | `/api/internal/saas/admins` | — | daftar PlatformAdmin |
| POST | `/api/internal/saas/admins` | (buat admin baru) | admin dibuat |

- Login **di-rate-limit** per-username (5x / 15 menit → `429`).
- Error login disamakan ("Username atau password salah.") untuk `not found` vs `wrong password`.
- Role: `super_admin` | `staff`. Otorisasi granular ("cuma super_admin yang boleh buat admin") **di-enforce di sisi PHP** (lihat catatan di `admins/route.ts`).

> ⚠️ **DEPRECATED (keputusan §3.4, dikonfirmasi):** akun admin panel mandiri di MySQL,
> auth PHP-native. Endpoint `/admins` + `/admins/login` & model `PlatformAdmin` Mongo
> di baris tabel ini **tidak dipakai lagi** — jangan dibangun ke panel.

### 2.2 Plans (CRUD paket langganan)
| Method | Path | Catatan |
|---|---|---|
| GET | `/api/internal/saas/plans?includeInactive=true` | list, urut `sortOrder` |
| POST | `/api/internal/saas/plans` | wajib: `name, code, limits, pricingOptions[≥1]` |
| GET | `/api/internal/saas/plans/[id]` | detail |
| PUT | `/api/internal/saas/plans/[id]` | **`code` tidak bisa diubah** (di-strip server) |
| DELETE | `/api/internal/saas/plans/[id]` | ditolak `409` kalau masih dipakai subscription `active` |

Struktur `SaasPlan` (dari `models/SaasPlan.ts`):
- `limits`: `{maxStaff, maxTransactionsPerMonth, maxWaMessagesPerMonth}`
- `pricingOptions[]`: `{billingPeriod: monthly|semiannual|annual, billingPeriodDays, price, discountLabel?}`
- `availableAddOns[]`: `{name, limitType: staff|transaction|wa, extraAmount, price, isActive}`

### 2.3 Stores (daftar toko + status langganan)
| Method | Path | Catatan |
|---|---|---|
| GET | `/api/internal/saas/stores?search=<q>` | join Store + TenantSubscription aktif |

Tiap item balikan: `{_id, name, slug, isActive, subscriptionStatus, subscriptionExpiresAt, createdAt, subscription:{planName, billingPeriod, startDate, expiresAt, activeAddOnsCount}|null}`.

### 2.4 Registrations (approve/reject pendaftaran)
| Method | Path | Body | Efek |
|---|---|---|---|
| GET | `/api/internal/saas/registrations` | — | daftar pendaftaran |
| POST | `/api/internal/saas/registrations/[id]/approve` | `{planId?, billingPeriod?}` | provisioning tenant (DB + super admin + subscription opsional), kirim WA |
| POST | `/api/internal/saas/registrations/[id]/reject` | `{rejectionReason?}` | tolak + kirim WA |

Catatan penting `approveRegistration` (`lib/provisioning.ts`): kalau `planId` dikirim maka
`billingPeriod` **wajib**; `expiresAt` dihitung `now + billingPeriodDays`; Store dibuat langsung
dengan `subscriptionStatus:'active'`. Approve **mengirim WhatsApp** ke pendaftar (efek keluar).

### 2.5 GAP — endpoint yang BELUM ada (perlu ditambah di Next.js)

Panel butuh beberapa aksi yang belum punya endpoint. Ini bagian **kerja di sisi Next.js**,
bukan PHP:

| Kebutuhan panel | Endpoint yang perlu dibuat | Prioritas |
|---|---|---|
| Detail 1 toko + histori subscription + usage counter berjalan | `GET /api/internal/saas/stores/[id]` | Tinggi |
| Ganti/renew/upgrade subscription toko manual | `POST /api/internal/saas/stores/[id]/subscription` | Tinggi |
| Suspend / aktifkan kembali toko | `PATCH /api/internal/saas/stores/[id]` (set `isActive`/`subscriptionStatus`) | Tinggi |
| Tambah add-on ke subscription aktif | `POST /api/internal/saas/stores/[id]/addons` | Sedang |
| Update / nonaktifkan PlatformAdmin | `PUT/PATCH /api/internal/saas/admins/[id]` | Sedang |
| Dashboard metrik (jumlah toko aktif, MRR, dsb) | `GET /api/internal/saas/stats` | Sedang |
| Data usage untuk 1 toko (kuota terpakai vs limit) | `GET /api/internal/saas/stores/[id]/usage` | Sedang |

> Semua endpoint baru WAJIB pakai `requireInternalApiKey()` di baris pertama, pola sama persis
> dengan route yang sudah ada. Update field cache `Store.subscriptionStatus`/`subscriptionExpiresAt`
> setiap kali subscription berubah (dipakai `auth.config.ts` untuk enforcement cepat).

---

## 3. Arsitektur Panel PHP

### 3.1 Stack
- **PHP 8.2+** native (tanpa Laravel/Symfony — cukup router mikro).
- **MySQL 8** untuk data OPERASIONAL panel: akun admin + auth, sesi, audit log,
  rate-limit login. Akses via **PDO** (prepared statements). **BATAS TEGAS:** MySQL
  hanya buat data milik panel. Data bisnis SaaS (plans, subscriptions, stores,
  usage, registrations) **TETAP di MongoDB Master**, diakses lewat internal API —
  jangan pernah ada 2 sumber kebenaran buat status langganan (yang di-enforce
  Next.js dari Mongo). Lihat §3.4.
- **AdminLTE 3** (Bootstrap 4) untuk UI — aset statis, di-vendor lokal (jangan CDN untuk panel internal).
- **Guzzle** (via Composer) atau cURL wrapper untuk HTTP ke API internal.
- **Session PHP** native (atau tabel `admin_sessions` di MySQL) untuk login admin.
- Server: **Nginx + PHP-FPM + MySQL**, host/subdomain terpisah dari Next.js.

### 3.2 Struktur direktori (usulan)
```
saas-panel/
├── public/                 # web root (Nginx root ke sini)
│   ├── index.php           # front controller / router
│   └── assets/             # AdminLTE, css, js (vendored)
├── src/
│   ├── Core/
│   │   ├── ApiClient.php    # wrapper HTTP -> /api/internal/saas/*, inject x-internal-api-key
│   │   ├── Db.php           # koneksi PDO ke MySQL (data operasional panel)
│   │   ├── Auth.php         # login/logout, session, guard super_admin (auth vs MySQL)
│   │   ├── Router.php       # routing sederhana
│   │   ├── Csrf.php         # token CSRF untuk semua form POST
│   │   └── View.php         # render template + layout AdminLTE
│   ├── Controllers/
│   │   ├── AuthController.php
│   │   ├── DashboardController.php
│   │   ├── StoreController.php
│   │   ├── PlanController.php
│   │   ├── RegistrationController.php
│   │   └── AdminController.php
│   └── Views/
│       ├── layout/ (header, sidebar, footer AdminLTE)
│       ├── auth/login.php
│       ├── dashboard/index.php
│       ├── stores/ (index, show)
│       ├── plans/ (index, form)
│       ├── registrations/index.php
│       └── admins/ (index, form)
├── config/
│   └── config.php          # baca dari ENV: API_BASE_URL, INTERNAL_API_KEY, DB_*, dll
├── migrations/             # SQL skema MySQL panel (lihat §3.4)
├── .env                    # TIDAK di-commit
├── .env.example
└── composer.json
```

### 3.3 `ApiClient` — jantung integrasi
Tanggung jawab:
- Selalu inject header `x-internal-api-key` dari ENV.
- Base URL dari `API_BASE_URL`.
- Timeout wajar (mis. 10s) + retry 1x untuk `GET` idempoten.
- Map status: `401`→paksa logout/tampilkan "key invalid", `503`→"API belum dikonfigurasi",
  `429`→"terlalu banyak percobaan", `4xx`→tampilkan `error` dari body, `5xx`→pesan generik.
- **Jangan** pernah log nilai `x-internal-api-key`.

### 3.4 Database Panel (MySQL) — data operasional, BUKAN data bisnis SaaS

Panel punya MySQL sendiri **hanya** untuk data yang dimiliki panel. Data bisnis
SaaS (plans/subscriptions/stores/usage/registrations) **tidak** ditaruh di sini —
itu tetap di MongoDB Master lewat internal API. Aturan: **status langganan cuma
punya SATU sumber kebenaran (Mongo)**, karena Next.js enforce dari situ.

| Ada di MySQL panel | Tetap di Mongo (via internal API) |
|---|---|
| Akun admin panel + auth | SaasPlan (paket) |
| Sesi login admin | TenantSubscription (langganan) |
| Audit log aksi admin | Store (toko) + status langganan cache |
| Rate-limit login (per user/IP) | TenantUsageCounter (kuota) |
| Setting panel (opsional) | Registration (pendaftaran) |

Skema awal (MySQL 8, `utf8mb4`):
```sql
CREATE TABLE platform_admins (
  id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- password_hash() PHP (bcrypt/argon2)
  name          VARCHAR(120) NOT NULL,
  role          ENUM('super_admin','staff') NOT NULL DEFAULT 'staff',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admin_sessions (           -- opsional; boleh pakai session PHP native
  id          CHAR(64) PRIMARY KEY,     -- token acak
  admin_id    BIGINT UNSIGNED NOT NULL,
  ip          VARCHAR(45) NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  CONSTRAINT fk_sess_admin FOREIGN KEY (admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  admin_id    BIGINT UNSIGNED NULL,
  action      VARCHAR(80)  NOT NULL,   -- 'approve_registration','update_plan','suspend_store',...
  target_type VARCHAR(40)  NULL,       -- 'store','plan','registration','admin'
  target_id   VARCHAR(64)  NULL,       -- id Mongo (string) dari objek yang disentuh
  meta        JSON         NULL,
  ip          VARCHAR(45)  NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_admin (admin_id), INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE login_attempts (           -- backing rate-limit login PHP-side
  id         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username   VARCHAR(64) NOT NULL,
  ip         VARCHAR(45) NOT NULL,
  success    TINYINT(1)  NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_user (username, created_at), INDEX idx_login_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Keputusan (DIKONFIRMASI 2026-08-05) — admin panel MANDIRI di MySQL:**
`platform_admins` ada di MySQL; **auth admin PHP-native** (bcrypt/argon2 via
`password_verify`) langsung ke MySQL. Panel **tidak** butuh endpoint
`POST /api/internal/saas/admins/login` maupun model `PlatformAdmin` di Mongo —
keduanya resmi **deprecated** (boleh dihapus di Next.js setelah panel live).
Admin SaaS ini **terpisah total** dari admin/user tenant (yang tetap di tenant
DB Mongo, dikelola sistem RBAC existing) — beda dunia, beda store, beda auth.

---

## 4. Modul Fungsional Panel

### Modul A — Autentikasi Admin
- Halaman login (AdminLTE login card).
- Submit → `ApiClient->post('/admins/login', {username, password})`.
- Sukses → simpan `{id, username, name, role}` di session PHP + regenerate session id.
- Guard: semua controller selain login cek session; halaman admin-management ekstra cek `role === 'super_admin'`.
- Logout → hancurkan session.
- Tampilkan sisa rate-limit secara ramah kalau `429`.

### Modul B — Dashboard (landing)
- Kartu metrik: total toko, toko aktif, toko expired/suspended, pendaftaran pending, (opsional) MRR.
- Sumber: `GET /api/internal/saas/stats` (endpoint baru) atau agregasi dari `/stores` + `/registrations` sementara belum ada `/stats`.
- Tabel ringkas: toko yang subscription-nya akan expired ≤ 7 hari.

### Modul C — Manajemen Toko (Stores)
- **List**: tabel dari `GET /stores?search=`. Kolom: nama, slug, status langganan (badge warna), plan, expiresAt, jumlah add-on. Search box → query `search`.
- **Detail** (butuh endpoint baru `GET /stores/[id]`): info toko, histori subscription, usage counter berjalan (transaksi/WA terpakai vs limit, headcount staff vs `maxStaff`).
- **Aksi**:
  - Ganti/renew/upgrade plan → form pilih plan + billingPeriod → `POST /stores/[id]/subscription` (endpoint baru).
  - Tambah add-on → `POST /stores/[id]/addons` (endpoint baru).
  - Suspend / aktifkan → `PATCH /stores/[id]` (endpoint baru).
- Badge status pakai warna konsisten: `active`=hijau, `pending_payment`=kuning, `expired`=abu, `suspended`=merah.

### Modul D — Manajemen Paket (Plans)
- **List**: `GET /plans?includeInactive=true`. Tampilkan limits + semua pricingOptions + add-on.
- **Create/Edit**: form dinamis —
  - `limits`: 3 input angka.
  - `pricingOptions`: repeater (minimal 1 baris), tiap baris `billingPeriod, billingPeriodDays, price, discountLabel`.
  - `availableAddOns`: repeater `name, limitType, extraAmount, price, isActive`.
  - Saat **edit**, field `code` **read-only** (server strip perubahan `code`).
- **Delete**: konfirmasi; tangani `409` (masih dipakai) → sarankan "nonaktifkan saja".

### Modul E — Pendaftaran (Registrations)
- **List pending**: `GET /registrations`.
- **Approve**: modal pilih plan + billingPeriod (opsional; boleh approve tanpa plan). Peringatkan **"aksi ini mengirim WhatsApp ke pendaftar & membuat database tenant"** sebelum submit → `POST /registrations/[id]/approve`.
- **Reject**: modal alasan → `POST /registrations/[id]/reject` (juga kirim WA).
- Karena approve/reject punya efek keluar & tak mudah dibatalkan, **wajib konfirmasi 2 langkah**.

### Modul F — Manajemen Admin Panel (Platform Admins)
- Hanya `super_admin`.
- List `GET /admins`; create `POST /admins`; edit/nonaktif `PUT /admins/[id]` (endpoint baru).
- Password tak pernah ditampilkan; reset = set password baru (bcrypt di sisi Next.js via pre-save hook `PlatformAdmin`).

---

## 5. Keamanan (wajib, bukan opsional)

1. **Transport**: panel ↔ Next.js **HARUS HTTPS**. `x-internal-api-key` bocor = akses penuh ke API internal.
2. **Penyimpanan key**: `INTERNAL_API_KEY` hanya di ENV server PHP (bukan di kode, bukan di repo). `.env` masuk `.gitignore`.
3. **Network allowlist**: idealnya API `/api/internal/saas/*` hanya menerima dari IP server PHP (firewall / Nginx `allow`/`deny`), sebagai lapis kedua di atas API key.
4. **Session PHP**: `session.cookie_httponly=1`, `cookie_secure=1`, `cookie_samesite=Lax`, regenerate id saat login, timeout idle.
5. **CSRF**: semua form `POST/PUT/DELETE` pakai token CSRF (`Csrf.php`).
6. **Rate limit login**: sudah ada di sisi Next (per-username). Tambahan: PHP boleh throttle per-IP.
7. **Otorisasi role**: enforce `super_admin` untuk Modul F & aksi destruktif — karena API `/admins` **mengandalkan PHP** untuk cek ini.
8. **Audit sederhana**: log aksi admin (siapa approve/reject/ubah plan) di sisi panel (file/DB kecil) — opsional tahap awal, disarankan.
9. **Jangan log rahasia**: filter `x-internal-api-key`, password, token dari semua log.

---

## 6. Konfigurasi Environment

### Sisi Next.js (`.env.local` / `.env.production`)
```
INTERNAL_API_KEY=<random panjang, mis. 64 hex>   # WAJIB di-set; kalau kosong endpoint 503
```
> Generate: `openssl rand -hex 32`. Belum di-set = seluruh `/api/internal/saas/*` fail-closed (503).

### Sisi Panel PHP (`.env`)
```
API_BASE_URL=https://app.domain.com
INTERNAL_API_KEY=<sama persis dengan yang di Next.js>
APP_ENV=production
SESSION_LIFETIME=3600
# MySQL panel (data operasional: admin/auth/audit) — BUKAN data bisnis SaaS
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=saas_panel
DB_USER=saas_panel
DB_PASS=<password kuat>
```

---

## 7. Rencana Eksekusi (fase bertahap)

### Fase 0 — Prasyarat (sisi Next.js) — ~0.5 hari
- [ ] Set `INTERNAL_API_KEY` di ENV Next.js + rebuild + `pm2 restart` (buat endpoint DATA: plans/stores/registrations).
- [ ] Smoke test endpoint DATA existing pakai `curl` + header key.
> **Admin panel TIDAK di-bootstrap lewat Mongo** (keputusan §3.4). Akun admin SaaS mandiri
> di MySQL — admin pertama di-seed saat setup MySQL (Fase 1). Model `PlatformAdmin` +
> endpoint `/admins` & `/admins/login` di Mongo resmi **deprecated**, tidak dipakai panel.

### Fase 1 — Skeleton panel + Auth (Modul A) — ~1 hari
- [ ] Setup repo `saas-panel/`, Composer, AdminLTE vendored, Nginx+PHP-FPM.
- [ ] **Setup MySQL**: buat DB `saas_panel`, jalankan migration (§3.4), seed 1 admin `super_admin`.
- [ ] `ApiClient`, `Db` (PDO), `Auth` (bcrypt vs MySQL), `Router`, `View`, `Csrf`.
- [ ] Halaman login + session + guard. **Milestone: bisa login sebagai admin (dari MySQL).**

### Fase 2 — Read-only (Modul B, C-list, D-list, E-list) — ~1.5 hari
- [ ] Dashboard metrik (agregasi sementara dari endpoint existing).
- [ ] List Stores (+search), List Plans, List Registrations.
- [ ] **Milestone: admin bisa lihat seluruh data lewat panel.**

### Fase 3 — Aksi non-destruktif (Modul D full) — ~1.5 hari
- [ ] Create/Edit/Delete Plan (repeater pricingOptions & addOns).
- [ ] Tangani semua edge case balikan (`409`, validasi).
- [ ] **Milestone: kelola paket end-to-end dari UI.**

### Fase 4 — Aksi berefek keluar (Modul E + C-aksi) — ~2 hari
- [ ] **(Next.js)** buat endpoint baru: `GET /stores/[id]`, `PATCH /stores/[id]`, `POST /stores/[id]/subscription`, `POST /stores/[id]/addons`, `GET /stores/[id]/usage`.
- [ ] Approve/Reject registrasi (konfirmasi 2 langkah + warning WA).
- [ ] Detail toko + ganti/renew/upgrade plan + suspend + add-on.
- [ ] **Milestone: lifecycle langganan penuh terkendali dari panel.**

### Fase 5 — Admin management + hardening (Modul F) — ~1 hari
- [ ] **(Next.js)** `PUT/PATCH /admins/[id]`.
- [ ] CRUD PlatformAdmin (super_admin only), reset password.
- [ ] Audit log, security review, finalisasi.

**Estimasi total: ~8–9 hari kerja** (belum termasuk integrasi pembayaran/Xendit SaaS — lihat §9).

---

## 8. Titik Integrasi dengan Kode Existing (referensi verified)

| Yang dipakai panel | File sumber di repo Next.js |
|---|---|
| Auth antar-server | `lib/internalAuth.ts` (`requireInternalApiKey`, header `x-internal-api-key`) |
| Model paket | `models/SaasPlan.ts` |
| Model langganan (+snapshot, addOns, `lastXenditInvoiceId`, `autoRenew`) | `models/TenantSubscription.ts` |
| Counter kuota berjalan | `models/TenantUsageCounter.ts` |
| Cache status di Store | `models/Store.ts` (`subscriptionStatus`, `subscriptionExpiresAt`) |
| Admin panel (bcrypt) | `models/PlatformAdmin.ts` |
| Pendaftaran | `models/Registration.ts` |
| Provisioning tenant | `lib/provisioning.ts` (`approveRegistration`, `rejectRegistration`) |
| Enforcement kuota | `lib/subscriptionEnforcement.ts` (`tryConsumeUsage`, `checkStaffLimit`) |
| Routes existing | `app/api/internal/saas/{plans,stores,registrations,admins}/**` |

---

## 9. Di Luar Scope (tahap berikutnya)

- **Integrasi pembayaran SaaS (Xendit)**: `models/TenantSubscription.ts` sudah menyiapkan
  `lastXenditInvoiceId` & komentar menyebut tipe invoice `saas_subscription`, tapi **`lib/xendit.ts`
  belum ada** dan webhook Xendit yang ada (`app/api/payments/xendit/*`) hanya untuk POS tenant.
  Auto-provisioning via webhook pembayaran adalah fase terpisah.
- **Self-service tenant** (halaman upgrade/billing di sisi tenant Next.js) — bukan panel admin.
- **Cron expiry**: perlu dicek/ dibuat job yang set `expired`/`suspended` saat `expiresAt` lewat
  + update cache `Store`. Belum ada cron subscription (`app/api/cron/*` hanya WA/voucher/stock).

---

## 10. Risiko & Catatan

- **Bootstrap admin pertama**: admin SaaS **mandiri di MySQL** (keputusan §3.4). Admin pertama
  di-**seed saat setup MySQL (Fase 1)** — INSERT row `platform_admins` dengan `password_hash`
  hasil `password_hash()` PHP (bcrypt/argon2). **Bukan** lewat curl `POST /admins` Mongo:
  endpoint `/admins`/`/admins/login` + model `PlatformAdmin` Mongo resmi **deprecated**, tidak
  dipakai panel. Validasi seed: `username` unik, `password` ≥8 char, `name` wajib, `role` diisi
  `super_admin` untuk admin pertama.
- **Field cache Store bisa basi**: setiap endpoint baru yang mengubah subscription HARUS ikut
  memperbarui `Store.subscriptionStatus`/`subscriptionExpiresAt`, kalau tidak `auth.config.ts`
  bakal salah menilai status login tenant.
- **Efek keluar (WA)**: approve/reject mengirim WhatsApp lewat Fonnte. Saat uji coba, pakai data
  pendaftaran dummy dengan nomor sendiri, jangan pendaftaran tenant asli.
- **`code` plan immutable**: UI harus mencerminkan ini (read-only saat edit) agar admin tak bingung.
- **Migrasi dari `/admin/cabang` + PIN lama**: `PlatformAdmin` + panel PHP menggantikan sistem
  `x-admin-pin`. Rencanakan sunset `app/api/admin/*` & `app/admin/cabang` setelah panel live
  (komentar di kode: "PIN lama, bakal dihapus begitu panel PHP live").

---

## 11. Ringkasan Kerja per Sisi

**Sisi Next.js (TypeScript) — 7 endpoint baru + prasyarat:**
`GET/PATCH /stores/[id]`, `POST /stores/[id]/subscription`, `POST /stores/[id]/addons`,
`GET /stores/[id]/usage`, `GET /stats`, `PUT/PATCH /admins/[id]`; set `INTERNAL_API_KEY`;
seed admin pertama; (nanti) cron expiry.

**Sisi Panel PHP (baru) — 6 controller + core + AdminLTE + MySQL lokal:**
Auth, Dashboard, Stores, Plans, Registrations, Admins. **MySQL panel** dipakai buat
data operasional (akun admin+auth, sesi, audit, rate-limit login); **data bisnis
SaaS diambil lewat `ApiClient` ke Mongo**, bukan MySQL. Auth admin PHP-native
(vs MySQL) → endpoint `/admins/login` + model `PlatformAdmin` Mongo jadi deprecated.

> Setelah plan ini disetujui, langkah pertama yang aman & cepat: **Fase 0** (set key + seed admin +
> smoke test API existing), karena itu memvalidasi seluruh fondasi tanpa menulis kode panel.


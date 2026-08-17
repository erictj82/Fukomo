-- Panel SaaS — skema MySQL 8 (data OPERASIONAL panel saja).
-- Data bisnis SaaS (plans/subscriptions/stores/usage/registrations) TIDAK di sini —
-- itu tetap di MongoDB Master, diakses via internal API. Lihat plan §3.4.
-- Jalankan: mysql -u <user> -p <db> < migrations/001_init.sql

CREATE TABLE IF NOT EXISTS platform_admins (
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

CREATE TABLE IF NOT EXISTS admin_sessions (
  id          CHAR(64) PRIMARY KEY,     -- token acak
  admin_id    BIGINT UNSIGNED NOT NULL,
  ip          VARCHAR(45) NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  CONSTRAINT fk_sess_admin FOREIGN KEY (admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
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

CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username   VARCHAR(64) NOT NULL,
  ip         VARCHAR(45) NOT NULL,
  success    TINYINT(1)  NOT NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_user (username, created_at), INDEX idx_login_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

<?php use App\Core\View; use App\Core\Auth; $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
function navActive($path, $prefix) { return str_starts_with($path, $prefix) ? 'active' : ''; } ?>
<aside class="main-sidebar sidebar-dark-primary elevation-4">
  <a href="/dashboard" class="brand-link text-center">
    <span class="brand-text font-weight-light"><i class="fas fa-crown mr-1"></i>Panel SaaS</span>
  </a>
  <div class="sidebar">
    <nav class="mt-2">
      <ul class="nav nav-pills nav-sidebar flex-column" role="menu">
        <li class="nav-item">
          <a href="/dashboard" class="nav-link <?= navActive($path, '/dashboard') ?: ($path === '/' ? 'active' : '') ?>">
            <i class="nav-icon fas fa-tachometer-alt"></i><p>Dashboard</p>
          </a>
        </li>
        <li class="nav-item">
          <a href="/stores" class="nav-link <?= navActive($path, '/stores') ?>">
            <i class="nav-icon fas fa-store"></i><p>Toko / Tenant</p>
          </a>
        </li>
        <li class="nav-item">
          <a href="/registrations" class="nav-link <?= navActive($path, '/registrations') ?>">
            <i class="nav-icon fas fa-user-plus"></i><p>Pendaftaran</p>
          </a>
        </li>
        <li class="nav-item">
          <a href="/plans" class="nav-link <?= navActive($path, '/plans') ?>">
            <i class="nav-icon fas fa-layer-group"></i><p>Paket / Plan</p>
          </a>
        </li>
        <?php if ((Auth::user()['role'] ?? '') === 'super_admin'): ?>
        <li class="nav-item">
          <a href="/admins" class="nav-link <?= navActive($path, '/admins') ?>">
            <i class="nav-icon fas fa-user-shield"></i><p>Admin Panel</p>
          </a>
        </li>
        <?php endif; ?>
      </ul>
    </nav>
  </div>
</aside>

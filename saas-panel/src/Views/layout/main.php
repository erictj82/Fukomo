<?php use App\Core\View; use App\Core\Auth; $u = Auth::user(); ?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= View::e($pageTitle) ?> — Panel SaaS</title>
  <!-- AdminLTE 3 (CDN) -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css">
</head>
<body class="hold-transition sidebar-mini layout-fixed">
<div class="wrapper">

  <!-- Navbar -->
  <nav class="main-header navbar navbar-expand navbar-white navbar-light">
    <ul class="navbar-nav">
      <li class="nav-item"><a class="nav-link" data-widget="pushmenu" href="#" role="button"><i class="fas fa-bars"></i></a></li>
    </ul>
    <ul class="navbar-nav ml-auto">
      <li class="nav-item">
        <span class="nav-link"><i class="fas fa-user mr-1"></i><?= View::e($u['name'] ?? '') ?>
          <small class="badge badge-<?= ($u['role'] ?? '') === 'super_admin' ? 'danger' : 'secondary' ?>"><?= View::e($u['role'] ?? '') ?></small>
        </span>
      </li>
      <li class="nav-item">
        <form method="post" action="/logout" style="display:inline">
          <?= \App\Core\Csrf::field() ?>
          <button class="btn btn-link nav-link" type="submit"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </form>
      </li>
    </ul>
  </nav>

  <?php require __DIR__ . '/sidebar.php'; ?>

  <div class="content-wrapper">
    <section class="content pt-3">
      <div class="container-fluid">
        <?php if (!empty($_SESSION['flash_error'])): ?>
          <div class="alert alert-danger"><?= View::e($_SESSION['flash_error']) ?></div>
          <?php unset($_SESSION['flash_error']); ?>
        <?php endif; ?>
        <?php if (!empty($_SESSION['flash_success'])): ?>
          <div class="alert alert-success"><?= View::e($_SESSION['flash_success']) ?></div>
          <?php unset($_SESSION['flash_success']); ?>
        <?php endif; ?>
        <?= $content ?>
      </div>
    </section>
  </div>

  <footer class="main-footer text-sm">
    <strong>Panel SaaS</strong> — kontrol langganan &amp; toko.
  </footer>
</div>

<script src="https://cdn.jsdelivr.net/npm/jquery@3.7/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js"></script>
</body>
</html>

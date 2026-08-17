<?php use App\Core\View; use App\Core\Csrf; ?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login — Panel SaaS</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/css/adminlte.min.css">
</head>
<body class="hold-transition login-page">
<div class="login-box">
  <div class="login-logo">
    <i class="fas fa-crown mr-1"></i><b>Panel</b> SaaS
  </div>
  <div class="card">
    <div class="card-body login-card-body">
      <p class="login-box-msg">Masuk untuk mengelola langganan &amp; toko</p>

      <?php if (!empty($_SESSION['flash_error'])): ?>
        <div class="alert alert-danger py-2"><?= View::e($_SESSION['flash_error']) ?></div>
        <?php unset($_SESSION['flash_error']); ?>
      <?php endif; ?>

      <form method="post" action="/login">
        <?= Csrf::field() ?>
        <div class="input-group mb-3">
          <input type="text" name="username" class="form-control" placeholder="Username"
                 required autofocus autocomplete="username">
          <div class="input-group-append">
            <div class="input-group-text"><span class="fas fa-user"></span></div>
          </div>
        </div>
        <div class="input-group mb-3">
          <input type="password" name="password" class="form-control" placeholder="Password"
                 required autocomplete="current-password">
          <div class="input-group-append">
            <div class="input-group-text"><span class="fas fa-lock"></span></div>
          </div>
        </div>
        <div class="row">
          <div class="col-12">
            <button type="submit" class="btn btn-primary btn-block">
              <i class="fas fa-sign-in-alt mr-1"></i> Masuk
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/admin-lte@3.2/dist/js/adminlte.min.js"></script>
</body>
</html>

<?php use App\Core\View; ?>
<div class="content-header px-0">
  <h1 class="m-0 text-dark">Dashboard</h1>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-warning">
    <i class="fas fa-exclamation-triangle mr-1"></i>
    Gagal memuat metrik: <?= View::e($error) ?>
  </div>
<?php else:
  $s = $stats['stores'] ?? [];
  $reg = $stats['registrations'] ?? [];
  $expiring = $stats['expiringSoon'] ?? [];
?>
  <div class="row">
    <div class="col-lg-3 col-6">
      <div class="small-box bg-info">
        <div class="inner">
          <h3><?= (int)($s['total'] ?? 0) ?></h3>
          <p>Total Toko</p>
        </div>
        <div class="icon"><i class="fas fa-store"></i></div>
        <a href="/stores" class="small-box-footer">Lihat semua <i class="fas fa-arrow-circle-right"></i></a>
      </div>
    </div>
    <div class="col-lg-3 col-6">
      <div class="small-box bg-success">
        <div class="inner">
          <h3><?= (int)($s['active'] ?? 0) ?></h3>
          <p>Langganan Aktif</p>
        </div>
        <div class="icon"><i class="fas fa-check-circle"></i></div>
      </div>
    </div>
    <div class="col-lg-3 col-6">
      <div class="small-box bg-secondary">
        <div class="inner">
          <h3><?= (int)($s['expired'] ?? 0) ?></h3>
          <p>Expired</p>
        </div>
        <div class="icon"><i class="fas fa-hourglass-end"></i></div>
      </div>
    </div>
    <div class="col-lg-3 col-6">
      <div class="small-box bg-danger">
        <div class="inner">
          <h3><?= (int)($s['suspended'] ?? 0) ?></h3>
          <p>Suspended</p>
        </div>
        <div class="icon"><i class="fas fa-ban"></i></div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-lg-3 col-6">
      <div class="small-box bg-warning">
        <div class="inner">
          <h3><?= (int)($reg['pending'] ?? 0) ?></h3>
          <p>Pendaftaran Pending</p>
        </div>
        <div class="icon"><i class="fas fa-user-plus"></i></div>
        <a href="/registrations" class="small-box-footer">Proses <i class="fas fa-arrow-circle-right"></i></a>
      </div>
    </div>
    <div class="col-lg-3 col-6">
      <div class="small-box bg-light">
        <div class="inner">
          <h3><?= (int)($s['pendingPayment'] ?? 0) ?></h3>
          <p>Menunggu Pembayaran</p>
        </div>
        <div class="icon"><i class="fas fa-money-bill-wave"></i></div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3 class="card-title"><i class="fas fa-clock mr-1"></i> Langganan akan berakhir ≤ 7 hari</h3>
    </div>
    <div class="card-body p-0">
      <?php if (empty($expiring)): ?>
        <p class="text-muted p-3 mb-0">Tidak ada langganan yang akan berakhir dalam 7 hari ke depan.</p>
      <?php else: ?>
        <table class="table table-sm table-hover mb-0">
          <thead>
            <tr><th>Toko</th><th>Slug</th><th>Berakhir</th><th class="text-right">Sisa Hari</th></tr>
          </thead>
          <tbody>
            <?php foreach ($expiring as $e): ?>
              <tr>
                <td><a href="/stores/<?= View::e($e['_id']) ?>"><?= View::e($e['name']) ?></a></td>
                <td><code><?= View::e($e['slug']) ?></code></td>
                <td><?= View::e(substr((string)($e['expiresAt'] ?? ''), 0, 10)) ?></td>
                <td class="text-right">
                  <span class="badge badge-<?= (int)$e['daysRemaining'] <= 3 ? 'danger' : 'warning' ?>">
                    <?= (int)$e['daysRemaining'] ?> hari
                  </span>
                </td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      <?php endif; ?>
    </div>
  </div>
<?php endif; ?>

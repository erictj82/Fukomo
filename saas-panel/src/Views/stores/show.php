<?php use App\Core\View;
if (!function_exists('statusBadge')) {
    function statusBadge(?string $status): string {
        $map = ['active'=>'success','pending_payment'=>'warning','expired'=>'secondary','suspended'=>'danger'];
        $cls = $map[$status] ?? 'light';
        return '<span class="badge badge-' . $cls . '">' . View::e($status ?: 'no-sub') . '</span>';
    }
}
?>
<div class="content-header px-0">
  <a href="/stores" class="btn btn-sm btn-default mb-2"><i class="fas fa-arrow-left"></i> Kembali</a>
</div>

<?php if (!empty($error) || empty($store)): ?>
  <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error ?? 'Data toko tidak ditemukan.') ?></div>
<?php else:
  $s = $store['store'] ?? [];
  $subs = $store['subscriptions'] ?? [];
  $usage = $store['currentUsage'] ?? null;
?>
  <div class="row">
    <div class="col-md-5">
      <div class="card">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-store mr-1"></i> <?= View::e($s['name'] ?? '') ?></h3></div>
        <div class="card-body">
          <dl class="row mb-0">
            <dt class="col-sm-4">Slug</dt><dd class="col-sm-8"><code><?= View::e($s['slug'] ?? '') ?></code></dd>
            <dt class="col-sm-4">Status</dt><dd class="col-sm-8"><?= statusBadge($s['subscriptionStatus'] ?? null) ?></dd>
            <dt class="col-sm-4">Aktif?</dt><dd class="col-sm-8"><?= !empty($s['isActive']) ? '<span class="text-success">Ya</span>' : '<span class="text-danger">Tidak</span>' ?></dd>
            <dt class="col-sm-4">Berakhir</dt><dd class="col-sm-8"><?= View::e(substr((string)($s['subscriptionExpiresAt'] ?? ''), 0, 10)) ?: '—' ?></dd>
            <dt class="col-sm-4">Dibuat</dt><dd class="col-sm-8"><?= View::e(substr((string)($s['createdAt'] ?? ''), 0, 10)) ?></dd>
          </dl>
        </div>
      </div>
    </div>

    <div class="col-md-7">
      <div class="card">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-chart-line mr-1"></i> Kuota Periode Berjalan</h3></div>
        <div class="card-body">
          <?php if (!$usage): ?>
            <p class="text-muted mb-0">Tidak ada langganan aktif — kuota tidak berjalan.</p>
          <?php else: ?>
            <p class="text-sm text-muted">
              Periode: <?= View::e(substr((string)($usage['periodStart'] ?? ''), 0, 10)) ?>
              → <?= View::e(substr((string)($usage['periodEnd'] ?? ''), 0, 10)) ?>
            </p>
            <div class="d-flex justify-content-between"><span>Transaksi</span><strong><?= (int)($usage['transactionsCount'] ?? 0) ?></strong></div>
            <div class="d-flex justify-content-between"><span>Pesan WA</span><strong><?= (int)($usage['waMessagesCount'] ?? 0) ?></strong></div>
            <div class="d-flex justify-content-between"><span>Staff (snapshot)</span><strong><?= (int)($usage['staffCountSnapshot'] ?? 0) ?></strong></div>
          <?php endif; ?>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3 class="card-title"><i class="fas fa-history mr-1"></i> Riwayat Langganan</h3></div>
    <div class="card-body p-0">
      <?php if (empty($subs)): ?>
        <p class="text-muted p-3 mb-0">Belum ada riwayat langganan.</p>
      <?php else: ?>
        <table class="table table-sm mb-0">
          <thead><tr><th>Plan</th><th>Periode</th><th>Harga</th><th>Status</th><th>Mulai</th><th>Berakhir</th><th class="text-center">Add-on</th></tr></thead>
          <tbody>
            <?php foreach ($subs as $sub): $snap = $sub['planSnapshot'] ?? []; ?>
              <tr>
                <td><?= View::e($snap['name'] ?? '—') ?></td>
                <td><?= View::e($sub['billingPeriod'] ?? '') ?></td>
                <td><?= number_format((float)($sub['pricePaid'] ?? 0), 0, ',', '.') ?></td>
                <td><?= statusBadge($sub['status'] ?? null) ?></td>
                <td><?= View::e(substr((string)($sub['startDate'] ?? ''), 0, 10)) ?></td>
                <td><?= View::e(substr((string)($sub['expiresAt'] ?? ''), 0, 10)) ?></td>
                <td class="text-center"><?= count($sub['activeAddOns'] ?? []) ?></td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      <?php endif; ?>
    </div>
  </div>
<?php endif; ?>

<?php use App\Core\View;
// Badge warna konsisten: active=hijau, pending_payment=kuning, expired=abu, suspended=merah.
if (!function_exists('statusBadge')) {
    function statusBadge(?string $status): string {
        $map = [
            'active' => 'success', 'pending_payment' => 'warning',
            'expired' => 'secondary', 'suspended' => 'danger',
        ];
        $cls = $map[$status] ?? 'light';
        $label = $status ?: 'no-sub';
        return '<span class="badge badge-' . $cls . '">' . View::e($label) . '</span>';
    }
}
?>
<div class="content-header px-0 d-flex justify-content-between align-items-center">
  <h1 class="m-0 text-dark">Toko / Tenant</h1>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<div class="card">
  <div class="card-header">
    <form method="get" action="/stores" class="form-inline">
      <div class="input-group">
        <input type="text" name="search" class="form-control form-control-sm" style="width:260px"
               placeholder="Cari nama / slug…" value="<?= View::e($search ?? '') ?>">
        <div class="input-group-append">
          <button class="btn btn-sm btn-primary" type="submit"><i class="fas fa-search"></i></button>
          <?php if (!empty($search)): ?>
            <a href="/stores" class="btn btn-sm btn-default">Reset</a>
          <?php endif; ?>
        </div>
      </div>
    </form>
  </div>
  <div class="card-body p-0">
    <table class="table table-hover mb-0">
      <thead>
        <tr>
          <th>Nama</th><th>Slug</th><th>Status</th><th>Plan</th>
          <th>Periode</th><th>Berakhir</th><th class="text-center">Add-on</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($stores)): ?>
          <tr><td colspan="7" class="text-center text-muted py-4">Tidak ada toko.</td></tr>
        <?php else: foreach ($stores as $st):
          $sub = $st['subscription'] ?? null; ?>
          <tr>
            <td><a href="/stores/<?= View::e($st['_id']) ?>"><strong><?= View::e($st['name']) ?></strong></a></td>
            <td><code><?= View::e($st['slug']) ?></code></td>
            <td><?= statusBadge($st['subscriptionStatus'] ?? null) ?></td>
            <td><?= $sub ? View::e($sub['planName']) : '<span class="text-muted">—</span>' ?></td>
            <td><?= $sub ? View::e($sub['billingPeriod']) : '<span class="text-muted">—</span>' ?></td>
            <td><?= View::e(substr((string)($st['subscriptionExpiresAt'] ?? ''), 0, 10)) ?: '<span class="text-muted">—</span>' ?></td>
            <td class="text-center"><?= $sub ? (int)$sub['activeAddOnsCount'] : 0 ?></td>
          </tr>
        <?php endforeach; endif; ?>
      </tbody>
    </table>
  </div>
</div>

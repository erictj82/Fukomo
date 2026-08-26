<?php use App\Core\View; use App\Core\Csrf;
// -1 ditampilkan sebagai ∞ (unlimited); 0 tetap 0 (fitur mati).
$fmtLim = fn($v) => (int)$v < 0 ? '∞' : (string)(int)$v; ?>
<div class="content-header px-0 d-flex justify-content-between align-items-center">
  <h1 class="m-0 text-dark">Paket / Plan</h1>
  <a href="/plans/create" class="btn btn-primary btn-sm"><i class="fas fa-plus mr-1"></i> Buat Plan</a>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<div class="card">
  <div class="card-body p-0">
    <table class="table table-hover mb-0">
      <thead>
        <tr>
          <th>Nama</th><th>Code</th><th>Limit (Staff / Trx / WA)</th>
          <th class="text-center">Harga</th><th class="text-center">Add-on</th>
          <th class="text-center">Status</th><th class="text-right">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($plans)): ?>
          <tr><td colspan="7" class="text-center text-muted py-4">Belum ada plan. Buat yang pertama.</td></tr>
        <?php else: foreach ($plans as $p):
          $lim = $p['limits'] ?? []; ?>
          <tr>
            <td><strong><?= View::e($p['name']) ?></strong>
              <?php if (!empty($p['description'])): ?>
                <br><small class="text-muted"><?= View::e($p['description']) ?></small>
              <?php endif; ?>
            </td>
            <td><code><?= View::e($p['code']) ?></code></td>
            <td>
              <?= $fmtLim($lim['maxStaff'] ?? 0) ?> /
              <?= $fmtLim($lim['maxTransactionsPerMonth'] ?? 0) ?> /
              <?= $fmtLim($lim['maxWaMessagesPerMonth'] ?? 0) ?>
            </td>
            <td class="text-center"><?= count($p['pricingOptions'] ?? []) ?> opsi</td>
            <td class="text-center"><?= count($p['availableAddOns'] ?? []) ?></td>
            <td class="text-center">
              <?php if (!empty($p['isActive'])): ?>
                <span class="badge badge-success">aktif</span>
              <?php else: ?>
                <span class="badge badge-secondary">nonaktif</span>
              <?php endif; ?>
            </td>
            <td class="text-right">
              <a href="/plans/<?= View::e($p['_id']) ?>/edit" class="btn btn-xs btn-default"><i class="fas fa-edit"></i></a>
              <form method="post" action="/plans/<?= View::e($p['_id']) ?>" style="display:inline"
                    onsubmit="return confirm('Hapus plan &quot;<?= View::e($p['name']) ?>&quot;? Kalau masih dipakai subscription aktif, hapus akan ditolak — nonaktifkan saja.');">
                <?= Csrf::fieldWithMethod('DELETE') ?>
                <button type="submit" class="btn btn-xs btn-danger"><i class="fas fa-trash"></i></button>
              </form>
            </td>
          </tr>
        <?php endforeach; endif; ?>
      </tbody>
    </table>
  </div>
</div>

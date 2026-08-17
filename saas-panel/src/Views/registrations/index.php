<?php use App\Core\View;
  $badge = ['pending' => 'warning', 'approved' => 'success', 'rejected' => 'danger'];
?>
<div class="content-header px-0">
  <h1 class="m-0 text-dark">Pendaftaran</h1>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<div class="btn-group btn-group-sm mb-3" role="group">
  <?php foreach (['' => 'Semua', 'pending' => 'Pending', 'approved' => 'Approved', 'rejected' => 'Rejected'] as $val => $label): ?>
    <a href="/registrations<?= $val ? '?status=' . $val : '' ?>"
       class="btn btn-<?= $status === $val ? 'primary' : 'default' ?>"><?= $label ?></a>
  <?php endforeach; ?>
</div>

<div class="card">
  <div class="card-body p-0">
    <table class="table table-hover mb-0">
      <thead>
        <tr>
          <th>Toko</th><th>Owner</th><th>Kontak</th>
          <th class="text-center">Status</th><th>Tanggal</th><th class="text-right">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($registrations)): ?>
          <tr><td colspan="6" class="text-center text-muted py-4">Belum ada pendaftaran.</td></tr>
        <?php else: foreach ($registrations as $r): ?>
          <tr>
            <td><strong><?= View::e($r['storeName']) ?></strong><br>
              <small class="text-muted"><code><?= View::e($r['slug']) ?></code></small></td>
            <td><?= View::e($r['ownerName']) ?></td>
            <td><small><?= View::e($r['email']) ?><br><?= View::e($r['phone']) ?></small></td>
            <td class="text-center">
              <span class="badge badge-<?= $badge[$r['status']] ?? 'secondary' ?>"><?= View::e($r['status']) ?></span>
            </td>
            <td><small><?= View::e(date('d M Y H:i', strtotime($r['createdAt'] ?? 'now'))) ?></small></td>
            <td class="text-right">
              <a href="/registrations/<?= View::e($r['_id']) ?>" class="btn btn-xs btn-info">
                <i class="fas fa-eye mr-1"></i><?= ($r['status'] ?? '') === 'pending' ? 'Tinjau' : 'Detail' ?>
              </a>
            </td>
          </tr>
        <?php endforeach; endif; ?>
      </tbody>
    </table>
  </div>
</div>

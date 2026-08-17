<?php use App\Core\View; use App\Core\Csrf;
  $roleBadge = ['super_admin' => 'primary', 'staff' => 'secondary'];
?>
<div class="content-header px-0 d-flex justify-content-between align-items-center">
  <h1 class="m-0 text-dark">Admin Panel</h1>
  <a href="/admins/create" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Tambah Admin</a>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-warning"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<div class="card">
  <div class="card-body p-0">
    <table class="table table-hover mb-0">
      <thead>
        <tr>
          <th>Username</th><th>Nama</th><th class="text-center">Role</th>
          <th class="text-center">Aktif</th><th>Login Terakhir</th><th class="text-right">Aksi</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($admins)): ?>
          <tr><td colspan="6" class="text-center text-muted py-4">Belum ada admin.</td></tr>
        <?php else: foreach ($admins as $a): $isMe = (int) $a['id'] === $meId; ?>
          <tr>
            <td><code><?= View::e($a['username']) ?></code>
              <?php if ($isMe): ?><span class="badge badge-info ml-1">Anda</span><?php endif; ?></td>
            <td><?= View::e($a['name']) ?></td>
            <td class="text-center">
              <span class="badge badge-<?= $roleBadge[$a['role']] ?? 'light' ?>"><?= View::e($a['role']) ?></span>
            </td>
            <td class="text-center">
              <?= (int) $a['is_active'] === 1
                ? '<span class="text-success"><i class="fas fa-check-circle"></i></span>'
                : '<span class="text-muted"><i class="fas fa-times-circle"></i></span>' ?>
            </td>
            <td><small><?= $a['last_login_at']
                ? View::e(date('d M Y H:i', strtotime($a['last_login_at'])))
                : '<span class="text-muted">—</span>' ?></small></td>
            <td class="text-right">
              <a href="/admins/<?= (int) $a['id'] ?>/edit" class="btn btn-xs btn-info"><i class="fas fa-edit"></i></a>
              <?php if (!$isMe): ?>
                <form method="POST" action="/admins/<?= (int) $a['id'] ?>" class="d-inline"
                      onsubmit="return confirm('Hapus admin &quot;<?= View::e($a['username']) ?>&quot;?');">
                  <?= Csrf::fieldWithMethod('DELETE') ?>
                  <button type="submit" class="btn btn-xs btn-danger"><i class="fas fa-trash"></i></button>
                </form>
              <?php endif; ?>
            </td>
          </tr>
        <?php endforeach; endif; ?>
      </tbody>
    </table>
  </div>
</div>

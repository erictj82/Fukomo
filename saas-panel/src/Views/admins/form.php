<?php
use App\Core\View;
use App\Core\Csrf;

$isEdit  = !empty($admin['id']);
$id      = $admin['id'] ?? '';
$action  = $isEdit ? "/admins/$id" : '/admins';
?>
<div class="content-header px-0">
  <a href="/admins" class="btn btn-sm btn-default mb-2"><i class="fas fa-arrow-left"></i> Kembali</a>
  <h1 class="m-0 text-dark"><?= $isEdit ? 'Edit Admin' : 'Tambah Admin' ?></h1>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-danger"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<form method="post" action="<?= View::e($action) ?>">
  <?= $isEdit ? Csrf::fieldWithMethod('PUT') : Csrf::field() ?>

  <div class="card">
    <div class="card-header"><h3 class="card-title">Info Admin</h3></div>
    <div class="card-body">
      <div class="form-row">
        <div class="form-group col-md-6">
          <label>Username <span class="text-danger">*</span>
            <?php if ($isEdit): ?><small class="text-muted">(tidak bisa diubah)</small><?php endif; ?>
          </label>
          <input type="text" name="username" class="form-control"
                 value="<?= View::e($admin['username'] ?? '') ?>"
                 <?= $isEdit ? 'readonly' : 'required' ?>
                 pattern="[a-zA-Z0-9_.-]+" placeholder="admin123">
          <small class="form-text text-muted">Huruf, angka, titik, strip, underscore.</small>
        </div>
        <div class="form-group col-md-6">
          <label>Nama Lengkap <span class="text-danger">*</span></label>
          <input type="text" name="name" class="form-control" required
                 value="<?= View::e($admin['name'] ?? '') ?>" placeholder="John Doe">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group col-md-6">
          <label>Password <?= $isEdit ? '' : '<span class="text-danger">*</span>' ?>
            <?php if ($isEdit): ?><small class="text-muted">(kosongkan jika tidak diubah)</small><?php endif; ?>
          </label>
          <input type="password" name="password" class="form-control"
                 <?= $isEdit ? '' : 'required' ?> minlength="8" placeholder="Minimal 8 karakter">
          <small class="form-text text-muted">Minimal 8 karakter.</small>
        </div>
        <div class="form-group col-md-6">
          <label>Role <span class="text-danger">*</span></label>
          <select name="role" class="form-control" required>
            <option value="super_admin" <?= ($admin['role'] ?? '') === 'super_admin' ? 'selected' : '' ?>>Super Admin</option>
            <option value="staff" <?= ($admin['role'] ?? 'staff') === 'staff' ? 'selected' : '' ?>>Staff</option>
          </select>
          <small class="form-text text-muted">Super Admin: akses penuh. Staff: akses terbatas.</small>
        </div>
      </div>

      <div class="form-group">
        <div class="custom-control custom-switch">
          <input type="hidden" name="is_active" value="0">
          <input type="checkbox" class="custom-control-input" id="isActive" name="is_active" value="1"
                 <?= (!$isEdit || !empty($admin['is_active'])) ? 'checked' : '' ?>>
          <label class="custom-control-label" for="isActive">Admin aktif</label>
        </div>
      </div>
    </div>
  </div>

  <div class="mb-4">
    <button type="submit" class="btn btn-primary"><i class="fas fa-save mr-1"></i> Simpan</button>
    <a href="/admins" class="btn btn-default">Batal</a>
  </div>
</form>

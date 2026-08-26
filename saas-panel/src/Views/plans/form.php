<?php
use App\Core\View;
use App\Core\Csrf;

$isEdit  = !empty($plan['_id']);
$id      = $plan['_id'] ?? '';
$lim     = $plan['limits'] ?? [];
$pricing = $plan['pricingOptions'] ?? [];
$addons  = $plan['availableAddOns'] ?? [];
$action  = $isEdit ? "/plans/$id" : '/plans';

$PERIODS = ['monthly' => 'Bulanan', 'semiannual' => '6 Bulanan', 'annual' => 'Tahunan'];
$LIMIT_TYPES = ['staff' => 'Staff', 'transaction' => 'Transaksi', 'wa' => 'Pesan WA'];
?>
<div class="content-header px-0">
  <a href="/plans" class="btn btn-sm btn-default mb-2"><i class="fas fa-arrow-left"></i> Kembali</a>
  <h1 class="m-0 text-dark"><?= $isEdit ? 'Edit Plan' : 'Buat Plan' ?></h1>
</div>

<?php if (!empty($error)): ?>
  <div class="alert alert-danger"><i class="fas fa-exclamation-triangle mr-1"></i> <?= View::e($error) ?></div>
<?php endif; ?>

<form method="post" action="<?= View::e($action) ?>">
  <?= $isEdit ? Csrf::fieldWithMethod('PUT') : Csrf::field() ?>

  <div class="card">
    <div class="card-header"><h3 class="card-title">Info Dasar</h3></div>
    <div class="card-body">
      <div class="form-row">
        <div class="form-group col-md-6">
          <label>Nama Plan <span class="text-danger">*</span></label>
          <input type="text" name="name" class="form-control" required
                 value="<?= View::e($plan['name'] ?? '') ?>">
        </div>
        <div class="form-group col-md-6">
          <label>Code <span class="text-danger">*</span>
            <?php if ($isEdit): ?><small class="text-muted">(tidak bisa diubah)</small><?php endif; ?>
          </label>
          <input type="text" name="code" class="form-control"
                 value="<?= View::e($plan['code'] ?? '') ?>"
                 <?= $isEdit ? 'readonly' : 'required' ?>
                 pattern="[a-z0-9\-]+" placeholder="starter, standard, enterprise">
          <small class="form-text text-muted">Huruf kecil, angka, strip.</small>
        </div>
      </div>
      <div class="form-group">
        <label>Deskripsi</label>
        <input type="text" name="description" class="form-control"
               value="<?= View::e($plan['description'] ?? '') ?>">
      </div>
      <div class="form-row">
        <div class="form-group col-md-4">
          <label>Urutan (sortOrder)</label>
          <input type="number" name="sortOrder" class="form-control" value="<?= (int)($plan['sortOrder'] ?? 0) ?>">
        </div>
        <div class="form-group col-md-8 d-flex align-items-end">
          <div class="custom-control custom-switch">
            <input type="hidden" name="isActive" value="0">
            <input type="checkbox" class="custom-control-input" id="isActive" name="isActive" value="1"
                   <?= (!$isEdit || !empty($plan['isActive'])) ? 'checked' : '' ?>>
            <label class="custom-control-label" for="isActive">Plan aktif</label>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header"><h3 class="card-title">Limit Kuota</h3></div>
    <div class="card-body">
      <p class="text-muted small mb-2"><i class="fas fa-info-circle mr-1"></i> Isi <code>-1</code> untuk <strong>unlimited</strong>, <code>0</code> untuk mematikan fitur, atau angka positif sebagai batas.</p>
      <div class="form-row">
        <div class="form-group col-md-4">
          <label>Max Staff</label>
          <input type="number" name="maxStaff" class="form-control" min="-1" value="<?= (int)($lim['maxStaff'] ?? 0) ?>">
          <small class="form-text text-muted">-1 = unlimited</small>
        </div>
        <div class="form-group col-md-4">
          <label>Max Transaksi / bulan</label>
          <input type="number" name="maxTransactionsPerMonth" class="form-control" min="-1" value="<?= (int)($lim['maxTransactionsPerMonth'] ?? 0) ?>">
          <small class="form-text text-muted">-1 = unlimited</small>
        </div>
        <div class="form-group col-md-4">
          <label>Max Pesan WA / bulan</label>
          <input type="number" name="maxWaMessagesPerMonth" class="form-control" min="-1" value="<?= (int)($lim['maxWaMessagesPerMonth'] ?? 0) ?>">
          <small class="form-text text-muted">-1 = unlimited</small>
        </div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h3 class="card-title">Opsi Harga <span class="text-danger">*</span> <small class="text-muted">(minimal 1)</small></h3>
      <button type="button" class="btn btn-sm btn-default" onclick="addPricing()"><i class="fas fa-plus"></i> Tambah</button>
    </div>
    <div class="card-body p-2">
      <table class="table table-sm mb-0" id="pricingTable">
        <thead>
          <tr><th>Periode</th><th>Hari</th><th>Harga (Rp)</th><th>Label Diskon</th><th></th></tr>
        </thead>
        <tbody id="pricingBody">
          <?php if (empty($pricing)) $pricing = [['billingPeriod' => 'monthly', 'billingPeriodDays' => 30, 'price' => 0, 'discountLabel' => '']]; ?>
          <?php foreach ($pricing as $po): ?>
          <tr>
            <td>
              <select name="po_billingPeriod[]" class="form-control form-control-sm">
                <?php foreach ($PERIODS as $val => $lbl): ?>
                  <option value="<?= $val ?>" <?= ($po['billingPeriod'] ?? '') === $val ? 'selected' : '' ?>><?= $lbl ?></option>
                <?php endforeach; ?>
              </select>
            </td>
            <td><input type="number" name="po_billingPeriodDays[]" class="form-control form-control-sm" min="1" value="<?= (int)($po['billingPeriodDays'] ?? 30) ?>"></td>
            <td><input type="number" name="po_price[]" class="form-control form-control-sm" min="0" value="<?= (int)($po['price'] ?? 0) ?>"></td>
            <td><input type="text" name="po_discountLabel[]" class="form-control form-control-sm" value="<?= View::e($po['discountLabel'] ?? '') ?>" placeholder="Hemat 15%"></td>
            <td><button type="button" class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h3 class="card-title">Add-on <small class="text-muted">(opsional)</small></h3>
      <button type="button" class="btn btn-sm btn-default" onclick="addAddon()"><i class="fas fa-plus"></i> Tambah</button>
    </div>
    <div class="card-body p-2">
      <table class="table table-sm mb-0">
        <thead>
          <tr><th>Nama</th><th>Tipe</th><th>Jumlah Ekstra</th><th>Harga (Rp)</th><th>Aktif</th><th></th></tr>
        </thead>
        <tbody id="addonBody">
          <?php foreach ($addons as $ao): ?>
          <tr>
            <td><input type="text" name="ao_name[]" class="form-control form-control-sm" value="<?= View::e($ao['name'] ?? '') ?>"></td>
            <td>
              <select name="ao_limitType[]" class="form-control form-control-sm">
                <?php foreach ($LIMIT_TYPES as $val => $lbl): ?>
                  <option value="<?= $val ?>" <?= ($ao['limitType'] ?? '') === $val ? 'selected' : '' ?>><?= $lbl ?></option>
                <?php endforeach; ?>
              </select>
            </td>
            <td><input type="number" name="ao_extraAmount[]" class="form-control form-control-sm" min="1" value="<?= (int)($ao['extraAmount'] ?? 1) ?>"></td>
            <td><input type="number" name="ao_price[]" class="form-control form-control-sm" min="0" value="<?= (int)($ao['price'] ?? 0) ?>"></td>
            <td class="text-center">
              <input type="hidden" name="ao_isActive[]" value="<?= !empty($ao['isActive']) ? '1' : '0' ?>">
              <input type="checkbox" <?= !empty($ao['isActive']) ? 'checked' : '' ?>
                     onchange="this.previousElementSibling.value = this.checked ? '1' : '0'">
            </td>
            <td><button type="button" class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>

  <div class="mb-4">
    <button type="submit" class="btn btn-primary"><i class="fas fa-save mr-1"></i> Simpan</button>
    <a href="/plans" class="btn btn-default">Batal</a>
  </div>
</form>

<script>
const PERIOD_OPTS = <?= json_encode($PERIODS) ?>;
const LIMIT_OPTS = <?= json_encode($LIMIT_TYPES) ?>;

function optionsHtml(map, sel) {
  return Object.entries(map).map(([v, l]) =>
    `<option value="${v}"${v === sel ? ' selected' : ''}>${l}</option>`).join('');
}

function addPricing() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><select name="po_billingPeriod[]" class="form-control form-control-sm">${optionsHtml(PERIOD_OPTS, 'monthly')}</select></td>
    <td><input type="number" name="po_billingPeriodDays[]" class="form-control form-control-sm" min="1" value="30"></td>
    <td><input type="number" name="po_price[]" class="form-control form-control-sm" min="0" value="0"></td>
    <td><input type="text" name="po_discountLabel[]" class="form-control form-control-sm" placeholder="Hemat 15%"></td>
    <td><button type="button" class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>`;
  document.getElementById('pricingBody').appendChild(tr);
}

function addAddon() {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" name="ao_name[]" class="form-control form-control-sm"></td>
    <td><select name="ao_limitType[]" class="form-control form-control-sm">${optionsHtml(LIMIT_OPTS, 'wa')}</select></td>
    <td><input type="number" name="ao_extraAmount[]" class="form-control form-control-sm" min="1" value="1"></td>
    <td><input type="number" name="ao_price[]" class="form-control form-control-sm" min="0" value="0"></td>
    <td class="text-center"><input type="hidden" name="ao_isActive[]" value="1"><input type="checkbox" checked onchange="this.previousElementSibling.value = this.checked ? '1' : '0'"></td>
    <td><button type="button" class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button></td>`;
  document.getElementById('addonBody').appendChild(tr);
}
</script>

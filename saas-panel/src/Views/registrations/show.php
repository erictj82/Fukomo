<?php use App\Core\View; use App\Core\Csrf;
  $badge = ['pending' => 'warning', 'approved' => 'success', 'rejected' => 'danger'];
  $isPending = ($reg['status'] ?? '') === 'pending';
?>
<div class="content-header px-0">
  <a href="/registrations" class="btn btn-sm btn-default mb-2"><i class="fas fa-arrow-left"></i> Kembali</a>
</div>

<div class="row">
  <div class="col-md-6">
    <div class="card">
      <div class="card-header"><h3 class="card-title"><i class="fas fa-file-alt mr-1"></i> Detail Pendaftaran</h3></div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">Nama Toko</dt><dd class="col-sm-8"><strong><?= View::e($reg['storeName'] ?? '') ?></strong></dd>
          <dt class="col-sm-4">Slug</dt><dd class="col-sm-8"><code><?= View::e($reg['slug'] ?? '') ?></code></dd>
          <dt class="col-sm-4">Owner</dt><dd class="col-sm-8"><?= View::e($reg['ownerName'] ?? '') ?></dd>
          <dt class="col-sm-4">Email</dt><dd class="col-sm-8"><?= View::e($reg['email'] ?? '') ?></dd>
          <dt class="col-sm-4">No. Telp</dt><dd class="col-sm-8"><?= View::e($reg['phone'] ?? '') ?></dd>
          <dt class="col-sm-4">Status</dt><dd class="col-sm-8">
            <span class="badge badge-<?= $badge[$reg['status']] ?? 'secondary' ?>"><?= View::e($reg['status'] ?? '') ?></span>
          </dd>
          <dt class="col-sm-4">Tanggal Daftar</dt><dd class="col-sm-8"><?= View::e(date('d M Y H:i', strtotime($reg['createdAt'] ?? 'now'))) ?></dd>
          <?php if (!$isPending && !empty($reg['rejectionReason'])): ?>
            <dt class="col-sm-4">Alasan Tolak</dt><dd class="col-sm-8 text-danger"><?= View::e($reg['rejectionReason']) ?></dd>
          <?php endif; ?>
        </dl>
      </div>
    </div>
  </div>

  <?php if ($isPending): ?>
    <div class="col-md-6">
      <div class="card card-success">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-check-circle mr-1"></i> Approve Pendaftaran</h3></div>
        <form method="POST" action="/registrations/<?= View::e($reg['_id']) ?>/approve">
          <?= Csrf::field() ?>
          <div class="card-body">
            <div class="form-group">
              <label>Pilih Plan <span class="text-danger">*</span></label>
              <select name="planId" id="planId" class="form-control" required>
                <option value="">— pilih plan —</option>
                <?php foreach ($plans as $p): ?>
                  <option value="<?= View::e($p['_id']) ?>"
                    data-pricing='<?= View::e(json_encode($p['pricingOptions'] ?? [], JSON_HEX_APOS | JSON_HEX_QUOT)) ?>'>
                    <?= View::e($p['name']) ?> (<?= View::e($p['code']) ?>)
                  </option>
                <?php endforeach; ?>
              </select>
              <?php if (empty($plans)): ?>
                <small class="text-danger">Belum ada plan aktif. Bikin plan dulu di menu Plans.</small>
              <?php endif; ?>
            </div>

            <div class="form-group">
              <label>Periode Langganan <span class="text-danger">*</span></label>
              <div id="periodOptions" class="text-muted small">Pilih plan dulu.</div>
            </div>
          </div>
          <div class="card-footer">
            <button type="submit" class="btn btn-success" <?= empty($plans) ? 'disabled' : '' ?>>
              <i class="fas fa-check mr-1"></i> Approve &amp; Provision Toko
            </button>
            <small class="d-block text-muted mt-2">Approve akan bikin toko + kirim WA konfirmasi ke owner. Aksi sekali jalan.</small>
          </div>
        </form>
      </div>

      <div class="card card-danger">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-times-circle mr-1"></i> Tolak Pendaftaran</h3></div>
        <form method="POST" action="/registrations/<?= View::e($reg['_id']) ?>/reject"
              onsubmit="return confirm('Yakin tolak pendaftaran ini? WA notifikasi akan dikirim.');">
          <?= Csrf::field() ?>
          <div class="card-body">
            <div class="form-group mb-0">
              <label>Alasan Penolakan <span class="text-danger">*</span></label>
              <textarea name="rejectionReason" class="form-control" rows="2" required
                        placeholder="cth: data toko tidak lengkap / duplikat"></textarea>
            </div>
          </div>
          <div class="card-footer">
            <button type="submit" class="btn btn-danger"><i class="fas fa-times mr-1"></i> Tolak</button>
          </div>
        </form>
      </div>
    </div>
  <?php endif; ?>
</div>

<?php if ($isPending): ?>
<script>
(function () {
  var sel = document.getElementById('planId');
  var box = document.getElementById('periodOptions');
  var LABELS = { monthly: 'Bulanan', semiannual: '6 Bulanan', annual: 'Tahunan' };

  function rupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }

  function render() {
    var opt = sel.options[sel.selectedIndex];
    var pricing = [];
    try { pricing = JSON.parse(opt.getAttribute('data-pricing') || '[]'); } catch (e) {}

    if (!sel.value || !pricing.length) {
      box.className = 'text-muted small';
      box.textContent = sel.value ? 'Plan ini belum punya opsi harga.' : 'Pilih plan dulu.';
      return;
    }
    box.className = '';
    box.innerHTML = pricing.map(function (po, i) {
      var label = LABELS[po.billingPeriod] || po.billingPeriod;
      var disc = po.discountLabel ? ' <span class="badge badge-info">' + po.discountLabel + '</span>' : '';
      return '<div class="custom-control custom-radio">' +
        '<input type="radio" class="custom-control-input" name="billingPeriod" ' +
        'id="bp' + i + '" value="' + po.billingPeriod + '"' + (i === 0 ? ' checked' : '') + ' required>' +
        '<label class="custom-control-label" for="bp' + i + '">' +
        label + ' — ' + rupiah(po.price) + ' <small class="text-muted">(' + po.billingPeriodDays + ' hari)</small>' + disc +
        '</label></div>';
    }).join('');
  }

  sel.addEventListener('change', render);
  render();
})();
</script>
<?php endif; ?>

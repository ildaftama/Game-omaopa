// Pemicu sinkronisasi ESB yang TEPAT WAKTU (owner 2026-11-12).
// Jadwal bawaan GitHub Actions ("schedule") telat 4-9 jam (sinkron 21.02 WIB baru jalan 03.00-07.00
// WIB). Skrip ini (Google Apps Script, gratis) memanggil workflow GitHub lewat API tiap jam --
// pemicu manual seperti ini langsung dijalankan GitHub, tidak antre seperti jadwal bawaan.
//
// Cara pasang (sekali saja):
// 1. script.google.com -> Proyek baru -> tempel seluruh isi file ini -> Simpan.
// 2. Setelan proyek (ikon gerigi) -> Zona waktu: (GMT+07:00) Jakarta.
// 3. Setelan proyek -> Properti skrip -> Tambahkan: nama GITHUB_TOKEN, nilai = token GitHub.
// 4. Pilih fungsi "pasang" -> Jalankan -> izinkan akses. Selesai; cek dengan fungsi "uji".
//
// Jadwal (WIB): 18, 19, 20 = omzet SEMENTARA hari ini (outlet masih buka);
// 21, 22, 23 = omzet FINAL hari ini (22 & 23 = ulangan kalau ada yang gagal). Sejak 2026-11-13
// outlet dianggap tutup 20.00: pemicu jam 20 otomatis diperlakukan FINAL oleh workflow;
// 07 = tarik ulang 7 hari terakhir (perbaiki laporan yang sempat gagal semalam).

const REPO = 'ildaftama/Game-omaopa';

function tiapJam() {
  const jam = Number(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'H'));
  if (jam >= 18 && jam <= 20) return picu_('esb-forecast-refresh.yml', { intraday: '1' });
  if (jam >= 21 && jam <= 23) return picu_('esb-forecast-refresh.yml', {});
  if (jam === 7) return picu_('esb-forecast-orders-refresh.yml', null);
}

function picu_(workflow, inputs) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Properti skrip GITHUB_TOKEN belum diisi.');
  const body = { ref: 'main' };
  if (inputs) body.inputs = inputs;
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + workflow + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 204) throw new Error('GitHub menolak (' + code + '): ' + res.getContentText().slice(0, 200));
  console.log('Dipicu: ' + workflow + ' ' + JSON.stringify(inputs || {}));
}

// Jalankan SEKALI: memasang pemicu tiap jam (menghapus pemicu lama skrip ini dulu).
function pasang() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tiapJam').timeBased().everyHours(1).create();
  console.log('Pemicu tiap jam terpasang.');
}

// Uji koneksi token: memicu tarikan pesanan & 7 hari terakhir (aman dijalankan kapan saja).
function uji() {
  picu_('esb-forecast-orders-refresh.yml', null);
}

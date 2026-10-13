import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';

// Public Firebase web configuration, shared with the existing website.
const app = getApps().find(a => a.name === '[DEFAULT]') || initializeApp({
  apiKey: 'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',
  authDomain: 'oma-opa-game.firebaseapp.com', projectId: 'oma-opa-game',
  storageBucket: 'oma-opa-game.firebasestorage.app', messagingSenderId: '737187594894',
  appId: '1:737187594894:web:07e8fdd4dbb2e5fa903fdf'
});
const auth = getAuth(app), db = getFirestore(app);
const dialog = document.querySelector('#forecast-login');
const form = dialog.querySelector('form');
const button = document.querySelector('#forecast-account');
const accountStatus = document.querySelector('#forecast-account-status');
let resolveReady;
const ready = new Promise(resolve => { resolveReady = resolve; });
onAuthStateChanged(auth, user => {
  button.textContent = user ? 'Keluar' : 'Masuk';
  accountStatus.textContent = user ? 'Akun terhubung' : 'Masuk untuk laporan penjualan';
  resolveReady();
  // Clear private rows immediately after account changes or logout.
  document.querySelector('#sales-results')?.replaceChildren();
  const status = document.querySelector('#sales-status');
  if (status) status.textContent = user ? 'Pilih tanggal laporan.' : 'Masuk untuk membaca laporan penjualan.';
});
button.addEventListener('click', async () => {
  await ready;
  if (auth.currentUser) {
    try { await signOut(auth); } catch { accountStatus.textContent = 'Belum berhasil keluar. Coba lagi.'; }
  } else dialog.showModal();
});
dialog.querySelector('[data-login-close]').addEventListener('click', () => dialog.close());
form.addEventListener('submit', async event => {
  event.preventDefault();
  const error = form.querySelector('[role="alert"]');
  const submit = form.querySelector('[type="submit"]');
  let phone = form.elements.phone.value.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  else if (phone.startsWith('8')) phone = '62' + phone;
  if (!/^62\d{8,13}$/.test(phone)) { error.textContent = 'Periksa nomor HP yang dipakai di website.'; return; }
  error.textContent = ''; submit.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, phone + '@phone.omaopa.fun', form.elements.pin.value);
    form.reset(); dialog.close();
  } catch { error.textContent = 'Belum berhasil masuk. Periksa nomor HP dan PIN, lalu coba lagi.'; }
  finally { form.elements.pin.value = ''; submit.disabled = false; }
});
dialog.addEventListener('close', () => { form.reset(); form.querySelector('[role="alert"]').textContent = ''; });
window.ForecastAccess = {
  async readRadarDaily(date) {
    await ready;
    if (!auth.currentUser) throw Object.assign(new Error('Masuk terlebih dahulu.'), { code: 'auth-required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Tanggal tidak valid.');
    const uid = auth.currentUser.uid;
    const result = await getDoc(doc(db, 'radarSalesDays', date));
    if (auth.currentUser?.uid !== uid) throw Object.assign(new Error('Sesi berubah.'), { code: 'auth-required' });
    return result.exists() ? result.data() : null;
  }
};

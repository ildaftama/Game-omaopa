# Integrasi ESB ke Radar — penarikan manual

Firebase untuk Radar sudah diaktifkan pada 13 Oktober 2026. Paket ini belum mengaktifkan jadwal otomatis. Tidak berisi kata sandi, token, atau omzet asli. Uji API langsung sebelumnya berhasil membaca 28 outlet pada 12 Oktober 2026; pengujian kode penyimpanan saat ini memakai simulasi.

## Berkas yang diunggah ke repository

- Folder `forecast/` untuk halaman khusus `https://omaopa.fun/forecast/`. Halaman ini memakai login nomor HP/PIN yang sama dengan website.
- Halaman Forecast tidak membutuhkan perubahan pada admin.html atau core-omaopa.js.
- `integration/` dan `.github/workflows/esb-manual.yml` pada akar repository.
- Folder `.github` mungkin tersembunyi di Windows. Pastikan workflow tampil di GitHub setelah commit. Jika unggahan tidak menyertakan folder ini, gunakan Add file → Create new file dengan nama `.github/workflows/esb-manual.yml`, lalu salin isi berkas workflow.
- Gabungkan dengan perubahan terbaru repository sebelum mengganti file lama. Jangan unggah folder kerja, kata sandi, atau hasil laporan ke repository publik.

## Status aktivasi Firebase — sudah selesai

- Project `oma-opa-game` dikelola melalui akun Google pemilik yang telah ditentukan.
- Akun sinkronisasi `radar-sync@omaopa.fun` berhasil dibuat; kata sandi diisi sendiri oleh pemilik.
- Aturan Radar sudah dipublikasikan. Sebanyak 83 kondisi izin lama dipertahankan dan dibungkus pengecualian khusus akun sinkronisasi, agar akun tersebut tidak mendapat izin ke koleksi lain.
- Akun admin website yang ditunjuk sudah masuk daftar `radarReaders` dengan boolean `enabled: true`.
- Rules Playground: penulis Radar diizinkan membuat laporan; penulis ditolak membaca rewards dan menghapus Radar; akun lain ditolak menulis Radar; pembaca yang ditunjuk diizinkan membaca; pengguna tanpa izin dan anonim ditolak membaca; akses baca rewards bagi akun pelanggan tetap diizinkan dalam simulasi.
- Pengujian ini merupakan simulasi aturan Firebase. Belum ada laporan omzet asli yang ditulis oleh workflow GitHub dan belum ada pengujian penarikan end-to-end melalui GitHub.
- Jangan menerbitkan ulang fragmen aturan untuk pemasangan paket ini. Fragmen berikut disertakan sebagai referensi penggabungan bila aturan diubah kemudian.

## Referensi penggabungan aturan Firebase

1. Buka project `oma-opa-game`. Simpan salinan aturan Firestore yang sedang aktif.
2. Siapkan akun Firebase Authentication khusus penarikan. Akun ini hanya dipakai proses GitHub, bukan akun admin utama. Pemilik sudah menyetujui pembuatan akses khusus dalam percakapan; kata sandi baru diisi sendiri oleh pemilik. Catat UID-nya.
3. Gabungkan `integration/firestore-radar.rules.fragment` ke aturan yang sudah ada, di dalam blok `match /databases/{database}/documents`. Ganti `PLACEHOLDER_SYNC_UID` dengan UID akun penarikan. Jangan mengganti keseluruhan aturan menggunakan fragmen ini.
4. Periksa aturan yang tumpang tindih. Firestore memakai OR antar izin: aturan umum seperti `match /{document=**} { allow read, write: if true; }`, atau izin bagi semua pengguna login, tetap dapat membuka laporan meskipun fragmen Radar ketat. Aturan umum harus dikecualikan dari koleksi Radar sebelum menyimpan data asli. Pastikan perubahan tidak mengganggu koleksi website lain.
5. Di Firebase Console, buat dokumen `radarReaders/UID_ADMIN` dengan field boolean `enabled: true` untuk admin yang boleh membaca omzet. Browser tidak boleh menulis daftar izin ini. Untuk mencabut akses, ubah enabled menjadi false lewat Console.
6. Verifikasi izin menggunakan Rules Playground/emulator: anonim dan pengguna biasa ditolak; pembaca ditunjuk boleh membaca tetapi tidak menulis; akun penarikan boleh membuat/memperbarui laporan namun tidak menghapus atau mengubah koleksi lain. Akun penarikan juga harus tidak memperoleh akses luas dari aturan lama.

Pemeriksaan Console menemukan aturan beberapa koleksi lama mengizinkan pengguna yang login untuk membaca atau menulis (contohnya rewards dan vouchers). Akun penarikan baru juga akan mendapatkan izin itu jika hanya menambahkan fragmen Radar. Pengecualian UID akun penarikan dari koleksi lain sudah diterapkan pada aturan aktif, sambil mempertahankan kondisi akses pengguna lama. `integration/firestore-writer-isolation.fragment` adalah referensi penggabungan, bukan file aturan lengkap yang dapat langsung dipublikasikan. Hindari menimpa aturan aktif dengan versi lama saat memperbarui website.

## Pengaturan GitHub

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Nama | Isi |
|---|---|
| ESB_USERNAME | Akun ESB yang telah diuji |
| ESB_PASSWORD | Kata sandi akun ESB |
| FIREBASE_SYNC_EMAIL | radar-sync@omaopa.fun |
| FIREBASE_SYNC_PASSWORD | Kata sandi akun tersebut |
| FIREBASE_WEB_API_KEY | Web API key project Firebase yang sama |

Isi sendiri melalui pengaturan GitHub. Jangan mengirim secrets melalui chat atau menulisnya dalam kode. Hanya pengelola repository tepercaya yang boleh mengubah workflow karena workflow dapat menggunakan secrets. Gunakan akun ESB dengan akses baca secukupnya jika tersedia; uji ini tidak membatasi kewenangan akun ESB yang ada.

## Menjalankan satu tanggal

1. GitHub → Actions → **Tarik laporan ESB manual** → Run workflow.
2. Isi tanggal penjualan `YYYY-MM-DD`, misalnya `2026-10-12`, lalu jalankan.
3. Setelah berhasil, buka `https://omaopa.fun/forecast/` → masuk dengan akun website yang diberi izin → **Penjualan harian**, pilih tanggal yang sama, klik **Lihat data tersimpan**.
4. Cocokkan seluruh outlet dengan laporan ESB sebelum menyebut angka sebagai omzet. Saat ini label tetap Pembayaran ESB. `paymentCount` adalah jumlah pembayaran, bukan jaminan jumlah nota unik.

Penarikan tanggal yang sama mengganti satu dokumen hari tersebut, sehingga tidak menggandakan laporan. Respons kosong atau tidak valid tidak menimpa data lama. Tidak ada penghapusan tahunan; dokumen harian dapat disimpan lebih dari setahun sesuai kebijakan perusahaan. Saat ini satu tanggal per proses, belum penarikan massal historis.

Laporan privat berada di `radarSalesDays/YYYY-MM-DD`. Angka asli tidak disalin ke file statis website maupun GitHub. Halaman Forecast membaca dengan login Firebase akun website pada domain yang sama, tanpa membuka halaman admin. Preview Sites terpisah belum tersambung ke login website GitHub.

## Batas tahap ini

- Jadwal otomatis belum ditambahkan.
- Aturan Firebase dan izin baca admin sudah aktif. Berkas Forecast, kode integrasi, dan workflow manual sudah diunggah ke repository melalui Chrome. GitHub Secrets belum diisi.
- API ESB mengembalikan 28 outlet pada tanggal uji; peta KMZ berisi 30 lokasi milik perusahaan. Selisih perlu dicocokkan berdasarkan kode outlet, status operasional, dan tanggal; tidak diasumsikan nol atau otomatis digabung berdasarkan kemiripan nama.
- Belum ada korelasi event/traffic maupun estimasi forecast. Riwayat pembayaran yang sudah tervalidasi menjadi dasar tahap berikutnya.
- Kode penyimpanan diuji dengan simulasi berhasil, respons kosong, data salah, dan kegagalan layanan. Penarikan end-to-end berikutnya memerlukan pengisian GitHub Secrets oleh pemilik. Halaman terbit sudah diuji: login website terbaca dan akses Firestore berhasil membaca status laporan yang belum tersedia.

Sumber teknis: [ESB API](https://developers.esb.co.id/esb-core/), [aturan Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions), [GitHub Secrets](https://docs.github.com/en/actions/concepts/security/secrets).

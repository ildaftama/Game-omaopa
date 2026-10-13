# Forecast Oma Opa

Halaman publik: https://omaopa.fun/forecast/

Peta, penduduk, kegiatan, wisata, lalu lintas dan tab Analisa terbuka tanpa login. Form penambahan kegiatan, estimasi wisata, pengamatan lalu lintas, impor dan ekspor manual sudah dihapus. Halaman admin dan login website utama tidak diubah.

## Data awal Analisa

- Periode 13 Juli–12 Oktober 2026. Laporan keuangan harian memuat 91 hari Net Sales gabungan, sampai 11 Oktober; 12 Oktober belum terisi.
- Data berasal dari baris Net Sales pada LK All Outlet Juli, Agustus, September dan Oktober. Ditambahkan 28 hari sebelumnya, 15 Juni–12 Juli, khusus untuk pembanding kegiatan awal Juli. Tahun/bulan mengikuti judul total pada laporan, bukan tab Analysis yang memiliki tanggal lama. Nilai diperiksa terhadap Total Sales dan Total Discount. Jadwal wisuda UII 27–28 Juni dikeluarkan dari pembanding menurut sumber resmi UII.
- Sebelas kegiatan historis dicatat dengan sumber resmi di historical-events.json. Status membedakan laporan pelaksanaan dengan jadwal atau pengumuman. Cakupan kegiatan masih terbatas.
- Analisa membandingkan omzet gabungan pada tanggal kegiatan dengan hari yang sama pada empat minggu sebelumnya, mengeluarkan tanggal kegiatan yang tercatat, dengan minimal dua hari pembanding per tanggal. Perubahan beberapa hari dihitung dari perbandingan jumlah omzet dan jumlah pembanding, bukan rata-rata persentase.
- Ringkasan publik hanya memuat persentase dan indeks. Nominal omzet, gaji, laba dan isi laporan keuangan tidak diunggah.
- Salinan nominal harian dan sumber sel tersimpan dalam database SQLite privat di laptop. Database itu belum dipindahkan ke Firebase. Jangan unggah database atau laporan mentah ke repository publik.
- Belum ada omzet historis per outlet yang tersimpan dari ESB. Total gabungan bukan angka outlet sekitar kegiatan; kenaikan pada tanggal kegiatan belum membuktikan pengaruh kegiatan.
- Arsip lalu lintas harian pada periode ini belum tersedia. Tidak dibuat angka kendaraan atau tingkat kemacetan dari warna peta. TrafficLayer Google menampilkan kondisi saat ini dan bukan endpoint unduhan arsip historis. Survei volume jalan lama tidak dipakai sebagai pengamatan Juli–Oktober 2026.
- Alternatif yang diperiksa: TomTom Traffic Stats mendukung riwayat kecepatan/waktu tempuh di kota tertentu di Indonesia, tetapi memerlukan akun dan kunci API MOVE. Ketersediaan pada ruas sekitar tiap outlet belum diuji. Produk Traffic Volume untuk estimasi jumlah kendaraan belum mencantumkan Indonesia dalam cakupannya. Belum dibuat akun, dibeli layanan atau dijalankan permintaan berbayar. Sumber: https://docs.tomtom.com/traffic-stats/documentation/product-information/market-coverage dan https://docs.tomtom.com/traffic-stats/documentation/api/traffic-volume.

## Penyimpanan ESB privat

Firebase project oma-opa-game sudah memiliki akun penarikan khusus, aturan penulis terbatas, dan daftar pembaca yang ditunjuk. Akses anonim ke radarSalesDays tetap ditolak. Halaman publik tidak memuat SDK login atau meminta PIN.

Delapan puluh tiga kondisi izin koleksi lama telah dipertahankan dengan pengecualian akun penarikan, sehingga akun ini tidak mendapat akses ke koleksi lain. Fragmen aturan hanya referensi; jangan menimpa aturan aktif dengan fragmen tersebut.

Laporan disimpan sebagai radarSalesDays/YYYY-MM-DD. Tidak ada penghapusan otomatis setelah satu tahun. Penarikan ulang tanggal yang sama memperbarui satu dokumen dan tidak menambah duplikat. Respons kosong atau tidak valid tidak menimpa data sebelumnya. Penyimpanan belum berjalan sebelum pengaturan koneksi dilengkapi.

## Pengaturan yang belum diisi

Isi sendiri di GitHub Settings → Secrets and variables → Actions. Jangan menulis kata sandi atau token dalam kode, chat, file publik, maupun log.

| Nama | Isi |
|---|---|
| ESB_USERNAME | Akun ESB yang telah diuji |
| ESB_PASSWORD | Kata sandi akun ESB |
| FIREBASE_SYNC_EMAIL | Email akun penarikan khusus yang telah dibuat |
| FIREBASE_SYNC_PASSWORD | Kata sandi akun penarikan khusus |
| FIREBASE_WEB_API_KEY | Web API key project Firebase |

## Penarikan satu tanggal atau historis

GitHub → Actions → Tarik laporan ESB manual → Run workflow.

Untuk satu hari, isi sales_date dan kosongkan date_from/date_to. Untuk historis, kosongkan sales_date dan isi date_from/date_to. Periode awal: 2026-07-13 sampai 2026-10-12, maksimal 93 hari sekali penarikan. Jadwal otomatis belum ditambahkan. Jika sebagian tanggal gagal, tanggal yang berhasil tetap tersimpan; ulangi tanggal gagal setelah kendala teratasi.

API ESB yang diuji adalah sales-payment-summary. Angkanya belum otomatis diperlakukan sebagai Net Sales setiap outlet. Cocokkan seluruh outlet dengan laporan penjualan bersih sebelum menggabungkannya dengan data Net Sales. paymentCount bukan jumlah nota unik.

Pada uji API 12 Oktober 2026 terdapat 28 outlet, sedangkan KMZ memiliki 30 lokasi perusahaan. Cocokkan berdasarkan kode dan status outlet; jangan menyamakan outlet memakai kemiripan nama saja. Jangan anggap outlet yang hilang memiliki omzet nol.

## Pembaruan ringkasan

analyse-history.mjs membaca data privat dan historical-events.json, kemudian menghasilkan analysis-data.js tanpa nominal. Format sumber yang saat ini didukung adalah netSales dengan cakupan all-outlets-ledger. Data per outlet memerlukan pencocokan dan perhitungan terpisah sebelum dipublikasikan. Perubahan sumber harus diperiksa sebelum ringkasan baru diunggah melalui Chrome.

Uji kode: enam pengujian mencakup kalender, penarikan dan penyimpanan, laporan kosong, pengulangan tanggal, kegagalan sebagian, pembanding hari sejenis, data hilang dan tidak keluarnya nominal ke ringkasan publik. Uji ini memakai data buatan. Penarikan ESB/Firebase langsung melalui GitHub masih menunggu pengisian Secrets.

Sumber teknis: [ESB](https://developers.esb.co.id/esb-core/), [TrafficLayer Google](https://developers.google.com/maps/documentation/javascript/examples/layer-traffic), [lapisan peta Google](https://developers.google.com/maps/documentation/javascript/layers), [aturan Firebase](https://firebase.google.com/docs/firestore/security/rules-conditions), [GitHub Secrets](https://docs.github.com/en/actions/concepts/security/secrets).

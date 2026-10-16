# Forecast Oma Opa

## Validasi, pesanan, dan waste ESB — 16 Oktober 2026

`demand-validation.mjs` menguji median tiga/empat weekday sebelumnya, minggu sebelumnya, dan pemilihan metode dari hasil sebelum target. Minimum tiga pembanding sama dengan metode rencana; median dibulatkan seperti rencana. Metode adaptif tidak diterapkan karena hasil keseluruhan lebih buruk. WAPE pcs/boks dihitung terpisah; bukan persentase akurasi, uji omzet rupiah atau jaminan permintaan. Output publik hanya ringkasan, tanpa baris uji mentah.

Pemilik mengonfirmasi pesanan bertanggal pengambilan, sudah termasuk LK, Mini per pcs, dan sebagian langsung melalui pabrik. Rekap CS gabungan tidak dikurangkan dari 28 outlet tanpa pembagian sumber/outlet. `orders-policy.mjs` menahan pengurangan bila cakupan/kelengkapan belum cocok, menolak duplikat, memisahkan pabrik, dan tidak memakai konfirmasi setelah cutoff. Prediksi uji 4 Oktober tetap dikunci.

`esb-waste-audit.mjs JOURNAL_ROWS_JSON LK_JSON PRIVATE_AUDIT_JSON` menghasilkan `forecast/waste-esb-summary-data.js`. September diperiksa pada 28 outlet: 1.886 baris Product/Cake/Pcs/Authorized dengan Purpose Waste Cake; sembilan baris kategori lain dipisahkan. Persentase = HPP waste / Net Sales LK outlet dan bulan yang sama. Periode tanggal jurnal berbeda dari tanggal produksi. Sampel dalam Waste Cake tetap mengikuti sumber. Nominal, HPP dan catatan jurnal tetap privat. Peringkat laba produk masih memakai rekap September sampai pencocokan per produk selesai.

`esb-client.mjs` menyimpan token dalam memori, login dari pengaturan rahasia, memperbarui token sekali setelah 401, membatasi percobaan gangguan sementara, dan memeriksa kelengkapan halaman. `esb-sync.mjs` memakai klien ini. Uji data buatan lulus; koneksi akun produksi dengan GitHub Secrets belum diverifikasi. Sesi login web berbeda dari token API. Jangan simpan kredensial dalam kode atau log. Workflow tetap manual, tanpa jadwal baru. `sales-payment-summary` tetap metrik pembayaran, bukan Net Sales atau jumlah kue.

Jalankan `node --test integration/*.test.mjs`. Sumber dan rekonsiliasi mentah tetap privat.

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

Cuplikan awal jalan telah disimpan lokal pada 13 Oktober 2026: 8 titik kecepatan Surakarta dan 37 ruas pencacahan mobil/motor Semarang. Waktu pengukuran sumber tidak tersedia dan titik belum dipetakan ke radius outlet. Data ini disimpan terpisah dari arsip historis outlet, tidak dipakai untuk analisa Juli–12 Oktober. Halaman publik menampilkan cuplikan bertanggal, bukan koneksi langsung. Arsip tanggal terdahulu belum ditemukan pada kedua tampilan publik. Sumber: [Dishub Surakarta](https://ccroom-dishub.surakarta.go.id/index.php/info-lalin), [SITIS Semarang](https://www.dashboard.dishub.semarangkota.go.id/ivss_dashboard.php).

analyse-history.mjs membaca data privat dan historical-events.json, kemudian menghasilkan analysis-data.js tanpa nominal. Format sumber yang saat ini didukung adalah netSales dengan cakupan all-outlets-ledger. Data per outlet memerlukan pencocokan dan perhitungan terpisah sebelum dipublikasikan. Perubahan sumber harus diperiksa sebelum ringkasan baru diunggah melalui Chrome.

Uji kode: enam pengujian mencakup kalender, penarikan dan penyimpanan, laporan kosong, pengulangan tanggal, kegagalan sebagian, pembanding hari sejenis, data hilang dan tidak keluarnya nominal ke ringkasan publik. Uji ini memakai data buatan. Penarikan ESB/Firebase langsung melalui GitHub masih menunggu pengisian Secrets.

Sumber teknis: [ESB](https://developers.esb.co.id/esb-core/), [TrafficLayer Google](https://developers.google.com/maps/documentation/javascript/examples/layer-traffic), [lapisan peta Google](https://developers.google.com/maps/documentation/javascript/layers), [aturan Firebase](https://firebase.google.com/docs/firestore/security/rules-conditions), [GitHub Secrets](https://docs.github.com/en/actions/concepts/security/secrets).

## Analisa harian per outlet — 13 Oktober 2026

Laporan ESB Daily Sales Summary By Branch sudah diekspor lewat Chrome untuk 15 Juni–12 Oktober 2026. Arsip privat berisi 3.358 catatan dengan metrik Net Sales Total, telah dicocokkan dengan total ekspor. Data ini berbeda dari hasil API sales-payment-summary; jangan saling menggantikan metrik.

`analyse-branches.mjs` menghasilkan ringkasan per outlet, pilihan 1/2/3 bulan, kategori kuartil, indeks omzet dan perubahan saat kegiatan. Masukan privat: `{ metric, source, sourceUrl, toDate, records: [{ branch, date, amount }] }`. Opsional berkas padanan nama menggunakan nama cabang huruf kecil tanpa spasi sebagai kunci dan ID outlet KMZ sebagai nilai. Jangan menebak padanan nama. Masukan dan XLSX ESB tidak boleh masuk repository publik.

Jalankan `node integration/analyse-branches.mjs PATH_JSON_PRIVAT [PATH_ALIAS_JSON]`, lalu `node --test integration/analyse-branches.test.mjs`. Kategori memerlukan sedikitnya 90% hari tercatat; hari hilang tidak dianggap nol. Pembanding kegiatan minimal dua hari sejenis untuk setiap tanggal kegiatan. Empat pengujian mencakup data hilang/nol, beberapa hari kegiatan, nama tak dikenal/duplikasi dan keluaran tanpa nominal.

Trafik lama 2016–2024 tetap terpisah; belum ada pasangan trafik dengan omzet pada tanggal yang sama. Arsip privat masih lokal, belum tersinkron otomatis ke Firebase. Jadwal penarikan belum diatur.

## Pembaruan metode 14 Oktober 2026

`analyse-branches.mjs` schema 3 mengecualikan tanggal agenda per outlet, bukan seluruh agenda di kota lain. Riwayat UII 27–28 Juni dikeluarkan hanya dari pembanding Jakal UII dan Nusa Indah. Setiap hari acara membutuhkan minimal dua hari sejenis dari empat minggu sebelumnya, lalu perubahan acara beberapa hari dihitung terhadap jumlah nilai harapan harian.

`medianBaselineChange` menguji perubahan dengan median pembanding. `patterns` hanya menyebut pola berulang bila minimal tiga acara sejenis semuanya positif pada kedua pembanding dan tidak bertabrakan dengan agenda terkait lain yang tercatat. Median perubahan acara menjadi angka ringkasan; tidak menyatakan efek kausal atau rekomendasi kenaikan stok sebesar persentase itu. Periksa promo, libur dan stok sebelum penggunaan operasional.

Alias Jebres/UNS dan Magelang/Pemuda, Magelang dikonfirmasi pemilik. Kaitan Nusa Indah/UII/UPN/AMIKOM dikonfirmasi pemilik; lokasi acara dicantumkan terpisah. Jalankan `node --test integration/analyse-branches.test.mjs` sebelum penerbitan. Data mentah dan arsip harian tidak boleh masuk repository publik.

## Profil dan produk per outlet

`node integration/import-outlet-intelligence.mjs SOURCE_JSON WASTE_JSON [PRIVATE_AUDIT_JSON]`

Masukan adalah arsip privat pembacaan Google Sheets yang memuat tab profil/SWOT/tindakan, performa bulanan, COGS September dan harga waste, serta data WASTE September terpisah. Skrip menghasilkan `forecast/outlet-intelligence-data.js` berisi ringkasan dan peringkat tanpa nominal. Jika diminta, audit nominal hanya ditulis ke path privat yang diberikan. Jangan memasukkan masukan atau audit ke repository publik.

Peringkat penjualan berdasarkan nilai, bukan volume. PnL produk = penjualan − HPP − waste tercatat; belum laba bersih outlet. Aturan pemilik: tanggal kosong setelah H+3 berarti waste nol; tanggal yang belum H+3 tetap belum lengkap. September sudah lengkap menurut aturan ini. Kolom waste dikenali per produk secara tepat; Classic Keju tidak menggunakan kecocokan teks 'classic keju' yang tidak ada pada judul kolom sumber. Sembilan hasil lain Gajah Raya cocok dengan dashboard; perbedaan Classic Keju tercatat di audit lokal. File sumber tidak diedit.

SWOT adalah observasi kualitatif dengan tanggal yang tidak tersedia; jangan menyamakan dengan demografi penduduk atau bukti sebab-akibat omzet. Angka dan produk pada ringkasan mengikuti outlet terpilih.

Aturan waste dikonfirmasi pemilik 14 Oktober 2026: kosong setelah H+3 = nol. `waste-policy.test.mjs` memeriksa batas H+2/H+3 serta nilai aktual nol dan non-nol.

## Evaluasi forecast — 16 Oktober 2026

Jalankan `node integration/forecast-evaluation.mjs TRACKING_JSON STOCK_SOURCES_JSON PRIVATE_AUDIT_JSON`, lalu `node --test integration/forecast-evaluation.test.mjs`. Masukan adalah snapshot privat Google Sheets; jangan unggah ke GitHub. Generator membaca header per hari, bukan mengasumsikan lebar kolom selalu sama. Rekap yang tidak cocok dengan Malmil + Ogura dan stok negatif/tidak seimbang dipisahkan. Output publik: `forecast/forecast-evaluation-data.js`.

Import ini snapshot September–13 Oktober untuk stok, Agustus–15 Oktober untuk rekap; bukan penarikan otomatis. Tanggal as-of 16 Oktober, tanggal rencana 17–23 Oktober. Jangan mengganti tanggal tanpa menyegarkan sumber. Pemilik mengonfirmasi Terpakai Real sebagai jumlah terjual bersih pada 16 Oktober. Raw, audit, dan nominal hanya tersimpan privat.

Baseline memakai median maksimal empat weekday sejenis dalam 28 hari, minimal tiga pengamatan. Rentang Q25–Q75 hanya kisaran historis. Backtest berjalan menggunakan data sebelum target, minimal dua pengamatan dan pembanding last-week pada hari yang sama. Hari valid nol tidak dihapus. Public UI menahan angka ketika tanggal lewat atau sumber lebih dari tujuh hari. Tidak ada pembelian API, perubahan jadwal, atau forecast kiriman otomatis. Umur simpan tiap produk, stok saat ini, pesanan dan lead time masih diperlukan. Efek kegiatan dan traffic belum menjadi pengali angka stok.

Arsip ber-versi: node integration/archive-forecast.mjs PRIVATE_AUDIT_JSON PRIVATE_DATABASE 2026-10-16. Database hanya disimpan privat. Setiap snapshot mempunyai hash; impor identik tidak menambah baris dan koreksi menghasilkan versi baru. Data awal telah diarsipkan dan pengulangan impor sudah diuji. Jangan unggah berkas SQLite ke repository publik.
## Harga forecast dari LK dan pcs ESB

Jalankan `node integration/lk-esb-prices.mjs LK_SEPTEMBER_JSON ESB_DAY_FOLDER PRIVATE_PRICE_AUDIT_JSON`. Masukan LK adalah daftar `{outlet,url,values}` dari Report A1:D28 untuk masing-masing outlet. Satu berkas ESB per tanggal/outlet berisi `{branch,date,expected,rows,complete}` atau `downloadComplete`, dengan seluruh halaman API `report/sales-menu-cogs`. Pembaca memerlukan 30 tanggal lengkap September, jumlah baris sesuai `count`, identitas cabang/tanggal yang cocok, serta periode/akun LK yang cocok.

Hanya `Sales` dihitung; `Void` dan `Non Sales` tidak dihitung. Nama kue biasa serta Paket Cemal-Cemil Malmil/Paket Oleh-Oleh Ogura dihitung satu kue per qty sesuai konfirmasi pemilik. Plastik, kotak, topping dan komponen paket diabaikan. Penarikan sumber memakai `showMenuPackage=0`; jangan menggabungkan header dan komponen yang merepresentasikan kue yang sama. Omzet ESB tidak digunakan sebagai pembilang harga. Harga = LK kelompok Ogura atau Malmil / qty kelompok yang sama dari ESB, per outlet. Rasa Cheese/Chocolate berbagi harga kelompok karena LK tidak memisahkan rasa. Tidak ada fallback ke harga polos ketika data bulan tidak lengkap.

Output publik `forecast/forecast-realized-prices.js` hanya memuat harga rata-rata turunan. Seluruh transaksi, nomor nota, nominal LK, kata sandi dan token harus tetap privat. Angka forecast kuantitas tetap berasal dari generator stok harian; rekonsiliasi harian dengan bundling ESB perlu dilakukan sebelum mengganti sumber kuantitas. Jadwal penarikan tetap belum diaktifkan.

Jalankan `node --test integration/lk-esb-prices.test.mjs integration/forecast-overview.test.mjs integration/performance-summary.test.mjs integration/forecast-evaluation.test.mjs` untuk pemeriksaan perubahan ini. `performance-summary.mjs` membaca rekap Performa Outlet dan durasi bulan terkait; header tanggal terakhir yang terpotong tidak boleh mengurangi cakupan hari. Durasi kosong tidak dianggap nol.


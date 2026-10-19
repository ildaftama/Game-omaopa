# Forecast Outlet Oma Opa

## Status terkini — 19 Oktober 2026

Halaman publik: https://omaopa.fun/forecast/. Pilih **Semua outlet** dan **Semua produk** untuk ringkasan; rincian dibuka per outlet.

Jumlah terjual diperbarui sampai 18 Oktober pada 28 outlet; rencana 20–26 Oktober. Metode mengurangi pesanan dari riwayat pembanding, mencari pola penjualan umum, kemudian menambahkan pesanan tercatat satu kali pada tanggal pengambilan. Jika jumlah atau pembanding belum jelas, dipakai median total tanpa tambahan pesanan. Mini satu kemasan sembilan pcs, mix tiga per rasa. Pengeluaran internal, pesanan pabrik dan ongkir dipisahkan. Forecast masih perkiraan penjualan, belum instruksi kiriman.

Pemilihan metode memakai 22–30 September, uji terpisah 1–13 Oktober. WAPE jumlah kue reguler/Mini 32,18% → 29,07%; Chiffon 78,78% → 51,21%. Catatan pesanan dibaca belakangan: ini simulasi retrospektif, belum membuktikan akurasi prospektif atau omzet. Prediksi lama yang dikunci tidak diubah. Kegiatan dan lalu lintas belum menjadi pengali otomatis.

Tren omzet tanpa pesanan kini mencakup seluruh omzet sumber, bukan hanya Malmil/Ogura. Gabungan memakai LK, pilihan outlet memakai laporan omzet outlet; sumber bisa memiliki selisih pencatatan. Sebanyak 141 dari 287 hari gabungan Januari–15 Oktober dapat dipisahkan dengan aman. Hari belum jelas tetap jeda. Rata-rata bulan memerlukan lima hari valid dan belum mewakili seluruh bulan. Nilai negatif diskon yang salah tanda pada rumus LK dikoreksi hanya dalam salinan analisis; spreadsheet sumber tidak diubah.

Arsip omzet ESB dijadwalkan setiap **00.00 WIB**. Jumlah produk, pesanan, LK, waste dan hasil forecast halaman ini **belum ikut otomatis diperbarui**. Periksa tanggal snapshot. Produk/laba dan waste masih memakai September; analisa kegiatan memakai omzet sampai 12 Oktober.

Kontak pelanggan, catatan asli, transaksi, nota, kredensial dan database tetap privat. Halaman publik hanya memuat ringkasan, harga turunan, forecast dan titik grafik yang diizinkan. Pengujian: `node --test integration/*.test.mjs`. Panduan pengolah ada di `integration/PETUNJUK.md`.

## Arsip catatan rilis sebelum 19 Oktober

Status jadwal, cakupan, dan metode pada catatan lama berikut digantikan oleh status terkini di atas.

Pembaruan 16 Oktober: forecast menampilkan selisih historis per produk, dengan minimal tiga hari sejenis sebelumnya dan pasangan tanggal uji yang sama. Angka nol dari median bukan rekomendasi stok nol bila produk pernah terjual. Metode adaptif diuji dan tidak diterapkan karena hasil keseluruhannya lebih buruk.

Waste kue September di Performa dan Ringkasan kini memakai jurnal ESB berstatus Authorized, kategori Product/Cake, tujuan Waste Cake, dibagi Net Sales LK outlet yang sama. Angka mengikuti tanggal jurnal, bukan tanggal produksi. Peringkat laba produk tetap memakai rekap lama sampai pencocokan per produk selesai.

Pesanan CS mengikuti tanggal pengambilan, sudah masuk LK, dan Mini dihitung per pcs. Sebagian pesanan melalui pabrik. Rekap gabungan belum dialokasikan ke outlet sehingga tidak ditambahkan atau dikurangkan secara sembarang dari forecast outlet. Koneksi otomatis dan jadwal penarikan belum aktif.

Halaman publik: https://omaopa.fun/forecast/

Peta, penduduk, demografi, kegiatan, wisata, lalu lintas dan Analisa dapat dibuka tanpa login. Tidak ada form penambahan data manual.

Analisa per outlet memakai laporan ESB Daily Sales Summary By Branch, Net Sales Total. Ekspor 15 Juni–12 Oktober 2026 berisi 3.358 catatan dan telah dicocokkan dengan total ekspor. Pilihan 1/2/3 bulan dihitung sampai 12 Oktober; 28 hari sebelumnya digunakan untuk pembanding. Sebanyak 28 lokasi KMZ sudah cocok dengan nama ESB. Pemilik mengonfirmasi Jebres = UNS dan Magelang = Pemuda, Magelang pada 13 Oktober 2026. Pleburan tidak dipasangkan ke KMZ. Hari hilang tidak dianggap nol.

Data omzet mentah tidak berada di repository ini. Halaman hanya memuat ringkasan persentase dan indeks. Arsip awal disimpan lokal secara privat; integrasi penyimpanan Firebase disiapkan tetapi penarikan ESB belum aktif. Koneksi ESB memerlukan GitHub Secrets; jadwal otomatis belum diatur.

Pembanding tambahan berasal dari 28 hari sebelum periode. Cuplikan delapan titik jalan Surakarta disimpan pada 13 Oktober 2026; waktu pengukuran sumber tidak tersedia, belum dipetakan ke outlet, dan tidak digunakan sebagai riwayat tiga bulan.

Cuplikan Semarang berisi hitungan mobil dan motor di 37 ruas, berlabel hari ini pada sumber. Belum ada arsip tanggal terdahulu atau pencocokan radius outlet. Hitungan tidak dijumlahkan antar ruas.

Rangkuman trafik 13 Oktober 2026 memuat tiga jalan bernama terdekat untuk setiap 30 lokasi dari KMZ, berdasarkan geometri OpenStreetMap. Jarak ke garis jalan bukan kepastian akses pintu outlet. Nama outlet Gajah Raya, misalnya, terletak paling dekat Jalan Tlogosari Raya pada KMZ ini.

Terdapat 10 rujukan pada 4 outlet: Sampangan (survei 2016), Tajem (publikasi/analisis 2021), Boyolali (laporan 2022, SMP/jam), dan Jakal UII (Dishub DIY 2024, rasio V/C). Sampangan dan Tajem memiliki hitungan kendaraan fisik. Rujukan koridor/pendekat lama bukan trafik terkini di depan outlet. Tidak ada baseline terbaru yang layak dipakai menetapkan batas minimum relokasi. Tanggal/hari survei yang tidak tersedia tidak dikarang.

traffic-baseline.js hanya mengubah hitungan kendaraan dengan durasi pengamatan yang jelas menjadi kendaraan/jam. SMP dan rasio V/C tidak diubah menjadi kendaraan. Perbandingan lokasi memerlukan titik di depan outlet terverifikasi, arah, tahun, kelompok hari dan periode jam yang sama, serta sedikitnya tujuh hari pengukuran. Data yang sekarang tersedia tidak memenuhi syarat tersebut, sehingga tidak dibuat peringkat relokasi.

Nama/geometri jalan © OpenStreetMap contributors, ODbL. Tautan sumber survei ada pada setiap rujukan. Arsip road_profiles dan traffic_references dipisahkan dari pengukuran harian agar data lama tidak masuk korelasi omzet 2026.

Tampilan dibuka pada Analisa: kategori omzet, indeks, perbandingan kegiatan per outlet dan acuan trafik. Data trafik lama tetap terpisah dari penjualan 2026. Kategori berdasarkan kuartil rata-rata omzet harian dengan kelengkapan minimal 90%; bukan ukuran jumlah pelanggan. Semua nominal harian tetap privat.

Pengolahan ulang: `node integration/analyse-branches.mjs PATH_JSON_PRIVAT [PATH_ALIAS_JSON]`. Jangan simpan masukan privat atau XLSX ESB dalam repository. Jalankan `node --test integration/analyse-branches.test.mjs` sebelum menerbitkan ringkasan.

Pembaruan 14 Oktober 2026: 14 kegiatan historis, termasuk wisuda UPN Juli/September, wisuda UII Agustus untuk Nusa Indah, dan AMIKOM Career Days Juli. Hubungan Nusa Indah dengan UII, UPN dan AMIKOM berasal dari konfirmasi pemilik; tidak disamakan dengan lokasi venue atau bukti pelanggan datang dari kampus.

Pembanding sekarang hanya mengecualikan kegiatan yang terkait outlet yang dianalisis. Karena itu persentase diperbarui dari versi 13 Oktober. Kesimpulan pola berulang memerlukan setidaknya 3 kegiatan sejenis, seluruh perubahan positif, tetap positif dengan median pembanding, dan tanpa agenda bersamaan yang tercatat. Ini aturan penyaringan deskriptif, bukan uji kausal atau prediksi stok.

UI berwarna navy/putih, ringkasan Kesimpulan di atas, rincian perbandingan dan sumber dalam bagian yang dapat dibuka. Wisuda AMIKOM 24 Oktober ditambahkan pada agenda Nusa Indah; data omzet berakhir 12 Oktober sehingga kegiatan mendatang belum dianalisis.

## Panduan per outlet — 14 Oktober 2026

Halaman kini dibuka pada satu outlet dan mengingat pilihan terakhir di perangkat. Ringkasan menunjukkan kekuatan outlet, penggerak penjualan, calon penguat laba, hubungan kegiatan, dan dua fokus kerja. Tab Produk, Kegiatan & omzet, SWOT, dan Sekitar outlet menampilkan rincian secara terpisah. Tidak ada tabel seluruh outlet pada tampilan awal.

Profil dan SWOT mencakup 28 outlet. Produk memakai September 2026 dari sumber perhitungan PERFORMA OUTLET. Peringkat penjualan memakai rupiah, bukan jumlah box; cakupan hanya produk utama tercatat. peringkat laba dihitung penjualan dikurangi HPP dan waste tercatat, belum biaya operasional. Pemilik mengonfirmasi tanggal kosong setelah H+3 berarti waste nol. Nominal produk dan catatan mentah tetap di arsip privat.

Rumus sumber untuk Cisfon Classic Keju tidak cocok dengan judul kolom waste. Pengolah memakai kolom produk yang benar; audit Gajah Raya cocok pada sembilan produk lain. Selisih itu tidak mengubah produk peringkat pertama Gajah Raya. Spreadsheet asli tidak diubah.

Aturan waste dikonfirmasi pemilik 14 Oktober 2026: kosong setelah H+3 = nol. `waste-policy.test.mjs` memeriksa batas H+2/H+3 serta nilai aktual nol dan non-nol.

## Forecast per produk — 16 Oktober 2026

Tab Forecast menyediakan dasar penjualan harian dalam satuan sumber, hasil uji metode, evaluasi prediksi sebelumnya, dan kelengkapan data. Stok 28 outlet/13 produk sampai 13 Oktober; rekap sampai 15 Oktober. Data merupakan snapshot, bukan live. Baseline belum merupakan perintah produksi/kiriman. Sumber privat tidak disertakan; hanya ringkasan serta estimasi turunan yang diterbitkan.
## Ringkasan harian semua outlet (16 Oktober 2026)

Pilih **Semua outlet** pada pemilih outlet dan **Semua produk** di Forecast. Ringkasan menampilkan estimasi omzet tercakup, jumlah dalam pcs/boks terpisah, dan rincian produk yang dapat dibuka per outlet. Produk tanpa pembanding yang cukup tidak dianggap nol. Cisfon Kurma dikeluarkan sesuai arahan pemilik.

Harga Malmil/Ogura harus dihasilkan oleh `integration/lk-esb-prices.mjs`: omzet kelompok di LK September dibagi jumlah pcs kelompok dari API ESB pada outlet dan 30 tanggal September yang sama. Jangan memakai omzet ESB, harga polos, atau omzet COGS untuk menggantikan omzet LK. Cheese/Chocolate memakai rata-rata kelompok karena LK tidak memisahkan rasa. Mini memakai Rp57.000/9 pcs; Cisfon lain memakai harga rekap. Token, kredensial, transaksi dan nilai LK tetap di arsip privat, tidak dimasukkan repository.

Forecast kuantitas masih berasal dari laporan stok harian terverifikasi sampai 13 Oktober. Ringkasan omzet belum diuji balik dalam rupiah, belum menyesuaikan perubahan topping, dan bukan instruksi kiriman otomatis. Jadwal penarikan belum diaktifkan.

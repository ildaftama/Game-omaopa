# Forecast Outlet Oma Opa

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

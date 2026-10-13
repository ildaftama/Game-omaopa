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

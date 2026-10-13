# Forecast Outlet Oma Opa

Halaman publik: https://omaopa.fun/forecast/

Peta, penduduk, demografi, kegiatan, wisata, lalu lintas dan Analisa dapat dibuka tanpa login. Tidak ada form penambahan data manual.

Analisa awal menggunakan 91 hari Net Sales gabungan dari laporan keuangan harian, 13 Juli–11 Oktober 2026. Dua belas Oktober belum terisi. Terdapat 11 kegiatan historis dengan tautan resmi. Persentase perubahan membandingkan hari sejenis, bukan bukti pengaruh kegiatan pada outlet tertentu. Omzet harian per outlet dan arsip lalu lintas belum tersedia.

Data omzet mentah tidak berada di repository ini. Halaman hanya memuat ringkasan persentase dan indeks. Arsip awal disimpan lokal secara privat; integrasi penyimpanan Firebase disiapkan tetapi penarikan ESB belum aktif. Koneksi ESB memerlukan GitHub Secrets; jadwal otomatis belum diatur.

Pembanding tambahan berasal dari 28 hari sebelum periode. Cuplikan delapan titik jalan Surakarta disimpan pada 13 Oktober 2026; waktu pengukuran sumber tidak tersedia, belum dipetakan ke outlet, dan tidak digunakan sebagai riwayat tiga bulan.

Cuplikan Semarang berisi hitungan mobil dan motor di 37 ruas, berlabel hari ini pada sumber. Belum ada arsip tanggal terdahulu atau pencocokan radius outlet. Hitungan tidak dijumlahkan antar ruas.

Rangkuman trafik 13 Oktober 2026 memuat tiga jalan bernama terdekat untuk setiap 30 lokasi dari KMZ, berdasarkan geometri OpenStreetMap. Jarak ke garis jalan bukan kepastian akses pintu outlet. Nama outlet Gajah Raya, misalnya, terletak paling dekat Jalan Tlogosari Raya pada KMZ ini.

Terdapat 10 rujukan pada 4 outlet: Sampangan (survei 2016), Tajem (publikasi/analisis 2021), Boyolali (laporan 2022, SMP/jam), dan Jakal UII (Dishub DIY 2024, rasio V/C). Sampangan dan Tajem memiliki hitungan kendaraan fisik. Rujukan koridor/pendekat lama bukan trafik terkini di depan outlet. Tidak ada baseline terbaru yang layak dipakai menetapkan batas minimum relokasi. Tanggal/hari survei yang tidak tersedia tidak dikarang.

traffic-baseline.js hanya mengubah hitungan kendaraan dengan durasi pengamatan yang jelas menjadi kendaraan/jam. SMP dan rasio V/C tidak diubah menjadi kendaraan. Perbandingan lokasi memerlukan titik di depan outlet terverifikasi, arah, tahun, kelompok hari dan periode jam yang sama, serta sedikitnya tujuh hari pengukuran. Data yang sekarang tersedia tidak memenuhi syarat tersebut, sehingga tidak dibuat peringkat relokasi.

Nama/geometri jalan © OpenStreetMap contributors, ODbL. Tautan sumber survei ada pada setiap rujukan. Arsip road_profiles dan traffic_references dipisahkan dari pengukuran harian agar data lama tidak masuk korelasi omzet 2026.

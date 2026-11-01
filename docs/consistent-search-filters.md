# Pencarian dan filter yang konsisten

Komponen SearchField menyediakan label, type=search, batas panjang, hapus pencarian dan pengembalian fokus. ListFilters menyediakan ringkasan memuat/gagal/jumlah hasil, kategori filter aktif dan Reset filter yang tidak men-submit form. Tata letak mobile satu kolom.

Digunakan oleh 10 panel daftar: pengguna, data akademik, authoring ujian/soal, bank soal, monitoring, kartu peserta, media, hasil/analitik, audit dan antrean koreksi. Monitoring/kartu juga dipakai portal pengawas. Form konfigurasi, dialog mutasi dan pencarian panduan tetap mengikuti kebutuhan modul masing-masing.

Filter atau pencarian pada daftar berhalaman mengembalikan page=1. Reset mempertahankan konteks jenis master, ujian kartu/monitor, view media serta pengaturan ekspor; bukan tindakan menghapus data atau pilihan massal. Hasil mereset seluruh filter daftar termasuk kelas/mapel/ujian/status/urutan. Pilihan massal tetap dikendalikan tombol terpisah.

Pengguna memakai abort controller, pemeriksaan aborted sesudah JSON dan debounce 250 ms. Bank/media/hasil/audit memakai nomor urut permintaan dan cleanup invalidation, debounce 250 ms. Monitoring/kartu juga menolak hasil konteks lama, dengan refresh otomatis tetap berjalan tanpa men-debounce timer. Pesan list error terpisah dari pesan mutasi. Server tetap menentukan cakupan/izin dan semantik query, bukan filter di browser.

Media memakai parameter search yang telah tersedia untuk object_path; label pencarian nama berkas mencakup bagian nama pada path. Tidak menambah indeks atau SQL. Pencarian lokal literal case-insensitive dengan trim luar, bukan regex/wildcard. Audit menolak rentang Dari >= Sebelum sebelum query.

Tidak ada migrasi atau perubahan database/endpoint/hak CRUD. Halaman tetap 23. Tidak menyimpan state pencarian ke URL, database atau localStorage.

Validasi: unit substring literal/trim/kapital; browser fixture pada sepuluh panel, 320/390/768/1440 px, reset/hapus/fokus, page=1, query trim/batas panjang, penolakan respons bank lama, kondisi gagal vs kosong, konteks reset dan pengiriman query media/hasil/audit. Fixture bukan UAT akun produksi atau perangkat fisik.

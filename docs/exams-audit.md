# Audit Ujian dan bank soal — 1 November 2026

Lingkup: `/dashboard/exams`, AuthoringPanel, preview/media, API authoring, schema/import, RPC/RLS serta navigasi ke persiapan. Halaman pustaka bank soal lintas ujian `/dashboard/bank` tetap merupakan modul terpisah.

## Temuan dan perbaikan

- Referensi ujian/kelas/config/subject/periode sebelumnya hanya satu respons PostgREST (batas default 1.000). Semua pembacaan kini memakai halaman 500 baris, urutan stabil dan batas waktu 15 detik; tetap client pengguna/RLS, organisasi eksplisit pada tabel induk. Versi saat ini dipetakan dengan Map; versi hilang gagal secara jelas, bukan payload undefined. ID ujian divalidasi sebelum membaca dan ujian tak berizin menghasilkan 404.
- Fetch awal dan refresh memakai jalur terpisah, error/HTML/payload tak valid tidak dibatasi atau diperiksa. Kini satu load dengan abort, sequence, live guard, schema dan deadline. Snapshot yang gagal disegarkan tetap terlihat tetapi perubahan diblokir dengan aksi retry.
- State busy bukan pengunci sinkron sehingga double submit dan perubahan konteks saat mutation dapat terjadi. Lock ref, fieldset disabled, pembatalan klien/unmount dan larangan menutup modal saat pending melindungi konteks. Tidak ada retry mutation otomatis; hasil tidak pasti memerlukan refresh. Pembatalan klien tidak membatalkan transaksi server yang sudah dimulai.
- ID request dipakai bersama editor dan impor, serta isi editor dapat berubah menggunakan ID lama setelah hasil parsial. Keduanya kini terpisah; editor mengaitkan ID dengan snapshot isi/versi/ujian, impor dengan preview. Pergantian ujian membuang preview/teks/pilihan yang terikat ujian lama. Impor mengosongkan preview setelah hasil diterima dan refresh satu kali.
- Pergantian tipe pada edit memanggil editor baru dan menghilangkan question_id. Pergantian tipe kini mempertahankan question_id, expected_version dan isi bersama (stem/poin/arah/lampiran), sambil menyiapkan opsi/kunci yang sesuai tipe baru. expected_version dan immutable history tetap dipertahankan.
- Pagination soal dapat tertinggal di halaman kosong setelah arsip. Halaman diturunkan dari batas hasil, pilihan dipangkas setelah refresh; maksimal 500 pilihan sesuai API. Arsip memakai konfirmasi dan tetap bukan penghapusan permanen.
- Status efektif sebelumnya memakai waktu snapshot tanpa berjalan. Jam diperbarui dengan offset waktu server; UI mencerminkan penguncian start/status/periode Guru, kuota dan konfigurasi, sementara server tetap otoritatif. Pratinjau/riwayat tetap tersedia saat terkunci.
- Periode aktif tanpa rentang valid ditolak sebelum RPC. Field periode diberi key agar tersinkron setelah refresh. Impor diperiksa berdasarkan byte UTF-8 maksimal 5 MB; null JSON tidak lagi diakses sebagai objek. Upload maksimal 10 lampiran dibatasi waktu dan perubahan draft dilindungi lock.
- Respons mutasi kosong/transport gagal tidak dianggap sukses, error internal SQL disamarkan; exception bisnis P0001 tetap dapat dibaca. API/format hasil dan transaksi RPC lama dipertahankan.
- Tabel/modal/toolbar diberi gaya scoped, wrapping, kontrol sentuh, scroll internal dan feedback. Identitas visual aplikasi dipertahankan.

## Kompatibilitas

Tidak ada halaman, dependency, role, endpoint, schema database, migrasi, atau Edge Function baru. Pembuatan/edit/duplikasi jadwal, PIN hash, konfigurasi lima tipe, periode, impor JSON/Excel/legacy/Google Forms, media, salin/arsip dan versi tetap menggunakan alur lama. Referensi nonaktif dibaca untuk mengidentifikasi jadwal lama; server tetap menolak referensi nonaktif untuk konfigurasi baru. Snapshot jawaban/sesi ujian berjalan tidak diubah.

## Validasi

`npm run check`: 272 tes lulus, 3 dilewati pada 43 file; lint tanpa error baru (satu warning lama pada pengaturan AI), typecheck dan production build lulus. Sebanyak 12 tes audit baru menguji auth/scope, validasi awal, lebih dari 1.000 baris, dependency gagal, ujian tak berizin, versi hilang, periode, hasil mutasi tak pasti, receipt salah, ukuran byte dan lock.

Browser final pada halaman/komponen produksi: Admin/Guru, 320/390/768/1024/1440 px, layar pendek 320×320, orientasi, teks 200%, touch, axe, batas viewport dan tidak ada pageerror. Alur tambah jadwal, edit soal termasuk perubahan tipe dengan ID/versi tetap, penguncian modal/single-flight, arsip/pagination, impor/satu-refresh/pergantian konteks, pratinjau lampiran gagal/retry, salin, duplikasi, periode, arsip ujian, data kosong, payload malformed, error, timeout baca dan hasil mutasi tidak pasti lulus. Respons API/aktor disimulasikan; tidak mengklaim uji fisik perangkat atau jaminan bebas seluruh bug.

Regresi 10 panel pencarian/filter pada 320/390/768/1440 px lulus. RLS delapan tabel ujian/soal/periode/lampiran/media diperiksa read-only dan tetap aktif. Tidak ada migrasi yang diperlukan. Browser memakai fixture aktor/API pada komponen/halaman produksi, tanpa perubahan data akademik atau pengiriman email produksi. Uji fisik perangkat serta UAT pengguna belum diklaim.

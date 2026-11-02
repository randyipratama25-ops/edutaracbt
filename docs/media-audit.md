# Audit Media soal — 2 November 2026

## Temuan dan perbaikan

- Daftar SQL memakai alias `m` yang berbenturan dengan variabel PL/pgSQL; pencarian dari frontend belum digunakan. Migrasi menetapkan resolusi kolom, mencari ID/path secara literal sebelum pagination dan mengurutkan `created_at,id` secara deterministik. Nama asli unggahan lokal lama memang tidak disimpan; label pencarian diperbaiki tanpa mengarang data.
- Daftar dan cleanup dimuat dalam satu Promise.all sehingga cleanup gagal ikut menyembunyikan daftar valid. Kontrak Zod, batas waktu, abort/generasi dan single-flight melindungi lifecycle; dua status error dipisah. Pagination langsung mengosongkan konteks lama dan dikoreksi saat total menyusut.
- busy state tidak mencegah dua event input/drop/hapus dalam tick yang sama. Lock sinkron, fieldset, snapshot target dan pencegahan penutupan modal menjaga operasi. Tidak ada retry mutation otomatis; unggah batch berhenti setelah hasil tidak pasti dan meminta pemeriksaan daftar.
- Unggah belum memvalidasi receipt, tipe/ukuran lokal atau keberlanjutan loop setelah unmount. Maksimal 25 berkas, 5 MiB, whitelist MIME, pengecekan server/magic/checksum dan receipt UUID tetap wajib. Batch memproses file valid secara berurutan; tidak meneruskan batch setelah respons tak pasti.
- INSERT metadata yang kehilangan respons sebelumnya dapat diikuti penghapusan bytes, padahal transaksi mungkin sudah commit. Kompensasi hanya untuk penolakan database definitif; bytes dipertahankan untuk hasil tak pasti/missing receipt. Tidak ada overwrite objek sumber.
- Hapus tidak memvalidasi path/cleanup_id dan mengabaikan kegagalan cleanup_done. Receipt divalidasi; kegagalan Storage, transport atau acknowledgement tetap dilaporkan pending. SQL menolak menutup tiket selama objek masih ada. Policy SELECT Admin memakai helper scoped yang sudah ada untuk target cleanup setelah metadata hilang, mempertahankan proteksi referensi/backup dan grant/RLS lama.
- Preview tidak menangani kegagalan gambar/audio dan memperbarui src audio setiap 50 detik. Ada retry/batas waktu/pembatalan; renewal tidak mengganti audio aktif atau audio dengan posisi pemutaran, dan retry dapat memulihkan posisi. Clipboard diperiksa dan gagal secara terkendali.
- Drive ditampilkan ke Guru, pilihan bisa melebihi 25 dan waktu impor berpotensi melebihi eksekusi. Tampilan Admin-only mengikuti server, pilihan dibatasi 25, pagination/deduplikasi tetap, metadata ukuran diverifikasi, denominator unik dan anggaran batch membatasi penjadwalan berikutnya. Timeout klien impor disesuaikan tanpa mengubah default permintaan lain.
- Galeri/tabel, path/UUID panjang, unggah, toolbar dan daftar cleanup/Drive mendapat wrapping, sticky table/scroll internal, feedback dan batas dialog mobile.

## Kompatibilitas dan migrasi

Dibaca sebelum edit: page/dashboard layout, MediaPanel/MediaPreview, API media/manage/drive/authoring/media, storeMedia/readBounded/validateMedia, caller unggah dan preview authoring, media RPC/reference/Storage policies/backup/bank wrappers, shared transport/dialog/filter/CSS dan pengujian.

Migrasi additive `20261102022942_media_search_audit.sql` dibuat dengan CLI, diuji pada seluruh schema terisolasi, lalu diterapkan ke staging. Hanya definisi fungsi dan policy terkait yang berubah; tidak menghapus baris atau objek. Hasil penerapan produksi dicatat dalam PR. Tidak ada tabel/kolom, role, endpoint, dependency atau halaman baru (inventaris23). RLS, owner/organization, batas ukuran/format, source+hash Drive, snapshot/bank/branding/report/backup dan immutable storage dipertahankan.

Security advisor dibandingkan sebelum/sesudah: temuan lama tabel private tanpa policy adalah default-deny dengan akses RPC, bukan alasan membuka RLS. Peringatan konfigurasi Auth lama tidak termasuk perubahan Media; referensi: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . Tidak ada pelebaran akses anon atau service-role key pada klien.

## Validasi

- `npm run check`: 332 passed, 3 skipped, lint tanpa error (satu warning AI settings lama), TypeScript dan build produksi lulus.

- 17 regresi baru: kontrak daftar/Drive/receipt, file kosong/tipe/5MiB, page/MIME/search, anon/origin, receipt hapus sebelum Storage, error/throw Storage, acknowledgement cleanup salah, cleanup berhasil, error SQL/ref protected, UUID, multipart, Drive Admin, kompensasi INSERT tidak pasti/definitif dan immutable upload receipt.
- Database terisolasi: pencarian case-insensitive sebelum pagination 55 berkas menjadi 50+5, ID tepat, `%` literal, MIME, urutan tie deterministik, cakupan Guru/Admin, serta cleanup lintas uploader oleh Admin. Tiket tidak dapat ditutup sebelum bytes dihapus. Regresi operasional/referensi/bank/history/deadline tetap melalui suite proyek.
- Browser komponen produksi: Admin/Guru, 320/390/768/1024/1440, galeri+tabel, orientation/layar pendek/text200/touch; axe WCAG A/AA pada panel/dialog tanpa pelanggaran dan tidak ada pageerror/horizontal overflow. Galeri/table, protected state/server reference race, preview retry, clipboard unavailable, cleanup-read parsial, input/drop lock, tipe/batch invalid, uncertain stop, delete dialog lock, cleanup, search/page clamp/stale/malformed, Drive25/pagination/import/role lulus.
- Fokus audio: WAV nyata diputar dengan renewal dipercepat; src tidak berubah saat aktif dan posisi jeda dipertahankan. Browser menulis API/Storage/Drive fixture, bukan media operasional.

Pengujian tidak mengunggah, menghapus atau mengimpor media produksi/Drive pengguna. Hasil INSERT/storage yang belum pasti tidak diklaim rollback; periksa daftar dan audit sebelum pengiriman ulang. UAT seluruh perangkat fisik dan jaminan bebas bug pada semua kondisi tidak diklaim. Scroll vertikal normal dan scroll tabel internal tetap tersedia.

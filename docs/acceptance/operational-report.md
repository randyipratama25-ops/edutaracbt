# Verifikasi operasional — 29 Oktober 2026

Penerimaan operasional BELUM DISAHKAN. Aktivasi fitur bukan pengesahan UAT.

## Keputusan pemilik

150 siswa bersamaan; p95 login/submit <=3 detik, autosave <=1,5 detik, error <=1%, kehilangan jawaban 0. Gmail/Google Workspace dipilih. Dataset legacy belum tersedia; tidak diasumsikan fresh start.

## Produksi

- automation_enabled=true; satu cron Supabase edutara-operations.
- Operations-worker v1 ACTIVE, verify_jwt=true, nonce/lease per job.
- Retensi BACKUP 180 hari aktif, dua backup sukses terbaru tetap dilindungi. Ini bukan retensi seluruh lampiran materi/siswa. Job retensi pertama berhasil 100%; tidak ada file kedaluwarsa yang dihapus pada uji awal.
- Migrasi 20261029145948 terpasang. Reservasi sebelum penghapusan menjaga organisasi, umur backup, dua backup terbaru dan lease. Admin tidak dapat retry backup yang sedang dihapus; job retensi lain tidak dapat merebutnya. Helper RPC hanya service_role.
- reminders_enabled=false, App Password Gmail belum tersimpan. Pengirim dan App Password perlu diisi langsung pada Pengaturan > Kredensial rahasia. Jangan mengirim password melalui percakapan.
- SMTP untuk pengingat aplikasi berbeda dari konfigurasi SMTP Supabase Auth untuk undangan/reset. Pengiriman inbox dan pemulihan end-to-end belum diverifikasi.

Status produksi di atas dibaca ulang setelah pekerjaan dilanjutkan.

## Staging dan hasil uji

Proyek staging terisolasi pada organisasi Free yang dipilih pemilik; kutipan biaya US$0/bulan. Preview branch uat-150 memakai URL/key staging dan marker isolated khusus branch; env produksi tidak diubah. Identitas sintetis: 150 siswa dan 3 petugas. Ujian: 20 PG. Tidak ada PII atau kredensial uji di repository.

Uji sebelumnya menjalankan 150 login paralel langsung ke Supabase staging, lalu start, tiga siklus save dengan replay, resume dan submit. Hasil ini BACKEND ONLY, bukan SLO browser/Next.js.

| Ukuran | Hasil tercatat |
|---|---|
| Siswa menyelesaikan ujian | 30/150 |
| Login ditolak rate limit | 120 |
| Requests / errors | 420 / 120 |
| Error rate | 28,57% |
| p95 login berhasil | 9965 ms |
| p95 autosave berhasil | 531 ms |
| p95 submit berhasil | 484 ms |
| Perbedaan jawaban pada sesi yang selesai | 0 |

Uji TIDAK LULUS SLO. Angka latency berasal dari request berhasil saja. Tidak mengklaim kehilangan jawaban 0 untuk seluruh 150 siswa, karena 120 siswa tidak mencapai attempt.

Pembacaan ulang database staging mengonfirmasi: 150 siswa, 30 attempt final, 600 jawaban, 1800 revisi jawaban, 600 grade_items dan 30 revisi penilaian. Ringkasan pengukuran di atas dipertahankan dari keluaran pengujian sebelumnya; log mentah lokal sesi itu tidak tersedia lagi. Tidak dibuat ulang atau diberi label sebagai pengukuran baru.

Simulasi login/modal pemulihan pada build lokal sebelumnya lulus di lebar 360, 390, 768 dan 1366 px, tanpa overflow horizontal/pageerror dan modal muat layar. Ini halaman publik dan simulasi viewport, bukan perangkat fisik atau UAT semua peran. Bukti gambar lokal sesi sebelumnya tidak tersedia lagi; hasil tidak diklaim sebagai screenshot baru.

Preview terproteksi. Pembuatan share link sementara sebelumnya ditolak automatic approval karena memperluas akses kepada pemilik link. Tidak menonaktifkan proteksi atau membuat bypass sebagai pengganti.

## Pengujian dan pemulihan kode

Kode operations-worker dipulihkan dari versi 1 yang sedang ACTIVE; SQL migrasi dari catatan migrasi Supabase. Keduanya dicocokkan terhadap main. Uji integrasi retensi dipulihkan agar dijalankan CI bersama pengujian database yang sudah ada. Driver HTTP diperbaiki supaya error semantik/idempotency tidak ditelan lalu dianggap sukses.

## Gerbang terbuka

1. Investigasi batas login burst di staging sebelum kapasitas 150 diterima. Jangan mematikan proteksi untuk meluluskan tes. Login bertahap/sesi yang sudah terautentikasi adalah profil uji berbeda dan harus dilaporkan terpisah.
2. Akses preview yang terautentikasi atau izin share link sementara untuk pengujian HTTP/browser lengkap.
3. UAT fisik dan seluruh peran, verifikasi email/pemulihan, serta pengamatan/rollback cloud.
4. Rekonsiliasi legacy saat sumber tersedia. Tidak ada impor produksi contoh atau tanda tangan penerimaan sintetis.

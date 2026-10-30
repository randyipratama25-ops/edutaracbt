# Saran Tahap 5 — Penerimaan operasional

Implementasi 30 Oktober 2026, baseline main `407fa91fa4ece249a973a9a28876010e2a6f3217`.

## Hasil implementasi

- Halaman Admin `/dashboard/acceptance`: observasi teknis organisasi sendiri, indikator kedaluwarsa lima menit, tindak lanjut dan unduhan JSON. API GET saja; role/konteks/organisasi diperiksa kembali. Tidak mengesahkan UAT atau menerbitkan deployment.
- Backup diperbaiki agar menyertakan `private.bank_versions` dan `private.bank_reviews` dengan join organisasi. Transport record berupa string JSON PostgreSQL menjaga presisi nilai desimal; restore lokal menerima string baru dan objek lama. Worker tetap memeriksa nonce/lease/service-role sebelum memproyeksikan format baru.
- Inventaris rollback mencakup snapshot/rubrik, bank/versi/review/paket/pemakaian, moderasi, jadwal publikasi dan bantuan. Latihan restore terisolasi membandingkan SHA seluruh baris terlindungi.
- Manifest rilis v2 memeriksa ketiga scheduler sesuai tujuan; v1 ditolak. Bukti kandidat SHA, backup, keamanan, UAT, SLO, recovery dan keputusan pemilik tetap wajib.
- Driver beban menghitung SLO dengan denominator lengkap, 150 peserta selesai, sampel latency cukup, profil uji eksplisit, tanpa selisih jawaban/kesalahan semantik. Tidak menyebut sampel 30 peserta berhasil sebagai kapasitas 150.

## Bukti dan batas penerimaan

`npm run check`: lint, TypeScript, 147 tes lulus dan 2 dilewati, build produksi. `npm run test:database`: seluruh regresi lulus, termasuk backup versi/review bank, isolasi organisasi, privasi snapshot Admin, grant dan restore dengan inventaris identik. Browser fixture 320/390/768/1440 menguji snapshot, unduhan berstatus belum disahkan, error/retry dan penghapusan data tampilan usang. Browser memakai API simulasi, bukan perangkat fisik atau sesi Admin produksi.

Pengamatan produksi sebelum migrasi pada organisasi utama: automation/reminders aktif, SMTP sender/secret tersedia, worker disetujui, retensi backup 180 hari, tiga cron aktif, tidak ada attempt belum final. Konfigurasi bukan bukti inbox atau keutuhan backup yang diunduh. Tidak ada secret dibaca balik.

Kapasitas 150 tetap belum diterima: pengujian burst backend terdahulu hanya 30/150 selesai dan 120 rate-limit (28,57% error request). Pengujian baru tidak dibuat-buat dan proteksi tidak dinonaktifkan. UAT perangkat fisik, dataset legacy/freeze/delta, latihan rollback cloud/media/Auth/Vault, bukti inbox/recovery terbaru serta persetujuan pemilik tetap terbuka. Merge implementasi bukan pengesahan cutover operasional. Lihat `uat-signoff.md`, `operations-runbook.md`, dan laporan operasional historis.

Migrasi maju `20261030055417_operational_acceptance.sql` tidak menulis ulang jawaban/nilai historis. Backup baru setelah perbaikan diperlukan untuk bukti cakupan terbaru; latihan restore hanya pada database terisolasi.

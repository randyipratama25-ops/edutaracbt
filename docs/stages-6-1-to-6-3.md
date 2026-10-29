# Tahap 6.1–6.3 — status 29 Oktober 2026

## Implementasi
Pengaturan Admin, branding login, secret Vault tanpa readback, audit append-only, job queue dengan lease/nonce/deduplikasi, scheduler tunggal Supabase, backup data/media dengan manifest/checksum dan restore terisolasi. Worker khusus backup disiapkan dengan JWT aktif. Worker lengkap hanya kode, belum di-deploy; SMTP dan retensi tetap dinonaktifkan.

Pipeline legacy: export-template.gs, transformasi/dry-run/karantina, load-staging dan parity. Driver beban menolak produksi dan memerlukan proyek staging terpisah.

## Validasi aktual
- Lint, TypeScript dan build produksi lokal lulus.
- Vitest: 67 lulus, 2 dilewati (8 berkas).
- Integrasi database Tahap 4, 5 dan 6 lulus dengan facade Auth/Storage/Vault/Cron/HTTP lokal.
- Restore terisolasi: 28 tabel, 118 rekaman, parity sama; 5 identitas memerlukan aktivasi ulang. Kredensial Auth, sesi dan nilai secret Vault tidak diekspor.
- Pembatasan Admin, secret tanpa readback, audit immutable, deduplikasi, batas semester/zona waktu, nonce, checksum serta penolakan artefak rusak lulus.

## Produksi dan penerimaan
Migrasi 20261029133618 serta koreksi 20261029133921 telah diterapkan dengan izin eksplisit pemilik. PR #6 di-merge pada 3868c82. Backup-worker JWT aktif dan backup smoke produksi berhasil; identity-gateway versi 5 memakai domain utama. Domain utama sudah diarahkan ke deployment Tahap 6. SMTP/retensi tetap nonaktif, automation_enabled=false walaupun satu cron sudah terpasang.

Gerbang terbuka: dataset legacy/migrasi native penuh, UAT perangkat, staging beban dan SLO, pengiriman email, serta restore cloud/Auth/Vault. Tidak ada klaim penerimaan penuh 6.2/6.3. Prosedur disable non-destruktif ada pada supabase/proposals/stage6-disable.sql; harus dipasangkan dengan aplikasi kompatibel dan tidak dijalankan sebagai latihan produksi.

## Penerapan disetujui dan terverifikasi
Pemilik memberikan izin eksplisit. Migrasi 20261029133618 diterapkan; backup-worker versi 2 ACTIVE dengan verify_jwt=true, full_worker_approved=false. SMTP dan retensi tetap nonaktif. Job smoke backup produksi 9e895868-859d-4e66-9074-572bafd7d924 succeeded 100%, checksum manifest 812a08ede79d09307b395159fa9403d43b1f495c74d2da7aec8af4032df61300. Anon dan authenticated tidak memiliki izin worker_command. Advisor hanya melaporkan tabel deny-by-default tanpa policy (INFO) dan perlindungan password bocor belum aktif (WARN). Catatan blokir sebelumnya adalah riwayat; penerapan ini telah diizinkan. Gerbang UAT/migrasi legacy/beban tetap terbuka.

Regresi skema lengkap menemukan policy backup yang membaca tabel privat dari konteks pengguna. Migrasi koreksi 20261029133921 memindahkan pemeriksaan ke helper terikat Admin/organisasi. Integrasi Tahap 4/5/6 diulang dengan kedua migrasi dan lulus; akses Storage tanpa sesi tidak error dan tidak menampilkan backup.

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
Migrasi supabase/proposals/stage6.sql BELUM diterapkan. Auto-review menolak perubahan produksi yang mencakup skema, RLS/grant, trigger, cron, dispatch worker dan fungsi akses data karena belum ada persetujuan eksplisit untuk dampak tersebut. Jangan menerapkan lewat jalur alternatif untuk menghindari penolakan.

PR belum boleh di-merge sebelum migrasi dan worker terverifikasi: UI baru bergantung pada RPC/skema baru. Worker backup belum di-deploy; transport belum dikonfigurasi. Worker penuh tetap nonaktif. Rollback non-destruktif: supabase/proposals/stage6-disable.sql, untuk digunakan hanya setelah migrasi diterapkan; mempertahankan data/audit.

Gerbang terbuka: sumber data legacy belum tersedia, migrasi staging penuh belum dilakukan, UAT semua peran/perangkat fisik belum disahkan, staging beban/akun/SLO belum tersedia, uji beban nyata belum dijalankan, SMTP/Drive nyata belum diverifikasi. Tidak ada klaim penyelesaian operasional 6.2/6.3 atau kesiapan cutover.

## Urutan penerapan setelah persetujuan
1. Verifikasi ulang backup pra-Tahap 6, attempt operasional, diff skema, dan hasil pengujian.
2. Terapkan proposal secara transaksional, catat versi migrasi sebenarnya ke repositori.
3. Deploy backup-worker dengan verify_jwt=true dan dependensi relatif; konfigurasikan transport JWT publik server-side. full_worker_approved harus tetap false.
4. Verifikasi job backup dan manifest/checksum, RLS/RPC, cron tunggal serta advisor keamanan.
5. Merge PR, verifikasi deployment dan HTTP. Jangan mengaktifkan SMTP/retensi sebelum persetujuan terpisah.

## Penerapan disetujui dan terverifikasi
Pemilik memberikan izin eksplisit. Migrasi 20261029133618 diterapkan; backup-worker versi 2 ACTIVE dengan verify_jwt=true, full_worker_approved=false. SMTP dan retensi tetap nonaktif. Job smoke backup produksi 9e895868-859d-4e66-9074-572bafd7d924 succeeded 100%, checksum manifest 812a08ede79d09307b395159fa9403d43b1f495c74d2da7aec8af4032df61300. Anon dan authenticated tidak memiliki izin worker_command. Advisor hanya melaporkan tabel deny-by-default tanpa policy (INFO) dan perlindungan password bocor belum aktif (WARN). Catatan blokir sebelumnya adalah riwayat; penerapan ini telah diizinkan. Gerbang UAT/migrasi legacy/beban tetap terbuka.

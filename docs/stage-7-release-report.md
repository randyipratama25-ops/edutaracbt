# Tahap 7.0 — persiapan cutover, rollback dan serah-terima

Status: implementasi alat/runbook; cutover operasional akhir BELUM DITERIMA.

| Item | Hasil aktual |
|---|---|
| 7.0-01 | Runbook, panduan peran dan agenda pelatihan disusun; pelatihan belum dilaksanakan |
| 7.0-02 | Preflight read-only: 0 attempt operasional belum final pada 29 Oktober 2026 20.58 WIB; snapshot harus diulang saat cutover |
| 7.0-03 | Prosedur freeze/final backup disusun; sumber legacy belum tersedia, freeze tidak dilakukan |
| 7.0-04 | Pipeline staging tersedia dari Tahap 6; delta produksi belum dijalankan |
| 7.0-05 | CI dan deployment untuk paket ini diperiksa; smoke seluruh peran belum disahkan |
| 7.0-06 | Domain sudah menunjuk Tahap 6 setelah izin pemilik sebelumnya; tidak dianggap cutover legacy final |
| 7.0-07 | Satu cron edutara-operations terpasang; automation_enabled=false, SMTP/retensi nonaktif |
| 7.0-08 | Checklist observasi login/autosave/submit/jobs disusun; periode observasi final belum disepakati |
| 7.0-09 | Gate preservasi protected rows dan latihan disable lokal tersedia; failover produksi belum dilatih |

## Bukti baseline yang diverifikasi

Produksi sebelum paket ini: commit 3868c82, deployment READY, domain utama Tahap 6. Identity-gateway ACTIVE versi 5, perubahan satu URL redirect; konfigurasi JWT tidak diubah. Backup smoke Tahap 6 succeeded 100% dengan manifest checksum 812a08ede79d09307b395159fa9403d43b1f495c74d2da7aec8af4032df61300. Backup itu bukan pengganti final backup sebelum cutover mendatang.

Preflight 2026-10-29T13:58:36Z: 0 attempt operasional belum final; 1 cron aktif; automation_enabled=false; full_worker_approved=false. Angka ini tidak menjadi pengunci start ujian atau bukti beban/UAT.

## Alat rilis

`npm run release:check -- docs/release/manifest.pending.json` harus exit 2: manifest sengaja belum memuat bukti yang tidak tersedia. Manifest lokal final memerlukan SHA tepat, bukti pemilik/UAT/keamanan/beban/staging/rollback/backup/recovery, preflight segar, backup final, freeze/delta legacy atau izin fresh start eksplisit. Tool tidak mengeksekusi mutasi produksi.

Gate preservasi menolak kehilangan/perubahan row attempt, jawaban, revisi, media jawaban dan nilai setelah rollback. Latihan database terisolasi menggunakan skema aplikasi, lifecycle fixture dan disable Tahap 6; tidak menghapus atau memodifikasi data produksi. Hasil final pengujian dan PR dicatat dalam laporan pengujian dan CI.

## Batas penerimaan

Dataset legacy, parity native penuh, UAT perangkat, SLO/beban, pengiriman email dan rollback cloud/Auth/Vault belum lengkap. Jangan menyatakan Tahap 7.0 selesai terverifikasi, melakukan restore produksi, menutup aplikasi lama, atau mengaktifkan otomasi/email/retensi berdasarkan merge ini saja.

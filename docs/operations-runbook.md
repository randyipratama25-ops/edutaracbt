# EDUTARA CBT — runbook rilis dan operasi

Status: diperbarui pada Saran Tahap 5 (30 Oktober 2026). Merge kode/runbook bukan pengesahan cutover akhir.
Penanggung jawab keputusan: pemilik madrasah; operator teknis menyiapkan bukti dan mencatat setiap tindakan. Tidak ada penanggung jawab atau tanda tangan yang diasumsikan.

## Gerbang sebelum cutover

1. Tetapkan kandidat commit dan deployment Vercel yang tepat, proyek Supabase `cwklpfplqoofvehlyfvd`, serta domain `https://edutara-cbt-ashen.vercel.app`. Verifikasi identitas proyek, region dan lingkungan sebelum tindakan.
2. Lengkapi `docs/uat-signoff.md`: Admin, Guru, Pengawas dan Siswa, perangkat nyata, akses lintas objek, koneksi terputus, autosave/submit/timeout. Akun Orang Tua atau peran lain tidak dianggap didukung tanpa implementasi dan UAT.
3. Lampirkan hasil keamanan, uji beban staging, SLO yang disetujui, pengiriman/pemulihan akun, dan latihan rollback. Semua proof harus terkait candidate_sha; perubahan kandidat mengharuskan peninjauan ulang bukti.
4. Putuskan data_mode: `legacy` memerlukan freeze mutasi sumber, backup final sumber/tujuan/media dan rekonsiliasi delta. `fresh` memerlukan keputusan eksplisit pemilik untuk mulai tanpa migrasi; ketiadaan dataset bukan izin fresh start.
5. Usulkan masa pengamatan 60 menit setelah smoke semua peran dan satu siklus autosave-submit selesai. Durasi ini belum disepakati; pemilik harus mengesahkannya pada bukti rilis.
6. Jalankan SQL read-only `scripts/release/preflight.sql`. Pastikan tidak ada attempt belum final, termasuk locked/disqualified yang belum dituntaskan. Jangan reset/hapus attempt agar angka menjadi nol. Jadwalkan jendela setelah ujian selesai; ulangi preflight maksimal lima menit sebelum pengalihan.
7. Verifikasi final backup status succeeded, semua checksum/bytes data dan media, unduhan manifest dan bagian, serta latihan restore. Backup aplikasi tidak mencakup password/sesi Auth atau secret Vault: siapkan reaktivasi akun dan konfigurasi secret secara terpisah.
8. Lengkapi manifest lokal v2 dari `docs/release/manifest.pending.json`, lampirkan proof yang telah diperiksa, lalu jalankan `npm run release:check -- /lokasi/manifest.json`. Exit 2 berarti STOP. Tool hanya memvalidasi pernyataan bukti lokal, bukan tanda tangan digital atau otorisasi server; operator wajib memeriksa artefak aslinya. Tidak mengeksekusi rilis otomatis.

## Freeze, delta, deployment dan trafik

- Umumkan jendela yang disetujui melalui kanal operasional oleh petugas; runbook tidak mengirim pesan otomatis.
- Untuk legacy, hentikan mutasi pada aplikasi sumber dengan mekanisme pemilik sumber yang terverifikasi. Simpan timestamp/batas akhir, ekspor final, ID stabil, checksum media, karantina invalid dan parity count/status/nilai/izin. ETL saat ini hanya staging: jangan mempromosikan ke domain native sebelum pipeline dan parity diterima.
- Pertahankan backup tujuan sebelum import, pemetaan ID dan delta. Jangan timpa nilai historis dengan penilaian ulang. Bila ada selisih yang belum dijelaskan, hentikan cutover.
- Deploy kandidat ke preview/staging terisolasi, jalankan smoke login tiap peran, bank soal, start/save/retry/submit, koreksi/publikasi, kartu/laporan dan job. Jangan gunakan akun/PII produksi untuk beban staging.
- Deploy produksi setelah semua gerbang terpenuhi. Verifikasi deployment READY dan SHA. Dalam transaksi cutover yang dikelola operator, tutup jendela start ujian sesuai mekanisme yang telah diuji; tidak ada atomic admission lock baru pada paket ini. Preflight adalah snapshot, bukan pengunci start. Jika start baru masih dimungkinkan, jangan mengalihkan.
- Alihkan domain hanya setelah izin rilis yang mencakup deployment/domain tersebut. Verifikasi alias setelah pengalihan: alias manual dapat tetap menunjuk deployment lama meskipun main sudah ter-deploy.
- Scheduler: gunakan satu job per fungsi: `edutara-operations` tiap menit, `edutara-recovery-retention` tiap 15 menit dan `edutara-results-publication` tiap menit; jangan tambahkan scheduler duplikat atau Vercel Cron. Keberadaan cron tidak berarti automation_enabled aktif. Aktivasi otomasi memerlukan review jadwal/status ujian dan uji staging; jangan mengaktifkannya hanya untuk mencentang checklist. Produksi organisasi utama telah memiliki otomasi/reminder aktif, SMTP aplikasi terkonfigurasi dan retensi backup 180 hari; baca ulang kondisi saat keputusan. SMTP Auth untuk akun adalah konfigurasi terpisah.

## Pengamatan dan respons insiden

Catat timestamp awal/akhir, SHA, URL/deployment, penguji, hasil dan artefak pada laporan pascarilis. Periksa setiap lima menit selama jendela yang disepakati:

| Sinyal | Pemeriksaan | Respons |
|---|---|---|
| Runtime | /api/health 200; bedakan dari kesehatan database | Periksa log/error, hentikan rilis bila error berulang |
| Login/akun | Login dan logout nyata per peran, redirect/pemulihan | Jangan minta password melalui percakapan; uji terkontrol |
| Jawaban | ACK autosave, revisi server, konflik/retry, submit satu kali | Kehilangan/korupsi jawaban: insiden kritis, amankan data sebelum rollback |
| Penilaian | ledger, esai pending vs nol, publikasi hanya Admin | Tahan publikasi bila mismatch |
| Job | queued/running/failed/blocked/uncertain, lease dan checksum | Jangan retry email uncertain tanpa rekonsiliasi |
| Akses | Siswa/Guru/Pengawas sesuai scope; anonim ditolak | Tutup akses terdampak dan investigasi |

Target yang disepakati: 150 siswa, p95 login/submit ≤3 detik, autosave ≤1,5 detik, error ≤1%, selisih jawaban 0. Uji burst backend sebelumnya gagal, sehingga kapasitas belum diterima. Jangan menciptakan angka keberhasilan beban; simpan sampel, p95/error rate/kehilangan jawaban dan persetujuan pemilik sebelum cutover akhir.

## Rollback yang menjaga jawaban baru

1. Amankan kondisi saat ini sebelum rollback: inventaris seluruh attempt/jawaban/revisi/nilai/media (termasuk snapshot soal, rubrik/nilai/riwayat, bank/versi/review/paket/pemakaian, moderasi, jadwal publikasi dan bantuan, serta yang dibuat SETELAH backup awal), manifest/checksum file, job dan audit. Simpan di lokasi privat; jangan commit data/PII/URL bertoken.
2. Utamakan rollback aplikasi ke deployment yang kompatibel dengan skema saat ini; pertahankan database dan objek Storage. Periksa kompatibilitas API/RPC/DTO sebelum alias dipindah. Tidak ada down-migration atau restore database produksi otomatis.
3. Jangan mengembalikan database produksi ke snapshot lama: itu dapat membuang jawaban baru. Restore snapshot ke lingkungan terisolasi; gabungkan delta terverifikasi secara terpisah, tinjau konflik dan jangan menimpa revisi terbaru.
4. Ekspor JSON inventory dari SQL read-only `scripts/release/protected-inventory.sql` ke berkas privat sebelum/sesudah. Jalankan `node scripts/release/compare-inventories.mjs /lokasi/before.json /lokasi/after.json` (exit 2 berarti gagal); alat ini memakai `assertAnswersPreserved` dari `scripts/release/gate.mjs`. Setiap row kunci+SHA harus tetap ada; nilai berubah/hilang membatalkan penerimaan. Inventaris harus lengkap dan satu snapshot konsisten, bukan sampel atau jumlah baris saja. Verifikasi bytes media juga secara terpisah.
5. `supabase/proposals/stage6-disable.sql` hanya fallback khusus penonaktifan modul 6, bukan rollback aplikasi lengkap. Ia mencabut RPC/menonaktifkan job sehingga UI versi baru tidak kompatibel. Gunakan hanya setelah persetujuan dan pasangan deployment kompatibel; jangan jalankan pada produksi sebagai latihan.
6. Latihan lokal `node scripts/release/rollback-drill.mjs` memakai PGlite/facade cron dan fixture sintetis, menguji disable tidak mengubah protected rows dan menolak snapshot yang kehilangan revisi. Hasilnya bukan bukti failover cloud, media produksi, Auth/Vault, atau UAT rollback nyata.
7. Setelah rollback, smoke ulang seluruh peran, jawaban/submit dan job; catat alasan, aktor, waktu, SHA dan parity. Aktifkan kembali scheduler/fitur hanya setelah verifikasi tidak ada job ganda.

## Serah-terima

Serahkan manifest final, laporan pengujian, bukti penerimaan, pemetaan legacy, lokasi backup, catatan konfigurasi tanpa secret, panduan peran, daftar masalah terbuka dan prosedur eskalasi. Petugas mengatur kredensial sendiri di kanal aman. Tanda tangan penerimaan tidak dibuat oleh alat otomatis.

## Ringkasan penerimaan di aplikasi

Admin dapat membuka `/dashboard/acceptance` untuk snapshot terbatas organisasi sendiri dan mengunduh observasi tanpa PII/secret. Tombol ini hanya R/ekspor lokal, tidak mengeksekusi deployment, mengaktifkan otomasi, mengirim email, atau mengesahkan UAT. Snapshot berumur >5 menit ditandai kedaluwarsa. Bukti eksternal tetap harus ditinjau dengan kandidat SHA dan penguji yang jelas.

Backup yang dibuat sebelum migrasi `20261030055417_operational_acceptance.sql` tidak menjadi bukti cakupan bank versi/review terbaru. Buat backup baru; worker mengirim `record` sebagai string JSON PostgreSQL untuk mempertahankan seluruh presisi numerik. Helper restore menerima format string baru serta objek lama. Format lama tidak dapat mengembalikan presisi yang sudah hilang. Jangan restore produksi sebagai latihan. Inventaris SHA dibandingkan saat mutasi terkait dihentikan; publikasi cron dapat mengubah baris jadwal secara sah sehingga perlu jendela tenang yang dikelola operator.

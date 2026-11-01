# Pemantauan operasional dan pemulihan berkala

Halaman Admin **Otomasi dan backup** menampilkan heartbeat, usia backup, antrean bermasalah dan tenggat latihan. Data dimuat setiap 60 detik saat halaman terlihat; snapshot lebih dari 2 menit menjadi usang. Heartbeat lebih dari 5 menit perlu pemeriksaan riwayat `edutara-operations` di Supabase Cron. Ini bukan uptime probe eksternal dan tidak dapat melaporkan gangguan saat browser/database sama-sama tidak tersedia.

## Jadwal dan tanggung jawab

- Setiap hari dan sebelum ujian: Admin membuka halaman, memeriksa ketiga Cron pada penerimaan operasional, antrean gagal/blocked/uncertain, backup, dan kondisi peserta. Catat insiden dan periksa log sebelum retry. Jangan retry pengiriman uncertain tanpa rekonsiliasi.
- Setiap pekan: scheduler yang sudah ada membuat satu backup dengan kunci ISO week pada zona sekolah, mengikuti `automation_enabled`. Tidak menambah Cron. Backup mingguan menunggu backup outstanding (queued/running/failed/blocked) ditangani; jendela backup semester mendapat prioritas. Tidak mengubah tenggat atau jawaban ujian. Backup lebih dari 8 hari ditandai perlu tindak lanjut; ini bukan jaminan RPO 8 hari. Sebelum perubahan besar tetap buat backup manual terbaru.
- Senin 05.00 WIB: GitHub Actions `Weekly isolated recovery drill` menjalankan fixture pemulihan, checksum media/rusak, presisi data, isolasi dan perlindungan jawaban. Jadwal GitHub dapat terlambat. Bisa dijalankan manual; laporan JSON tampil di job summary. Aktifkan notifikasi kegagalan Actions pada akun penanggung jawab. Tidak memakai kredensial/data produksi.
- Setiap 30 hari dan sesudah perubahan skema besar: petugas mengunduh backup asli, melakukan pemulihan terisolasi, menguji media/Auth/akses, dan Admin mencatat hasil serta lokasi bukti. Catatan gagal terbaru tetap menandai perlu tindak lanjut. Riwayat sepuluh latihan tampil; catatan append-only, tidak boleh berisi password/secret/data siswa.

## Pemulihan backup asli

1. Dari pekerjaan backup berhasil, unduh manifest dan seluruh bagian. Pertahankan folder `data/` dan `objects/` relatif terhadap direktori artefak. SHA-256 manifest harus dibandingkan dengan `result_checksum` dari pekerjaan asli, bukan hash yang dihitung dari file yang belum dipercaya.
2. Dari root repositori dengan dependency terpasang, jalankan:

   ```bash
   npm run operations:restore -- /private/backup-root /private/manifest.json SHA256_TERVERIFIKASI /private/recovery-report.json
   ```

   Alat hanya membuat PGlite in-memory baru; tidak menerima URL database atau menjalankan restore produksi. Memeriksa manifest, bytes semua bagian, jumlah record/media, urutan foreign key dan kesamaan setiap baris setelah restore. Laporan tidak menyertakan isi baris. Kredensial Auth/sesi/secret tidak ada di backup aplikasi.
3. Laporan `passed` membuktikan pemulihan data terisolasi dan checksum objek. Upload media ke Storage uji, aktivasi ulang Auth, uji akses semua peran, link/media dan alur ujian tetap harus diverifikasi terpisah. Tanpa langkah ini jangan menyatakan pemulihan layanan lengkap berhasil. Pastikan tidak ada jalur menuju resource produksi.
4. Catat `backup_id`, `backup_checksum`, waktu selesai, durasi detik, hasil aktual, lokasi laporan dan hasil/tindak lanjut pada form Admin. Database memvalidasi kepemilikan organisasi, status backup, checksum dan waktu. Catatan merupakan pernyataan Admin; bukan sertifikasi otomatis oleh aplikasi.
5. Setelah bukti disimpan aman, hapus salinan lokal sensitif sesuai kebijakan sekolah. Backup aplikasi tidak menggantikan dump/PITR, escrow secret, atau rencana pemulihan infrastruktur.

## Insiden dan sasaran pemulihan

Amankan jawaban dan inventaris terbaru, catat waktu/dampak, hentikan publikasi yang meragukan, lalu tentukan penanggung jawab. Ukur RTO dari durasi latihan aktual dan RPO dari waktu snapshot backup; jangan menjanjikan angka sebelum diuji. Rollback aplikasi mempertahankan database dan seluruh jawaban setelah backup. Restore historis tidak boleh menimpa jawaban baru. Pemulihan produksi mengikuti runbook yang ditinjau dan keputusan insiden terpisah.

## Validasi

`npm run check`, `npm run operations:drill` dan `npm run test:database`. Browser fixture menguji 320/390/768/1440, data usang, error/retry, form bukti/idempotensi dan riwayat. Uji fixture bukan latihan dari backup produksi asli. Tidak ada pemulihan produksi atau pengiriman pesan dilakukan oleh pengujian ini.

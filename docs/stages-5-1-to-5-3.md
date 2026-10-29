# Tahap 5.1–5.3 — operasi ujian

Implementasi teknis 29 Oktober 2026. Tidak menyatakan gerbang UAT perangkat nyata atau ketahanan beban produksi telah disahkan.

## 5.1 — ruang, roster, sesi, pengawas

Halaman `/dashboard/rooms` khusus Admin menyediakan tambah/ubah/hapus ruang kosong, sesi dalam jadwal ujian, roster eligible, penugasan dan pengganti berperiode. Kapasitas 0 berarti tanpa batas; kapasitas terbatas dan UNIQUE siswa–ujian diperiksa database di dalam transaksi dengan lock ruang/jadwal. Batch gagal seluruhnya bila satu peserta tidak eligible, sudah mulai, duplikat atau melampaui kapasitas. Rename memakai ID/FK; mengubah kapasitas di bawah jumlah roster ditolak. Ruang/sesi yang masih dirujuk riwayat tidak dihapus paksa; tugas dapat dinonaktifkan.

Tugas baru memakai FK organisasi–ujian–ruang–sesi. Tugas lama dengan session_id NULL diperlakukan sebagai sesi utama untuk kompatibilitas. Pengawas efektif mempertimbangkan tugas aktif, periode sesi, akun aktif/role yang valid, serta pengganti belum dicabut dan sedang berlaku. Guru yang menjadi pengganti tetap role teacher. Pencabutan/akhir periode mengembalikan hak kepada pengawas asal. Semua API dan RPC menghitung hak terkini; tidak mempercayai klaim role user_metadata. Roster bukan syarat baru untuk start/login siswa.

## 5.2 — monitor dan tindakan

`/dashboard/monitor` untuk Admin/Guru; `/supervisor` untuk pengawas efektif. Admin melihat organisasi, Guru hanya kelas–mapel aktif yang eligible, pengawas hanya roster ruang dalam tugas efektif. Monitor mencakup belum mulai/aktif/selesai/timeout/diskualifikasi, ketersediaan sesi login, jumlah jawaban tersimpan, deadline, jumlah insiden, pencarian, filter, halaman 25 baris, dan ekspor JSON data yang sedang difilter. Sesi login tersedia bukan klaim perangkat sedang online. Status timeout diselaraskan oleh engine finalisasi sebelum hasil monitor dikirim.

Admin/pengawas efektif dapat unlock/reset/diskualifikasi tunggal atau batch maksimum 100 attempt. Alasan 5–1000 karakter, konfirmasi KONFIRMASI, versi attempt dan UUID request wajib. Transaksi batch atomik; stale version ditolak. Guru tanpa tugas pengawas mendapat akses baca, bukan tindakan. Unlock menggunakan kebijakan deadline tetap sebelumnya. Reset mengarsipkan before_state/aktor/alasan, menandai attempt lama reset, menaikkan epoch untuk menutup writer lama, serta mempertahankan jawaban, revisi, grade, snapshot, media dan insiden. Start berikutnya memperoleh attempt_number baru dan deadline tidak melewati deadline attempt reset; jika sudah lewat, tidak dapat memulai ulang. Tidak ada tambahan waktu tersembunyi.

Realtime memakai private Supabase Broadcast dari trigger pascacommit, hanya payload kosong sebagai invalidasi. SSE server meneruskan sinyal tanpa mengekspos access token ke JavaScript browser; data selalu dibaca ulang melalui RPC berizin. Polling 5 detik tetap berjalan. SSE berakhir 50 detik dan tersambung ulang, heartbeat 15 detik; timer/channel/listener dibersihkan saat pembatalan/unmount. Pengawas yang dicabut ditolak pada pembacaan berikutnya, data layar dibersihkan, dan koneksi pengawas diperiksa ulang. Sinyal lama tidak berisi nama, jawaban, ID ujian atau nilai.

## 5.3 — media, Drive, kartu, pesan

`/dashboard/media`: galeri/tabel, gambar/audio, drop-zone, batch maksimal 25 file (5 MiB/file), daftar per 50 item, filter tipe, pratinjau privat, salin ID/lampiran dan URL 60 detik, serta hapus berkonfirmasi. Server membatasi pembacaan stream dan mencocokkan signature MIME termasuk RIFF WEBP versus WAVE; SHA-256 dicatat untuk unggahan baru. File lama tidak ditimpa. Penghapusan ditolak jika dirujuk versi soal, snapshot attempt, logo, atau job laporan/kartu. Akses Admin Storage dibatasi organisasi. Penghapusan metadata menghasilkan tiket pembersihan persisten; gagal Storage dapat dicoba ulang melalui UI. Tidak menghapus media jawaban siswa.

Adaptor Drive opsional hanya Admin: folder allowlist dari `GOOGLE_DRIVE_FOLDER_ID`, access token baca dari `GOOGLE_DRIVE_ACCESS_TOKEN` di server. Listing berhalaman, impor 1–25 file, cek parent/trashed/MIME/ukuran sebelum unduh, timeout 20 detik, limit bytes, checksum dan nama deterministik untuk retry idempoten. Tidak mengambil URL arbitrer atau mengubah file Drive. Kredensial konektor ChatGPT tidak disalin ke aplikasi. Provider nyata dan masa berlaku token **belum diverifikasi**; tanpa konfigurasi, endpoint 503 dan unggahan lokal tetap tersedia. OAuth pengguna/refresh otomatis belum disediakan. Rujukan API: https://developers.google.com/workspace/drive/api/guides/manage-downloads dan https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get.

`/dashboard/cards` dan panel pengawas: template ringkas dua kolom/besar satu kolom, kop/alamat/logo/pejabat dari konfigurasi laporan, nama, username, jadwal WIB, ruang dan alamat login. Tidak memuat password permanen, PIN plaintext atau token aktivasi. PDF gabungan 1–500 peserta; ZIP PDF per siswa 1–50; maksimum 50 MiB. Job persisten memotret identitas/jadwal/kop saat dibuat, lease 4 menit, progres, gagal/retry maksimum 5, bucket privat dan signed download 60 detik. Worker Next after maksimum 300 detik; jika terputus, dapat diklaim ulang setelah lease habis. Kartu bukan pembaruan kredensial akun.

Broadcast all/exam/selected selalu dibatasi penerima eligible dalam hak pengirim terkini. Request idempoten, anggaran 10 pengiriman/15 menit, receipt unik pesan–siswa. Inbox terpasang pada `/student`, menerima sinyal privat dan polling; terbaca hanya ditandai lewat tindakan siswa, timestamp pertama tidak berubah saat retry. Pengirim dapat meninjau receipt yang masih berada dalam cakupannya. Tidak ada pengiriman email/WhatsApp atau pesan ke luar aplikasi.

## Database, backup dan rollback

Migrasi Supabase `20261029120103_operational_stages_5.sql` berhasil diterapkan. Preflight mengunci tabel attempt dan membatalkan pemasangan bila sudah ada attempt operasional organisasi sekolah. Sebelum pemasangan: 0 attempt operasional, 0 ruang, 0 tugas. Backup terarah konfigurasi/fungsi awal tersimpan terpisah dari git; SHA-256 `2743e27b1499e0a88882c199de946c814bca1638454fb586caec3fa7f0407b4d`. Bukan dump penuh/PITR.

Jika perlu rollback: kembalikan aplikasi ke commit sebelum Tahap 5, lalu tinjau dan jalankan `supabase/proposals/stage5-disable.sql`. Script mencabut RPC baru dan memulihkan fungsi operasi lama, tanpa DROP/TRUNCATE/DELETE ledger, overrides, pesan, job atau file. Penguatan akses media dipertahankan. Reaktivasi memerlukan migrasi baru yang ditinjau. Jangan menjalankan ulang migrasi awal pada database yang telah berisi attempt operasional.

## Bukti verifikasi dan batas

- Lint, TypeScript, build Next.js produksi lokal lulus. Trace fungsi kartu memuat font dan empat binari Chromium.
- Unit suite: 56 lulus, dua PDF QA opsional dilewati pada run biasa. Modul operasi dengan PDF QA dijalankan terpisah: 6 lulus.
- `node scripts/stage5-integration.mjs`: pemasangan semua migrasi pada PGlite/Postgres terisolasi dengan facade auth/storage/realtime; regresi attempt sebelumnya; pengganti/pencabutan dan role tetap; kapasitas 0, batas kapasitas dan rollback batch; eligibility/UNIQUE roster; sesi FK; receipt idempoten; lease kartu; reset/arsip/nomor/deadline; larangan overwrite dan referensi media; tiket cleanup; serta disable non-destruktif lulus. Ini tidak mengklaim stress race dua koneksi PostgreSQL atau layanan Storage/WebSocket nyata.
- PDF QA 15 kartu dengan nama Arab, empat halaman; halaman awal/akhir dirender dan diperiksa, identitas peserta terakhir utuh. PDF gambar/logo dan ZIP menggunakan jalur worker yang sama; integrasi penyimpanan dan ZIP massal di akun operasional belum disahkan UAT.
- Pemeriksaan produksi: RPC operasi/kartu tidak terbuka untuk anon; bucket exam-cards privat. Advisor menunjukkan tabel RPC-only default-deny sebagai INFO, dan peringatan Auth leaked-password protection yang sudah ada. Rujukan: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Belum disahkan: UAT browser lengkap semua role/perangkat fisik, pengiriman WebSocket nyata saat pergantian pengawas, race stress dua koneksi, volume besar 500 kartu, Drive kredensial nyata, dan ketahanan koneksi saat ujian operasional. UI/API tersedia untuk UAT; ini tidak mengubah AI/OCR yang masih nonaktif.

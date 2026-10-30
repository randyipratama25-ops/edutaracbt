# Tahap 1 — Keandalan jawaban dan sesi

Tidak ada halaman, endpoint atau role baru. Migrasi tambahan `20261029184135_durable_attempt_recovery.sql` menyediakan cadangan draf server. Pengembangan memperkuat portal `/student` dan menggunakan RPC attempt yang telah memeriksa sesi Auth, kepemilikan attempt, writer client/session/epoch, CAS revisi, idempotensi dan deadline server.

## Perilaku

Draf teks/pilihan disimpan sinkron ke localStorage pada perubahan, sebelum debounce. Key mencakup siswa, attempt dan client; envelope versi 1 menyimpan writer epoch dan waktu. Restore hanya menerima soal snapshot yang aktif, epoch sama dan umur maksimal 24 jam. Jawaban sama dengan server tidak dikirim kembali. Revisi server yang berbeda menampilkan konflik; refresh berulang tidak boleh menaikkan revisi dasar draf secara diam-diam. Tidak ada kunci/rubrik/token disimpan dalam draf.

Retry batch mempertahankan request ID dan payload. Pengakuan harus lengkap dan valid sebelum antrean dianggap diakui; edit lebih baru tidak terhapus oleh pengakuan edit lama. Retry otomatis periodik hanya untuk gangguan sementara. Storage gagal/penuh tidak dianggap sukses dan menampilkan peringatan; jawaban tetap berada di memori sampai diakui.

Canvas menyimpan PNG draf setelah stroke/undo/clear dan sebelum upload. Draf terikat siswa/attempt/client/epoch/soal. Canvas lokal dipulihkan sebagai belum tersimpan; unggah ulang dilakukan eksplisit. Canvas server gagal dimuat memblokir penggambaran untuk mencegah menimpa gambar lama. Draf lokal ditahan sampai relasi media dapat dipulihkan/dikonfirmasi atau attempt difinalisasi.

Heartbeat menyelaraskan deadline dan waktu server, berjalan pula pada online/visibility kembali. Pemeriksaan tidak overlap. Submit menunggu antrean manual, mengunci klik ganda, dan mempertahankan request ID/mode saat hasil transport tidak pasti. Input dibekukan sampai finalisasi dikonfirmasi atau penolakan definitif diterima. Saat waktu habis server tetap memutuskan jawaban yang diterima sebelum deadline.

Bukti penerimaan memakai ID attempt dan finalized_at dari DTO server untuk status submitted/time_expired. TXT hanya referensi, bukan dokumen bertanda tangan atau bukti isi semua jawaban; disqualified/reset/in_progress tidak mendapat bukti pengumpulan sukses. Hasil nilai tetap mengikuti kebijakan publikasi.

## Validasi dan batas

Jalankan `npm run check` dan `node scripts/stage4-local-db.mjs supabase/tests/attempts.sql`. Tes antrean mencakup respons hilang, edit bersamaan, konflik termasuk refresh berulang, quota storage dan scope pengguna/epoch; tes player mencakup save-before-submit, kegagalan konflik dan retry submit identik; tes canvas mencakup restore stroke dan penguncian bila gambar lama gagal dimuat.

UAT perangkat: putuskan jaringan sebelum autosave; refresh di tab yang sama; sambungkan kembali; periksa jawaban server; lakukan takeover perangkat; uji sleep/background; putuskan respons setelah submit; uji canvas gagal upload dan refresh; pastikan deadline tidak bertambah dan bukti tetap dapat dibuka setelah resume.

localStorage bertahan setelah tab ditutup pada profil browser/origin yang sama. Cadangan yang telah mencapai server dapat dipilih setelah takeover di perangkat lain. Belum ada jaminan offline penuh maupun penambahan waktu otomatis. Browser yang memblokir storage hanya mendapat antrean memori/peringatan. Migrasi tambahan diterapkan di staging dan produksi tanpa mengubah jawaban/nilai; pengujian tidak mengirim email nyata.


## Pemulihan persisten dan perpindahan perangkat

Draf tab/sesi lama ditawarkan eksplisit dari localStorage. Cadangan server dicoba sebelum canonical save, tetapi kegagalan/exception pada cadangan tidak boleh menghalangi canonical save. Fungsi recovery mengunci attempt dan memverifikasi siswa pemilik, sesi Auth, writer client/session/epoch, snapshot, status serta deadline. Revisi draf yang telah kalah dari revisi kanonis diabaikan; trigger membersihkan salinan identik saat jawaban diakui.

Setelah resume/takeover, API menambahkan pilihan salinan server dan maksimum tiga unggahan canvas terbaru per soal yang lebih baru daripada jawaban tersimpan. UI memakai antrean utama/CAS untuk mengaktifkan salinan pilihan. Nilai tidak dihitung dari tabel draf. Draf yang belum pernah keluar dari perangkat offline tidak dapat dipindahkan otomatis.

Tombol Pindah perangkat menyimpan antrean sebelum menampilkan kesiapan. Login di perangkat tujuan tetap memerlukan ambil alih; perangkat lama ditolak dan deadline tidak bertambah. Canvas belum tersimpan memblokir persiapan perpindahan.

Server menyimpan maksimum tiga salinan writer per soal. Retensi berjalan setiap 15 menit; TTL maksimal 24 jam dan tidak melewati deadline. Finalisasi/reset membersihkan draf. Tabel berada di private dengan RLS dan tanpa direct grants; RPC anon ditolak. Rollback frontend tetap dapat memakai jawaban kanonis. RPC recovery dapat dinonaktifkan tanpa menghapus jawaban/nilai.

Validasi tambahan: `scripts/durable-recovery-integration.mjs` mencakup stage tanpa canonical save lalu takeover, isolasi peran/pengguna, writer lama, snapshot salah, ACK, stale retry, expiry dan finalisasi. Kedua skrip integrasi Tahap 1 dimasukkan ke `npm run test:database` untuk CI.

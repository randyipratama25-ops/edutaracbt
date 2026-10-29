# Tahap 1 — Keandalan jawaban dan sesi

Tidak ada halaman, endpoint, role atau migrasi database baru. Pengembangan memperkuat portal `/student` dan menggunakan RPC attempt yang telah memeriksa sesi Auth, kepemilikan attempt, writer client/session/epoch, CAS revisi, idempotensi dan deadline server.

## Perilaku

Draf teks/pilihan disimpan sinkron ke sessionStorage pada perubahan, sebelum debounce. Key mencakup siswa, attempt dan client; envelope versi 1 menyimpan writer epoch dan waktu. Restore hanya menerima soal snapshot yang aktif, epoch sama dan umur maksimal 24 jam. Jawaban sama dengan server tidak dikirim kembali. Revisi server yang berbeda menampilkan konflik; refresh berulang tidak boleh menaikkan revisi dasar draf secara diam-diam. Tidak ada kunci/rubrik/token disimpan dalam draf.

Retry batch mempertahankan request ID dan payload. Pengakuan harus lengkap dan valid sebelum antrean dianggap diakui; edit lebih baru tidak terhapus oleh pengakuan edit lama. Retry otomatis periodik hanya untuk gangguan sementara. Storage gagal/penuh tidak dianggap sukses dan menampilkan peringatan; jawaban tetap berada di memori sampai diakui.

Canvas menyimpan PNG draf setelah stroke/undo/clear dan sebelum upload. Draf terikat siswa/attempt/client/epoch/soal. Canvas lokal dipulihkan sebagai belum tersimpan; unggah ulang dilakukan eksplisit. Canvas server gagal dimuat memblokir penggambaran untuk mencegah menimpa gambar lama. Draf lokal ditahan sampai relasi media dapat dipulihkan/dikonfirmasi atau attempt difinalisasi.

Heartbeat menyelaraskan deadline dan waktu server, berjalan pula pada online/visibility kembali. Pemeriksaan tidak overlap. Submit menunggu antrean manual, mengunci klik ganda, dan mempertahankan request ID/mode saat hasil transport tidak pasti. Input dibekukan sampai finalisasi dikonfirmasi atau penolakan definitif diterima. Saat waktu habis server tetap memutuskan jawaban yang diterima sebelum deadline.

Bukti penerimaan memakai ID attempt dan finalized_at dari DTO server untuk status submitted/time_expired. TXT hanya referensi, bukan dokumen bertanda tangan atau bukti isi semua jawaban; disqualified/reset/in_progress tidak mendapat bukti pengumpulan sukses. Hasil nilai tetap mengikuti kebijakan publikasi.

## Validasi dan batas

Jalankan `npm run check` dan `node scripts/stage4-local-db.mjs supabase/tests/attempts.sql`. Tes antrean mencakup respons hilang, edit bersamaan, konflik termasuk refresh berulang, quota storage dan scope pengguna/epoch; tes player mencakup save-before-submit, kegagalan konflik dan retry submit identik; tes canvas mencakup restore stroke dan penguncian bila gambar lama gagal dimuat.

UAT perangkat: putuskan jaringan sebelum autosave; refresh di tab yang sama; sambungkan kembali; periksa jawaban server; lakukan takeover perangkat; uji sleep/background; putuskan respons setelah submit; uji canvas gagal upload dan refresh; pastikan deadline tidak bertambah dan bukti tetap dapat dibuka setelah resume.

SessionStorage bukan penyimpanan setelah tab ditutup atau lintas perangkat. Belum ada jaminan offline penuh maupun penambahan waktu otomatis. Browser yang memblokir storage hanya mendapat antrean memori/peringatan. Tidak melakukan perubahan database produksi atau mengirim email nyata sebagai bagian pengujian.

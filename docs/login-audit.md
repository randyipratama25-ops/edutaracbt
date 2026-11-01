# Audit Login dan bantuan pemulihan

Lingkup: `/login`, form, dialog/tombol bersama, branding, username, API login/recover, gateway identitas dan konteks/sesi. Stack Next.js/Supabase; tidak ada GAS, CRUD akademik, tabel atau pagination di halaman ini.

## Temuan dan perbaikan

- State busy tidak mencegah dua submit sebelum repaint atau persaingan login/pemulihan. Satu ref lock kini mengunci keduanya; kontrol konsisten selama proses dan login berhasil tetap terkunci sampai navigasi.
- Fetch tanpa deadline dan akses JSON/data langsung dapat membuat UI terus sibuk atau gagal tanpa pesan berguna. Helper membatasi 35 detik, memvalidasi envelope, memberi pesan hasil belum pasti, tidak retry otomatis dan membersihkan request saat unmount.
- Destination API dipercaya langsung. Kini hanya route tetap sesuai konteks diterima; mapping dipakai bersama API/UI. Password dipertahankan persis dan tidak disimpan.
- Modal tidak boleh ditutup selama request. Kini boleh close/reopen, mempertahankan draft/hasil dan fokus, tanpa mengirim ulang request berjalan. Abort klien tidak membatalkan email yang sudah diproses server.
- Username pemulihan dan localStorage kurang divalidasi. Keduanya memakai skema backend. Input utama sengaja uncontrolled: autofill tanpa event React tidak tertimpa perubahan konteks/checkbox. FormData membaca nilai aktual.
- Form native default GET berpotensi menaruh password di URL tanpa JavaScript. Kedua form sekarang POST ke API lama. API tetap JSON-only; petunjuk mengaktifkan JavaScript tampil pada browser tanpa JS.
- Query `error=activation` diabaikan. Flag whitelist kini menampilkan pesan aman, tanpa menampilkan nilai query lain.
- Branding opsional bisa menahan render tanpa batas dan nilai salah bentuk dapat merusak UI. Deadline bersama 6 detik, fallback teks/logo serta wrapping menjaga halaman dapat digunakan.
- Hierarki, feedback dan mobile diperbaiki dengan alert/status, label/name field, tombol sentuh, footer Beranda/Bantuan dan dialog bounded. Tidak menyembunyikan konten dengan overflow hidden; layar pendek tetap bisa digulir.
- Gateway menulis LOGIN ke organisasi statis. Seleksi profil kini menyertakan organization_id dan audit memakai organisasi akun. Riwayat lama tidak diubah; fungsi sesi, penugasan, rate limit dan respons recovery tetap sama.

## Validasi dan batas

`npm run check` (lint, TypeScript, unit/regresi, build); tes kontrak API/cookie HttpOnly/same-origin, timeout, malformed response, fallback branding dan handler gateway asli dengan SDK simulasi lintas organisasi.

`node scripts/ui/login-browser.mjs` memakai halaman `/login` asli, API simulasi tanpa email/akun produksi: 320/390/768/1440, layar pendek, orientasi, teks 200%, touch, keyboard/fokus, axe, input kosong, storage/autofill, pengiriman ganda, recovery close/reopen/rate/timeout/unmount, konteks, password dan POST/no-JS. Pemeriksaan otomatis bukan sertifikasi aksesibilitas atau UAT perangkat fisik/inbox nyata.

Tidak perlu migrasi database. Kontrak API, RLS, sesi HttpOnly/SameSite, akun aktif dan batas akses tetap dipertahankan. Deployment gateway memperbaiki hanya pencatatan audit baru.

# Pengembangan dan pengoperasian fondasi

Stack: Next.js App Router, TypeScript, Tailwind CSS, pola komponen shadcn/Radix, Lucide, Zod, Supabase. Server memakai @supabase/ssr dengan cookie HttpOnly; browser tidak menyimpan token. Lockfile wajib digunakan (`npm ci`).

## Pengaturan lokal

1. Salin `.env.example` ke `.env.local`. Isi dua variabel publik dari proyek Supabase yang benar; tidak perlu service role pada aplikasi Vercel.
2. `npm ci`, `npm run check`, `npm run dev`. Lingkungan ini memerlukan `--hostname 127.0.0.1` bila deteksi jaringan OS dibatasi.
3. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` adalah pemeriksaan terpisah. CI menjalankannya tanpa kredensial produksi.
4. `supabase/functions` memakai Deno dan import map sendiri, tidak masuk kompilasi Next. Deploy identity-gateway dengan config yang tersimpan; function memvalidasi password untuk login dan JWT+aktor RLS untuk mutasi. `verify_jwt=false` tidak menjadikan aksi admin anonim.

## Aktivasi admin pertama — belum dijalankan pada produksi

Tidak ada password default atau admin demo ditanam pada produksi. Pemilik perlu menyiapkan email admin yang sah dan kunci server hanya pada shell lokal privat.

- Pada Supabase Auth URL Configuration, set Site URL ke `https://edutara-cbt-randyipratama25-2274.vercel.app` dan tambahkan URL `/auth/reset` serta `/auth/confirm` pada redirect allowlist. Pengaturan ini belum dapat diverifikasi melalui konektor yang tersedia. Tautan preview jangan diarahkan ke database produksi tanpa kebijakan terpisah.
- Siapkan SMTP/penyedia pengiriman sesuai kebutuhan. Tidak ada email nyata dikirim dalam implementasi ini.
- Jalankan `node scripts/bootstrap-admin.mjs <email-admin> <username> '<nama lengkap>'` dengan `NEXT_PUBLIC_SUPABASE_URL` dan `SUPABASE_SECRET_KEY` di lingkungan privat. Tindakan ini mengirim undangan hanya ke email yang dimasukkan pemilik.
- Selesaikan undangan, tetapkan password minimal 12 karakter, lalu login username/password. Script menolak jika sudah ada admin aktif; aplikasi melindungi admin aktif terakhir dari deaktivasi.
- Jangan menyimpan secret, link aktivasi atau password ke GitHub, log, screenshot, atau chat.

## Database

Dua migrasi pertama diterapkan pada proyek baru yang sebelumnya kosong. Skema domain ujian adalah pondasi, bukan implementasi ujian. Tabel ujian/kunci/attempt belum diberi grant Data API. Semua 21 tabel public memakai RLS. Bucket exam-media privat, limit 5 MiB; akses signed URL 60 detik dan path pengguna. Metadata file dan editor lengkap diselesaikan pada tahap media berikutnya.

Tes `supabase/tests/rls.sql` memakai identitas sintetis tanpa password dalam satu transaksi dan selalu rollback. Jalankan melalui koneksi berizin di lingkungan uji. Jangan menghapus identitas produksi untuk mengulang tes. RLS membatasi sesi melalui auth.sessions; username, role dan organisasi dari body tidak pernah menjadi otoritas.

## Status ruang lingkup

Login siswa/PIN tetap ditolak sampai mesin attempt tersedia. Pengawas efektif diverifikasi; layar monitor tersedia kemudian. Guru dapat melihat dan membuat siswa pada kelas penugasannya; hanya Admin dapat mengarsipkan/nonaktifkan pengguna. Role/username tidak dapat diganti melalui editor nama pada iterasi ini. Impor TSV maksimal 200 baris dengan preview dan hasil per baris; undangan dapat parsial, retry username yang sudah tersimpan ditolak. Belum ada ekspor password.

## Pemulihan dan rollback

Rollback aplikasi dengan deployment READY sebelumnya. Jangan menghapus tabel atau storage saat rollback kode. Migrasi bersifat tambahan pada database kosong; mempertahankan data baru lebih utama daripada drop schema. Backup dan cutover legacy belum dikerjakan. Tidak menjalankan ulang baseline SQL pada database berisi tabel yang sama; periksa migration history dahulu.

## Smoke tests yang dapat diulang

Pada proyek pra-produksi kosong dengan persetujuan pemilik, set `EDUTARA_ALLOW_TEST_FIXTURES=1` dan kunci server pada lingkungan privat. `node scripts/test-identities.mjs seed` membuat empat akun sintetis dengan password acak dan email `.invalid`, tanpa mengirim email. Setelah build, jalankan `node scripts/auth-smoke.mjs` dan `node --env-file=.env.local scripts/media-smoke.mjs`. Selalu jalankan `node scripts/test-identities.mjs cleanup` dalam langkah finally. Tidak menjalankan seed ini pada proyek berisi profil nyata. Tidak menyimpan fixture rahasia ke repository. `scripts/smoke.mjs` memeriksa akses anonim dan CSRF tanpa akun; service gateway dan variabel Supabase harus tersedia.

Jika undangan berhasil tetapi penyimpanan profil gagal, identitas pending tidak dihapus otomatis; ia tidak memiliki akses aplikasi tanpa profil/RLS. Pemilik meninjau identitas pending sebelum retry. Email yang sudah ada diperiksa sebelum pengiriman undangan agar tidak mengubah akun lama.

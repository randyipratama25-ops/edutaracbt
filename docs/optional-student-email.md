# Email opsional saat Admin membuat akun siswa

Form tambah pengguna di `/dashboard/users` kini menampilkan **Email siswa (opsional)** khusus role `student`. Untuk role lainnya email tetap wajib dan mengikuti alur undangan.

Siswa dengan email nyata tetap dibuat melalui Auth Admin `createUser` seperti sebelumnya. Jika Admin mengosongkan email, Edge Function menghasilkan alamat masuk internal berbentuk `student-<UUID>@example.com`, memakai domain contoh yang dicadangkan (RFC 2606). Ini **bukan** alamat yang dimiliki siswa, tidak boleh ditampilkan sebagai kontak atau digunakan untuk mengirim email. Pola email internal yang sama tidak boleh dimasukkan secara manual. Password yang Admin tetapkan/generate tetap wajib dan tidak berubah ketentuannya, begitu pula kelas, status aktif, dan login menggunakan username.

Sistem mendeteksi alamat internal ketika menerima permintaan pemulihan password dan **tidak** memanggil `resetPasswordForEmail` untuk akun tersebut; respons pemulihan tetap generik agar tidak membocorkan keberadaan akun. Fitur kirim ulang undangan untuk akun seperti itu dinonaktifkan dan layar menampilkan email kosong. Pengguna tanpa email harus dibantu Admin untuk pemulihan akses; fitur pengaturan ulang password oleh Admin **belum termasuk** dalam perubahan ini.

Validasi client, Next.js API, dan Edge Function tetap mewajibkan email yang valid bagi role non-siswa. Pratinjau/impor TSV memperbolehkan beberapa siswa memiliki kolom email kosong tanpa menganggapnya duplikat. Tidak ada migrasi database diperlukan; penggantian Edge Function wajib dilakukan sebelum rilis aplikasi web agar server menerima input email kosong.

Rilis: Deploy Edge Function `identity-gateway` dari `supabase/functions/identity-gateway` (termasuk `student-email.ts`, `invitations.ts`, `validation.ts`, dan `deno.json`), lalu deploy aplikasi Next.js. Validasi akun tanpa email secara nonproduksi dan hindari membuat akun nyata sebagai uji tanpa izin.

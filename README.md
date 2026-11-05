# EDUTARA CBT

Fondasi pembangunan ulang CBT: Next.js App Router, TypeScript, Tailwind, shadcn/Radix, Zod, Supabase Auth/PostgreSQL/Storage.

Mulai dari [keadaan proyek](docs/project-state.md), [panduan pengembangan](docs/development.md), dan [hasil 1.1–1.4](docs/stages-1-1-to-1-4.md). Dokumen acuan asli ada pada docs/reference.

`npm ci` lalu `npm run check`. Untuk lokal, isi .env.local dari .env.example; jangan commit secret.

Login staf, shell, pengelolaan pengguna/master dan fondasi otorisasi tersedia. Akun Admin pertama dan konfigurasi email harus disiapkan pemilik. Ujian, penilaian, monitoring penuh, migrasi legacy dan penerimaan produksi masih mengikuti tahapan berikutnya. File Code.gs/index.html adalah sumber legacy; tidak dijalankan sebagai backend Next.js.

### Editor soal TinyMCE

Atur `NEXT_PUBLIC_TINYMCE_API_KEY` dengan key publik Tiny Cloud, izinkan domain aplikasi di Tiny Cloud, lalu build ulang. TinyMCE tersedia di formulir soal Ujian dan Bank Soal. Editor dasar tersedia jika key belum diatur atau skrip gagal dimuat.

Gunakan kontrol gambar/audio untuk menyimpan lampiran di penyimpanan media EDUTARA. Lampiran diputar atau ditampilkan melalui pratinjau dan pemutar ujian sesuai hak akses. Rumus LaTeX tersimpan sebagai teks dan dirender oleh MathJax. Delimiter lama `$…$` dan `$$…$$` tetap didukung.

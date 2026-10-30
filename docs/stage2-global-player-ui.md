# Tahap 2 — UI/UX global dan player

Cakupan: tampilan bersama pada 18 halaman, shell staf Admin/Guru, portal siswa/pengawas dan player. Tidak ada migrasi database, endpoint, role atau kewenangan CRUD baru. Pagar server `actor()` dan pengalihan konteks pada layout dashboard tetap dipertahankan.

## Implementasi

- Sistem visual tunggal di `app/globals.css`: warna/kontras, tipografi sistem tanpa unduhan font eksternal, jarak, panel, form, tombol, indikator loading, tabel sticky/zebra, scroll region dan reduced motion.
- `DashboardShell` menyediakan kelompok navigasi, aria-current, breadcrumb, akun dan menu mobile berbasis dialog. Guru tidak mendapat tautan administrasi; menu tetap menggunakan URL lama dan Next Link.
- Dialog mengembalikan fokus ke pembuka meski dibuka secara controlled tanpa Radix Trigger. Pemilihan soal mobile dan lompatan dari ringkasan submit memindahkan fokus ke judul soal. Escape biasa kembali ke pembuka.
- Player memisahkan kolom pengerjaan dan peta soal desktop. Mobile memakai peta dalam dialog, header/timer sticky, tombol sebelumnya/berikutnya dan ragu yang tetap muat pada layar kecil. Alat menyimpan kontrol font, fullscreen, reload dan transfer perangkat.
- `completion()` membedakan jawaban kosong/parsial/lengkap tanpa menilai benar-salah. Minimum karakter esai memakai penghitung bermakna yang telah ada. Pemeriksaan wajib dan finalisasi tetap di server.
- Konfirmasi submit menampilkan ringkasan dan navigasi kembali ke jawaban belum lengkap. Semua kontrol autosave, konflik, canvas, takeover dan pengumpulan tidak pasti dari Tahap 1 tetap dipakai.
- Ukuran tulisan (16/18/20/22), soal terakhir dan ragu disimpan sebagai preferensi lokal per siswa/attempt. Tidak dimasukkan ke tabel jawaban atau disinkronkan sebagai nilai.
- Pratinjau soal tidak lagi menduplikasi opsi pada player; authoring tetap menampilkan opsi/kunci sesuai kewenangannya. Lampiran yang gagal dimuat memiliki feedback/coba ulang dan pembatalan fetch saat komponen berganti.
- Portal siswa membedakan loading, gagal, kosong dan data tersedia. Login mendukung tampil/sembunyikan password tanpa mengubah aturan autentikasi.

## Pengujian

`npm run check` menjalankan lint, TypeScript, tes dan build produksi. Tes baru mencakup menu Admin/Guru, aria-current, buka/tutup navigasi, label status peta soal, jawaban kosong/parsial/kanvas/esai dan ringkasan wajib/opsional. Tes regresi Tahap 1 tetap dijalankan.

`node scripts/ui/stage2-browser.mjs` memakai fixture nonoperasional tanpa data/akun produksi. Skrip memasang route sementara `app/stage2-check` dan menghapusnya pada cleanup; jangan menjalankan build/release bersamaan. Cache dev terisolasi lewat `EDUTARA_UI_TEST_DIST`, default build produksi tetap `.next`. Konfigurasi tipe yang ditulis Next selama uji dipulihkan setelah selesai. Fixture tidak boleh dideploy sebagai route produksi.

Browser memeriksa lebar 320/390/768/1440, overflow dokumen, gulir tabel, trap fokus/Escape pada menu dan modal form, simpan jawaban simulasi, status parsial, navigasi soal, ukuran huruf, timer mobile, ringkasan submit, error/retry/empty state dan toggle password. Tangkapan layar disimpan di `/tmp` hanya untuk inspeksi internal. Hasil browser simulasi tidak dianggap UAT perangkat fisik atau verifikasi akun/produksi end-to-end.

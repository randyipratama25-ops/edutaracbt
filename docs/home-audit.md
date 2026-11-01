# Audit dan refactoring Beranda

Lingkup: `/`, `ActivationRedirect`, tombol bersama, bantuan kontekstual beserta katalog, layout/skip link, styling terkait, jalur login dan handler aktivasi/password yang sudah ada. Beranda tidak memiliki CRUD, tabel, pagination, fetch data akademik atau daftar dinamis. Kondisi data kosong/banyak relevan pada hasil pencarian bantuan; backend autentikasi tetap menangani validitas kredensial.

## Temuan dan perbaikan

- Pemberitahuan statis menyatakan aplikasi dalam pengembangan dan ujian belum dibuka, meskipun kondisi itu tidak berasal dari konfigurasi. Dihapus tanpa menggantinya dengan klaim kesiapan operasional yang tidak diverifikasi.
- Pengalihan awal hanya mendeteksi keberadaan dua token fragment. Callback root berupa kode PKCE/token hash diabaikan; token kosong ikut diteruskan. Parser lokal membatasi ukuran, memeriksa pasangan token, dan mengarahkan ke `/auth/reset` atau `/auth/confirm` yang sudah ada. Tidak menerima destination/next eksternal.
- Error penyedia dan callback tidak lengkap tidak memberi feedback, dan fragment sensitif dapat menetap pada URL. Kini tampil pesan umum dan parameter autentikasi dibersihkan tanpa dirender/dicatat. Verifikasi sesi tetap pada backend; parser bukan validator kriptografis.
- Effect hanya berjalan saat mount, sehingga callback fragment pada Beranda yang sudah terbuka tidak ditangani. Listener hashchange/popstate ditambahkan dengan cleanup; ref mencegah redirect ganda pada satu mount.
- Tombol bantuan mendahului CTA masuk dalam baris tanpa gap, dan konteks peran belum jelas. CTA utama, bantuan sekunder dan panduan peran ringkas dikelompokkan; tetap satu login dengan konteks lama. Indikator pending Next.js memberi feedback navigasi tanpa permintaan login duplikat atau perubahan ukuran label.
- Styling hero terpecah di beberapa selector. Selector khusus Beranda menggantikan aturan hero yang hanya dipakai halaman ini; warna, tombol, tipografi dan dialog bersama dipertahankan. Tidak menggunakan overflow:hidden untuk menyembunyikan konten.

## Validasi

Unit: callback normal, fragment, kode/email, error, parameter kosong/berlebih, sanitasi URL, destination lokal. Browser memakai halaman `/` asli: navigasi login, bantuan buka/tutup/fokus/Tab, pencarian tanpa hasil dan semua hasil publik, resize/orientasi, layar pendek, zoom teks, JavaScript nonaktif, callback dan error yang disimulasikan; tidak memakai akun/kredensial produksi. Pemeriksaan axe WCAG-tag membantu mendeteksi masalah otomatis dan bukan sertifikasi aksesibilitas.

Tidak ada migrasi database atau perubahan kontrak API/otorisasi. Scroll vertikal dokumen tetap tersedia pada layar pendek atau zoom agar seluruh konten terjangkau; tidak ada konten yang sengaja dipotong untuk memaksa satu layar. Tidak mengubah player, timer, jawaban, nilai, branding login, atau status ujian.

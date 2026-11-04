# Feedback aplikasi dan pemulihan alur

Tanggal: 4 November 2026 (WIB).

## Cakupan

Komponen bersama `StateCard`, `FeedbackMessage`, `ValidatedForm`, dan `FeedbackProvider` menyelaraskan 10 kondisi. Integrasi mencakup 112 pesan status, 33 formulir, 12 tampilan kosong, route loading/error, modal bersama, serta enam halaman khusus Admin. Tidak ada halaman atau tabel baru; inventaris tetap 23 halaman.

| Kondisi | Perilaku dan tindak lanjut |
| --- | --- |
| Empty | Ikon, judul, penjelasan dan tindakan halaman yang sudah ada dipertahankan dalam kartu konsisten. |
| Loading | Spinner dekoratif, teks status, skeleton dan penanda busy; reduced-motion mematikan animasi. |
| Error | Pesan kontekstual tetap tersedia, gaya error/alert konsisten. Fallback root, dashboard dan global menyediakan retry; mendukung `retry` Next.js terpasang serta kompatibilitas `reset`. Detail exception tidak ditampilkan. |
| No Internet | Status offline browser ditampilkan pada halaman dan modal. Tidak menavigasi, menghapus draf, atau mengulang penyimpanan otomatis. |
| Slow Network | Permintaan yang belum selesai selama 8 detik mendapat petunjuk untuk menunggu. Ini indikator respons lambat, bukan pengukuran Mbps atau kepastian penyebabnya. Transport JSON bersama mencakup unduh/parsing body. |
| No Search Result | Ringkasan filter menampilkan nol hasil dengan ikon pencarian dan tindakan reset; petunjuk kosong masing-masing modul dipertahankan. |
| Permission Denied | Enam halaman Admin menampilkan penolakan dengan tautan kembali. API tetap menerapkan otorisasi lama. Respons 401/403 pada area privat dikonfirmasi lewat pemeriksaan sesi sebelum menentukan pemberitahuan akses. |
| Session Expired | Pemberitahuan hanya setelah pemeriksaan server memastikan sesi tidak tersedia. Masuk kembali membuka tab baru; pemeriksaan ulang bersifat read-only. Gangguan Auth/429/5xx tidak dinyatakan kedaluwarsa. |
| Form Validasi | Constraint native dan handler bisnis dipertahankan. Setelah isian invalid, ringkasan berbahasa Indonesia dapat diklik untuk memfokuskan kolom; daftar diperbarui saat isian/struktur formulir berubah. Label, bukan nilai kolom, dipakai dalam ringkasan. |
| Success | Status sukses eksplisit dari alur akun, Pengguna, Data master, Pengaturan dan ekspor Audit mendapat ikon dan warna konfirmasi. Informasi antrean/hasil yang belum pasti tidak otomatis dinyatakan selesai. |

## Keandalan dan keamanan

- Pengamatan request mempertahankan method, body, credential, signal, response dan kebijakan retry pemanggil. Bukan pengganti queue autosave/idempotensi yang sudah ada. Event hanya berisi ID lokal, fase, status HTTP dan pathname tanpa query, bukan isi formulir, URL API, token atau header.
- Scope pathname dan cleanup mencegah pemberitahuan lama muncul pada halaman lain. Clock monotonic dipakai untuk latensi/cooldown. Pemeriksaan sesi dibatasi satu request pada satu waktu dan cooldown 30 detik; pengecekan eksplisit dapat melewati cooldown, tetap tanpa mutation.
- `GET /api/auth/session` menggunakan `getUser` server dan hanya mengembalikan `{ authenticated: true }` atau error aman. Cache private/no-store. Endpoint ini tidak memberi izin data maupun menggantikan actor/RLS/grant.
- Pemberitahuan koneksi berada dalam alur dokumen dan di dalam dialog yang aktif, tanpa overlay yang menutup kontrol ujian. Tidak menyimpan password atau data formulir ke penyimpanan baru. Nilai/isian tetap terbuka pada gangguan koneksi; penutupan tab tetap mengikuti mekanisme draf masing-masing modul.
- Offline mengikuti sinyal browser; status online bukan jaminan internet/layanan dapat dijangkau. Kegagalan layanan tetap ditangani error per modul. Gambar, unduhan navigasi dan SSE bukan ukuran kecepatan request aplikasi.
- Tidak ada perubahan skema/RLS, konfigurasi Auth, dependency atau migrasi database.

## Validasi

- `npm run check`: lint tanpa error (satu warning ref cleanup AI lama), typecheck, **420 tes lulus / 3 dilewati pada 53 file**, dan build produksi. Tidak ada route fixture pada hasil build.
- `feedback-browser.mjs`: sepuluh state pada 320/390/768/1024/1440, pemindaian tag WCAG/axe, validasi required/email dengan fokus kolom dan tanpa POST invalid, perubahan field form, success/retry, reset pencarian, offline dalam modal/draf tetap, respons 8 detik, permission/session/Auth outage, login tab baru, pemeriksaan ulang, rotasi, layar pendek, teks 200% dan reduced motion lulus.
- `accessibility-browser.mjs`: keyboard, skip link, fokus modal/fallback, validasi password, navigasi mobile, autosave dan player pada 320/768/1440 lulus. Pemeriksaan akhir diulang setelah perbaikan skip link agar tetap tersembunyi pada teks besar.
- Regresi browser `settings-browser`, `authoring-browser`, `results-browser` dan `search-filters-browser` lulus. Mencakup lock, konflik/hasil belum pasti, kredensial, koreksi, impor, pagination dan sepuluh panel daftar pada ukuran terkait.
- Unit endpoint sesi memeriksa status saja tanpa identitas, missing/invalid session, gangguan Auth/429/5xx, dan private/no-store. Unit transport memeriksa body/signal/response asli, satu permintaan tanpa retry tambahan, cleanup abort/parse failure, metadata tanpa secret, dan durasi sampai JSON selesai dibaca.
- Screenshot mobile dan teks 200% diperiksa; tidak ditemukan overflow dokumen, modal keluar viewport, atau JavaScript error dalam skenario browser tersebut. Browser memakai komponen produksi dengan API simulasi, termasuk mutation; tidak mengirim email, membuat job, atau mengubah nilai produksi. Pemindaian axe bukan sertifikasi aksesibilitas dan bukan pengujian semua kombinasi data/role.

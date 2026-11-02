# Penyelarasan UI dan UX EDUTARA CBT

Tanggal: 2 November 2026 (WIB).

## Temuan dan perubahan

- 23 halaman menggunakan tata letak, filter, formulir dan dialog bersama. Terdapat 31 penggunaan dialog pada 19 komponen. Jarak paragraf ditambah gap grid membuat beberapa bagian terlalu renggang; margin elemen teks langsung pada stack diselaraskan.
- Header halaman tanpa petunjuk alur dilengkapi satu kalimat tindakan. Identitas warna hijau dan struktur navigasi dipertahankan.
- Filter kini memiliki latar dan pembatas ringkasan; tombol reset, indikator loading, jumlah, error, pagination dan cakupan filter tidak berubah.
- Dialog bersama mendapat class judul/deskripsi eksplisit, pemisah petunjuk, jarak formulir dan tindakan konsisten, grid satu kolom mobile, pembungkus teks dan tinggi berbatas viewport. Tidak menambahkan wrapper yang mengubah dependency selector komponen lama.
- Petunjuk teknis hash, engine, snapshot, ledger dan worker pada alur umum diganti dengan konsekuensi yang dimengerti pengguna. Tidak menghapus bukti operasional yang memang diperlukan Admin, batasan SEB, status gagal/belum pasti, informasi biaya AI, atau peringatan destructive.
- AI: persetujuan pengiriman data memakai checkbox baris; detail keamanan/uji koneksi dikelompokkan pada panduan yang dapat dibuka. Alur simpan → uji → aktifkan dipertahankan.

## Batas perubahan

Tidak ada perubahan backend, payload, API, role/RLS, autentikasi, state machine, penyimpanan, timer ujian atau algoritme nilai. Tidak ada halaman, dependency atau migrasi database baru. Styling bersama berlaku juga pada Beranda, Login, Atur password, portal Siswa/Pengawas dan halaman operasional tanpa menyalin komponen atau listener.

## Validasi

- `npm run check`: lint tanpa error (satu warning ref cleanup AI sudah ada sebelumnya), typecheck, 383 tes lulus / 3 dilewati pada 51 file, dan production build berhasil. Inventaris build tidak memuat route fixture.
- `settings-browser.mjs`: layar 320–1440, orientasi, teks 200%, axe, dialog/draf/kredensial, konflik dan hasil belum pasti, SMTP, serta regresi Jobs/Audit lulus.
- `authoring-browser.mjs`: Admin/Guru, layar 320–1440, layar pendek/rotasi/teks 200%, touch/axe, dialog, impor, locking dan recovery lulus.
- `results-browser.mjs`: Admin/Guru, layar 320–1440, rotasi/teks 200%, touch/axe, koreksi, batch, AI, analisis, ekspor dan pemulihan gagal memuat lulus.
- `ai-settings-browser.mjs`: 8 penyedia, pengosongan key, uji/aktif/nonaktif, perubahan belum disimpan dan retry lulus pada 320/390/768/1440.
- `search-filters-browser.mjs`: 10 panel produksi pada 320/390/768/1440, pagination, trim/batas pencarian, clear/fokus, reset, penolakan respons usang dan error vs empty lulus. Skrip disesuaikan dengan pemilihan ujian Monitoring dan pencarian khusus Kartu yang sudah ada.
- `accessibility-browser.mjs`: pemindaian tag WCAG tanpa pelanggaran terdeteksi, skip link, keyboard, fokus modal/fallback, validasi password, navigasi mobile, timer dan autosave lulus pada 320/768/1440.
- Screenshot desktop Hasil dan mobile Pengaturan diperiksa secara visual. Tidak ditemukan horizontal overflow atau dialog keluar viewport dalam matriks browser di atas.

Browser menggunakan komponen produksi dengan respons API simulasi; tidak mengirim email, membuat job, mengubah nilai atau data produksi. Uji browser mencakup keluarga komponen dan alur utama, bukan seluruh kombinasi data/role pada 23 halaman atau setiap keadaan dari 31 dialog. Pemindaian otomatis bukan sertifikasi aksesibilitas. Tidak ada pengujian langsung yang mengubah data produksi. Pemeriksaan integrasi database dijalankan oleh CI Foundation checks.

# Audit halaman Audit aktivitas

Tanggal: 2 November 2026 (WIB). Route: `/dashboard/audit`.

## Temuan

- Urutan SQL hanya memakai timestamp, sehingga catatan pada waktu sama dapat bergeser di batas halaman.
- Komponen daftar audit dan ekspor bercampur dengan state/mutasi Otomasi. Pembacaan generik menerima data tanpa pemeriksaan runtime, tidak memiliki timeout/abort, dan dapat meninggalkan permintaan usang tetap berjalan.
- Parameter halaman menerima NaN, Infinity dan pecahan. Rentang waktu terbalik tidak ditolak sebelum RPC. Respons audit malformed dapat dianggap sukses dan mematahkan render.
- Loading/error menghasilkan tabel kosong tanpa empty state yang jelas; pagination tidak kembali ke halaman tersedia ketika total menyusut. Tidak ada tombol muat ulang langsung pada alur audit.
- Input dan tampilan tanggal mengikuti zona perangkat tanpa penanda. Batas `until` adalah eksklusif, tetapi sebelumnya konteks waktu tidak jelas.
- Ekspor tidak dibatasi jumlah request/waktu, dapat berulang jika server memberi baris kosong dengan total positif, dan tidak mendeteksi halaman duplikat/perubahan total. CSV langsung mencabut object URL, tanpa konfirmasi berhasil. Perlindungan formula tidak mencakup whitespace/control prefix.

## Perbaikan

- `SystemPanel` tetap kompatibel; audit dipindah ke `AuditPanel` dan cabang lama dihapus. Mutasi, polling, halaman Pengaturan dan daftar Jobs dipertahankan.
- Kontrak Zod pada API dan client, penolakan parameter audit invalid, respons tidak valid 503, proyeksi field yang memang digunakan. Admin dalam konteks staf tetap wajib; tenant dan database privilege tetap ditentukan `system_command` yang sudah ada.
- Debounce 250 ms, abort, generation dan timeout melalui transport bersama; kontrol menginvalidasi hasil lama segera. Clamp pagination 50 baris, loading/error/empty terpisah, refresh eksplisit, ringkasan filter dan navigasi aksesibel.
- Input/display WIB melalui helper waktu yang sudah ada, CSV tetap ISO UTC dengan header eksplisit.
- Ekspor membekukan filter dan batas waktu atas saat mulai, membatasi 10.000 baris/200 halaman/120 detik, memvalidasi setiap halaman, menolak total berubah, duplikat dan hasil parsial. Lock sinkron, batal ekspor dan cleanup unmount; object URL dilepas setelah browser menerima unduhan; CSV memakai BOM, quote escaping dan pencegahan formula prefix.
- Tabel berarea gulir, kolom waktu sticky, reflow tindakan mobile, teks panjang wrapping; modal Detail menampilkan identitas catatan dan target tanpa membuka mutasi atau data tambahan.

## Validasi dan batas

- `npm run check` lulus: lint tanpa error (satu warning ref cleanup AI yang sudah ada), typecheck, **406 tes berhasil / 3 dilewati pada 52 file**, dan build produksi.
- `audit-browser.mjs` lulus: 320/390/768/1024/1440, rotasi 844×390 dan layar 320×320, touch, teks 200%, axe pada panel/detail, fokus dialog, pagination clamp, WIB, respons usang, error/malformed/empty, retry dan CSV.
- `settings-browser.mjs` lulus untuk regresi Settings/SystemPanel, Jobs/Audit, dialog dan kredensial, konflik/hasil belum pasti, SMTP, mobile dan axe. Seluruh mutasi pada uji tersebut disimulasikan.
- `audit-integration.mjs` lulus dalam PostgreSQL terisolasi: 101 timestamp sama melewati tiga halaman, ID unik berurutan DESC, batas atas eksklusif, penolakan Guru, patch idempotent dan privilege/config fungsi tetap. Tes ditambahkan ke `test:database` agar dijalankan CI.
- Migrasi diterapkan dan diperiksa di staging: kedua pengurutan baru aktif, SECURITY DEFINER/search_path tetap dan anon tidak memperoleh EXECUTE. Tidak ada perubahan isi log.
- Screenshot mobile diperiksa; tidak ditemukan overflow dokumen atau dialog di luar viewport pada matriks uji. Pemindaian axe bukan sertifikasi aksesibilitas.

Baseline advisor tetap memuat INFO [RLS tanpa policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) pada tabel yang memang ditutup dari akses langsung, dan WARN [Leaked Password Protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) yang sudah ada sebelum perubahan. Tidak mengubah konfigurasi Auth atau grant di luar audit. Browser menggunakan API read simulasi; tidak membuat, mengubah atau menghapus audit log produksi. Migrasi `20261102144237_audit_stable_order.sql` menambah ID DESC sebagai pembeda timestamp pada pemilihan halaman dan agregasi JSON audit; fungsi, privilege, search_path, tenant guard serta tindakan lainnya dipertahankan. Tidak ada dependency, endpoint atau perubahan isi data. Inventaris tetap 23 halaman; satu penggunaan dialog baru (total 32 pada 20 komponen).

Ekspor tidak mengklaim snapshot transaksi lintas halaman. Jika pembacaan bergeser, aplikasi menolak berkas daripada mengunduh data yang diketahui tidak lengkap. Urutan timestamp sama kini memakai ID DESC. Duplikat lintas halaman tetap dideteksi sebagai perlindungan tambahan.

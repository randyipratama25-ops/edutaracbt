# Audit Atur password akun

Lingkup `/auth/reset`, form password, callback Beranda, `/auth/confirm`, API aktivasi/password, sesi/cookie, helper transport, bantuan dan CSS. Tidak ada tabel, pagination, CRUD akademik atau integrasi GAS pada halaman ini.

## Temuan dan perbaikan

- Effect aktivasi dapat berjalan ulang (termasuk Strict Mode) dan memakai ulang refresh token. Promise inisialisasi tunggal per mount dan cleanup yang mengenali reconnect Strict Mode mencegah request ganda; unmount nyata membatalkan pekerjaan klien.
- Token fragment baru dibersihkan setelah response. Kini dibersihkan sebelum request. Marker URL nonrahasia `activation=pending/invalid` mencegah refresh/tautan gagal memakai sesi lama yang mungkin berbeda akun. Token/password tidak ditulis ke storage atau log aplikasi.
- Callback parsial/error diperlakukan sebagai halaman biasa; kode email hash belum diteruskan. Parser callback bersama menangani fragment, PKCE dan invite/recovery, menjaga destination lokal dan membersihkan data sensitif. `/auth/confirm` menangani exception penyedia dengan redirect lokal yang sama.
- Form langsung aktif tanpa mengecek sesi. GET read-only pada API password yang sama mengembalikan hanya readiness sesi, private/no-store. Form terkunci sampai sesi/aktivasi valid; cek ulang hanya mengulang pembacaan sesi, tidak mengirim ulang token.
- Submit tidak memiliki lock/deadline dan respons langsung dipercaya. Lock, helper transport lama yang diperluas, batas 35 detik/no automatic retry, serta validasi response memperjelas loading/error/success/hasil belum pasti. Jika hasil mutation tak pasti, pengguna diminta mencoba login dengan password baru sebelum mengulang.
- Validasi konfirmasi, atribut form dan feedback belum konsisten. Skema password 12–128 karakter dipakai bersama API/UI, kedua field memiliki maxlength, form native POST, password tidak di-trim. Toggle lihat/sembunyikan terpisah, aria-invalid/deskripsi dan fokus feedback diperbaiki. Help dialog tidak kehilangan fokus saat request selesai.
- Audit yang throw sesudah update dapat melewatkan global signout; error hasil signout diabaikan. Setelah update terkonfirmasi, audit dicoba dan global signout tetap dicoba walau audit gagal. Hasil partial tetap mengakui password sudah berubah, dengan flag additive `signed_out:false`, tanpa mendorong mutation ulang. Log kegagalan hanya nama event, tanpa password/token.
- Setelah sukses form dulu tetap dapat dikirim dan mempertahankan nilai. Kini nilai dibersihkan, form dikunci dan CTA menuju login disediakan.
- Transisi link dari outline ke tombol utama dapat menampilkan teks putih sebelum latar hijau selesai berubah. Transisi link pada form reset dinonaktifkan agar kontras stabil saat status berubah.
- Card sebelumnya tidak mempunyai batas lebar auth-card. Styling khusus reset, hierarchy, bantuan/footer dan target sentuh 44 px menjaga wrapping serta reflow. Layar pendek/zoom memakai scroll dokumen alami, bukan memotong konten.

## Kompatibilitas dan batas

Tidak mengubah panjang/kebijakan bisnis password, konteks/peran, endpoint POST, cookie HttpOnly/SameSite, nama event audit atau global scope signout yang sudah ada. GET readiness dan flag signed_out bersifat additive. Tidak diperlukan migrasi database atau deployment Edge Function. Penolakan password lemah/sama menggunakan feedback 422, sesi invalid 401, dan hasil penyedia tidak pasti 503. Global signout mencabut refresh sessions; JWT akses lama tetap dapat berlaku sampai kedaluwarsa sesuai perilaku Supabase.

## Validasi

`npm run check`; tes API status sesi, same-origin, batas input, password utuh, urutan update/audit/signout, audit gagal, partial signout, callback dan exception provider. Browser `/auth/reset` asli dengan API simulasi: desktop/tablet/mobile, layar pendek, orientasi, teks 200%, sentuhan, keyboard/fokus/help, sesi kosong/expired, marker/token/error, Strict Mode single-flight, mismatch, double submit, weak/rate failure, timeout/non-JSON, sukses/partial, clear fields dan unmount. Tidak mengganti password atau mengirim email akun produksi. Pemeriksaan axe bukan sertifikasi aksesibilitas.

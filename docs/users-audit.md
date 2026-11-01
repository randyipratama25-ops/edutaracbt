# Audit Pengguna (/dashboard/users)

## Lingkup dan alur

Dashboard layout memeriksa sesi/konteks staf; page memakai UsersPanel, list filters, dialog dan bantuan lama. GET /api/admin/users membaca profil melalui client pengguna/RLS, filter organisasi/role/status/pencarian, sort username dan pagination 20. GET /api/admin/master memberi kelas aktif berizin. POST users meneruskan manage_user ke identity-gateway setelah Origin, actor, schema dan kewenangan; gateway memeriksa target/organisasi/kelas, undangan dan aturan Admin aktif terakhir melalui database. Pratinjau memakai workflow_command/import_preview; impor tetap create per baris. Tidak ada form password atau edit role/email/username yang dihapus.

## Temuan dan perbaikan

- Submit tambah/edit/status dan pratinjau belum memiliki lock sinkron bersama. Kini satu lock melindungi semua proses, termasuk double-click/programmatic repeated submit; modal perubahan tetap terbuka hingga hasil/deadline sehingga response tidak menutup form akun lain.
- State pesan global dipakai lintas operasi sehingga error/sukses dapat muncul di modal yang salah. Feedback daftar, form, konfirmasi, undangan dan impor dipisahkan; validasi field mengikuti schema backend dan nama whitespace ditolak. Native POST menggantikan default GET; username dinormalisasi sesuai schema tanpa pattern HTML yang tidak kompatibel regex v.
- Response daftar/kelas/undangan dipercaya, count null dianggap nol, kelas gagal tanpa penjelasan. Schema runtime, deadline read20s/mutation35s, abort/generation guard dan pemulihan eksplisit menangani non-JSON/null/error serta response lama. Total null di server menjadi 503 aman; query tetap RLS+organisasi dengan deadline15s.
- Pagination dapat tertinggal di halaman kosong ketika filter aktif kehilangan baris. UI menghitung halaman terakhir, meng-clamp lalu membaca ulang. Underscore pencarian sekarang literal, bukan wildcard karakter tunggal. Definisi filter/sort dan jumlah per halaman tetap.
- Undangan dapat bercampur saat response info akun lama datang setelah modal berpindah. Cleanup/sequence dan lock pengiriman menjaga target. Kelayakan, cooldown/budget/provider dan email terdaftar tetap di server; cooldown UI mencegah recheck langsung menawarkan pengiriman baru sesudah sukses.
- Hasil create/email/update tidak pasti dapat mendorong pengiriman ulang. UI membedakan penolakan pasti vs timeout/non-JSON/5xx/indikasi create parsial, mengunci form, dan meminta pemeriksaan daftar/inbox. Tidak ada retry otomatis pada mutation.
- Pratinjau menganggap check server yang hilang sebagai valid. Kini setiap baris valid memerlukan tepat satu check server. TSV memeriksa 4–5 kolom, duplikat username/email case-insensitive, batas 200 dan nomor baris.
- Impor sebelumnya terus mengirim setelah unmount/hasil tak pasti dan tidak membedakan baris belum dikirim. Kini sequential, berhenti pada uncertain/401/403/429, mempertahankan laporan per baris dan menandai sisanya belum diproses. Unmount membatalkan request klien saat ini dan tidak mengirim baris berikutnya.
- Unduhan referensi kelas/hasil dapat memuat teks awal formula. Ekspor TSV menetralkan formula dan separator tanpa mengubah data database.
- Pada teks 200% di mobile, breadcrumb dapat menyempit menjadi kolom huruf dan membuat sticky header menutupi tombol. Header sempit kini membungkus breadcrumb ke baris tersendiri dan tidak sticky pada viewport sangat pendek.
- Pada tabel mobile, kolom username sticky dapat menutupi tombol pada grid aksi dua kolom. Aksi menjadi satu kolom sempit pada ponsel agar tombol dapat terlihat penuh di samping username saat tabel digeser.
- Konfirmasi native window.confirm diganti dialog berizin yang konsisten. Tabel mempertahankan header/username sticky, scroll internal bounded dan target keyboard/touch; dialog/reflow tidak memotong field; label role Indonesia tetap memetakan enum lama.

## Kompatibilitas dan batas

Tidak ada endpoint, role, tabel, dependency atau migrasi baru. Tidak perlu deployment Edge Function. Gateway Auth/profil/enrollment tetap dan bukan transaksi tunggal; respons tidak pasti bukan bukti tidak tersimpan. UI tidak menjamin idempotensi lintas tab/perangkat atau membatalkan efek server yang sudah berjalan. Admin perlu memeriksa akun/inbox dan menangani provisioning parsial melalui prosedur operasional; jangan membuat ulang akun secara otomatis. Tidak ada delete akun produksi, perubahan password, perubahan last-admin constraint, bypass RLS, service-key client atau pengiriman email pengujian operasional.

## Validasi

Tes API: Origin, actor/context/role, schema, batas page, query literal/org/deadline, null count, gateway/session dan guard Guru. Tes transport: envelope/schema, known/unknown/partial outcomes, deadline, abort dan no retry. Tes TSV: duplikat/kolom/empty/header serta formula-safe export. Browser memuat page/komponen produksi di route fixture dengan actor/API simulasi; menguji Admin/Guru, desktop/tablet/mobile, layar pendek, orientasi, zoom teks, tabel scroll, keyboard/touch, modal/axe, filters/sort/reset/page clamp, CRUD/invitation/import serta failure/timeout/unmount. Ini bukan UAT akun produksi atau sertifikasi aksesibilitas. Semua email/mutation browser disimulasikan. `npm run check`, skrip users-browser dan integrasi database CI menjadi pemeriksaan akhir sebelum merge.

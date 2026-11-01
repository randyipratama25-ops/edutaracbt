# Audit Ringkasan madrasah (/dashboard)

## Lingkup dan alur

Page dan layout memverifikasi actor. Admin membaca total profiles/classes/subjects melalui client Supabase pengguna (RLS, organisasi); Guru tidak meminta total organisasi. UI memakai DashboardShell, RoleActions, GradingPriority dan Workbench. Agenda berasal dari workflow_command/preparation; koreksi dari results_command/list state=pending. API dan fungsi database tetap, tidak ada CRUD data akademik pada Ringkasan. Tombol Perbarui hanya mengulang R; pintasan menuju modul CRUD yang sudah ada. Menu, help dan logout tetap komponen lama. Tidak ada tabel/form akademik, pencarian atau pagination lokal yang dihilangkan.

## Temuan dan perbaikan

- Hitungan selesai hanya cocok dengan lifecycle Selesai sehingga Dinilai/Dipublikasikan terlewat. Ketiganya kini dihitung; arsip dikecualikan dari statistik maupun agenda.
- Daftar kosong setelah filter arsip tidak memiliki empty state karena memakai panjang array sebelum filter. Kini dibedakan belum ada ujian dan seluruh ujian diarsipkan.
- Sorting string timestamp dapat salah untuk representasi offset berbeda. Kini memakai epoch, prioritas yang sama, tie-break ID dan enam baris tanpa mutasi sumber; jumlah terlihat/total dijelaskan.
- Klien langsung mempercayai payload sehingga null/format rusak dapat menyebabkan render error, angka negatif/tidak valid dan tanggal Invalid Date. Skema snapshot dashboard memeriksa field yang digunakan; hasil gagal tidak dianggap nol.
- Permintaan agenda/koreksi tidak memiliki deadline/cancellation; agenda tidak punya retry, respons lama berpotensi membingungkan. Hook GET bersama menambah batas 15 detik, AbortController, live guard, lock refresh dan data terakhir bertanda setelah gagal. Tidak ada background polling atau klaim realtime; waktu snapshot backend ditampilkan WIB.
- Total Admin menganggap count null sebagai nol dan rejection satu query dapat menggagalkan seluruh halaman. Setiap query kini menangani error/null/rejection/timeout secara terpisah, tetap memakai head/exact dan RLS, dengan filter organisasi eksplisit. Total tetap menyertakan data nonaktif agar definisi lama tidak berubah. Tombol refresh server tersedia.
- Layout dan page bisa dirender paralel; guard page kini memeriksa konteks/peran sebelum query, selain layout lama. Tidak ada perubahan hak akses, RLS atau API.
- Pada orientasi desktop, pemicu menu mobile dapat tersembunyi saat dialog ditutup. Fokus dialihkan ke main bila pemicu tersembunyi, tetap kembali ke pemicu pada mobile.
- Heading, data card, label link agenda, feedback, target sentuh dan wrapping diperjelas dengan CSS khusus ringkasan. Sidebar, identity dan semua pintasan lama dipertahankan. Scroll dokumen alami diperbolehkan pada konten panjang/zoom; bukan overflow yang memotong data.

## Kompatibilitas

Tetap 23 halaman. Tidak ada migrasi, tabel, endpoint atau dependency baru. GET workflow/results, lifecycle server, cakupan authoring/koreksi Guru, org/RLS Admin dan navigasi lama tetap. Helper api lama menerima opsi signal dan validasi envelope yang opt-in; pemakai lama tidak berubah. Tidak memakai service-role client, cache lintas pengguna, atau log data siswa. Tidak menghitung ulang lifecycle memakai jam klien. Snapshot baru hanya dibaca saat mount atau Perbarui.

## Validasi dan batas

Tes guard page, total terisolasi, skema, perhitungan lifecycle, pengurutan timestamp, transport, deadline, retry dan unmount. Browser memuat komponen produksi DashboardShell/DashboardOverview dengan API dan actor/statistik fixture, bukan mem-bypass login produksi: Admin/Guru, 320/390/768/1024/1440 px, layar pendek, orientasi, teks 200%, keyboard, sentuhan, help/menu bounded, axe, empty/arsip/banyak/loading/error, expired/non-JSON/payload rusak, refresh, data terakhir dan timeout. Tidak membuat akun, mengubah password, jawaban, nilai atau ujian produksi. Pemeriksaan axe bukan sertifikasi aksesibilitas; ukuran viewport bukan uji semua perangkat fisik.

Jalankan `npm run check`, `node scripts/ui/dashboard-browser.mjs`, serta rangkaian integrasi database CI. Gunakan EDUTARA_TEST_CHROME bila Chromium disediakan terpisah. Fixture route dan build cache sementara dibersihkan setelah pengujian. Deployment smoke menguji redirect anonim dan health/API guard tanpa sesi produksi.

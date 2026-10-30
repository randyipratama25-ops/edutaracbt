# Saran Tahap 6 — Fitur lanjutan terkendali

Baseline `f488dbaeabfe0cb19c8726d0bf605e3639a4aed9`, 30 Oktober 2026. AI belum diaktifkan karena penyedia belum dikonfigurasi; ekspor nilai tersedia dalam XLSX dan PDF.

## Implementasi

- `/dashboard/advanced` hanya Admin staf. Menampilkan status AI nonaktif, konfigurasi pilot SEB, probe browser lokal, formulir enam hasil aktual serta riwayat evaluasi organisasi dengan pagination. Setiap catatan menyertakan SHA kandidat, label perangkat uji, platform/versi SEB, catatan dan referensi artefak privat tanpa URL bertoken. Hasil tidak mengaktifkan SEB secara otomatis atau mengesahkan UAT.
- RPC `advanced_command` mengulang pemeriksaan Admin/organisasi/akun aktif; mutasi idempoten, JSON boolean ketat dan audit. Tabel private RLS tanpa grant langsung; U/D ditolak trigger. Backup organisasi dan inventaris rollback menyertakan catatan evaluasi; restore diuji hanya secara terisolasi.
- `/api/advanced/seb` mengunduh pilot XML plist `.seb` pada origin HTTPS aplikasi yang diizinkan. Login di SEB menggunakan autentikasi yang sudah ada. `allowQuit=true`, tanpa secret/password/token ujian. Ini konfigurasi tidak terenkripsi untuk evaluasi, bukan lockdown produksi. Tidak mengubah admission, writer epoch, deadline atau pemulihan jawaban. Tidak ada validasi BEK/CK atau kepercayaan otorisasi dari user-agent/API JavaScript browser.
- `/api/grading/ai` tetap 503 setelah otorisasi/validasi; tidak ada koneksi provider, pengiriman jawaban atau pembuatan row permintaan baru melalui endpoint web. Jalur legacy RPC tetap tidak memiliki penyedia aktif; riwayat lama dipertahankan. Aktivasi provider bukan bagian rilis ini.
- Laporan `exchange` pada Hasil/Analitik tersedia bagi Admin/Guru dalam scope laporan lama. Job mematok ledger revisi dan kop, memeriksa kepemilikan/izin kembali. XLSX memiliki header stabil, freeze, filter dan sheet Panduan; PDF landscape memakai mapping sama. Kolom ID Peserta, Nama, ID Ujian, Ujian, ID Attempt, Kelas, Revisi ledger, Status attempt, Status nilai, Nilai final, Kelulusan. Nilai provisional/diskualifikasi kosong; nol final tetap nol numerik. Sel teks tidak menjadi formula Excel. Tidak mengintegrasikan layanan/LMS secara langsung dan tidak membuat CSV.

## Migrasi

`20261030063153_advanced_features.sql`: tabel/trigger/RPC evaluasi serta penambahan jenis laporan dengan kontrol akses, lease, retry dan version pinning yang sama. Tidak ada rewrite jawaban/nilai/attempt historis. Tidak ada aktivasi model AI atau kewajiban SEB pada produksi.

## Verifikasi dan batas

Integrasi database menguji role, organisasi, input ketat, retry/conflict, append-only, grant, kepemilikan format exchange dan restore evaluasi identik. Unit/API menguji origin pilot, enam kategori boolean, AI tanpa outbound, scope Admin, mapping nilai final 0 vs pending/diskualifikasi, spreadsheet injection, ID/revisi, dan HTML escaping. Browser fixture menggunakan API simulasi pada 320/390/768/1440 untuk form, probe lokal, save/history, unduhan serta error/retry. PDF nyata 60 baris dibuat, dipastikan multi-halaman landscape, dan halaman pertama dirender/diperiksa; XLSX dibaca ulang dengan ExcelJS.

Bukan UAT klien SEB fisik atau pengesahan keamanan lockdown. Windows/macOS/iOS memerlukan observasi per versi di perangkat nyata sebelum kebutuhan enforcement diputuskan. Penerimaan operasional Tahap 5 (SLO150, legacy, perangkat fisik, latihan cloud dan persetujuan pemilik) tetap belum disahkan oleh perubahan ini.

## Acuan resmi yang diperiksa

- https://safeexambrowser.org/developer/seb-integration.html — tingkat integrasi dan konfigurasi XML/unencrypted.
- https://safeexambrowser.org/developer/seb-file-format.html — struktur konfigurasi.
- https://safeexambrowser.org/developer/seb-config-key.html — BEK/CK serta perbedaan header/JavaScript API.
- https://supabase.com/docs/guides/database/functions — fungsi terkontrol dan grant.

## Hasil penerapan 30 Oktober 2026

- Migrasi identik (MD5 `326e4a00470f7cc14466edf49de8c910`) diverifikasi di staging (riwayat `20261030064320`) dan diterapkan ke produksi. Tabel evaluasi memiliki RLS; anon/authenticated tidak memiliki SELECT tabel langsung.
- Lint, TypeScript, 159 tes (3 dilewati), build produksi, seluruh regresi database dan browser fixture empat ukuran layar lulus. Pemeriksaan komponen menggunakan panduan React.
- Dokumen pemeriksaan versi 1.7 mencakup 23 halaman. Hasil pilot bukan pengesahan perangkat SEB fisik.

# Keadaan proyek — 29 Oktober 2026, Asia/Jakarta

Repositori: randyipratama25-ops/edutaracbt; branch produksi main.
Baseline aplikasi yang telah dibuktikan: db1865629ed69ffa878d91fbfd42813ecf425730; build/typecheck lulus, Vercel READY dan HTTP 200.
Vercel: edutara-cbt pada team_lgY0IkLXGJkeHTLYtDbFFHu9; project prj_h6hiNwgrc9fC3zYCDa8louCOPkgI.
Supabase: cwklpfplqoofvehlyfvd, organisasi womoisnyxjrmzfhodjgk, region ap-southeast-1. Pemeriksaan awal sesi ini: tidak ada tabel aplikasi/migrasi.

Tahap 0.1 BERJALAN: commit/blob terikat dan repositori/lingkungan sudah diverifikasi; inventaris statis tersedia, semua entry point dinamis belum dibuktikan.
Tahap 0.2 TERHAMBAT untuk dataset lama: mapping/ERD awal tersedia; header aktual, sampel tersamarkan, counts dan file belum tersedia. Skema aplikasi baru tidak dianggap bukti data legacy.
Tahap 0.3 BERJALAN: 18 ADR terbuka, rulebook/kontrak/threat model dan 12 fixture sintetis; differential tests, keputusan ambigu serta target SLO belum final.
Tahap 1.1–1.4: implementasi fondasi tersedia pada branch feat/stages-1-1-to-1-4; rincian bukti dan batas di docs/stages-1-1-to-1-4.md. Build/lint/typecheck/unit, SQL/RLS, HTTP Auth/CRUD dan Storage sudah lulus. PR #1 https://github.com/randyipratama25-ops/edutaracbt/pull/1 telah digabungkan ke main pada afddefb8929d7111e1c58dfb61b869303209595c. Deployment baru diperiksa terpisah; jangan menyamakan merge dengan READY. Admin operasional, email dan UAT belum diselesaikan.

Dua migrasi dan identity-gateway sudah diterapkan pada proyek Supabase baru. Akun uji sementara telah dibersihkan. Tidak ada fitur ujian dinyatakan setara atau siap produksi. Belum ada dataset legacy dimigrasi atau UAT disahkan. Dokumen perencanaan yang diarsipkan mempertahankan status historis; status aktual ada di file ini dan worklog.

Tindakan berikutnya: fondasi CI/komponen, skema minimal terisolasi dengan RLS, autentikasi internal, pengguna/master; keputusan yang memblokir modul tetap dilacak. Tidak mengaktifkan SSO, regrading, atau impor produksi.

## Verifikasi operasional 29 Oktober 2026
- Profil Admin pertama: username admin, email tumtsnurulfalah@gmail.com; undangan tercatat pada Auth, email belum dikonfirmasi. Pengguna harus mengatur password sendiri.
- Site URL produksi dan redirect /auth/reset serta /auth/confirm tersimpan di dashboard Supabase. SMTP kustom belum aktif; pengiriman ke inbox belum diverifikasi.
- UAT perangkat fisik belum diverifikasi. Browser aplikasi masih memerlukan autentikasi Vercel.
- Memulihkan berkas aplikasi yang terhapus dalam commit status 7216a00 dari hasil merge afddefb; menambahkan penerusan fragment aktivasi dari root ke /auth/reset.

## Tahap 2.1–2.3 — 29 Oktober 2026
Implementasi jadwal, bank soal, versi immutable, impor/copy/progres tersedia pada `/dashboard/exams`. Keputusan max=0 tanpa batas, lock setelah mulai, Forms melalui ekspor sudah diberikan pemilik. Rincian dan bukti: docs/stages-2-1-to-2-3.md. UAT browser seluruh alur dan perangkat fisik belum disahkan; tidak ada klaim kesetaraan penuh data legacy.

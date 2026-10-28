# Keadaan proyek — 29 Oktober 2026, Asia/Jakarta

Repositori: randyipratama25-ops/edutaracbt; branch produksi main.
Baseline aplikasi yang telah dibuktikan: db1865629ed69ffa878d91fbfd42813ecf425730; build/typecheck lulus, Vercel READY dan HTTP 200.
Vercel: edutara-cbt pada team_lgY0IkLXGJkeHTLYtDbFFHu9; project prj_h6hiNwgrc9fC3zYCDa8louCOPkgI.
Supabase: cwklpfplqoofvehlyfvd, organisasi womoisnyxjrmzfhodjgk, region ap-southeast-1. Pemeriksaan awal sesi ini: tidak ada tabel aplikasi/migrasi.

Tahap 0.1 BERJALAN: commit/blob terikat dan repositori/lingkungan sudah diverifikasi; inventaris statis tersedia, semua entry point dinamis belum dibuktikan.
Tahap 0.2 TERHAMBAT untuk dataset lama: mapping/ERD awal tersedia; header aktual, sampel tersamarkan, counts dan file belum tersedia. Skema aplikasi baru tidak dianggap bukti data legacy.
Tahap 0.3 BERJALAN: 18 ADR terbuka, rulebook/kontrak/threat model dan 12 fixture sintetis; differential tests, keputusan ambigu serta target SLO belum final.
Tahap 1.1 fondasi App Router dan deployment tersedia; CI, komponen, domain dan pemeriksaan tambahan dikerjakan berikutnya.
Tahap 1.2–1.4: belum diimplementasikan pada snapshot ini.

Tidak ada fitur ujian dinyatakan setara atau siap produksi. Belum ada dataset legacy dimigrasi atau UAT disahkan. Dokumen perencanaan yang diarsipkan mempertahankan status historis; status aktual ada di file ini dan worklog.

Tindakan berikutnya: fondasi CI/komponen, skema minimal terisolasi dengan RLS, autentikasi internal, pengguna/master; keputusan yang memblokir modul tetap dilacak. Tidak mengaktifkan SSO, regrading, atau impor produksi.

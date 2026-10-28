# Catatan pekerjaan

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

27 Oktober 2026: unduh source commit terikat; `git hash-object` cocok. Indeks statis, matriks awal, rancangan mapping, ERD, ADR dan fixture dibuat. Source tidak disertakan. Pencarian repositori terpasang untuk edutara tidak mengidentifikasi repo tujuan. Dataset produksi tidak tersedia dalam konteks. Belum ada uji runtime.

## 29 Oktober 2026 — sinkronisasi acuan

Baseline runtime db18656 READY; repo tujuan dan organisasi Supabase terverifikasi. Menyalin 47 artefak rencana/fixture sebelumnya beserta dokumen induk ke repo. Status 0.2 dan 0.3 tetap terbuka; repositori/lingkungan tidak lagi dianggap hilang. Tidak ada source GAS sensitif atau secret baru disalin ke dokumentasi.

## 29 Oktober 2026 — implementasi fondasi 1.1–1.4

Dokumentasi 0.1–0.3 commit 500518b093aa2359e645bba38fb4a425c5a754ef masuk main. Branch fitur feat/stages-1-1-to-1-4 dibuat. Dua migrasi diterapkan pada Supabase cwklpfplqoofvehlyfvd dan identity-gateway dideploy. Uji lint/typecheck/unit/build, SQL/RLS, Auth/CRUD HTTP dan Storage lulus. Fixture Auth sintetis sementara diperbaiki setelah metadata timestamp kosong menyebabkan error Auth; ini kesalahan provisioning fixture SQL, bukan password aplikasi. Fixture dan file sementara dibersihkan. Request Origin lokal diperbaiki; TypeScript6 dipakai untuk kompatibilitas ESLint. Scope dan pekerjaan penerimaan tersisa ada pada stages-1-1-to-1-4.md.

PR #1 digabungkan ke main pada afddefb8929d7111e1c58dfb61b869303209595c. Workflow CI tersimpan; API belum menampilkan run CI, jadi CI remote belum diklaim lulus. Pemeriksaan lokal telah lulus.

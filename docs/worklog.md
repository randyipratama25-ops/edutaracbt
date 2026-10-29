# Catatan pekerjaan

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

27 Oktober 2026: unduh source commit terikat; `git hash-object` cocok. Indeks statis, matriks awal, rancangan mapping, ERD, ADR dan fixture dibuat. Source tidak disertakan. Pencarian repositori terpasang untuk edutara tidak mengidentifikasi repo tujuan. Dataset produksi tidak tersedia dalam konteks. Belum ada uji runtime.

## 29 Oktober 2026 — sinkronisasi acuan

Baseline runtime db18656 READY; repo tujuan dan organisasi Supabase terverifikasi. Menyalin 47 artefak rencana/fixture sebelumnya beserta dokumen induk ke repo. Status 0.2 dan 0.3 tetap terbuka; repositori/lingkungan tidak lagi dianggap hilang. Tidak ada source GAS sensitif atau secret baru disalin ke dokumentasi.

## 29 Oktober 2026 — implementasi fondasi 1.1–1.4

Dokumentasi 0.1–0.3 commit 500518b093aa2359e645bba38fb4a425c5a754ef masuk main. Branch fitur feat/stages-1-1-to-1-4 dibuat. Dua migrasi diterapkan pada Supabase cwklpfplqoofvehlyfvd dan identity-gateway dideploy. Uji lint/typecheck/unit/build, SQL/RLS, Auth/CRUD HTTP dan Storage lulus. Fixture Auth sintetis sementara diperbaiki setelah metadata timestamp kosong menyebabkan error Auth; ini kesalahan provisioning fixture SQL, bukan password aplikasi. Fixture dan file sementara dibersihkan. Request Origin lokal diperbaiki; TypeScript6 dipakai untuk kompatibilitas ESLint. Scope dan pekerjaan penerimaan tersisa ada pada stages-1-1-to-1-4.md.

### 29 Oktober 2026 — Tahap 2.1–2.3
Implementasi modul authoring; pengujian unit, SQL/RLS/kuota konkuren dan HTTP. Keputusan pemilik serta batas verifikasi dicatat di docs/stages-2-1-to-2-3.md.

### 29 Oktober 2026 — Tahap 3.1–3.3
Implementasi attempt/player/save/submit/integrity dan dependensi inti grading 4.1. Kebijakan D07/D08 serta adaptor OCR dipilih pemilik. Tes dan keterbatasan dicatat di docs/stages-3-1-to-3-3.md; UAT perangkat tetap terbuka.

- 2026-10-29: Tahap 4.1–4.3: halaman hasil/analisis, RPC koreksi atomik/ledger/publikasi, adaptor AI nonaktif, laporan PDF/XLSX dan job privat. Migrasi 20261029102717 diterapkan setelah backup terarah, PostgreSQL staging lokal dan rollback teruji. Detail validasi dan batas: docs/stages-4-1-to-4-3.md.

- 2026-10-29: Implementasi teknis Tahap 5.1–5.3. Tambah ruang/sesi/roster/pengganti efektif, monitor scoped, reset non-destruktif dengan deadline tetap, media immutable + cleanup retry, kartu privat PDF/ZIP dan notifikasi in-app. Migrasi 20261029120103 diterapkan setelah backup, staging lokal dan rollback test. Lihat docs/stages-5-1-to-5-3.md; UAT fisik, transport live/beban besar dan kredensial Drive nyata belum disahkan.

# Tahap 4 — Bank soal dan penilaian

Implementasi 30 Oktober 2026. Baseline main `cde0fbadb14fc296d61a0906a6b418d6b1c24e79`.

## Perilaku dan kewenangan

- Halaman `/dashboard/bank`: metadata mapel/kelas/materi/indikator/kesulitan/C1–C6; lima tipe soal, versi, review, arsip, impor dan hasil per baris. Guru hanya pada seluruh kelas–mapel penugasan; editor pemilik/Admin. Guru lain meninjau; Admin dapat menyetujui soal organisasi sendiri.
- Kisi-kisi maksimal 3 ujian draf, 20 kelompok, 200 soal/paket, hanya versi bank disetujui. Bobot esai mengikuti rubrik. Sampling acak dengan komposisi yang sama tidak menjamin kesetaraan psikometrik. Transaksi batal seluruhnya jika stok/kuota tidak cukup. Versi sumber/pemakaian dicatat dan snapshot attempt lama tetap utuh.
- Halaman `/dashboard/grading`: kode anonim, koreksi rubrik per kriteria (nol eksplisit berbeda dari kosong), alasan revisi dan umpan balik. Identitas tetap dapat dilihat oleh akun berwenang melalui modul Hasil. Guru menilai sesuai satu atau lebih kelas snapshot yang ditugaskan untuk mapel, mengikuti aturan lama.
- Moderasi memerlukan penilai lain; revisi usang ditolak. Usulan belum mengubah nilai resmi. Persetujuan memakai ledger penilaian resmi yang sama. Tidak ada hapus/edit umum atas versi atau riwayat.
- Hanya Admin menerbitkan/membatalkan publikasi. Jadwal setelah akhir ujian memerlukan semua nilai final dan moderasi selesai. Cron tiap menit memeriksa ulang kewenangan pembuat dan fingerprint revisi/completion. Revisi berikutnya menyembunyikan hasil dan memblokir jadwal sampai tinjauan ulang.
- Analisis distraktor dan tanda sampel kecil (<30); interpretasi daya pembeda belum cukup pada <4. PDF/XLSX membawa rincian kriteria dan alasan revisi. AI tetap adaptor tidak aktif.

## Migrasi dan operasional

`supabase/migrations/20261030052445_bank_assessment_stage4.sql` diterapkan ke staging `fgnndovqgpkslznxhrgu` dan produksi `cwklpfplqoofvehlyfvd`. Riwayat versi remote diselaraskan ke timestamp berkas setelah penerapan MCP. Tidak ada backfill jawaban/nilai/snapshot/deadline lama.

Sembilan tabel private baru semuanya RLS, tanpa SELECT langsung anon/authenticated. RPC hanya authenticated dengan pemeriksaan role/scope internal; anon ditolak. Worker `private.publish_due_results()` tidak diberikan kepada authenticated; cron `edutara-results-publication` aktif tiap menit. Media yang dipakai versi bank tetap terlindungi dari penghapusan.

Security advisor: tambahan INFO RLS tanpa policy pada tabel private memang disengaja karena akses hanya melalui fungsi terkontrol. Peringatan leaked-password protection sudah ada sebelum Tahap 4; tidak ada WARN baru dari perubahan ini. Acuan: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Verifikasi

- `npm run check`: lint, TypeScript, 19 berkas tes; **136 lulus, 2 dilewati**; build produksi lulus.
- `npm run test:database`: regresi penilaian/operasional/retention/sesi/recovery/workflow dan integrasi bank/assessment PGlite.
- `scripts/bank-assessment-integration.mjs`: scope, review terpisah, duplikat, versi, rollback paket, media/RLS, privasi snapshot/rubrik, proyeksi anonim, ledger kriteria, retry idempoten, moderasi/revisi usang, jadwal/cron/revalidasi, pencabutan penugasan dan grant private.
- `scripts/ui/stage4-browser.mjs`: data API simulasi pada 320/390/768/1440; keadaan kosong, dialog editor/kisi-kisi, Escape, form publikasi Admin dan overflow dokumen. Gambar mobile diperiksa visual. Route sementara dihapus dan tidak masuk produksi.
- Browser belum merupakan UAT akun produksi, interaksi penilaian lengkap pada perangkat fisik, sertifikasi aksesibilitas atau pembuktian kesetaraan psikometrik. Pengujian otorisasi/mutasi dilakukan melalui integrasi SQL terisolasi.

Inventaris hak akses resmi: `Pemeriksaan_Halaman_Hak_Akses_CRUD_EDUTARA_CBT.md` versi 1.5, 21 halaman.

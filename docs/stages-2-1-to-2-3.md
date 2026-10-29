# Tahap 2.1–2.3 — Jadwal dan penyusunan soal

Implementasi 29 Oktober 2026. Jalur UI: `/dashboard/exams`. API staf: `/api/authoring`; media: `/api/authoring/media`.

## Keputusan pemilik

- D03: `max_questions=0` berarti tanpa batas untuk tipe yang enabled; disabled tetap menolak penambahan.
- D09: setelah waktu mulai server, atau status active/closed/archived, penulisan/edit/arsip/import/copy soal dikunci, termasuk Admin. Penutupan/arsip administratif tetap tersedia; scheduler tidak membuka kembali penutupan manual.
- D12: integrasi Google Forms melalui berkas ekspor, bukan OAuth langsung. JSON ekspor Forms API berisi items/choiceQuestion/textQuestion dapat dinormalisasi; format lain ditolak. Pilihan tanpa kunci harus diperbaiki pada pratinjau sebelum diimpor. Tidak ada akses URL Google arbitrer.
- D04: data baru mendukung ID opsi A–F (2–6 opsi). Ini tidak mengesahkan regrading historis legacy.
- D05: PIN hanya hash bcrypt, tidak disertakan dalam SELECT/API. Keputusan resolusi PIN ganda pada start attempt masih bagian 3.1; modul ini tidak memilih ujian hanya dari PIN.

## Cakupan

### 2.1

CRUD jadwal multi-kelas, duplikasi jadwal menjadi draft dengan PIN baru, arsip massal, durasi/waktu/passing grade/shuffle, lima konfigurasi enabled/max/option count/default points. Periode input Guru global dan bypass per ujian. Guru harus memiliki penugasan aktif untuk **seluruh pasangan mapel–kelas** ujian. Status efektif memakai jam server. Handler `advance_exam_schedule` khusus service_role tersedia untuk aktivasi dan timeout; penjadwalan cron belum diaktifkan (6.1).

### 2.2

PG, PG kompleks, BS, JODOH, Esai. Editor markup dengan toolbar format/simbol/Arab/LaTeX, arah RTL/LTR, render KaTeX, HTML attribute-free allowlist; URL gambar/audio tidak diterima dalam HTML. Opsi memakai ID stabil, kunci/rubrik/pembahasan, poin/wajib/minChars, metadata canvas. Upload privat maksimal 5 MiB dengan MIME + signature validation; attachment menggunakan ID, URL bertanda tangan 60 detik. UPDATE membuat versi baru, optimistic version check mencegah lost update; versi tersimpan immutable. DTO siswa menghapus key/rubric/explanation/keywords; rute siswa yang memanfaatkan DTO akan diintegrasikan pada tahap 3.1.

Salin membuat ID soal dan relasi attachment baru, mempertahankan referensi ke object privat immutable yang sama untuk menghindari duplikasi bytes. Izin baca object mengikuti akses ujian; tidak menjadikan bucket publik. UI belum menggunakan TinyMCE; editor HTML terbatas dengan toolbar dipakai untuk menjaga allowlist yang sama dengan validasi database.

### 2.3

Parser format legacy PG/PG kompleks, BS Pernyataan, JODOH Pasangan/Pengecoh, Esai Rubrik/MinKarakter/KataKunci; pemisah baris kosong atau `---`, serta JSON kanonik. Template lima tipe dan unduhan Excel. Excel `.xlsx`: kolom A `question_json` per baris; tidak menjalankan formula. Adaptor ekspor Forms API berkas berizin pengguna. Pratinjau bernomor blok, valid/invalid, maksimum 500 item/request dan 5 MB. Impor ulang dengan idempotency key yang sama mengembalikan hasil sama; perubahan payload pada key sama ditolak. Duplikat payload disisihkan. Soal satuan, impor, copy menggunakan satu RPC/lock baris ujian dan guard periode/konfigurasi/kuota yang sama. Indikator jumlah/target per tipe dalam ujian yang dapat diakses Guru.

## Validasi yang dilakukan

- Lint dan TypeScript lulus; 20 tes Vitest lulus, termasuk semua tipe, opsi F, sanitasi, DTO tanpa kunci, 500/501, legacy BS/JODOH/Esai, ekspor Forms, roundtrip workbook Excel.
- Build Next.js lulus.
- `supabase/tests/authoring.sql`: transaksi rollback dengan identitas sintetis; CRUD jadwal, lima tipe, edit v2/riwayat v1, stale version, idempotency, kuota 1, 500 esai berbeda dengan kuota 0, penolakan 501, copy ID baru, scope Guru, periode kedaluwarsa, siswa tanpa akses kunci, penguncian setelah mulai, dan scheduler tidak membuka manual close.
- Dua transaksi database bersamaan pada kuota 1 menghasilkan satu saved=1 dan satu saved=0/QUOTA; jumlah akhir tepat 1. Fixture berada dalam organisasi uji terisolasi. Versi immutable dan ujian uji dipertahankan di organisasi uji terisolasi; ujian/soal diarsipkan dan sesi uji diberi not_after lampau. Identitas sintetis tidak mempunyai password maupun identitas provider. Penghapusan fixture melalui plugin gagal Invalid or expired requestState, sehingga tidak diklaim sudah terhapus. Tidak berada dalam organisasi operasional.
- `scripts/authoring-http-smoke.mjs`: 6 pemeriksaan runtime HTTP; API/media tanpa sesi ditolak, cross-origin ditolak, halaman ujian tanpa sesi dialihkan ke login.
- Advisor keamanan: tidak ada error/warning baru; INFO default-deny untuk tabel modul mendatang serta private request log memang disengaja.

## Batas verifikasi

Belum mengesahkan UAT browser untuk seluruh workflow Admin/Guru atau perangkat fisik tablet/ponsel. Belum ada data legacy nyata dimigrasikan. OAuth Forms langsung, galeri/media management penuh, canvas jawaban, snapshot attempt dan penilaian berada di tahap berikutnya. Ekspor Excel lama yang berbeda header perlu dinormalisasi ke template baru; tidak dinyatakan setara dengan seluruh workbook legacy tanpa sampel aktual.

Migrasi diterapkan melalui transaksi SQL karena `apply_migration` plugin dua kali gagal `Invalid or expired requestState`. SQL sumber dan versi migrasi disimpan dalam repositori; registry remote sudah direkonsiliasi untuk ketiga versi migrasi.

Audit dependensi production akhir: 0 kerentanan. KaTeX 0.19.1; ExcelJS 4.4.0 dengan override uuid 11.1.1; roundtrip workbook dan typecheck tetap lulus. Preview/Excel diload dinamis; GET bank soal melakukan pagination internal agar tidak terpotong batas 1.000 baris Data API.

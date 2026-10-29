# Tahap 4.1–4.3 — hasil, koreksi, analisis, laporan

Implementasi teknis 29 Oktober 2026. UAT operasional pada perangkat fisik belum disahkan.

## Keputusan pemilik

- AI: adaptor dan persetujuan disiapkan; penyedia belum diaktifkan. Tidak ada jawaban siswa yang dikirim keluar. Permintaan menghasilkan kegagalan eksplisit dengan points NULL, bukan nol.
- Hanya Admin menerbitkan nilai final kepada siswa. Kunci/rubrik tidak masuk DTO siswa. Guru hanya mengoreksi cakupan kelas–mapel yang ditugaskan dan aktif.

## 4.1

Hasil dipaginasi 25 baris, dicari nama/username, difilter kelas/mapel/ujian/status, diurut nama/nilai. Detail memakai snapshot versi soal dan ledger revisi. Finalisasi otomatis memakai engine objektif yang sudah ada untuk PG/PGK/BS/JODOH. Esai belum dikoreksi tetap pending, nilai resmi NULL; nol adalah nilai sah. Kelulusan dihitung terhadap passing_grade snapshot, bukan kebijakan ujian yang berubah kemudian. Riwayat lama tidak ditebak kelasnya: Admin dapat meninjau/rekalkulasi, guru tidak otomatis mendapat akses historis tanpa snapshot kelas.

## 4.2

Koreksi satu soal, semua esai peserta, atau soal yang sama lintas peserta melalui satu RPC batch atomik (maksimal 500 item). Bobot snapshot, nilai desimal, expected revision dan request UUID diperiksa server. Stale write ditolak; retry identik tidak menggandakan riwayat. Rekalkulasi berizin perlu alasan. Nilai, komentar, sumber, aktor, dan revisi tercatat. Adaptor AI memiliki kontrak output ketat, prompt minim identitas, batas batch/rate, kebijakan timeout 20 detik, metadata provider/model/prompt/schema, serta keputusan terima/edit/tolak; provider nyata belum tersambung.

## 4.3

Analisis lima tipe memakai hanya attempt final layak (bukan pending/DQ/reset). Ambil attempt layak terbaru per siswa–ujian, pisahkan versi soal. P memakai earned/max; D memakai rerata kelompok atas/bawah k=max(1,floor(0,27*N)), ikatan diurut ID stabil. Batas kesukaran P<0,30 sukar; 0,30–0,70 sedang; >0,70 mudah. D negatif dibuang; <0,20 jelek; <0,30 cukup; <0,40 baik; sisanya sangat baik. Daftar salah/parsial, distribusi opsi/pernyataan/pasangan, dan nilai esai disediakan; sampel kecil diberi penanda.

Ekspor PDF/XLSX: rekap, per kelas, rinci siswa, soal, jawaban, lembar kosong, analisis; kop/alamat/logo/pejabat diatur Admin. PDF menyematkan font Arab dan KaTeX, halaman bernomor global dan gambar privat. XLSX menyimpan teks HTML/LaTeX sebagai teks, bukan rumus Excel; jawaban panjang dipecah tanpa truncation. XLSX tidak mengonversi LaTeX menjadi persamaan grafis; canvas/lampiran soal tetap dirujuk dengan ID. PDF menyematkan gambar canvas/soal yang tersedia. Audio/dokumen dirujuk, tidak diubah menjadi gambar.

Job persisten menyimpan revisi nilai dan identitas/kop saat dibuat, progress/lease/failures/retry; file di bucket privat exam-reports dengan tautan 60 detik dan pemeriksaan ulang izin. Maksimal 500 attempt/job, 50 MiB hasil, 1.500 halaman PDF, 30 MiB data dan 40 MiB media; permintaan yang melampaui batas ditolak jelas untuk dibagi, bukan dipotong. Worker berjalan Next after (300 detik); job terputus dapat diklaim ulang setelah lease 4 menit. Ini bukan worker antrean eksternal permanen.

## Migrasi dan pemulihan

Migrasi produksi `20261029102717_grading_results_reports.sql` berhasil diterapkan melalui plugin Supabase. Sebelum pemasangan: 0 attempt organisasi sekolah, 0 nilai manual; 2 attempt sintetis di organisasi uji. Backup terbatas attempt/grade/definisi fungsi/policy/kolom tersimpan terpisah dari git, SHA-256 `df9be48ebc63c5e9bcce56a2939aa479e85fc48358f7fb902e091322f25e1195`. Ini backup terarah, bukan dump penuh/PITR.

Penolakan pemeriksaan awal diselesaikan dengan backup, pengujian PostgreSQL lokal terisolasi, rollback teruji, dan preflight yang membatalkan pemasangan bila attempt operasional/nilai manual muncul. Jangan menjalankan ulang berkas migrasi secara manual pada produksi yang sudah tercatat.

Rollback: kembalikan aplikasi ke commit sebelum Tahap 4; jalankan `supabase/proposals/stage4-disable.sql` melalui perubahan database yang ditinjau. Script mengembalikan finalisasi sebelumnya dan mencabut RPC baru, sambil mempertahankan seluruh ledger/kolom/job/file agar nilai baru tidak hilang. Tidak ada DROP/TRUNCATE/DELETE data grading. Reaktivasi perlu migrasi baru yang ditinjau.

## Verifikasi

- ESLint dan TypeScript lulus, build Next.js produksi lokal lulus.
- Unit suite: 51 lulus, 1 PDF QA dilewati default; PDF QA terpisah lulus (7 pengujian modul hasil/laporan).
- `node scripts/stage4-integration.mjs`: semua migrasi dipasang di PGlite/Postgres terisolasi dengan facade auth/storage; regresi attempt lama, scoped teacher exact class, pending/zero/desimal, stale revision/idempotensi/batch rollback, AI gagal bukan nol, Admin publication guard, snapshot revisi ekspor, lease/retry/revoked scope, DTO siswa tanpa kunci, dan rollback non-destruktif lulus.
- PDF QA: jawaban Arab panjang 160 paragraf + rumus, 7 halaman, marker END_OF_ANSWER ditemukan lewat pdftotext; halaman awal/akhir dirender dan diperiksa. Bukan sertifikasi seluruh printer/perangkat.
- XLSX dibuka ulang ExcelJS: teks panjang utuh, 6,25 tersimpan numerik, formula injection tidak menjadi formula.
- Advisor Supabase: tabel privat/RPC-only sengaja RLS default deny; peringatan leaked-password protection yang sudah ada tetap memerlukan tindak lanjut konfigurasi Auth. Referensi: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Gerbang yang belum disahkan: browser UAT lengkap dengan pengguna operasional, perangkat nyata, volume besar/ketahanan 500 attempt, AI provider nyata, dan pencetakan lintas printer.

# Tahapan Pembangunan Ulang EDUTARA CBT

Versi: **1.0** · Tanggal: **26 Oktober 2026** · Bahasa: Indonesia  
Status: **rencana kerja; belum ada implementasi, migrasi atau pengujian aplikasi yang dibuktikan melalui penyusunan dokumen ini.**

## 1. Kedudukan dan acuan

Dokumen ini merinci roadmap Bagian 14 dalam `Dasar_Pembangunan_Ulang_EDUTARA_CBT.md` versi 1.0. Gunakan keduanya: dokumen dasar menjelaskan kebutuhan dan perilaku, dokumen ini mengendalikan urutan, bukti dan progres pekerjaan. Tidak ada fitur yang dikeluarkan dari cakupan.

- Repositori sumber: https://github.com/amtsnurulfalah-commits/edutaracbt
- Commit pembanding: `1a4407c727f2660e40019177c5920bab45afb815`.
- Blob `Code.gs`: `9f7ebec17a4a7103a51417db3e00c62f647eda91`.
- Blob `index.html`: `71bcdc15134ad5baf35bc17d99d93f7bee169fd5`.
- SHA-256 dokumen dasar yang dibaca: `94c55f4a62267c4dba103666cc981c56107e4a16257a7c288f70b56f5758f934`.
- Stack tetap: **Next.js App Router + TypeScript + Vercel + Tailwind CSS + shadcn/ui + Zod + Supabase**.
- Baseline cakupan: **F01–F36**, **SEC-01–SEC-26**, **T001–T056**, **D01–D18**.

Dokumen dasar berasal dari audit statis. Roadmap ini tidak menggantikan pembacaan fungsi legacy lengkap, audit dataset produksi berizin, dan UAT. Jangan menganggap perilaku produksi telah terbukti. Jika sumber berubah, simpan baseline baru beserta diff dan dampaknya, jangan mengganti acuan diam-diam.

Default rancangan: autentikasi internal, Supabase Auth diutamakan; satu organisasi aktif dengan `organization_id` dan isolasi data. Central SSO dan produk multi-tenant penuh memerlukan keputusan terpisah. Default tersebut belum berarti seluruh D01–D18 disahkan.

## 2. Tata kerja dan definisi status

| Status | Makna dan bukti yang dibutuhkan |
|---|---|
| BELUM DIMULAI | Belum ada pengerjaan terverifikasi |
| BERJALAN | Ada perubahan nyata; pekerjaan/bukti yang tersisa tercatat |
| TERHAMBAT | Tuliskan penyebab, dampak, pihak penentu dan pekerjaan independen yang tetap dapat dilanjutkan |
| SIAP DIVERIFIKASI | Implementasi tersedia; tes/UAT belum seluruhnya selesai |
| SELESAI TERVERIFIKASI | Keluaran, tes relevan, dokumentasi dan UAT yang dipersyaratkan telah dibuktikan |

Kotak checklist menunjukkan butir kerja, bukan bukti uji. Commit/PR, merge, build hijau, migrasi diterapkan, deployment sehat dan persetujuan UAT adalah fakta berbeda; catat masing-masing. Jangan menandai selesai hanya karena halaman tampil, kode sudah ditulis, tes belum dijalankan atau PR telah di-merge.

Setiap unit kerja memiliki ID tetap `<tahap>-<nomor>`; misalnya `3.2-02`. Jika dipecah lagi gunakan akhiran `.a/.b`, jangan mengubah ID lama. Kerjakan PR berukuran terukur dengan satu tujuan domain, migrasi terkait, tes dan dokumentasi. Penomoran tahap dipertahankan dari dokumen dasar; urutan pelaksanaan mengikuti dependensi.

## 3. Dependensi yang perlu diperhatikan

1. Baseline dan keputusan domain → fondasi proyek → database/RLS → auth → master/pengguna → ujian → soal berversi.
2. **Inti grading 4.1 disiapkan setelah 2.2 dan fixture 0.3, sebelum finalisasi 3.2 dinyatakan selesai.** UI hasil 4.1 dapat diselesaikan kemudian. Submit tidak boleh mengeluarkan nilai sementara palsu karena nomor tahap grading lebih besar.
3. **Storage minimum tersedia pada 1.2** untuk editor 2.2 dan canvas 3.1. Tahap 5.3 melengkapi manajemen media, bukan menunda penyimpanan jawaban.
4. **Audit, handler timeout/aktivasi, dan fondasi job dibangun bersama modul pemakai.** Tahap 6.1 mengintegrasikan scheduler, observabilitas, backup dan konfigurasi akhir; keamanan deadline tidak menunggu cron.
5. Job ekspor minimum mendahului laporan massal 4.3. Ruang/penugasan 5.1 dapat disiapkan setelah 2.1/1.4; monitor berizin membutuhkan pengawas efektif.
6. Script transformasi dan fixture migrasi mulai disiapkan pada 0.2; migrasi penuh 6.2 dilakukan setelah skema stabil. Uji dan audit berlangsung setiap tahap, bukan hanya pada 6.3.

Keputusan yang belum tersedia menghambat hanya bagian yang bergantung padanya. Lanjutkan pekerjaan independen, gunakan fixture tersamarkan, dan laporkan batas validasi secara eksplisit.

## 4. Ringkasan tahap dan pelacak awal

| Tahap | Fokus | Dependensi utama | Status awal |
|---|---|---|---|
| 0.1 | Baseline dan kendali cakupan | Tidak ada | BELUM DIMULAI |
| 0.2 | Audit dataset dan pemetaan migrasi | 0.1 | BELUM DIMULAI |
| 0.3 | Rulebook, keputusan dan strategi uji | 0.1; 0.2 untuk semantik data | BELUM DIMULAI |
| 1.1 | Fondasi proyek dan CI | 0.1; kontrak 0.3 tersedia | BELUM DIMULAI |
| 1.2 | Database, RLS dan Storage dasar | 1.1, 0.2, keputusan skema 0.3 | BELUM DIMULAI |
| 1.3 | Autentikasi internal dan otorisasi | 1.2, rulebook izin 0.3 | BELUM DIMULAI |
| 1.4 | Pengguna dan data master | 1.3 | BELUM DIMULAI |
| 2.1 | Jadwal, konfigurasi tipe dan periode soal | 1.4, keputusan D03/D05/D09 | BELUM DIMULAI |
| 2.2 | Bank soal dan editor multimodal | 2.1, Storage dasar 1.2 | BELUM DIMULAI |
| 2.3 | Impor, salin dan progres soal | 2.2, keputusan adaptor Google | BELUM DIMULAI |
| 3.1 | Mesin attempt dan layar ujian | 2.2, 1.3, kontrak penilaian 0.3 | BELUM DIMULAI |
| 3.2 | Autosave, konflik dan finalisasi | 3.1; inti grading 4.1 menjadi dependensi finalisasi | BELUM DIMULAI |
| 3.3 | Integritas ujian dan UX perangkat | 3.2, keputusan D07/D08 | BELUM DIMULAI |
| 4.1 | Penilaian terpusat dan hasil | 2.2, fixture 0.3; integrasi dengan 3.1/3.2 | BELUM DIMULAI |
| 4.2 | Koreksi esai dan saran AI | 4.1, adaptor jobs dasar bila batch berat | BELUM DIMULAI |
| 4.3 | Analitik dan laporan | 4.1, 4.2; job ekspor minimum tersedia | BELUM DIMULAI |
| 5.1 | Ruang, roster dan pengawas pengganti | 2.1, 1.4; dapat disiapkan setelah fondasi ujian | BELUM DIMULAI |
| 5.2 | Monitoring dan tindakan operasional | 3.2, 3.3, 4.1, 5.1 | BELUM DIMULAI |
| 5.3 | Media lengkap, kartu dan notifikasi | 1.2, 4.3, 5.1, 5.2 | BELUM DIMULAI |
| 6.1 | Konfigurasi, audit dan otomasi operasional | Handler inti sejak 2.1/3.2; seluruh modul untuk integrasi akhir | BELUM DIMULAI |
| 6.2 | Migrasi penuh dan rekonsiliasi | 0.2, skema stabil, 6.1 | BELUM DIMULAI |
| 6.3 | UAT, keamanan dan kapasitas | Seluruh tahap fitur dan 6.2 | BELUM DIMULAI |
| 7.0 | Cutover, rollback dan serah-terima | 6.3 dan persetujuan rilis pemilik | BELUM DIMULAI |

## 5. Paket pekerjaan terperinci

Keluaran berupa nama/path yang direncanakan, belum merupakan berkas yang sudah tersedia. Setiap tahap wajib memenuhi DoD pada Bagian 6. Tes rujukan menggunakan definisi asli dari Bagian 13 dokumen dasar.

### Tahap 0.1 — Baseline dan kendali cakupan

**Prasyarat:** Tidak ada.  
**Cakupan:** F01–F36. **Uji utama:** T053.  
**Status awal:** BELUM DIMULAI.

- [ ] **0.1-01** Bekukan commit sumber dan kedua blob SHA.
- [ ] **0.1-02** Inventaris entry point backend, frontend, tabel, integrasi dan layar.
- [ ] **0.1-03** Buat matriks fitur serta daftar temuan audit.
- [ ] **0.1-04** Catat lokasi repositori baru dan lingkungan yang benar.

**Keluaran:** docs/source-baseline.md, docs/feature-parity.md, docs/security-register.md.  
**Gerbang selesai:** Seluruh F01–F36 mempunyai pemilik tahap; sumber pembanding dapat direproduksi.

### Tahap 0.2 — Audit dataset dan pemetaan migrasi

**Prasyarat:** 0.1.  
**Cakupan:** F01–F36. **Uji utama:** T048, T053, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **0.2-01** Inventaris semua sheet/header dan versi produksi dengan akses sah.
- [ ] **0.2-02** Ambil sampel tersamarkan.
- [ ] **0.2-03** Petakan relasi dan legacy_id.
- [ ] **0.2-04** Deteksi duplikat, orphan, opsi F, JSON rusak dan URL media.
- [ ] **0.2-05** Susun ERD serta karantina data bermasalah.

**Keluaran:** docs/data-mapping.md, docs/data-anomalies.md, docs/erd.md.  
**Gerbang selesai:** Setiap sheet/kolom relevan dipetakan; data yang belum tersedia dicatat sebagai penghambat, bukan diasumsikan valid.

### Tahap 0.3 — Rulebook, keputusan dan strategi uji

**Prasyarat:** 0.1; 0.2 untuk semantik data.  
**Cakupan:** F01–F36. **Uji utama:** T010–T020, T028–T034, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **0.3-01** Daftarkan D01–D18 sebagai ADR.
- [ ] **0.3-02** Tetapkan state machine, matriks izin dan kebijakan waktu.
- [ ] **0.3-03** Buat sedikitnya 12 golden fixture penilaian.
- [ ] **0.3-04** Rancang threat model dan kontrak API.
- [ ] **0.3-05** Tetapkan SLO serta kapasitas target sebelum uji beban.

**Keluaran:** docs/business-rules.md, docs/decisions/, tests/fixtures/legacy/, docs/threat-model.md.  
**Gerbang selesai:** Konflik yang menghalangi modul diputuskan dengan bukti; konflik lain tetap tercatat terbuka dan tidak ditebak.

### Tahap 1.1 — Fondasi proyek dan CI

**Prasyarat:** 0.1; kontrak 0.3 tersedia.  
**Cakupan:** F03. **Uji utama:** T051, T055.  
**Status awal:** BELUM DIMULAI.

- [ ] **1.1-01** Bootstrap stack yang ditetapkan dengan lockfile.
- [ ] **1.1-02** Pisahkan modul domain dan UI.
- [ ] **1.1-03** Siapkan lint/typecheck/test/build/CI.
- [ ] **1.1-04** Buat .env.example tanpa secret.
- [ ] **1.1-05** Bangun shell responsif, dialog, tabel serta loading/empty/error/retry.
- [ ] **1.1-06** Siapkan log requestId.

**Keluaran:** Proyek build, konfigurasi CI, docs/development.md.  
**Gerbang selesai:** Instalasi bersih dan seluruh pemeriksaan fondasi lulus; navigasi cepat tidak meninggalkan listener.

### Tahap 1.2 — Database, RLS dan Storage dasar

**Prasyarat:** 1.1, 0.2, keputusan skema 0.3.  
**Cakupan:** F02, F25; fondasi seluruh fitur. **Uji utama:** T041, T043, T049, T050.  
**Status awal:** BELUM DIMULAI.

- [ ] **1.2-01** Tulis migrasi berversi untuk identitas, akademik, ujian, soal, attempt, nilai, ruang, jobs dan audit.
- [ ] **1.2-02** Tambahkan FK/UNIQUE/CHECK/index serta schema JSON version.
- [ ] **1.2-03** Aktifkan RLS dan uji aktor lintas scope.
- [ ] **1.2-04** Sediakan bucket privat dan adapter upload/akses minimum untuk editor.
- [ ] **1.2-05** Seed hanya data uji.

**Keluaran:** supabase/migrations/, supabase/tests/, types database, Storage dasar.  
**Gerbang selesai:** Migrasi dari database kosong berhasil; akses lintas siswa/kelas/ruang/organisasi ditolak; secret tidak terekspos.

### Tahap 1.3 — Autentikasi internal dan otorisasi

**Prasyarat:** 1.2, rulebook izin 0.3.  
**Cakupan:** F01, F02, F03. **Uji utama:** T001–T006, T009, T049–T051.  
**Status awal:** BELUM DIMULAI.

- [ ] **1.3-01** Bangun login tiga konteks dan mapping username server.
- [ ] **1.3-02** Cookie aman, logout/revocation, pemulihan/aktivasi, rate limit dan perlindungan CSRF.
- [ ] **1.3-03** Remember username saja.
- [ ] **1.3-04** Guru dapat memilih konteks Pengawas jika ditugaskan.
- [ ] **1.3-05** Buat requireActor/permission dan dashboard scoped.
- [ ] **1.3-06** PIN memakai service yang dilengkapi 2.1/3.1.

**Keluaran:** Modul auth/permissions, login, shell per peran, kontrak sesi.  
**Gerbang selesai:** Login staf, logout, akun nonaktif dan penolakan izin lulus; T001–T003 baru tuntas setelah attempt tersedia.

### Tahap 1.4 — Pengguna dan data master

**Prasyarat:** 1.3.  
**Cakupan:** F23, F24. **Uji utama:** T006, T009, T044, T049, T054.  
**Status awal:** BELUM DIMULAI.

- [ ] **1.4-01** CRUD kelas/mapel dan pengguna.
- [ ] **1.4-02** Penugasan Guru mapel–kelas dengan exact ID.
- [ ] **1.4-03** Aktif/nonaktif dan arsip.
- [ ] **1.4-04** Pencarian/filter/sort/pagination/bulk paste.
- [ ] **1.4-05** Template dan preview impor pengguna dengan error per baris.
- [ ] **1.4-06** Lindungi password dari DTO/ekspor.

**Keluaran:** Halaman users/master-data, impor dan seed akun uji semua peran.  
**Gerbang selesai:** Admin dan Guru sesuai scope dapat menjalankan alur sah; tindakan lintas kelas dan ekspor password ditolak.

### Tahap 2.1 — Jadwal, konfigurasi tipe dan periode soal

**Prasyarat:** 1.4, keputusan D03/D05/D09.  
**Cakupan:** F04, F05, F07, F10. **Uji utama:** T007–T009, T017, T020, T044.  
**Status awal:** BELUM DIMULAI.

- [ ] **2.1-01** CRUD/duplikasi/arsip/bulk ujian multi-kelas.
- [ ] **2.1-02** Waktu/durasi/PIN hash/passing grade/shuffle.
- [ ] **2.1-03** Lima konfigurasi enabled/max/optCount/defaultPoint.
- [ ] **2.1-04** Periode Guru dan bypass.
- [ ] **2.1-05** Turunkan status efektif dari jam server dan override manual.
- [ ] **2.1-06** Sediakan handler aktivasi/timeout yang nanti dijadwalkan 6.1.

**Keluaran:** Modul exams/authoring-policy, konfigurasi dan progres target.  
**Gerbang selesai:** Batas waktu/periode dan kuota valid; cron tidak dapat membuka kembali ujian ditutup manual; max=0 tidak diinterpretasi tanpa keputusan.

### Tahap 2.2 — Bank soal dan editor multimodal

**Prasyarat:** 2.1, Storage dasar 1.2.  
**Cakupan:** F06, F08, sebagian F16/F25. **Uji utama:** T010–T017, T022, T043, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **2.2-01** CRUD/pratinjau lima tipe.
- [ ] **2.2-02** Opsi/kunci/rubrik/poin/wajib/min karakter.
- [ ] **2.2-03** Versi soal immutable.
- [ ] **2.2-04** Editor HTML tersanitasi, Arab RTL/LTR, LaTeX, keyboard simbol, gambar/audio.
- [ ] **2.2-05** Gunakan attachment ID dan pisahkan DTO siswa.
- [ ] **2.2-06** Metadata canvas disiapkan untuk 3.1.

**Keluaran:** Modul questions, rich editor, question_versions, attachment picker dasar.  
**Gerbang selesai:** Kelima tipe tersimpan dan render benar; kunci tidak bocor; HTML berbahaya ditolak/disanitasi; versi lama tetap dapat dibaca.

### Tahap 2.3 — Impor, salin dan progres soal

**Prasyarat:** 2.2, keputusan adaptor Google.  
**Cakupan:** F07, F09, F10. **Uji utama:** T017–T021, T054, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **2.3-01** Parser teks legacy dan template tiap tipe.
- [ ] **2.3-02** Impor Excel dan Google Forms berizin.
- [ ] **2.3-03** Preview valid/invalid bernomor blok.
- [ ] **2.3-04** Maksimum 500 item/request.
- [ ] **2.3-05** Transaksi kuota dan deduplikasi/idempotency.
- [ ] **2.3-06** Salin antarujian beserta lampiran dengan ID baru.
- [ ] **2.3-07** Tampilkan progres target Guru.

**Keluaran:** Modul imports/copy/progress, fixture parser, laporan hasil per item.  
**Gerbang selesai:** 500/501 dan race kuota teruji; semua jalur memeriksa periode/tipe/kuota yang sama; adaptor tanpa koneksi gagal dengan pesan jelas.

### Tahap 3.1 — Mesin attempt dan layar ujian

**Prasyarat:** 2.2, 1.3, kontrak penilaian 0.3.  
**Cakupan:** F11, F12, F13, F16. **Uji utama:** T001–T003, T022–T025, T028.  
**Status awal:** BELUM DIMULAI.

- [ ] **3.1-01** Bangun start/resume dengan PIN/kelas/jadwal dan identitas sesi.
- [ ] **3.1-02** Cegah attempt aktif ganda.
- [ ] **3.1-03** Simpan snapshot versi/urutan soal/opsi/kebijakan.
- [ ] **3.1-04** Timer deadline server.
- [ ] **3.1-05** Navigasi/indikator/wajib.
- [ ] **3.1-06** Esai rich text/canvas undo-clear-warna-pena dan Storage.
- [ ] **3.1-07** Konversi LaTeX melalui adaptor backend berizin.

**Keluaran:** Modul attempts/player/essay, kontrak start/resume.  
**Gerbang selesai:** Reload tidak mengubah shuffle/deadline atau jawaban; lima tipe dapat dijawab; canvas besar tidak terpotong; siswa tidak menerima kunci.

### Tahap 3.2 — Autosave, konflik dan finalisasi

**Prasyarat:** 3.1; inti grading 4.1 menjadi dependensi finalisasi.  
**Cakupan:** F13, F17, F20. **Uji utama:** T025–T029, T031, T050.  
**Status awal:** BELUM DIMULAI.

- [ ] **3.2-01** Autosave batch berversi dan acknowledgement persisten.
- [ ] **3.2-02** Debounce, pending state, retry terbatas dan konflik dua perangkat.
- [ ] **3.2-03** Submit manual/otomatis transaksional idempoten.
- [ ] **3.2-04** Server menentukan status/deadline.
- [ ] **3.2-05** Validasi wajib untuk manual tanpa menghambat timeout.
- [ ] **3.2-06** Handler timeout dapat dijalankan sebelum scheduler final.

**Keluaran:** answer_revisions, idempotency ledger, finalisasi dan integrasi grading.  
**Gerbang selesai:** Tidak ada sukses simpan palsu, overwrite revisi baru atau submit ganda; nilai resmi hanya lewat engine; uji gangguan jaringan lulus.

### Tahap 3.3 — Integritas ujian dan UX perangkat

**Prasyarat:** 3.2, keputusan D07/D08.  
**Cakupan:** F14, F15. **Uji utama:** T023, T030, T038, T051.  
**Status awal:** BELUM DIMULAI.

- [ ] **3.3-01** Fullscreen/landscape/wake lock sesuai dukungan.
- [ ] **3.3-02** Deteksi fokus/tab/pagehide/shortcut/copy-cut-paste/context menu.
- [ ] **3.3-03** Event countable dan toleransi keyboard/orientasi.
- [ ] **3.3-04** Keputusan disqualified di server.
- [ ] **3.3-05** Penjelasan konsekuensi dan jalur peninjauan.
- [ ] **3.3-06** Uji Android/iOS/desktop serta kebutuhan aksesibilitas.

**Keluaran:** Modul integrity, kebijakan toleransi, matriks perangkat.  
**Gerbang selesai:** False positive ditinjau pada perangkat nyata; reload dan event berulang tidak menggandakan hukuman; batas kemampuan browser dijelaskan.

### Tahap 4.1 — Penilaian terpusat dan hasil

**Prasyarat:** 2.2, fixture 0.3; integrasi dengan 3.1/3.2.  
**Cakupan:** F17, F20; result gate F11. **Uji utama:** T003, T010–T016, T031–T032, T053, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **4.1-01** Implementasikan pure grading engine sejak kontrak soal stabil.
- [ ] **4.1-02** PG/PGK/BS/JODOH parsial, esai pending vs nol sah, normalisasi 0–100 dan passing grade.
- [ ] **4.1-03** Ledger versi dan hasil scoped.
- [ ] **4.1-04** Filter/sort/search/pagination/detail.
- [ ] **4.1-05** Enforce show_exam_result tanpa kebocoran kunci.

**Keluaran:** Modul grading/results, golden differential tests, ledger.  
**Gerbang selesai:** Semua golden test lulus; submit/regrade/report memakai engine sama; hasil tersembunyi tidak dikirim ke siswa.

### Tahap 4.2 — Koreksi esai dan saran AI

**Prasyarat:** 4.1, adaptor jobs dasar bila batch berat.  
**Cakupan:** F18, F19. **Uji utama:** T015–T016, T032, T045.  
**Status awal:** BELUM DIMULAI.

- [ ] **4.2-01** Koreksi per siswa/per soal dan batch transaksional.
- [ ] **4.2-02** Rubrik/score desimal/progres null vs 0.
- [ ] **4.2-03** Rekalkulasi berizin.
- [ ] **4.2-04** AI satu/batch dengan schema Zod, timeout, rate limit dan minimisasi PII.
- [ ] **4.2-05** Simpan provider/prompt/version/alasan.
- [ ] **4.2-06** Guru menerima/mengubah/menolak.

**Keluaran:** essay-grading, AI adapter, approval history.  
**Gerbang selesai:** Nilai di luar bobot ditolak; gagal AI bukan skor nol sah; hanya skor disetujui masuk nilai resmi.

### Tahap 4.3 — Analitik dan laporan

**Prasyarat:** 4.1, 4.2; job ekspor minimum tersedia.  
**Cakupan:** F21, F22, F36. **Uji utama:** T033–T035, T053.  
**Status awal:** BELUM DIMULAI.

- [ ] **4.3-01** Analisis lima tipe dan peserta salah.
- [ ] **4.3-02** P/D kelompok 27% dan batas kategori sesuai rulebook.
- [ ] **4.3-03** Detail siswa/kelas/rekap/lembar soal/jawaban.
- [ ] **4.3-04** PDF/XLSX/cetak massal dengan kop/logo/pejabat.
- [ ] **4.3-05** Job ekspor, progres, signed URL dan retry.
- [ ] **4.3-06** Uji Arab/math serta halaman panjang.

**Keluaran:** item-analysis, reports, export_jobs, template dokumen.  
**Gerbang selesai:** Angka sama dengan ledger/fixture; seluruh jenis analisis tersedia; PDF/Excel terbuka dan tidak terpotong; akses unduhan dibatasi.

### Tahap 5.1 — Ruang, roster dan pengawas pengganti

**Prasyarat:** 2.1, 1.4; dapat disiapkan setelah fondasi ujian.  
**Cakupan:** F29, F30, F31. **Uji utama:** T005, T039–T041, T049.  
**Status awal:** BELUM DIMULAI.

- [ ] **5.1-01** CRUD ruang, kapasitas 0 tanpa batas dan peserta eligible.
- [ ] **5.1-02** UNIQUE siswa per ujian plus transaksi kapasitas.
- [ ] **5.1-03** Tugas ujian–ruang–sesi memakai FK.
- [ ] **5.1-04** Tunjuk/cabut pengganti dengan periode dan audit.
- [ ] **5.1-05** Hitung pengawas efektif.
- [ ] **5.1-06** Guru tetap memiliki role asal.
- [ ] **5.1-07** Invalidasi izin/subscription lama.

**Keluaran:** rooms, rosters, supervisor assignments/substitutions.  
**Gerbang selesai:** Race roster/kapasitas ditolak; rename ruang aman; pengganti mengambil hak tugas dan pencabutan memulihkannya; ruang tidak dijadikan syarat login tanpa keputusan.

### Tahap 5.2 — Monitoring dan tindakan operasional

**Prasyarat:** 3.2, 3.3, 4.1, 5.1.  
**Cakupan:** F27, F30. **Uji utama:** T037–T041, T049, T055.  
**Status awal:** BELUM DIMULAI.

- [ ] **5.2-01** Dashboard live scoped Admin/Guru/Pengawas.
- [ ] **5.2-02** Status belum login/aktif/selesai/timeout/curang, jawaban/waktu/insiden.
- [ ] **5.2-03** Realtime pascacommit dan polling fallback dengan cleanup.
- [ ] **5.2-04** Unlock/reset tunggal/bulk dengan alasan/konfirmasi.
- [ ] **5.2-05** Arsipkan riwayat reset dan hormati kebijakan waktu.

**Keluaran:** monitor, supervisor dashboard, attempt_overrides.  
**Gerbang selesai:** Status konsisten dengan database; pengawas lama langsung kehilangan akses; reset/unlock tidak menghapus bukti atau memberi waktu tanpa aturan.

### Tahap 5.3 — Media lengkap, kartu dan notifikasi

**Prasyarat:** 1.2, 4.3, 5.1, 5.2.  
**Cakupan:** F25, F26, F28. **Uji utama:** T036, T042–T043, T054.  
**Status awal:** BELUM DIMULAI.

- [ ] **5.3-01** Lengkapi galeri/tabel/drop-zone/batch gambar/audio, akses privat dan hapus aman.
- [ ] **5.3-02** Adaptor folder Drive berizin.
- [ ] **5.3-03** Template kartu PDF tunggal/massal/ZIP beserta progres.
- [ ] **5.3-04** Broadcast all/exam/selected dan receipt unik.
- [ ] **5.3-05** Pengiriman scoped dan fallback polling.

**Keluaran:** Media manager, exam-cards, notifications/receipts.  
**Gerbang selesai:** File bytes dan referensi benar; kartu tidak memuat password permanen; penerima dan status baca akurat tanpa duplikasi.

### Tahap 6.1 — Konfigurasi, audit dan otomasi operasional

**Prasyarat:** Handler inti sejak 2.1/3.2; seluruh modul untuk integrasi akhir.  
**Cakupan:** F05, F32, F33, F34, F35. **Uji utama:** T044, T046–T048, T050.  
**Status awal:** BELUM DIMULAI.

- [ ] **6.1-01** Lengkapi pengaturan umum/rahasia/template.
- [ ] **6.1-02** Audit append-only sejak mutasi awal.
- [ ] **6.1-03** Pilih satu scheduler per job.
- [ ] **6.1-04** Activation/timeout/reminder/backup/manual backup.
- [ ] **6.1-05** Outbox/retry/deduplikasi/job_runs.
- [ ] **6.1-06** Email Guru valid dan belum target.
- [ ] **6.1-07** Backup data+media+template, retensi serta latihan restore.

**Keluaran:** settings, audit-logs, jobs, backup/recovery runbook.  
**Gerbang selesai:** Cron dipanggil dua kali tetap aman; secret tidak readback; backup semester 30 Juni/31 Desember 23.30 zona sekolah teruji; restore lengkap berhasil.

### Tahap 6.2 — Migrasi penuh dan rekonsiliasi

**Prasyarat:** 0.2, skema stabil, 6.1.  
**Cakupan:** F01–F36 untuk data legacy. **Uji utama:** T048, T053, T056.  
**Status awal:** BELUM DIMULAI.

- [ ] **6.2-01** Bangun ETL export/transform/load/parity dengan dry-run dan upsert legacy_id.
- [ ] **6.2-02** Pisahkan metadata esai/AI/elapsed.
- [ ] **6.2-03** Karantina invalid.
- [ ] **6.2-04** Pindahkan media bytes/checksum.
- [ ] **6.2-05** Aktivasi akun tanpa token/password terbuka.
- [ ] **6.2-06** Impor staging penuh dan ulangi.
- [ ] **6.2-07** Bandingkan count/status/nilai/laporan/izin.

**Keluaran:** scripts/legacy-*/, scripts/parity-check/, docs/migration-report.md.  
**Gerbang selesai:** Setiap record/file valid dipertanggungjawabkan; nilai historis dipertahankan dan selisih dijelaskan; ETL ulang tidak menggandakan data.

### Tahap 6.3 — UAT, keamanan dan kapasitas

**Prasyarat:** Seluruh tahap fitur dan 6.2.  
**Cakupan:** F01–F36. **Uji utama:** T001–T056 + regresi tambahan.  
**Status awal:** BELUM DIMULAI.

- [ ] **6.3-01** Jalankan matriks penuh semua peran.
- [ ] **6.3-02** Uji IDOR/RLS/CSRF/XSS/file/secret/Realtime.
- [ ] **6.3-03** Race, offline, jam perangkat dan ujian serentak.
- [ ] **6.3-04** UAT perangkat nyata.
- [ ] **6.3-05** Ukur p95/error rate/kehilangan jawaban sesuai SLO.
- [ ] **6.3-06** Tutup SEC-01–SEC-26 dengan bukti dan ulangi tes terdampak.

**Keluaran:** docs/test-report.md, docs/uat-signoff.md, security register, laporan beban.  
**Gerbang selesai:** Semua fitur dan tes wajib lulus; tidak ada bug kritis/tinggi; dispensasi harus disetujui dan membatasi klaim kesetaraan.

### Tahap 7.0 — Cutover, rollback dan serah-terima

**Prasyarat:** 6.3 dan persetujuan rilis pemilik.  
**Cakupan:** F01–F36. **Uji utama:** Smoke seluruh peran + T026, T029, T035, T037, T046, T048.  
**Status awal:** BELUM DIMULAI.

- [ ] **7.0-01** Susun release runbook dan pelatihan.
- [ ] **7.0-02** Pastikan tidak memutus attempt aktif.
- [ ] **7.0-03** Freeze mutasi lama dan backup final.
- [ ] **7.0-04** Delta ETL/rekonsiliasi.
- [ ] **7.0-05** Deploy dan smoke staging/production.
- [ ] **7.0-06** Alihkan trafik sesuai persetujuan.
- [ ] **7.0-07** Aktifkan scheduler tunggal.
- [ ] **7.0-08** Pantau login/autosave/submit/jobs.
- [ ] **7.0-09** Siapkan rollback yang menjaga jawaban baru.

**Keluaran:** Release manifest, operations-runbook, panduan peran, laporan pascarilis.  
**Gerbang selesai:** UAT disahkan, smoke lulus, rollback terlatih dan data baru terjaga; durasi pengamatan disepakati dan hasil dicatat.

## 6. Definition of Done dan bukti validasi

Sebelum satu fitur atau tahap menjadi SELESAI TERVERIFIKASI:

- [ ] Frontend, API/service dan database yang dibutuhkan tersedia, bukan placeholder.
- [ ] Input disaring Zod; aktor berasal dari sesi terverifikasi; izin diperiksa terhadap objek target; RLS dan akses media diuji.
- [ ] Aturan domain, adapter legacy, migrasi berversi dan penanganan data invalid sesuai kontrak.
- [ ] Happy path, invalid, unauthorized serta retry/race yang relevan lulus; bukti mencantumkan commit, lingkungan dan actual result.
- [ ] State loading/empty/error/retry, keyboard/fokus dialog, mobile/desktop dan navigasi telah diperiksa.
- [ ] Tidak ada secret/password/kunci jawaban terlarang dalam DTO, log, bundle, RSC payload atau ekspor.
- [ ] Audit, requestId, observabilitas dan penanganan kegagalan tersedia sesuai dampak.
- [ ] Dokumen API, aturan bisnis, parity, keputusan dan runbook diperbarui.
- [ ] Tidak ada bug kritis/tinggi terbuka; regresi modul terdampak lulus.
- [ ] UAT yang dipersyaratkan disetujui pihak yang benar; bila belum, status tetap SIAP DIVERIFIKASI.

Untuk fondasi non-UI, bukti teknis sesuai gerbang tahap cukup; jangan mengarang persetujuan UAT. Jangan mengklaim kesetaraan penuh bila ada fitur wajib gagal/ditunda walaupun dispensasi operasional telah diberikan.

Pemeriksaan rutin: instalasi bersih sesuai lockfile, lint, typecheck, tes relevan dan production build. Gunakan skrip yang benar-benar ada di package.json; simpan perintah, waktu, exit code dan ringkasan. Tes integrasi database memerlukan lingkungan uji nyata; hasil mock tidak membuktikan RLS. Perubahan dokumentasi saja tidak memerlukan build aplikasi, tetapi konsistensi isi dan pemetaan ID tetap diverifikasi.

## 7. Matriks keterlacakan fitur

Setiap baris wajib dilengkapi lokasi implementasi, API/service, policy, tes dan bukti UAT saat pengerjaan. Tahap pada tabel adalah penanggung jawab utama, bukan batas eksklusif.

| ID | Kemampuan dari dokumen dasar | Tahap pemilik | Status awal |
|---|---|---|---|
| F01 | Halaman login responsif, pilihan peran Siswa / Admin-Guru / Pengawas, validasi form, PIN ujian siswa, remember username, status jaringan, sesi tersimpan, pemulihan login, logout | 1.3 | BELUM DIMULAI |
| F02 | Peran Admin, Guru, Pengawas, Siswa; status aktif; Guru memiliki pasangan mata pelajaran–kelas; Guru dapat menjadi pengawas saat mendapat penugasan | 1.3 | BELUM DIMULAI |
| F03 | Dashboard admin/guru dengan statistik, informasi terkini, command palette dan lonceng aktivitas; UI sidebar collapse/mobile | 1.1/1.3 | BELUM DIMULAI |
| F04 | CRUD jadwal ujian: mapel, beberapa kelas, waktu mulai/akhir, durasi, PIN, status, passing grade, pengacakan, konfigurasi jenis & kuota soal, bypass periode input, duplikasi dan hapus massal | 2.1 | BELUM DIMULAI |
| F05 | Otomatisasi status ujian dari jadwal, aktif/nonaktif, penutupan, timeout otomatis | 2.1/6.1 | BELUM DIMULAI |
| F06 | Bank soal lima tipe: PG, PG kompleks, BS, JODOH, Esai, poin, wajib/tidak, kunci, pembahasan/rubrik, lampiran gambar/audio, min karakter esai | 2.2 | BELUM DIMULAI |
| F07 | Pembatasan tipe soal per ujian (`enabled`, `max`, `optCount`, `defaultPoint`), validasi dan kuota saat menambah, edit, menyalin, dan impor | 2.1/2.3 | BELUM DIMULAI |
| F08 | Editor rich text (TinyMCE), rumus MathJax/LaTeX, keyboard karakter/simbol/Arab/matematika, pratinjau, sisip gambar/audio | 2.2 | BELUM DIMULAI |
| F09 | Input soal satuan, bulk text multi-format dengan parser/validator serta pratinjau blok valid-gagal, copy template, impor Excel, impor Google Forms, salin antarujian, hapus massal | 2.3 | BELUM DIMULAI |
| F10 | Periode global input soal Guru, pengecualian per ujian, guard server, indikator progress/target pembuatan soal per guru dan per ujian | 2.1/2.3 | BELUM DIMULAI |
| F11 | Siswa login menggunakan PIN yang cocok dengan kelas dan ujian; validasi waktu/status; dapat masuk hasil saja bila telah menyelesaikan ujian | 3.1/4.1 | BELUM DIMULAI |
| F12 | Pemilihan soal berdasarkan tipe, urutan tipe, acak soal tiap tipe dan acak pilihan PG/PG kompleks, navigasi prev/next dan nomor soal, jawaban tiap tipe | 3.1 | BELUM DIMULAI |
| F13 | Timer ujian, resume, autosave/jeda sinkronisasi, status `In Progress`/`Completed`/`Waktu Habis`/`Curang`, submit manual/otomatis | 3.1/3.2 | BELUM DIMULAI |
| F14 | Kontrol anti-kecurangan: full screen, deteksi kehilangan fokus/pindah tab, Windows/Meta, pagehide, copy/cut/paste/menu konteks; catat insiden, blur, intervensi pengawas | 3.3 | BELUM DIMULAI |
| F15 | Dukungan ujian ponsel landscape, toleransi perubahan orientasi & keyboard virtual, wake lock, modal konfirmasi/peringatan dan toleransi waktu | 3.3 | BELUM DIMULAI |
| F16 | Esai rich text, batas karakter opsional, pratinjau MathJax, mode menggambar di canvas, konversi gambar/rumus menjadi LaTeX via layanan eksternal | 3.1 | BELUM DIMULAI |
| F17 | Penilaian objektif (termasuk kredit parsial tipe tertentu), nilai akhir 0–100, passing grade dan label kelulusan | 4.1 | BELUM DIMULAI |
| F18 | Koreksi esai per peserta/per soal, batch save, progress koreksi, skor esai manual, rekalkulasi nilai | 4.2 | BELUM DIMULAI |
| F19 | Bantuan penilaian esai AI, skor saran beserta alasan, satu soal/batch, terima/ubah lalu simpan oleh pengajar | 4.2 | BELUM DIMULAI |
| F20 | Rekap hasil ujian, filter, sortir, pencarian, pagination, status, buka blokir, reset percobaan, detail jawaban, cetak/unduh per siswa | 4.1/5.2 | BELUM DIMULAI |
| F21 | Analisis butir PG/PG kompleks/BS/JODOH, tingkat kesukaran, daya pembeda, sebaran pilihan, data peserta salah, analisis esai | 4.3 | BELUM DIMULAI |
| F22 | Laporan per peserta, ringkasan per kelas, ekspor Excel, PDF dan cetak massal | 4.3 | BELUM DIMULAI |
| F23 | CRUD pengguna semua peran, aktif/nonaktif, penugasan guru, impor massal siswa/pengguna, unduh template, filter, pagination | 1.4 | BELUM DIMULAI |
| F24 | Data master kelas/mapel; tambah/ubah/hapus/search/sort/bulk paste | 1.4 | BELUM DIMULAI |
| F25 | Manajemen gambar dan audio: upload batch, drag/drop, sinkron dari folder, galeri/tabel, salin URL, proteksi akses, pemilihan lampiran dan hapus | 1.2/2.2/5.3 | BELUM DIMULAI |
| F26 | Kartu ujian siswa perorangan/massal, template, ekspor PDF dan ZIP, progress pembuatan | 5.3 | BELUM DIMULAI |
| F27 | Pemantauan ujian real-time/polling, statistik siswa, jumlah jawaban, waktu, status login/ujian/curang, detail pelanggaran, filter, export, unlock/reset, operasi bulk | 5.2 | BELUM DIMULAI |
| F28 | Kirim notifikasi dari petugas ke semua peserta/ujian/peserta terpilih, terima notifikasi di layar ujian, status terbaca dan riwayat | 5.3 | BELUM DIMULAI |
| F29 | Manajemen pengawas per ujian-ruang-sesi, penunjukan pengawas pengganti, pencabutan, otorisasi pengawas efektif dan audit | 5.1 | BELUM DIMULAI |
| F30 | Dashboard/monitor khusus Pengawas sesuai penugasan; akses terbatas peserta di ruangnya; aksi unlock/reset/notifikasi sesuai izin | 5.1/5.2 | BELUM DIMULAI |
| F31 | CRUD ruang ujian, kapasitas, penugasan pengawas, tambah/hapus peserta, penolakan siswa ganda antar-ruang pada ujian sama, sinkron nama ruang/penugasan | 5.1 | BELUM DIMULAI |
| F32 | Konfigurasi identitas dan tampilan aplikasi, logo, gambar login, hasil siswa, batas pelanggaran, fitur canvas, pengaturan kop PDF, folder media, kartu, kunci AI | 6.1 | BELUM DIMULAI |
| F33 | Audit log tindakan admin/pengawas/guru: login/logout, perubahan data, blokir/unlock, nilai, backup, penugasan | 1.3/6.1 | BELUM DIMULAI |
| F34 | Backup manual/terjadwal akhir semester, pemeriksaan trigger, backup data dan lampiran | 6.1 | BELUM DIMULAI |
| F35 | Pengingat email progres input soal Guru (periode mendekati akhir), verifikasi status email dari sumber lama dan mekanisme anti-duplikasi pengiriman | 6.1 | BELUM DIMULAI |
| F36 | Format dokumen institusi: kop, identitas pejabat, daftar soal PDF, rekap hasil PDF, laporan per siswa, kartu peserta | 4.3/5.3 | BELUM DIMULAI |

## 8. Register keamanan, keputusan dan penerimaan

### 8.1 Penanggung jawab temuan keamanan

Semua temuan awal **TERBUKA / BELUM DIVERIFIKASI**. Pemilik tahap wajib menutup akar masalah dan menautkan tes negatif, bukan hanya mengganti UI.

| Temuan | Tahap utama penutupan | Bukti wajib |
|---|---|---|
| SEC-01, SEC-02, SEC-04, SEC-06, SEC-08 | 1.2–1.4 | Auth aman, DTO tanpa password, pencabutan sesi dan scope exact ID |
| SEC-03 | 1.3, 6.1 | Pengaturan hanya oleh aktor berizin; secret tidak readback |
| SEC-05, SEC-10, SEC-12, SEC-17, SEC-26 | 3.1–3.3, 4.1 | Attempt owner/deadline/revision/status server, snapshot dan blob utuh |
| SEC-07, SEC-11 | 4.1–4.3 | Grade authority, engine tunggal dan rekalkulasi berversi |
| SEC-09, SEC-23, SEC-24 | 1.1–1.3, 2.2, 3.3 | Cookie aman, sanitasi/CSP, cleanup dan uji perangkat |
| SEC-13, SEC-14 | 4.2 | Secret server, provider sah dan kegagalan AI eksplisit |
| SEC-15, SEC-18, SEC-19, SEC-21 | 5.1–5.3 | Izin resource, transaksi roster/receipt, FK dan Realtime scoped |
| SEC-16, SEC-20 | 2.1, 6.1 | PIN aman, override manual dan scheduler tunggal |
| SEC-22, SEC-25 | 4.3, 5.3, 6.2 | Kartu aman, signed URL, checksum media dan template valid |

### 8.2 Daftar keputusan yang harus dilacak

Salin D01–D18 dari Bagian 16 dokumen dasar ke ADR. Setiap ADR menyimpan status, bukti legacy, pilihan, konsekuensi, tes dan pihak/tanggal pengesahan. Rekomendasi default bukan persetujuan.

| ID | Keputusan | Batas penyelesaian |
|---|---|---|
| D01 | Auth internal atau Central SSO | Sebelum implementasi auth 1.3 |
| D02 | Satu organisasi atau multi-tenant penuh | Sebelum skema 1.2 dikunci |
| D03 | Semantik TypeConfig.max=0 | Sebelum kuota 2.1/2.3 |
| D04 | Opsi keenam dan kunci F | Sebelum 2.2/4.1 dan regrading historis |
| D05 | PIN ganda/ambigu | Sebelum start attempt 3.1 |
| D06 | Apakah roster syarat mulai | Sebelum 3.1; default jangan menambah syarat |
| D07 | Ambang dan kebijakan anti-cheat | Sebelum 3.3 |
| D08 | Waktu setelah unlock | Sebelum 3.3/5.2 |
| D09 | Perubahan soal saat ujian | Sebelum snapshot 2.2/3.1 |
| D10 | Selisih skor historis | Sebelum 6.2; jangan timpa nilai lama |
| D11 | Publikasi hasil/detail/kunci | Sebelum 4.1 |
| D12 | Kelanjutan Forms/Drive | Sebelum adaptor 2.3/5.3 |
| D13 | Provider AI dan retensi jawaban | Sebelum 4.2 |
| D14 | Pengganti password permanen pada kartu | Sebelum 5.3 |
| D15 | Jadwal backup dan retensi | Sebelum 6.1 |
| D16 | Kapasitas siswa/file dan SLO | Target awal 0.3; final sebelum uji 6.3 |
| D17 | Verifikasi email Guru legacy | Sebelum reminder 6.1/migrasi 6.2 |
| D18 | Wewenang Guru menonaktifkan/menghapus siswa | Sebelum 1.4 |

### 8.3 Daftar penerimaan yang wajib diwarisi

Tabel berikut menyalin skenario dan kriteria dari dokumen dasar agar pelaksana dapat menautkan bukti tanpa kehilangan kasus. Status seluruhnya **BELUM DIUJI**; ini bukan laporan hasil tes.

| Kode | Skenario | Kriteria penerimaan |
|---|---|---|
| T001 | Login Siswa benar + PIN/kelas/waktu valid | Membuat/memulihkan attempt milik sendiri, role Siswa |
| T002 | PIN salah, kelas salah, ujian belum mulai/sudah berakhir | Ditolak, tidak membuat attempt |
| T003 | Siswa sudah submit, `show_exam_result=true/false` | Benar-benar hasil saja atau pesan selesai tanpa bocor nilai |
| T004 | Login Admin, Guru, Pengawas dan Guru dalam konteks Pengawas | Dashboard/role efektif tepat, tidak mengubah peran permanen |
| T005 | Guru login sebagai Pengawas tanpa assignment | Ditolak; Pengawas asal dengan substitute aktif tidak lagi punya izin |
| T006 | Nonaktifkan akun saat sesi aktif | Mutasi berikutnya ditolak dan sesi dianggap tidak valid |
| T007 | Admin CRUD ujian tanggal mulai/akhir/durasi | Waktu, kelas, PIN, grade, jenis, shuffle, bypass tersimpan dan tervalidasi |
| T008 | Duplikasi, aktivasi manual/otomatis, arsip, hapus massal | Tidak menghapus nilai/attempt secara tidak sengaja; audit tercatat |
| T009 | Guru melihat dua ujian dengan nama kelas/mapel mirip | Hanya ujian exact assignment, tanpa kebocoran substring |
| T010 | Tipe PG biasa, opsi benar huruf atau teks legacy | Skor sesuai source untuk data sah, terlepas urutan acak |
| T011 | PG kompleks: pilih sebagian benar tanpa salah | Kredit parsial proporsional bobot |
| T012 | PG kompleks: pilih benar + satu salah | Nol poin menurut kebijakan legacy |
| T013 | BS: tiga pernyataan, jawaban sebagian, format teks/index | Kredit parsial tepat; `Sesuai/Tidak Sesuai` kompatibel |
| T014 | JODOH: pasangan salah/sebagian/semua benar, bentuk legacy | Poin parsial tepat, tidak dibingungkan duplikasi teks |
| T015 | Esai belum dinilai, bernilai 0, dinilai manual, nilai 0 yang sah | Status belum dinilai tidak sama dengan skor 0; total recalculated |
| T016 | Grade esai melebihi bobot/pertanyaan asing | Ditolak di server, tidak memodifikasi skor |
| T017 | Masukkan soal per tipe `enabled=false` atau mencapai `max` | Ditolak atau dilewati dengan reason per item; kuota tidak terlewati |
| T018 | Batch import 500 dan 501, campuran format valid/invalid | 500 diperiksa per blok; >500 ditolak; count dan alasan akurat |
| T019 | Dua Guru melakukan batch import ke kuota tersisa yang sama | Transaksi menjaga batas, satu operasi tidak merusak data lainnya |
| T020 | Input periode aktif, Guru di luar jendela; Admin bypass | Guru ditolak, Admin berizin, exception per ujian berfungsi |
| T021 | Excel/Google Forms import, salin soal, preview, edit/hapus | Semua tipe dan lampiran dipertahankan, kunci tidak tertukar |
| T022 | Teks Arab RTL, MathJax, gambar, audio dalam soal/jawaban | Render konsisten dan aman tanpa merusak layout |
| T023 | Canvas esai besar, gambar, undo/clear, ubah jadi LaTeX | Konten utuh tersimpan di Storage, tanpa truncation silent |
| T024 | Ujian shuffle reload beberapa kali | Urutan soal dan opsi **sama per attempt**; jawaban tetap terpilih |
| T025 | Navigasi soal dan required question | Posisi, indikator, peringatan tepat tanpa kehilangan jawaban |
| T026 | Jaringan hilang di tengah autosave, pulih, submit retry | Pending data/revision dipulihkan, tidak ada double submit |
| T027 | Dua tab/perangkat menyimpan jawaban dengan versi bertabrakan | Conflict dilaporkan/ditangani tanpa menimpa data lebih baru |
| T028 | Ubah jam komputer atau reload di akhir ujian | Deadline server tetap menang, tidak dapat memperpanjang durasi |
| T029 | Deadline attempt dan `end_at` terlampaui saat offline | Cron/server menyelesaikan tepat sekali dengan status sesuai kebijakan |
| T030 | Pelanggaran focus/tab/fullscreen/keyboard/mobile | Event dapat diaudit, toleransi bekerja, false positive terkendali |
| T031 | Hasil PG+PGK+BS+JODOH+Esai skenario gabungan | Skor `round(100 × earned/max, 2)` dan passing grade tepat |
| T032 | Hitung ulang nilai setelah grade esai | Objective scoring tidak berubah tanpa perubahan versi; ledger audit ada |
| T033 | Analisis P, D, 27% atas/bawah, batas .30/.70/.20/.40 | Identik dengan formula yang disepakati; peserta tidak layak dikecualikan |
| T034 | Analisis BS, JODOH, PGK, esai dan detail peserta salah | Tab lengkap dan data tepat; filter akses |
| T035 | Cetak laporan siswa, kelas, rekap, lembar soal, PDF/Excel | Kolom, kop dan total tidak terpotong; file aman dan bisa dibuka |
| T036 | Generate 1 dan ratusan kartu peserta PDF/ZIP | Progress reliabel, identitas benar, password permanen tidak muncul |
| T037 | Monitor Admin, Guru, Pengawas efektif pada waktu bersamaan | Scope role tepat, status realtime/fallback akurat, tanpa kebocoran data |
| T038 | Pengawas buka blokir/reset satu/massal di ruangnya | Hanya peserta sah, alasan dan audit dicatat, status/timer sesuai kebijakan |
| T039 | Admin atur pengawas dan pengawas pengganti | Original kehilangan hak sementara, substitute mendapat hak, cabut memulihkan |
| T040 | Ganti nama ruang dan edit penugasan pengawas | Relasi FK tetap benar, tidak ada orphan/akses salah |
| T041 | Tambahkan siswa ke dua ruang sama exam, kapasitas 1, proses paralel | Salah satu ditolak; kapasitas tidak terlewati; beda ujian tetap legal |
| T042 | Notifikasi all/exam/selected, baca sekali, riwayat | Target tepat, tak ada kiriman ulang saat polling/reload |
| T043 | Upload/hapus gambar/audio, drag-drop banyak file, signed URL | Akses sesuai role, file bukan hanya metadata link, opsi soal tetap dapat memuat |
| T044 | Master data, pengaturan tampilan, kop dan input period | CRUD/preview/readback benar; API key tidak terbuka |
| T045 | AI sukses, timeout, JSON tidak valid, hasil di luar rentang, soal kosong | Saran valid dibatasi; error tidak dinyatakan skor 0 sah; persetujuan manusia |
| T046 | Cron activate/timeout/reminder/backup dijalankan dua kali | Hasil idempoten; tidak ada double email/finalisasi/backup tak terkendali |
| T047 | Pengingat Guru 24 jam sebelum deadline, email belum verifikasi | Target kurang lengkap saja; tidak kirim untuk email tidak valid |
| T048 | Backup, restore dan migrasi pada dataset contoh | Semua row+file+bukti penilaian pulih sesuai checksum dan integritas FK |
| T049 | Akses lintas siswa, Guru beda kelas, Pengawas beda ruang | Semua endpoint dan Realtime menolak data/aksi terlarang |
| T050 | Sesi expired/logout, CSRF, XSS HTML soal, file berbahaya, IDOR | Diblokir server, tidak ada eksfiltrasi token/secret |
| T051 | Keyboard-only, screen reader, modal focus trap, desktop/mid/mobile | Form/soal/modals dapat dioperasikan, tidak horizontal overflow |
| T052 | Koneksi lambat dan 300+ siswa ujian bersamaan (target ditentukan UAT) | Latensi/p95/error rate dan autosave loss sesuai SLO yang disepakati |
| T053 | Perbandingan data legacy: counts, scores, status, reports per tipe | Semua selisih terdokumentasi; perubahan rumus disetujui bukan diam-diam |
| T054 | File preview, template CSV/XLSX, Google Forms adapter tanpa koneksi | Pesan kegagalan dapat dimengerti, no data corruption |
| T055 | Pergantian halaman cepat dan buka/tutup dialog/polling berulang | Tidak ada listener ganda, loading macet, leak, menu tak responsif |
| T056 | `optCount=6`, kunci F legacy, data BS tanpa statements, Jodoh duplikat | Ditentukan secara eksplisit dan tercakup regression test |

## 9. Kendali progres agar terukur

### 9.1 Ukuran progres

- **Progres tahap:** unit kerja checklist selesai dengan bukti / total unit kerja tahap. Laporkan bersama jumlah butir; bukan estimasi jam.
- **Cakupan fitur:** jumlah F01–F36 yang memenuhi DoD / 36. Fitur dengan beberapa tahap pemilik baru selesai setelah seluruh dependensi dan UAT terkait selesai.
- **Penerimaan:** jumlah T lulus / seluruh T yang direncanakan. Laporkan lulus, gagal, belum diuji dan terhambat secara terpisah; minimum awal 56, dapat bertambah.
- **Keamanan:** jumlah SEC tertutup dengan bukti / 26; laporkan kritis/tinggi terbuka secara terpisah.
- **Migrasi:** count sumber/mapped/written/quarantined, orphan, file/checksum, selisih skor dan hasil rerun. Jangan menyembunyikan karantina dalam persentase sukses.

Persentase tersebut mengukur hal berbeda dan tidak boleh dirata-ratakan menjadi klaim “siap produksi”. Durasi, kalender dan biaya baru ditetapkan setelah akses/data/tim/kapasitas diketahui; tidak ada janji tanggal selesai dalam dokumen ini.

### 9.2 Template catatan tahap

```markdown
## Tahap <ID> — <judul>
Status: BELUM DIMULAI / BERJALAN / TERHAMBAT / SIAP DIVERIFIKASI / SELESAI TERVERIFIKASI
Diperbarui: <tanggal dan jam Asia/Jakarta>
Acuan dasar: <versi + hash>
Repositori baru / branch / commit: <nilai aktual atau BELUM TERSEDIA>
Lingkungan: <lokal/staging/production; tanpa secret>
Unit selesai: <ID checklist + bukti>
Unit tersisa: <ID checklist>
Fitur / SEC / ADR / tes terkait: <ID>
File berubah dan alasannya: <path + ringkasan>
PR / merge / deployment: <tautan dan status masing-masing>
Migrasi: <file + belum/sudah diterapkan di lingkungan apa>
Perintah uji: <perintah aktual, waktu, exit code, hasil>
UAT: <peran, skenario, bukti dan persetujuan atau BELUM>
Penghambat dan dampak: <fakta>
Risiko / regresi / rollback: <langkah konkret>
Langkah berikutnya: <ID + tindakan pertama>
```

## 10. Mekanisme melanjutkan pekerjaan antarsesi

Dokumen ini harus dibawa bersama dokumen dasar pada sesi lanjutan. Memori percakapan bukan pengganti catatan aktual repositori. Jangan menganggap tersedia akses repositori, Supabase, Vercel atau data produksi hanya karena tercantum dalam rencana.

### 10.1 Berkas kendali yang dibuat ketika proyek mulai

| Berkas rencana | Isi dan waktu pembaruan |
|---|---|
| `docs/implementation-plan.md` | Salinan dokumen tahapan ini; ubah status/checklist sesudah bukti tersedia |
| `docs/project-state.md` | Ringkasan keadaan terkini dan satu tindakan berikutnya; setiap akhir sesi |
| `docs/worklog.md` | Riwayat append-only per sesi; jangan menghapus kegagalan/keputusan lama |
| `docs/feature-parity.md` | F01–F36 → file/service/policy/test/UAT; setiap perubahan fitur |
| `docs/security-register.md` | SEC-01–SEC-26 → mitigasi/tes/status; setiap perbaikan keamanan |
| `docs/test-report.md` | T001–T056 dan tambahan → expected/actual/commit/env/bukti |
| `docs/decisions/ADR-###.md` | D01–D18 dan keputusan tambahan; sebelum semantik diubah |
| `docs/data-mapping.md` | Sheet/kolom → tabel/transform/karantina; setiap perubahan ETL |
| `docs/operations-runbook.md` | Deploy/migrasi/jobs/backup/restore/rollback; setiap perubahan operasi |

Path tersebut adalah kontrak artefak masa depan. Pembuatan dokumen ini saja belum membuat berkas-berkas repositori tersebut.

### 10.2 Prosedur awal sesi

1. Baca dokumen dasar, rencana terkini, project-state dan entri worklog terakhir.
2. Verifikasi repo/branch/HEAD/working tree dan PR/deployment yang disebutkan. Jangan menimpa perubahan pengguna atau mengulang migrasi tanpa memeriksa riwayatnya.
3. Cocokkan status dokumen dengan kode, migrasi, hasil tes dan lingkungan aktual. Bila berbeda, koreksi status dengan bukti.
4. Pilih unit kerja berikutnya yang dependensinya siap; baca penuh entry point legacy relevan menggunakan indeks Bagian 15 dokumen dasar.
5. Catat aturan/izin/data/side effects; implementasikan dari database/service/API ke UI, kemudian tes dan perbarui bukti.
6. Jika penghambat bergantung akses atau keputusan, catat dan kerjakan bagian independen. Jangan mengarang konfigurasi, ID, data atau hasil.

### 10.3 Prosedur akhir sesi

1. Simpan perubahan secara konkret dan catat lokasi/commit atau perubahan belum dikomit; dokumentasikan migrasi belum diterapkan.
2. Perbarui status/checklist, parity, security register, ADR, hasil uji dan penghambat relevan.
3. Tulis project-state ringkas berisi tahap aktif, pekerjaan terakhir yang terbukti, pekerjaan tersisa dan tindakan pertama sesi berikutnya.
4. Tuliskan apa yang belum diuji. Rahasia/kredensial tidak masuk dokumen, prompt lanjutan atau log.

### 10.4 Snapshot konteks awal dokumen ini

```yaml
project: Rebuilt EDUTARA CBT
plan_version: '1.0'
updated_at: '2026-10-26'
source_commit: 1a4407c727f2660e40019177c5920bab45afb815
new_repository: BELUM_DIVERIFIKASI
current_branch: BELUM_DIVERIFIKASI
last_verified_implementation_commit: BELUM_ADA_BUKTI
application_stage: BELUM_DIMULAI_BERDASARKAN_DOKUMEN_INI
next_work_item: '0.1-01'
completed_in_this_request:
  - Penyusunan dokumen tahapan berdasarkan dokumen dasar
implementation_tests: BELUM_DIJALANKAN
production_data_access: BELUM_DIVERIFIKASI
open_decisions: D01-D18
security_findings: SEC-01-SEC-26_BELUM_DIVERIFIKASI
acceptance_tests: T001-T056_BELUM_DIUJI
```

Status ini mencatat batas bukti saat penyusunan rencana, bukan pernyataan bahwa repositori baru pasti belum ada. Pada sesi implementasi pertama, verifikasi aktual lalu perbarui.

### 10.5 Prompt siap pakai untuk melanjutkan

> Lanjutkan pembangunan ulang EDUTARA CBT berdasarkan `Dasar_Pembangunan_Ulang_EDUTARA_CBT.md` dan `Tahapan_Pembangunan_Ulang_EDUTARA_CBT.md` versi terkini. Baca `docs/project-state.md`, `docs/worklog.md`, matriks parity, keputusan dan laporan tes jika sudah tersedia. Verifikasi repositori, branch, commit, perubahan lokal, migrasi dan deployment aktual sebelum mengubah kode. Mulai dari unit kerja berikutnya yang dependensinya siap; jangan mengulang pekerjaan selesai atau menganggap tes/UAT telah lulus tanpa bukti. Pertahankan F01–F36, tutup SEC-01–SEC-26, jalankan T001–T056 serta regresi relevan. Baca fungsi legacy terkait secara lengkap. Kerjakan backend/database/otorisasi/UI secara utuh, catat keputusan semantik dan penghambat, lalu perbarui checklist, hasil tes, project-state dan langkah pertama sesi berikutnya. Jangan mengubah stack atau mengintegrasikan Central SSO tanpa keputusan eksplisit.

## 11. Gerbang rilis dan operasi

- [ ] Cakupan penuh dan status semua F, SEC, T serta ADR dapat ditelusuri ke bukti aktual.
- [ ] Auth/RLS/Storage/kunci jawaban/scope Realtime dan sesi semua peran teruji di staging.
- [ ] Seluruh skenario wajib lulus; UAT Admin/Guru/Pengawas/Siswa disahkan; kapasitas dan SLO terbukti sesuai target yang disepakati.
- [ ] ETL dry-run, full staging import, rerun idempoten dan rekonsiliasi count/status/nilai/media berhasil.
- [ ] Backup final dan restore latihan berhasil; retensi, pemilik operasional dan kanal penanganan insiden ditetapkan.
- [ ] Produksi/preview menggunakan konfigurasi terpisah; secret aman; build/deployment sehat dan migrasi terverifikasi.
- [ ] Freeze/cutover tidak memutus ujian aktif; delta-sync akhir dan rollback menjaga jawaban/nilai setelah perpindahan.
- [ ] Hanya satu otoritas scheduler aktif per job; dashboard memantau login, autosave, submit, konflik, antrean dan kegagalan.
- [ ] Persetujuan pemilik diperoleh untuk cutover produksi; tanggal/versi/penanggung jawab tercatat.
- [ ] Panduan semua peran dan runbook operasional diserahkan; hasil masa pengamatan dicatat.

Rilis uji terbatas bila disepakati harus diberi label cakupan/risiko/batas peserta yang nyata. Fitur opsional operasional seperti AI tetap membutuhkan UI, penanganan error dan pengujian mode tanpa konfigurasi; ketidaktersediaan kredensial bukan alasan menghapus kemampuan dari cakupan kesetaraan.

## 12. Riwayat dokumen

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 26 Oktober 2026 | Rincian roadmap 0.1–7.0, dependensi lintas nomor, checklist unit kerja, pemetaan 36 fitur, register 26 temuan/18 keputusan, 56 skenario, DoD dan kendali konteks antarsesi |

# Rencana uji dan status

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Semua T001–T056 BELUM DIUJI. Fixture dalam paket merupakan contoh ekspektasi usulan, bukan hasil eksekusi source.

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

## Bukti baru — 29 Oktober 2026

Pernyataan BELUM DIUJI pada tabel baseline di atas adalah snapshot historis. Sebagian assertion T006/T009/T041/T043/T049/T050 sudah dijalankan dan lulus pada SQL/HTTP/Storage; skenario lengkap/UAT tetap belum disahkan. Lihat docs/stages-1-1-to-1-4.md untuk perintah, batas dan hasil. T001–T003 menunggu mesin attempt; tidak ditandai selesai.

## Tahap 7.0 — paket persiapan rilis, 29 Oktober 2026
- Lint, TypeScript, build produksi lokal lulus.
- Vitest: 74 lulus, 2 dilewati, 9 berkas. Tujuh tes baru mencakup fail-closed manifest, bukti per-commit, attempt aktif, jadwal ganda, timestamp/backup kedaluwarsa, izin fresh-start dan preservasi revisi jawaban baru.
- Integrasi database Tahap 4/5/6 lulus. Latihan rollback dengan SQL inventory yang sama seperti runbook melindungi 22 protected rows setelah disable lokal dan menolak kehilangan revisi.
- Release gate pada manifest pending menghasilkan ready=false/exit 2 sesuai harapan.
- Tidak ada migrasi/restore/freeze/aktivasi otomasi produksi pada paket ini. Smoke seluruh peran, perangkat fisik, SLO beban, rekonsiliasi legacy dan pengesahan cutover masih terbuka.

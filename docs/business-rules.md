# Rulebook awal

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

## 4. Peran, otorisasi, dan batas data

| Aksi | Admin | Guru | Pengawas | Siswa |
|---|:---:|:---:|:---:|:---:|
| Kelola jadwal ujian | Ya | Lihat yang ditugaskan | Hanya jadwal ruang bertugas | Tidak |
| Kelola bank soal | Ya | Ya, hanya mapel–kelas sendiri dan selama periode | Tidak | Tidak |
| Periksa hasil / koreksi | Ya | Ya, ujian sendiri | Monitoring sesuai penugasan, bukan nilai global | Hasil sendiri jika diizinkan |
| Kelola pengguna | Semua | Siswa dalam kelas yang ditugaskan, sesuai kebijakan | Tidak | Tidak |
| Monitoring semua ujian | Ya | Hanya kelas/ujian penugasan | Hanya ruang/ujian efektif | Tidak |
| Buka blokir / reset peserta | Ya | Ujian/kelas sendiri | Peserta ruang/ujian efektif | Tidak |
| Kirim notifikasi peserta | Ya | Ujian/kelas sendiri | Ujian/ruang efektif | Tidak |
| Pengawas, ruang, master, konfigurasi | Ya | Tidak | Tidak | Tidak |
| Mengerjakan ujian | Tidak melalui dashboard staf | Tidak melalui dashboard staf | Tidak melalui dashboard pengawas | Hanya attempt dirinya yang valid |

**Hak Guru di kode lama:** pasangan `mapel:kelas` disimpan sebagai string dalam kolom `Users.Class` untuk Guru; parsing campuran string dan JSON juga ditemukan. Matching sebagian memakai `.includes()` sehingga berisiko menghasilkan kecocokan terlalu luas. Di PostgreSQL wajib menjadi relasi terstruktur `teacher_assignments(user_id, subject_id, class_id)`, dengan *exact matching* ID dan cakupan akses diperiksa pada setiap query/mutasi.

**Pengawas efektif:** jika baris tugas memiliki pengganti aktif, **pengganti** yang berhak atas ruang/ujian tersebut; pengawas asli sementara kehilangan hak penugasan itu. Ketika pengganti dicabut, hak kembali ke pengawas asli. Role `Guru` yang memperoleh penugasan dapat masuk *mode Pengawas* tanpa mengganti role asal. Simpan `original_role` dan `active_context`, jangan timpa role akun permanen.

**RLS dan server policy:** jangan mengandalkan menu tersembunyi. Semua perubahan dan semua query server wajib membaca identitas dari sesi yang diverifikasi, memeriksa role aktif dan objek target, serta membatasi data sesuai instansi/ujian/kelas/ruang. Kunci jawaban tidak boleh dikirim lewat API siswa sebelum kebijakan rilis memungkinkan.

## 5. Model domain dan state machine

### 5.1 Status ujian

- Status sumber: `Aktif`, `Non-Aktif`, `Completed`/`Selesai` (terdapat beberapa ejaan dalam source). Pendaftaran peserta mengecek PIN, kelas, status, dan waktu mulai/akhir.
- Pisahkan dalam model baru: `draft | scheduled | active | closed | archived`, dengan adapter label lama. Jangan hanya mengandalkan kolom status yang ditulis browser atau cron; **evaluasi jendela waktu berdasarkan jam server**.
- `end_at > start_at`; durasi menit positif; ujian aktif saat jadwal mengizinkan; selesai tidak membuka attempt baru; peserta yang sudah selesai hanya dapat melihat hasil menurut setting.
- `PassingGrade` sumber adalah ambang **skor 0–100**, bukan jumlah poin mentah; jika tidak dikonfigurasi (`0`) label lulus/null tidak dipaksa.

### 5.2 Status attempt siswa

```text
NOT_STARTED --(PIN/kelas/jadwal valid)--> IN_PROGRESS
IN_PROGRESS --(autosave)--> IN_PROGRESS
IN_PROGRESS --(submit manual)--> SUBMITTED
IN_PROGRESS --(durasi atau end_at lewat)--> TIME_EXPIRED
IN_PROGRESS --(pelanggaran terkonfirmasi sesuai kebijakan)--> DISQUALIFIED
DISQUALIFIED --(unlock sah oleh petugas)--> IN_PROGRESS [dengan audit dan aturan waktu]
IN_PROGRESS/SUBMITTED/... --(reset berwenang)--> NOT_STARTED [riwayat tetap diarsipkan]
SUBMITTED/TIME_EXPIRED --(grade esai)--> GRADED
```

**Adapter lama:** `In Progress` → `in_progress`; `Completed`/`Selesai` → `submitted/graded` (berdasarkan grade); `Waktu Habis` → `time_expired`; `Curang` → `disqualified`. Status tersebut tidak boleh saling tertukar dalam laporan/monitor. Simpan kapan, siapa, dan alasan semua *override*.

### 5.3 Aturan login, sesi, dan resume

1. Pengguna aktif, password valid, context role legal.
2. Siswa wajib memasukkan PIN ujian numerik yang cocok dengan ujian dan salah satu kelasnya; cek jendela waktu dan status.
3. Ambil atau buat attempt `user_id + exam_id`, default **maksimal satu attempt aktif per ujian**. Desain baru dapat mengizinkan attempt ulang hanya melalui versi/reset berizin.
4. Untuk attempt `disqualified`, blokir sampai tindakan pemulihan resmi.
5. Jika sudah selesai, tampilkan hasil saja bila `show_exam_result=true`; selain itu tampilkan pesan selesai tanpa skor.
6. Jika resume: kembalikan jawaban sebelumnya dan **sisa waktu dari server**, bukan restart timer di browser. Kode lama menggunakan `__pausedElapsedSec__` sebagai metadata internal snapshot ketika curang/unlock; simpan sebagai kolom normal di attempt yang terpisah dari jawaban.
7. Jika waktu habis saat offline/browser tertutup, finalisasi melalui server/cron saat berikutnya; tidak boleh memperoleh tambahan waktu akibat reload.
8. Jika peserta masuk di perangkat lain, gunakan kebijakan sesi yang eksplisit (misalnya single active session + revocation), tampilkan pesan jelas.

### 5.4 Bentuk soal dan nilai

- **PG:** satu jawaban, benar mendapat bobot penuh, salah/kosong = 0.
- **PG Kompleks:** beberapa jawaban benar; sumber memberi parsial `bobot × (jumlah opsi benar dipilih / total opsi benar)` **hanya jika tidak ada opsi salah yang dipilih**. Jika ada opsi salah, nilai soal = 0. Pastikan respons siswa berupa himpunan tanpa duplikasi.
- **BS:** tiap pernyataan benar memberi `bobot / jumlah pernyataan`; menerima padanan `Benar/Salah` dan di kode lama juga `Sesuai/Tidak Sesuai`. Kunci bisa memakai teks pernyataan atau indeks legacy. Adapter migrasi wajib mengakomodasi keduanya.
- **JODOH:** nilai `bobot × (jumlah pasangan benar / total pasangan)`; pasangan legacy berbentuk `{q,a}` dan jawaban siswa berupa mapping `q -> a`; padanan legacy `MATCHING` juga muncul di fungsi koreksi.
- **Esai:** nilai awal **0** sebelum dinilai guru; skor per soal `0..bobot`, dapat desimal; skor AI hanyalah rekomendasi. Setelah skor manual disimpan, **nilai akhir dihitung ulang** dari semua soal objektif dan skor esai.
- **Skor akhir:** `round(100 × total_poin_diperoleh / total_bobot, 2)` dengan total bobot seluruh soal ujian. Simpan hasil serta versi kunci/penilaian yang digunakan.
- **Batas bobot impor teks:** backend parser batch memvalidasi bobot `0.01..100`, konten `1..2000` karakter, panjang opsi `1..500`, jumlah opsi PG/PG kompleks antara 2 dan `optCount` (pengaturan sumber normalnya 2–6, default 5). Kebijakan yang sama perlu diterapkan secara konsisten ke input satuan, edit, impor dan salin; bila terjadi perbedaan legacy, dokumentasikan di tes kesetaraan.
- **IsRequired:** setiap soal punya flag wajib/tidak wajib. Sebelum submit manual, validator klien/server memberi konfirmasi untuk soal wajib yang kosong; **timeout/curang tetap harus dapat difinalisasi**.
- **Esai:** rubrik penilaian, batas minimum karakter opsional, format rich text/LaTeX dan gambar/canvas merupakan metadata terpisah.

### 5.5 Randomisasi yang tidak merusak kunci

Urutan sumber: soal diklasifikasikan dan ditampilkan dalam lima kelompok (`PG → PG_KOMPLEKS → BS → JODOH → Esai`); `shuffleConfig` dapat mengacak urutan dalam tiap kelompok, sementara opsi PG/PG kompleks diacak. Implementasi baru **wajib menyimpan snapshot urutan soal, urutan opsi, ID opsi, serta versi soal pada attempt** sehingga resume dan audit tidak berubah walaupun guru mengedit soal. Gunakan ID opsi sebagai jawaban kanonik; migrasi kunci huruf/teks harus diselesaikan **sebelum** mengacak. Jangan mengevaluasi menggunakan urutan opsi yang sudah diacak atau label A/B yang dapat berubah.

### 5.6 Pembuatan soal batch dan periode input

Alur batch: `parse teks` → `validasi per blok di browser` → `pratinjau valid/invalid` → `verifikasi sesi & akses ujian` → `cek periode` → `kunci transaksi` → `validasi ulang di server` → `cek tipe aktif` → `cek kuota/opsi` → `cek duplikat` → `simpan` → `hasil count/skipped/details`. Sumber membatasi satu request batch **maksimal 500 soal**. Kode balasan memiliki kategori `AUTH`, `PERIOD`, `CONFIG_MISSING`, `TYPE_DISABLED`, `QUOTA`, `SYSTEM` beserta detail item yang dilewati. Implementasi baru wajib mendukung respons per item, *idempotency key*, rollback aman, log dan kuota transaksional, bukan hanya pesan sukses umum.

`TypeConfig` per ujian: setiap tipe mempunyai `enabled`, `max`, `defaultPoint`; PG/PG_KOMPLEKS juga `optCount`. `max=0` harus dipastikan semantik kompatibelnya sebelum implementasi (kode sumber memakai `max=0` sebagai nilai default dan mempunyai pemeriksaan kuota; uji kasus 0 serta batas tepat). Target progres Guru = penjumlahan `max` seluruh tipe yang aktif; bandingkan terhadap jumlah soal yang tersimpan per ujian. Guru dibatasi periode input global `[start,end]` inklusif jika aktif; Admin selalu bebas periode dan ujian dapat `bypassInputPeriod`.

### 13.1 *Golden data fixtures* untuk mesin penilaian

Buat minimal 12 fixture statis terstruktur:

```text
legacy/scoring/
  pg-letter-key.json
  pg-text-key.json
  pg-shuffled-options.json
  pg-complex-partial.json
  pg-complex-wrong-option.json
  bs-key-by-text.json
  bs-key-by-index.json
  bs-sesuai-synonym.json
  jodoh-partial.json
  essay-ungraded.json
  essay-manual-zero.json
  mixed-types-final-score.json
```

Setiap fixture mencakup `questionVersion`, kunci internal, jawaban siswa, bobot, skor expected raw+normalisasi, status expected serta sumber pembanding. Lakukan *differential tests* pada perhitungan legacy vs kode baru (di environment terkontrol, **tanpa data produksi sensitif**). Jika bug legacy menyebabkan nilai keliru, jangan memaksakan hasil yang salah sebagai aturan baru; buat *decision record* yang membedakan `legacyObserved`, `correctedExpected`, dampak historis, dan persetujuan koreksi.

### 13.2 Parameter nonfungsional dan uji beban

- **Keandalan autosave:** setiap jawaban terkirim mempunyai acknowledgement persisten; bila gagal, UI mempertahankan perubahan yang belum dikonfirmasi untuk retry; tidak ada indikasi 'tersimpan' palsu.
- **Performa:** tetapkan target p95 login, start attempt, autosave, monitor refresh, batch import, penilaian dan pembuatan dokumen berdasarkan lingkungan staging yang menyerupai produksi.
- **Kapasitas:** tetapkan target peserta serentak nyata; uji burst login + save + submit bersamaan, serta race 2+ staff.
- **Aksesibilitas:** label form, tab order, escape/focus modal, warna/kontras, feedback screen reader; anti-cheat harus mempertimbangkan kebutuhan aksesibilitas dan keyboard on-screen.
- **Observabilitas:** request-id, error rate, p95, job failures, retries, RLS violations, connection pool, queue backlog, storage failure, performance regressions, audit integritas.

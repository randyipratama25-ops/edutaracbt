# Tahap 3.1–3.3 — mesin ujian, autosave, integritas

Implementasi teknis 29 Oktober 2026. Gerbang UAT perangkat nyata **BELUM DISETUJUI**; dokumen ini tidak menyatakan aplikasi siap ujian produksi.

## Keputusan pemilik

- D07: kejadian integritas **dicatat dan ditinjau**, tanpa diskualifikasi otomatis. Pengawas efektif/Admin memutuskan dengan alasan. Keyboard virtual/orientasi diberi toleransi dan metadata dicatat.
- D08: unlock tidak menambah deadline. Jika deadline sudah lewat, server melakukan finalisasi; tidak menghidupkan ulang attempt.
- Canvas → LaTeX: siapkan adaptor backend berizin; penyedia OCR/kredensial belum dikonfigurasi sesuai pilihan pemilik. Endpoint 503 yang jelas, tanpa mengirim gambar ke pihak eksternal.
- PIN ambigu D05 ditangani dengan memilih ID ujian eksplisit lalu memvalidasi PIN hash + keanggotaan kelas. Tidak mencari ujian hanya dari PIN. Roster ruang tidak dijadikan syarat baru untuk start; roster dipakai untuk cakupan pengawas.

## Implementasi

### 3.1 — start/resume/player

Login siswa di identity-gateway diaktifkan. Password memverifikasi identitas; PIN diminta pada pemilihan ujian sebelum akses soal/attempt. `/student` terproteksi. RPC memeriksa akun, sesi aktif, kelas ID tepat, PIN bcrypt, status dan jendela jadwal. Percobaan PIN dibatasi anggaran per siswa. Lock per siswa–ujian dan unique index mencegah attempt aktif ganda; attempt selesai tidak dapat dimulai ulang tanpa reset berizin pada tahap berikutnya.

Snapshot privat menyimpan versi/payload grading, urutan kelompok/soal dan opsi, pilihan JODOH, serta kebijakan. DTO siswa menghapus key/rubric/explanation/keywords; lampiran privat memakai URL singkat dan izin snapshot. Reload mempertahankan snapshot, jawaban yang diakui, dan deadline `min(akhir_jadwal, mulai+durasi)`. Perubahan sumber setelah snapshot tidak mengubah penilaian attempt. Satu writer: client UUID per tab + auth session + epoch; takeover eksplisit mengganti epoch dan diaudit.

Layar menyediakan lima tipe jawaban, navigasi, tanda ragu lokal, indikator, timer server, validasi wajib, esai markup/Arab/LaTeX dengan alternatif teks, canvas pointer/undo/clear/warna/ukuran pena. PNG utuh disimpan di bucket privat terpisah, checksum SHA-256, maksimal 5 MiB/4096 px; tidak ada pemotongan Base64. Metadata file harus sesuai attempt/question/writer. Canvas terdaftar tidak dapat dihapus oleh siswa; media sumber yang sudah dipakai snapshot juga tidak dapat dihapus oleh pemilik melalui Storage. Draf canvas menghambat submit/pindah soal sampai unggah selesai atau ditangani pengguna.

### 3.2 — autosave/finalisasi

Debounce 800 ms; request UUID dipertahankan saat retry (maksimal tiga), expected_revision per soal, ACK/revisi/checksum persisten. Edit lokal yang lebih baru tidak dihapus oleh ACK lama. Konflik tidak ditimpa otomatis: pilih versi server atau rebase lokal secara eksplisit. UI tidak melaporkan sukses sebelum ACK; online dapat memicu retry kembali. Jawaban belum diakui hanya di memori tab, bukan penyimpanan offline permanen. Beforeunload memberi peringatan; menutup/reload paksa tetap dapat menghilangkan draf yang belum diakui. Pagehide/keepalive tidak dianggap jaminan simpan.

Save, submit, timeout, takeover dan review mengunci baris attempt yang sama. Submit manual mengecek kelengkapan wajib/minimum karakter plain text (markup, entitas, rumus dan simbol dikecualikan). Timeout tidak terhambat jawaban kosong. Finalisasi idempoten menulis ledger objektif satu kali, memakai fungsi grading SQL immutable terpusat dan snapshot. PG/PGK/BS/JODOH mendapat penilaian parsial yang sesuai kontrak; esai `pending`, bukan nilai resmi nol. Total bobot termasuk esai; score_percent NULL sampai koreksi selesai. Hasil hanya dikirim bila flag publikasi aktif dan tidak pending/disqualified.

Deadline ditetapkan server; save setelah deadline memicu finalisasi dan mengembalikan status akhir, bukan ACK simpan palsu. Menutup/mengarsipkan jadwal mengakhiri attempt pada pemeriksaan server berikutnya. Handler service-role `advance_exam_schedule` menjalankan engine finalisasi yang sama untuk timeout (cron aktual tahap 6.1). Heartbeat pemain 15 detik menyegarkan status dan waktu. Sesi dengan not_after lewat ditolak walau JWT belum mencapai expiry sendiri.

### 3.3 — integritas dan peninjauan

Fullscreen/landscape lewat tombol dan wake lock bila didukung. Deteksi tab/fokus/pagehide/fullscreen/shortcut/copy/cut/paste/context menu; tidak merekam isi clipboard atau teks ketikan. Durasi fokus minimal 1.500 ms, toleransi keyboard/orientasi, cooldown insiden 10 detik, UUID dedupe di server. Metadata klien bukan bukti tunggal; server tidak melakukan diskualifikasi otomatis. Browser tidak dapat mencegah perangkat kedua, screenshot OS, atau seluruh kecurangan.

`/supervisor` dan `/dashboard/monitor` menyediakan kejadian, diskualifikasi/unlock beralasan. Cakupan supervisor tepat exam + room + student dan pengganti yang sedang efektif; Guru tanpa penugasan tidak berhak. Admin hanya organisasinya. Keputusan diaudit; unlock menaikkan epoch tanpa menambah deadline. Peninjauan tidak membuka endpoint kunci/nilai soal.

## Bukti validasi

- 45 tes lokal: foundation/authoring, primitive grading, 12 golden fixture legacy melalui adaptor eksplisit, validasi jawaban, plain-text Arab, dan lima skenario queue dengan respons hilang/edit saat in-flight/retry habis/konflik/status terminal.
- `supabase/tests/attempts.sql` rollback: lima tipe snapshot, PIN salah, start idempoten, deadline/shuffle stabil, ACK replay, stale revision, dua perangkat/takeover, siswa lain/kelas mirip ditolak, tanpa kunci, event dedupe tanpa auto-DQ, scope pengawas, unlock deadline tetap, source version berubah tanpa mengubah snapshot, submit sekali, esai pending, timeout mengabaikan required dan nol resmi, canvas-scope, pembekuan media snapshot, proteksi hapus canvas, PIN rate-limit, penutupan manual dan sesi kedaluwarsa.
- Dua submit yang dikirim berbarengan melalui plugin menghasilkan status sama, score 100, satu ledger. Save B yang beradu dengan submit menghasilkan jawaban B/revisi 2/score 0/satu ledger, konsisten dengan urutan yang diterima database. Fixture konkuren dipertahankan di organisasi sintetis terisolasi, jadwal/soal diarsipkan dan sesi dinonaktifkan dengan not_after; tidak masuk organisasi operasional.
- 11 pemeriksaan HTTP runtime: 9 endpoint tanpa sesi/cross-origin ditolak; halaman student/monitor dialihkan ke login.
- Lint, typecheck dan build diperiksa sebelum merge. Integrasi identity-gateway versi 4 ACTIVE, import map eksplisit. Fungsi tetap memverifikasi autentikasi internal (verify_jwt false sudah merupakan konfigurasi sebelumnya).

## Batas dan pekerjaan tersisa

- UAT Android/iOS/desktop dengan keyboard virtual, screen reader, rotasi, fullscreen/wake lock, canvas/pointer dan gangguan jaringan nyata belum dijalankan/disahkan. **3.3-06 dan gerbang penerimaan perangkat masih terbuka.**
- OCR canvas → LaTeX belum aktif sesuai keputusan pemilik; tidak ada konversi fiktif. Menulis LaTeX manual tetap tersedia.
- UAT browser alur siswa/pengawas end-to-end dengan akun operasional belum disahkan. Uji beban 60–132 siswa dan ukuran Storage/retensi bukan hasil dari tes fungsional ini.
- Koreksi esai, publikasi/manajemen hasil lengkap, reset attempt, proktor realtime, scheduler otomatis, dan laporan tetap mengikuti tahap 4–6. Tidak ada skor sementara yang dipublikasikan sebagai nilai resmi.
- Supabase CLI dihentikan setelah auto-review menolak telemetri PostHog; migrasi diterapkan melalui plugin, dan nama file mengikuti versi registry remote yang benar-benar dihasilkan.

Audit dependensi production: 0 kerentanan. Advisor Supabase tetap mencatat warning existing leaked-password-protection dan INFO default-deny pada tabel privat/modul mendatang; bukan klaim seluruh konfigurasi keamanan sudah sempurna.

# Audit Portal siswa — /student

Tanggal: 4 November 2026 (WIB). Basis: `24422527e3166a781b6f3ae49dba9e373adbfa5c`.

## Alur dan batas perubahan

Halaman memeriksa actor, role Siswa dan konteks siswa. Daftar ujian, pemeriksaan perangkat, PIN, start/resume/takeover, player lima jenis soal, autosave ber-revisi, pemulihan draf, canvas, kejadian integritas, bantuan pengawas, pengumpulan, bukti dan hasil ditelusuri bersama API/SQL/Storage terkait. Inbox dan bantuan konteks tetap tersedia. Tidak ada perubahan rumus nilai, kewajiban soal, batas waktu, cakupan organisasi, kepemilikan, epoch writer, atau mekanisme peninjauan pengawas.

Sumber dibaca sebelum perubahan: `app/student`, seluruh komponen attempts, queue/recovery/presentation, preflight, Inbox, bantuan pengawas/konteks, preview media/LaTeX, CSS, Auth actor, API attempts/canvas/media/latex/preflight/workflow, migrasi attempt/workflow/recovery/bank/penilaian serta fixture/tes terkait.

## Temuan dan perbaikan

| Temuan / penyebab | Perbaikan |
|---|---|
| Snapshot siswa menyertakan `distractors`, sehingga pengecoh menjodohkan dapat diidentifikasi lewat respons RPC. | Proyeksi database menghapus metadata privat pada pembuatan baru dan pembacaan sesi lama; pilihan gabungan/acak `choices` tetap tersedia. Snapshot immutable dan payload penilaian tidak ditulis ulang. API/client turut memvalidasi proyeksi. |
| Guard terminal hanya memeriksa `id` dan `status`; data rusak dapat masuk player/antrean. | Kontrak runtime untuk daftar, soal, jawaban, waktu, status dan recovery. Respons finalisasi tidak valid menjadi 503/hasil belum pasti; antrean tidak menerima terminal parsial atau ACK duplikat. |
| Kegagalan reload/takeover tersembunyi saat player sudah terbuka. | Pesan sesi tetap dirender, diumumkan dan dibawa ke area pandang; pengambilalihan memakai dialog konsekuensi yang jelas. |
| State busy tidak mengunci pembukaan dalam tick yang sama. | Lock sinkron, timeout/abort, mounted/generation dan ID tab yang valid. Respons lama tidak membuka kembali sesi final atau menurunkan epoch. |
| Reload status setelah submit uncertain meremount player, sehingga identitas retry dan edit lock bisa hilang. | Reload aktif pada attempt/epoch yang sama mempertahankan instance player dan request_id. Status terminal tetap otoritatif. Ulangi pengumpulan memakai payload/mode/ID yang sama. |
| Submit, persiapan pindah perangkat dan reload dapat saling mendahului; timeout bisa dianggap terkirim ketika submit lain belum selesai. | Pengunci operasi, dialog tidak menutup saat submit, edit/resolusi konflik dijeda saat pending, dan auto-submit hanya ditandai ketika operasi benar-benar dapat dimulai. |
| Deadline ref tidak mengikuti pembaruan props; error kontak server bercampur pesan tindakan. | Ref deadline diperbarui, waktu tetap dari server + jam monotonic, heartbeat dibatasi/dibatalkan saat unmount; error koneksi terpisah dan pulih setelah respons sah. |
| Hasil tidak memiliki jalur kembali ke daftar dan bukti hilang untuk status graded. | Tombol kembali hanya setelah finalisasi terkonfirmasi, label status Indonesia, bukti graded dengan timestamp server tetap tersedia. |
| Canvas dapat menautkan respons tanpa ID, mengubah state setelah unmount, atau terus menggambar setelah pointer capture hilang. | Validasi receipt, abort/guard callback, penyimpanan goresan saat pagehide, pemisahan pointer, retry pemuatan gambar lama dan penguncian unggah ganda. Draf tetap tersedia saat unggahan gagal. |
| Bantuan pengawas dapat menumpuk pembacaan, menampilkan kosong ketika gagal, atau mengosongkan pesan tanpa receipt sah. | Pembacaan single-flight/timeout/abort, loading/error/coba ulang terpisah, validasi daftar/receipt, lock tulis, teks dan request_id dipertahankan saat hasil belum pasti. Tidak menjanjikan jawaban tersimpan tanpa ACK. |
| Metadata kebijakan/ACK dapat terbuang saat validasi respons; recovery tambahan yang rusak dapat memblokir resume. | Policy, saved_at dan checksum tetap tersedia; recovery tambahan yang tidak valid turun menjadi null tanpa memblokir respons canonical yang sah. |
| Header panjang/alat pada layar pendek, PIN/form dan pesan panjang berpotensi menutup konten. | Reflow, tombol sentuh 44px, jadwal terstruktur, header menjadi non-sticky bila terlalu tinggi, menu alat bergulir dan wrapping scoped. Ujian closed tanpa attempt tidak menampilkan form mulai. |

## Migrasi dan kompatibilitas

`supabase/migrations/20261104152013_student_payload_privacy.sql` telah diterapkan di staging dan produksi. Riwayat keduanya diselaraskan ke versi yang sama setelah checksum SQL diverifikasi. Migrasi hanya mengganti proyeksi pada fungsi yang sudah ada; grants, SECURITY DEFINER/search_path, RLS, relasi dan data jawaban tidak diubah. Pemeriksaan advisor sesudah migrasi tidak menambah temuan dibanding baseline.

Uji database lokal membuat attempt baru dan snapshot simulasi lama di database terisolasi, memanggil RPC sebagai siswa, dan memastikan pilihan menjodohkan tetap lengkap, private metadata tidak keluar, byte snapshot/penilaian tidak berubah, serta deadline/epoch tetap. `scripts/student-privacy-integration.mjs` ditambahkan ke pemeriksaan database CI. Tidak menjalankan ujian, mengirim jawaban, mencatat bantuan palsu, atau melakukan finalisasi siswa produksi untuk pengujian.

Inventaris tetap 23 halaman; 34 penggunaan Dialog pada 20 komponen. Kontrak `StudentPortal`, `ExamPlayer`, queue, API dan backend dipertahankan, dengan opsi callback reload tambahan yang kompatibel untuk mencegah remount pada hasil belum pasti. Tidak ada dependency baru.

## Kode final

- `components/attempts/player.tsx`: portal, pembukaan, player, pengumpulan dan dialog.
- `components/attempts/queue.ts`, `canvas.tsx`: ACK, antrean dan gambar.
- `components/workflow/help.tsx`: bantuan pengawas.
- `lib/attempts/contracts.ts`, `recovery.ts`: validasi respons dan bukti.
- `app/student/page.tsx`, `app/api/attempts/route.ts`, CSS scoped di `app/globals.css`.

## Validasi dan batas

- Lint/typecheck dan build produksi; satu warning AI yang sudah ada tetap di luar lingkup.
- 448 tes otomatis lulus, 3 dilewati, 55 berkas: privasi, tipe respons, role/origin, recovery, terminal/ACK, canvas, pengumpulan dan regresi lain.
- Browser memakai fixture **build produksi**, sehingga pemuatan modul sampel tidak memicu Fast Refresh. Daftar kosong/error/malformed/banyak, 43 ujian, 70 soal, preflight/PIN, double-open, reload gagal, takeover, lima jenis jawaban, help uncertain/receipt, map/fokus, submit uncertain/reload identitas/bukti/kembali dan kegagalan canvas diperiksa.
- 320/390/768/1024/1440px, orientasi/320×320, teks 200%, batas modal, overflow halaman dan axe WCAG-tag; tidak ada pageerror pada skenario tersebut.
- Regresi aksesibilitas: skip link, keyboard/focus trap/return, navigasi, timer live-off, autosave dan deskripsi esai. Regresi preflight: offline, expiry lima menit, storage warning/draft isolation, resume, rumus/media dan goresan.
- Tindakan tulis browser disimulasikan. Ini bukan sertifikasi aksesibilitas, uji semua perangkat fisik, bukti beban serentak, atau jaminan draf offline tetap ada setelah storage dibersihkan. Receipt hanya berdasarkan jawaban yang diakui server; deadline dan aturan penilaian tetap berlaku.

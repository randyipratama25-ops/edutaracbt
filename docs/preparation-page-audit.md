# Audit Persiapan ujian — /dashboard/preparation

Tanggal: 4 November 2026 (WIB). Basis: `723d0f403db22af2da70df02b80a30b8953d5c2c`.

## Alur dan sumber yang diperiksa

DashboardLayout memeriksa actor/konteks staf. PreparationPanel membaca workflow preparation, memilih ujian dari daftar berizin/deep link, menampilkan checklist dan mengizinkan Admin membuka wizard. Identitas/peserta/jadwal menghasilkan draf melalui authoring_command; soal diisi lewat bank soal pada tab baru; aturan disimpan sebelum checklist dan publikasi. workflow_command mengulang pemeriksaan izin, status, waktu dan kesiapan secara atomik sebelum mengubah draf menjadi terjadwal. Guru tetap tidak membuat atau memublikasikan jadwal.

Dibaca sebelum perubahan: page/layout, PreparationPanel/Checklist/Workbench, PageHeading/DashboardShell/ContextHelp, Dialog/Button/ValidatedForm/feedback, clientRequest/api, workflow/authoring schema/contracts/read/server API, fungsi SQL exam_preparation/author_command/workflow_command dan pemicu invalidasi kesiapan, CSS wizard/checklist, serta tes dan fixture terkait. Hubungan state id/selected/step, metadata, jadwal/PIN/configs, read/loading/error, request_id, penutupan modal dan tautan antarhalaman dipetakan.

## Temuan dan perbaikan

| Penyebab | Perbaikan |
| --- | --- |
| Pembacaan tanpa kontrak runtime, timeout, abort atau pengaman respons terlambat. | Kontrak untuk kesiapan/metadata/receipt, ID ujian/check unik, waktu valid, tautan internal berizin dan konsistensi ready. Read single-flight berbatas waktu memakai controller/generation/mounted guard dan cleanup yang aman di Strict Mode. |
| Selection tetap menunjuk ujian yang hilang atau deep link tidak berizin. | Hanya mempertahankan ID yang masih tersedia; fallback ke ujian nonarsip atau daftar berizin yang tersisa. |
| load menangkap error tanpa memberi hasil kepada next; wizard tetap maju meskipun pemeriksaan gagal. | load mengembalikan keberhasilan; tahap baca tidak maju saat gagal. Kesiapan lama tidak mengaktifkan publikasi, jumlah soal belum diketahui ditampilkan sebagai tanda pisah, draf hilang memiliki pesan/retry. |
| Isian tetap bisa berubah selama mutation; begin hanya memakai state busy, bukan lock sinkron. | Fieldset dan lock sinkron membekukan isian, mencegah pembukaan/submit ganda serta menahan penutupan dialog saat tulis. |
| Draf timeout/malformed dapat dicoba ulang dengan payload berbeda atau dibuang ketika wizard dibuka ulang. | Payload dan request_id dibekukan saat hasil belum pasti; dialog dapat ditutup/dibuka lalu pemeriksaan eksplisit memakai payload identik. Pembuatan draf baru diblokir selama hasil belum pasti. Tidak ada retry otomatis. |
| Satu publishId tidak terikat pada target dan receipt tidak diperiksa. | Retry menyimpan target, confirmation dan ID; receipt harus published:true untuk target yang sama. Selection dikunci saat uncertain; publikasi ujian lain memakai ID baru. API juga memvalidasi receipt. |
| Enter pada tahap akhir hanya memicu next dan tidak memublikasikan. | onSubmit tahap Publikasi menjalankan jalur publish yang sama, tetap melalui validasi native, lock dan pemeriksaan server. |
| Tanggal input mengikuti zona perangkat sementara output WIB; durasi bisa melebihi jendela jadwal. | Konversi input WIB ketat memakai helper yang sudah ada, penolakan tanggal kalender tidak valid dan validasi durasi muat jadwal. Tidak mengubah aturan SQL. |
| Metadata nonaktif ditawarkan dan tautan checklist menutup wizard melalui navigasi halaman. | Hanya kelas/mapel aktif yang ditawarkan; state kosong jelas. Tautan perbaikan dari dialog membuka tab baru. |
| Teks langkah/konfigurasi dan daftar kelas panjang menyulitkan mobile/zoom. | Progress mobile menampilkan langkah berjalan dan nomornya, layout konfigurasi reflow, kelas bergulir lokal, teks membungkus dan tombol 44px. Checklist, form dan dialog tetap dalam viewport dengan gulir vertikal yang wajar. |

## Kompatibilitas

Tidak ada migrasi, dependency, halaman, role/grants/RLS atau perubahan rumus nilai, jawaban, snapshot, deadline, periode input, pemeriksaan kesiapan SQL maupun pemicu invalidasi. Masih 23 halaman/34 penggunaan Dialog pada 20 komponen. API/fungsi bisnis lama dipertahankan; hanya respons preparation/publish/draf yang diperketat. Fixture stage3 diperbarui sesuai receipt SQL yang sebenarnya (published/id, resolved dan deadline/minutes).

Wizard menyimpan state hanya selama komponen/tab masih terbuka. PIN tidak dicatat ke localStorage/sessionStorage. Payload retry draf yang belum pasti berada di memori sampai receipt sah atau komponen ditinggalkan; tidak menjanjikan pemulihan wizard setelah reload/navigasi. Pengeditan paralel dari tab lain tetap tunduk pada pemeriksaan SQL; ini tidak menambahkan optimistic concurrency untuk seluruh konfigurasi ujian.

## Validasi

- 475 tes lulus, 3 dilewati, 60 berkas; lint tanpa error (satu warning AI yang sudah ada), typecheck dan build produksi.
- Tes khusus: data malformed/duplikat/unsafe href, pemilihan ujian, batas role/origin/confirmation, receipt target, WIB/tanggal kalender; interaksi pembukaan ganda, draf uncertain/close/reopen, durasi, gagal refresh, submit lock, target publikasi dan Strict Mode.
- Browser fixture **build produksi**, API simulasi: 51 ujian, 69 kelas aktif, kosong/error/malformed, tujuh tahap, validasi native, perangkat zona New York dengan jadwal WIB, payload/request_id retry identik, gagal refresh sesudah draf tersimpan, field/dialog terkunci, Enter publikasi, receipt salah target, publikasi ujian berbeda, Guru read-only dan tautan tab baru.
- 320/390/768/1024/1440px, orientasi/320×320, teks 200%, touch, axe tag WCAG dan batas halaman/modal; tidak ditemukan pageerror atau horizontal overflow pada skenario uji. Gulir vertikal form panjang dipertahankan agar seluruh kontrol dapat dijangkau.
- Database lokal terisolasi: workflow integration membuktikan readiness/publication gate, invalidasi, cakupan role/penugasan, idempotency dan batas deadline/version. Rangkaian database lengkap juga diperiksa sebelum merge.

Tidak membuat draf, PIN, publikasi, pesan atau perubahan jawaban siswa pada produksi untuk pengujian. Hasil bukan sertifikasi aksesibilitas, uji semua perangkat fisik atau uji beban serentak.

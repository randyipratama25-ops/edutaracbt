# Audit Otomasi dan backup — /dashboard/jobs

Tanggal: 4 November 2026 (WIB). Basis: `99e4a8f20f627f72cddf91755c66f4c7808f43e0`.

## Alur yang diperiksa

Admin dalam konteks staf → halaman Jobs → pemantauan `/api/operational` dan daftar `/api/system?action=jobs` → tindakan `systemMutation` → RPC `system_command` / `operational_health` → worker dan status antrean yang sudah ada. Backup selesai dapat membuka manifest, ZIP atau daftar bagian; endpoint unduh memeriksa Admin, organisasi dan status melalui RPC. Form catatan latihan tidak menjalankan restore. Pengaturan/Audit tetap menggunakan API `SystemPanel` yang sama.

Sumber yang dibaca sebelum perubahan: halaman/pagar dashboard, panel sistem, health/checks, transport dan feedback bersama, form/dialog/tombol/filter, CSS, kontrak/validasi sistem, endpoint operasional/unduh/ekspor, SQL sistem/retensi/pemulihan dan worker backup/operasi, serta tes dan fixture terkait.

## Temuan dan perbaikan

| Temuan / penyebab | Perbaikan |
|---|---|
| Interval membuat pembacaan baru walau sebelumnya belum selesai; request tidak dibatalkan saat unmount. | Satu pembacaan aktif, timeout/abort/generation, cleanup listener/timer, jeda saat tersembunyi/offline dan saat konfirmasi/lihat bagian. Cleanup tetap aman pada replay effect pengembangan. |
| State `busy` saja tidak mengunci klik ganda secara sinkron. | Ref lock langsung, fieldset disabled, penutupan modal dijeda selama tulis. Pembacaan lama dibatalkan sebelum tindakan. |
| Respons tidak divalidasi dapat membuat `.map` gagal atau status salah. | Kontrak Zod di server untuk daftar job/bagian dan di client untuk daftar/status/receipt. Data terakhir ditandai ketika pembaruan gagal; tindakan terkait dijeda. |
| Bagian backup lama tetap terlihat dan respons lambat dapat dipasangkan dengan ID baru. | Modal bagian dengan reset, abort, generation dan loading/error/empty tersendiri. Nomor bagian 0 tetap sah. |
| Tombol retry/cancel masih muncul untuk outcome retensi terminal; rekonsiliasi muncul untuk semua jenis uncertain. | Guard sesuai aturan SQL: cancelled/retention_pending/retired tidak dapat dicoba ulang; rekonsiliasi hanya reminder uncertain. Backend tetap otoritatif. |
| Pesan umum dan receipt tanpa validasi dapat menyiratkan proses sudah selesai. | Pisahkan antrean diterima, pembatalan selesai, rekonsiliasi tercatat, gagal dan hasil belum pasti. Sukses tulis tetapi gagal refresh dijelaskan tanpa menyarankan kirim ulang. |
| Deskripsi pembatalan backup menjelaskan email, dan pesan tindakan lama terbawa ke modal baru. | Deskripsi berdasarkan tindakan/hasil rekonsiliasi, ID sasaran dan alasan/konfirmasi eksplisit; pesan dibersihkan saat modal baru dibuka. |
| Nomor bagian unduh memakai Number sehingga string kosong dapat menjadi 0; error SQL diteruskan mentah. | Validasi digit/integer aman, pemeriksaan prefix organisasi/job, gunakan pemetaan error RPC yang sudah ada. |
| Daftar 100 baris tanpa pencarian/filter/pagination dan kode status mentah menyulitkan tindak lanjut. | Pencarian lokal ID/jenis/status/hasil/error; filter jenis/status; 10 baris per halaman; label Indonesia, WIB, progres dan jumlah percobaan. Batas pencarian 100 terbaru dinyatakan jelas. |
| Form latihan dapat berubah ketika pending dan belum memeriksa receipt. | Validasi native + Zod, pengunci langsung, timeout/abort, receipt saved=true, draf tetap saat gagal, request_id sama untuk percobaan identik. |
| SHA/error/ID panjang dan kontrol padat berpotensi keluar container. | Grid minmax(0,1fr), wrapping, tabel desktop bergulir lokal dan kartu pekerjaan pada mobile, modal bersama berbatas viewport, target sentuh minimal 44px. |

## Kode final

- `components/system/jobs.tsx`: daftar, polling, tindakan, filter/pagination, modal konfirmasi dan bagian.
- `components/system/health.tsx`: pemantauan dan pencatatan latihan.
- `lib/system/jobs.ts`: kontrak job/bagian, label dan guard tindakan.
- `lib/operational/health.ts`: kontrak status operasional; rumus pemeriksaan tetap.
- `app/api/system/route.ts`, `app/api/backups/download/route.ts`: validasi batas server.
- `app/dashboard/jobs/page.tsx`, `components/system/panel.tsx`, CSS scoped di `app/globals.css`.

Tidak ada perubahan skema, dependency, role, RLS, penjadwal, worker atau format backup. Tidak diperlukan migrasi database. Inventaris tetap 23 halaman; 33 penggunaan Dialog pada 20 komponen. Formulir latihan tetap inline.

## Validasi dan batas

- Lint tanpa error baru; satu warning lama di pengaturan AI. Typecheck lulus.
- 430 tes otomatis lulus, 3 dilewati, 54 berkas. Sepuluh kasus baru menguji data rusak/duplikat, guard retensi, izin, receipt, health dan unduh.
- Build produksi lulus setelah cache build lama yang tidak dapat dibaca dipisahkan; tidak ada perubahan dependency.
- `scripts/ui/jobs-browser.mjs`: daftar kosong/100 baris, pencarian/filter/pagination, malformed/error, polling single-flight, klik/submit ganda, alasan whitespace/native validation, uncertain/idempotency, respons bagian terlambat, rekonsiliasi, draf latihan dan receipt.
- Desktop/tablet/mobile 320, 390, 768, 1024 dan 1440px; orientasi landscape/layar pendek 320×320; teks 200%; batas modal dan horizontal overflow diperiksa. Pemindaian axe WCAG A/AA dan pageerror diuji.
- Pengujian browser menggunakan API simulasi. Tidak menjalankan backup baru, pengiriman email, pembatalan job nyata, restore atau pencatatan bukti palsu di produksi. Integrasi database lokal yang sudah ada tetap menjadi pemeriksaan CI; UAT perangkat fisik dan restore produksi bukan klaim audit UI ini.
- Auto-refresh tidak otomatis mengulang mutation. Request_id backup hanya diganti setelah receipt backup diterima; tindakan lain tidak menghapus identitas percobaan backup yang belum pasti. Draf form tidak dijanjikan bertahan setelah tab/perangkat ditutup.

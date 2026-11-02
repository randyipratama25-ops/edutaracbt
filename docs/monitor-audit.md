# Audit Peninjauan/monitoring ujian — 2 November 2026

## Temuan dan perbaikan

- Daftar, SSE/polling, reload manual dan bantuan bisa bertumpuk; tidak ada timeout, pembatalan lifecycle atau validasi respons. Monitor dan sinyal/bantuan kini single-flight, memakai clientRequest/AbortController dan kontrak Zod. Error bukan data kosong. Pembacaan options gagal memiliki retry, bukan spinner tanpa akhir.
- Pergantian ujian mengosongkan rows tetapi belum membatalkan respons sebelumnya secara langsung. Generasi permintaan dan abort berubah pada event pergantian; respons stale tidak menyentuh state baru. Status pembaruan terakhir terlihat dan polling terkait dijeda saat dialog operasional dibuka.
- Peserta tanpa attempt memiliki version/pending/deadline null dari SQL. Kontrak menerima null tersebut; tindakan mensyaratkan attempt/version valid. Tombol unlock hanya untuk diskualifikasi, disqualify hanya aktif, reset mempertahankan aturan bisnis SQL. Peserta tidak berizin tidak dapat ditindak dari UI/server.
- Tindakan dihitung ulang dari rows yang berubah karena polling ketika dialog dibuka. Kini ID/version disalin saat dialog dibuka; CAS server tetap wajib. Form dan dialog memakai lock sinkron, fieldset disabled dan pencegahan tutup selama mutation pending. Konflik/hasil tak pasti memerlukan tutup dan pemeriksaan ulang; tidak ada pengiriman ulang otomatis dan request_id tetap sama untuk payload sama.
- Riwayat sent mempertahankan isi sebelumnya, read gagal terlihat terus memuat, respons dialog lama dapat mengganti dialog baru. State loading/error/data dipisah, abort/generasi menjaga konteks, retry eksplisit. Ekspor JSON memakai hasil filter dan URL object dicabut setelah download dipicu.
- Pilihan tersembunyi bertahan setelah filter, jumlah dapat melewati batas broadcast, halaman kosong setelah polling menyusutkan total. Pilihan dibersihkan pada filter/ujian, dibatasi 500; action maksimal 100 attempt tetap berlaku. Page diturunkan ke rentang valid dengan ukuran 25 tetap.
- API mengembalikan transport error sebagai 403/422 atau menerima data null. Memakai mapper error/receipt yang sudah ada: konflik 409, SQL detail disamarkan, transport/null 503. Target GET wajib, attempts mutation unik, rentang waktu dan penerima terpilih tervalidasi. Bentuk API/RPC tetap.
- SSE tidak memeriksa token session, heartbeat rejection/subscribe failure bisa bocor dan cleanup channel rejection tidak ditangani. Token diwajibkan, cleanup idempotent dipanggil pada abort/cancel/channel failure, heartbeat/close aman. Polling 5 detik tetap fallback, kanal tetap private dengan aturan organisasi/penugasan lama.
- Tabel mendapat sticky header/identitas dan scroll internal, toolbar min-width/reflow, text wrapping, dialog bounded. Panduan panjang menjadi details, metrik dan freshness membantu peninjauan. Indikator koneksi tetap bukan bukti kecurangan.

## Cakupan dan kompatibilitas

Ditelusuri sebelum edit: page monitor dan supervisor, OperationsPanel mode monitor/rooms, IncidentPanel, API operations/live/workflow, transport/client request, dialog/list filters/CSS, schema operasi/workflow, SQL ops_command/review_attempt/workflow_command/ops_student/effective_supervisor, receipt/history/notifikasi dan pengujian terkait.

Tidak ada perubahan ledger, struktur data bisnis, endpoint, halaman (tetap 23), role, dependency, migrasi database atau Edge Function. Server tetap otoritatif untuk cakupan, audit/alasan/konfirmasi, CAS/version, idempotensi, 1–100 tindakan, 1–500 penerima, batas dispensasi 1–60 menit dan jadwal/deadline. Reset tidak menambah waktu/menghapus jawaban atau bukti. Penugasan efektif dan mode ruang bersama dipertahankan.

## Validasi

- `npm run check`: 315 passed, 3 skipped, TypeScript dan build produksi lulus. Lint tanpa error; satu warning AI settings yang sudah ada.

- 13 regresi baru: null/kontrak, receipt/status, transisi/cakupan, page clamp, duplikat/sasaran/waktu, target GET/anonim, supervisor/student, konflik/SQL/transport, null write, origin/JSON/batas ukuran, workflow read, token SSE dan cleanup cancel tepat sekali.
- Browser komponen produksi: Admin/Guru; lebar 320/390/768/1024/1440; touch/orientasi/layar pendek/text 200%; axe WCAG A/AA pada panel dan dialog tanpa pelanggaran. Tidak ada pageerror atau horizontal overflow pada matriks uji. Scroll vertikal normal dan scroll tabel internal dipertahankan agar konten tetap dapat diakses.
- Alur browser: unlock dengan snapshot version/lock submit/dialog; selection/filter/page shrink; history error/retry/stale dialog; polling lambat satu pembacaan aktif; pergantian ujian melawan respons lama; malformed/error/retry; uncertain recovery dan request_id sama; notifikasi terpilih, help resolve, dispensasi Admin, Guru read-only pada peserta tak berizin; mode Rooms tambah ruang berkapasitas nol dan form sesi.
- Query metadata produksi read-only: RLS aktif pada 14 tabel operasi/attempt/bantuan/notifikasi yang diperiksa. Tidak memanggil monitor RPC produksi saat audit karena RPC lama dapat memfinalisasi attempt yang telah kedaluwarsa.

Penulisan browser disimulasikan; tidak ada reset/diskualifikasi/dispensasi, nilai, notifikasi atau email operasional produksi yang dibuat oleh pengujian ini. Bukan klaim UAT semua perangkat fisik atau jaminan bebas bug di semua kondisi. Hasil check lengkap, CI dan deployment dicatat pada PR.

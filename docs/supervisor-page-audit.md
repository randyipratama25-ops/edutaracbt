# Audit Portal pengawas — /supervisor

Tanggal: 4 November 2026 (WIB). Basis: `70fdcc4ef6061e6ba0197611d65be7d684b8e62b`.

## Alur yang diperiksa

Halaman server memeriksa actor dan konteks pengawas efektif (Pengawas/Guru). Prioritas kerja mengarah ke monitor, bantuan dan kartu. OperationsPanel membaca pilihan ujian, peserta, sinyal/bantuan; polling/SSE memperbarui daftar. Pemilihan peserta membekukan target/version dalam dialog intervensi. API memeriksa origin/input/actor, RPC memeriksa organisasi dan penugasan efektif sebelum tindakan/idempotent receipt. Riwayat, broadcast, ekspor monitor, respons bantuan serta kartu PDF/ZIP/unduhan tetap tersedia.

Sumber yang ditelusuri: `app/supervisor/page.tsx`, RoleActions, OperationsPanel/shared/contracts/schema/server, IncidentPanel/schema, CardsPanel/card-contracts, API operations/live/workflow/cards/download, pemrosesan kartu, actor/canUseContext, Dialog/ValidatedForm/feedback/context help, CSS dan migrasi operational/workflow/notification terkait. Kontrak callback, state, dependency baca/tulis, error/loading/empty, CAS version, request_id, grants/RLS dan batas konteks diperiksa sebelum perubahan.

## Temuan dan perbaikan

| Penyebab masalah | Perbaikan |
| --- | --- |
| Dialog bantuan hanya menjeda panel anak; monitor induk tetap memperbarui peserta dan polling kartu tersembunyi tetap berjalan. | Callback dialog mengunci kontrol dan menjeda monitor induk secara sinkron; request baca yang sedang berjalan dibatalkan/diinvalidasi. Kartu baru dimuat ketika dibuka, polling/SSE berhenti ketika ditutup, state pilihan/retry dipertahankan. |
| Respons bantuan lama dapat selesai setelah dialog dibuka; dua read paralel belum diselesaikan sepenuhnya ketika salah satunya gagal. | AbortController, generation dan allSettled membatasi pembacaan; callback lama tidak mengganti state dialog. Cleanup membatalkan read/mutation saat unmount. |
| Indikator jeda disebut loading; kegagalan refresh setelah receipt sah berpotensi dianggap gagal simpan. | Jeda dibedakan dari loading; receipt sah tetap sukses dengan pemberitahuan jika refresh gagal. Hasil belum pasti mempertahankan teks/request_id dan membutuhkan pemeriksaan status. |
| API hanya memeriksa keberadaan sebagian hasil; batch receipt lebih pendek masih dianggap sukses. | Validasi runtime daftar/riwayat/sinyal/bantuan dan ID unik; receipt reset/unlock/diskualifikasi harus mencakup semua target. Resolve harus `resolved:true`; menit dispensasi harus sama dengan permintaan. Respons malformed/parsial menjadi 503, tanpa otomatis mengirim write baru. |
| Bantuan panjang tak memiliki pencarian/filter/pagination; daftar koneksi panjang mendesak alur utama. | Pencarian nama/pesan/tanggapan, status menunggu/ditangani/semua, pagination 10; ringkasan koneksi dapat dibuka dengan gulir lokal. Nilai kontak kosong tidak menjadi Invalid Date. |
| Riwayat menampilkan seluruh JSON mentah; deadline mengikuti zona perangkat. | Lini masa kejadian/tindakan, label, alasan, status insiden dan waktu WIB; metadata bukti tetap di rincian. Deadline monitor menampilkan tanggal dan waktu WIB. |
| Dua pintasan menuju target yang sama dan tautan kartu tidak membuka details tertutup (termasuk hash yang sama). | Bantuan memiliki anchor tersendiri; anchor dalam halaman memakai navigasi native, panel kartu menangani hash/click berulang tanpa menghapus state. Listener dibersihkan. |
| Header, bantuan/pesan/nama panjang dan dialog memerlukan penataan yang konsisten. | CSS scoped, wrapping, filter reflow, tombol sentuh dan batas dialog/daftar; tabel mempertahankan gulir lokal dan kolom sticky. |

## Kompatibilitas dan database

Tidak ada migrasi, skema, dependency atau perubahan grants/RLS. Actor tetap memeriksa getUser/profil aktif/konteks dan penugasan. Backend tetap otoritatif untuk organisasi, penugasan asli/pengganti dan masa sesi. Pengawas tidak mendapatkan akses pengaturan ruang/penugasan atau dispensasi Admin. Tidak mengubah formula nilai, data jawaban, snapshot immutable, deadline, reset history, writer epoch atau CAS.

API baru memeriksa respons dari RPC yang sudah ada; payload bisnis dan endpoint dipertahankan. Opsi tambahan CardsPanel `enabled` dan callback IncidentPanel bersifat opsional, sehingga pemanggil lama tetap kompatibel. Total tetap 23 halaman/34 penggunaan Dialog pada 20 komponen. Dokumentasi pemeriksaan diperbarui ke v1.37.

## Validasi

- Tes API: batas actor/context/origin, response malformed/duplikat/partial, receipt bantuan, akses Admin dan supervisor.
- Tes interaksi: dialog menjeda read/induk, submit sinkron tunggal, isian/request_id uncertain tetap, refresh gagal sesudah sukses, late read diabaikan, pagination/filter bantuan dan state kartu saat ditutup/dibuka.
- 461 tes otomatis lulus, 3 dilewati, 58 berkas.
- `npm run check`: lint tanpa error (satu warning AI yang sudah ada), typecheck, seluruh tes dan build produksi.
- Browser memakai fixture **build produksi** dengan API simulasi: 51 peserta, status/no attempt, lima lebar 320/390/768/1024/1440, orientasi/320×320/teks 200%, touch, axe, table/modal bounds, filter/pagination, reload/exam/history race, malformed/error/uncertain/retry ID, broadcast, bantuan, dispensasi Admin dan regresi ruang. Mode supervisor memeriksa tanpa kontrol dispensasi, riwayat, lazy cards/anchor dan jeda bantuan dengan dialog pending terlindungi. Tidak ada pageerror/overflow halaman pada skenario tersebut.
- Database terisolasi: `scripts/workflow-integration.mjs` dan `scripts/operations/integration.mjs` lulus (cakupan/penugasan, bantuan, heartbeat, dispensasi idempotent/version/deadline, grants, serta regresi operasi/pemulihan).

Tindakan tulis browser disimulasikan; tidak membuat reset, diskualifikasi, dispensasi, pesan, kartu atau bantuan palsu pada siswa produksi. Hasil bukan sertifikasi aksesibilitas, jaminan semua perangkat fisik, uji beban serentak atau pengganti UAT pengawas di madrasah.

# Audit Ruang, sesi dan pengawas — 2 November 2026

## Temuan / perbaikan

- Mode ruang memakai CSS monitor: kolom nama mengikuti kolom checkbox56px, tabel dan daftar sesi sulit digunakan pada mobile. Presentasi RoomLists kini terpisah, kolom identitas190px, sticky header/nama, scroll internal, ringkasan, pencarian dan pagination25 pada ruang/sesi/penugasan. Halaman memakai kelas khusus tanpa mengubah tampilan monitor.
- Daftar roster besar dirender seluruhnya, tanpa pencarian/batas500 pada pilihan. RosterChoices memakai pagination25, pencarian, pilihan unik/fungsional maksimal500, pilih hasil dan kosongkan; pilihan dipertahankan antarhalaman/pencarian dalam dialog. Peserta dari roster ruang lain tetap dikecualikan.
- Form waktu mengikuti zona perangkat. Input dan tampilan kini eksplisit WIB dengan konversi/validasi UTC, termasuk pemeriksaan tanggal yang dinormalisasi seperti30Februari. Template waktu edit tetap akurat di perangkat zona lain.
- Judul modal generik dan konfirmasi tanpa nama sasaran. Judul/identitas kini spesifik. Dropdown/tombol hanya menawarkan pengawas pengganti selain pengawas asal; tugas perlu ruang/sesi/staf, pencabutan perlu substitusi belum dicabut. Riwayat yang merujuk ruang/sesi dijelaskan dan tombol hapus dinonaktifkan; server tetap memeriksa kondisi terkini.
- Tindakan tetap bisa dibuka ketika pembacaan ruang gagal atau belum selesai. UI kini membedakan loading/error/empty dan tidak menampilkan kontrol perubahan pada snapshot gagal; selama refresh tindakan dinonaktifkan. Lock, dialog pause, abort/generation/single-flight dan request_id lama dipertahankan. Pesan sesudah mutation tidak mengklaim daftar berhasil diperbarui jika refresh gagal.
- SQL session_save mengembalikan id meski UPDATE tidak menemukan sesi/ujian yang cocok. Migrasi20261102074638_rooms_audit.sql menambahkan pemeriksaan FOUND dan konflik409. API memeriksa Admin/staff sebelum RPC untuk seluruh operasi ruang; menolak roster duplikat, saved:false dan receipt salah. Nama API/payload dan resultData tetap.

## Cakupan dan kompatibilitas

Dibaca sebelum edit: page/layout/actor, seluruh OperationsPanel dan state/modal, API ops_command, contracts/schema/transport/shared live, dialog/button/list filters/CSS, SQL ops_command/ops_student/effective_supervisor/room_capacity, FK/trigger/penugasan/pengganti dan integrasi database terdahulu.

Tetap23 halaman, tanpa endpoint/dependency baru. Kapasitas0=tanpa batas, kapasitas/eligibilitas organisasi, kunci roster setelah mulai, sesi dalam jadwal ujian, staf aktif, pengganti/periode dan penonaktifan tanpa menghapus riwayat dipertahankan. Tidak mengubah nilai/attempt/notifikasi atau aturan monitor. Komponen RoomLists/RosterChoices hanya presentasi; mutation tetap satu alur OperationsPanel→API→ops_command. Penghapusan dengan referensi tetap ditolak server walaupun kondisi berubah setelah UI dibuka.

Migrasi mengganti hanya potongan update sesi dalam definisi fungsi yang ada dengan guard anchor; tidak menulis ulang data, tidak mengubah grant/RLS/security definer/search_path. Staging diverifikasi fungsi memiliki guard baru, search_path kosong dan anon tidak dapat EXECUTE ops_command. Produksi dibaca hanya untuk metadata/advisory/log sebelum migrasi; tidak memanggil RPC monitor karena dapat memfinalisasi attempt kedaluwarsa.

## Validasi

-20 regresi baru kontrak/helper/API: WIB/invaliddate/selection500/sortimmutable/legacy nullable, roster duplikat/waktu/kapasitas0/receipt, tiga peran nonadmin dan sepuluh aksi admin-only, konflik dan false/malformed receipt.
- scripts/rooms-integration.mjs: Postgres/PGlite terisolasi dengan seluruh migrasi dan fixture lifecycle; create/update/idempotensi sesi, sesi hilang/dihapus ditolak, nonadmin ditolak. Termasuk npm run test:database/CI.
- Browser komponen produksi dengan API fixture:320/390/768/1024/1440, orientasi/layar pendek/teks200%, axe WCAG A/AA; CRUD ruang/sesi, WIB dari zona Los Angeles, assign/substitute/revoke/unassign, roster500/pagination, submit/close lock, uncertainty/request_id, respons stale, single-flight, malformed/error, page clamp dan empty state.
- Regresi browser monitor Admin/Guru dijalankan karena OperationsPanel bersama; API mutation disimulasikan tanpa operasi akademik produksi.

## Batas

Browser memakai data simulasi, bukan akun produksi atau semua perangkat fisik. Scroll vertikal halaman/daftar dan tabel internal dipertahankan agar konten tidak terpotong. Keberhasilan pengujian bukan jaminan semua kombinasi data/perangkat bebas bug. Data bisnis lama tidak diubah; guard sesi mencegah acknowledgement palsu baru dan tidak menulis ulang ledger idempotensi lama.

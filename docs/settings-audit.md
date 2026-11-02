# Audit Pengaturan aplikasi — 2 November 2026

## Temuan dan perbaikan

- Form pengaturan berbagi state dengan audit/job. Read tidak divalidasi/dibatasi waktu; loading awal kosong, error tidak memiliki retry yang jelas. SettingsPanel kini khusus pengaturan, dengan kontrak runtime, lifecycle abort/generation, timeout dan error/retry. SystemPanel tetap entry point lama; blok pengaturan lama dihapus, daftar audit/job dipertahankan.
- Menyimpan secret atau refresh setelah save dapat membuang draf umum. Status server dan draf kini terpisah; secret ACK memperbarui flag tanpa mengganti draft/version. Reload meminta discard bila ada perubahan/password belum disimpan. Semua isian lintas form dikunci saat write memakai synchronous lock.
- Read setelah save gagal dapat menampilkan versi lama seolah siap disimpan lagi. Save tetap CAS/version; konflik409, hasil tak pasti dan refresh gagal mengunci write sampai reload berhasil. Tidak ada retry write otomatis. Pesan membedakan save yang berhasil tetapi status belum terbaca.
- Receipt kosong/false dapat dianggap sukses dan error SQL mentah keluar API. Mapper rpcData bersama serta kontrak GET/save/secret/probe/job menolak receipt salah; secret response dibatasi metadata dan tidak membocorkan field tambahan. Hak Admin/staff, origin, body/schema dan nama API tetap.
- Checkbox pengingat dinonaktifkan seluruhnya ketika SMTP unavailable, termasuk saat perlu mematikan flag yang sudah aktif. Sekarang penonaktifan tetap tersedia. Save reminder memeriksa kesiapan worker, sender dan secret sebelum request, dengan SQL tetap otoritatif.
- Tombol SMTP dapat memakai sender lama ketika draft berubah, dan ACK job tidak menjelaskan hasil koneksi belum diketahui. Tombol memakai readiness/sender tersimpan, memperlihatkan job/link, tidak mengklaim koneksi berhasil. Request_id sama untuk retry yang belum pasti; berganti ketika versi/sender berubah atau secret diganti. Worker lama tetap verify(), tanpa sendMail untuk smtp_probe.
- Kredensial lama AI berpotensi membingungkan konfigurasi multi-provider. Fitur lama dipertahankan dengan label legacy dan tautan ke halaman penyedia aktif. Status secret tidak memuat nilai; input dibersihkan setelah ACK, jenis berubah, discard atau hasil write secret tidak pasti.
- UI panjang tanpa kelompok dan checkbox mengikuti gaya kolom form. Identitas/branding, kebijakan, email/template, kredensial dan uji SMTP dikelompokkan; grid responsive, wrap teks, target sentuh, dirty/version/readiness feedback, tautan bergaris bawah, dialog discard berbatas viewport. Variabel/jadwal rinci dilipat.

## Cakupan dan kompatibilitas

Dibaca sebelum edit: page/layout/actor/staff, seluruh SystemPanel settings/audit/jobs, API system, schemas/http/client transport, branding/login/home dan pengujian branding, SQL system_command/app_settings/Vault/branding mirror/RLS, scheduler dan worker SMTP, serta integrasi Stage6. Modifikasi hanya alur settings dan validasi/error pada API bersama; audit/job mempertahankan operasi dan payload lama.

Tidak ada migrasi database, dependency, endpoint atau halaman baru. Inventaris23 tetap, CAS/version, kebijakan ujian/publikasi/canvas, timezone sekolah, retention7–730, reminder template, scheduler mingguan/semester, dua backup terbaru dan Vault tetap. ID media publik tetap gambar dalam organisasi; membersihkan ID kembali ke fallback. Tidak membuka akses langsung ke tabel privat atau membaca nilai secret. Query metadata produksi: anon tidak dapat EXECUTE system_command, authenticated tidak dapat SELECT app_settings/secret_refs langsung, RLS kedua tabel aktif.

## Validasi

- `npm run check` lulus:383 passed,3 skipped,51 file; lint tanpa error, TypeScript dan build produksi berhasil. Satu warning lama pengaturan AI di luar cakupan.

-14 regresi baru kontrak/helper/API: metadata/draft terpisah, corruption/null/versi, timezone, receipt valid, tiga peran nonadmin/anon/origin, CAS409, SQL masking, empty/false ACK, SMTP job identity, secret readback stripping, jobs/audit contract.
- Browser SystemPanel nyata dengan API fixture:320/390/768/1024/1440, orientasi/layar pendek/text200%, axe A/AA; dirty/discard, secret isolation/clearing/submit lock, version/CAS, conflict/uncertain/refresh failure, timezone, reminder disable saat worker off, SMTP persisted sender/request_id/queued status, malformed read/retry, regresi dasar Audit/Jobs.
- Pengujian branding/login lama dan integrasi database Stage6 tetap dijalankan pada CI lengkap. Tidak ada secret/perubahan pengaturan/email atau job produksi dibuat oleh pengujian; probe/backup browser disimulasikan.

## Batas

Pengujian memakai fixture, bukan login produksi atau pengiriman email nyata. Tindakan uji SMTP tetap merupakan job asinkron dan hasilnya harus dibaca di Pekerjaan. Tidak mengubah konfigurasi SMTP Auth Supabase atau kredensial provider. Scroll vertikal wajar dipertahankan supaya semua isian dapat diakses. Keberhasilan QA tidak merupakan jaminan semua perangkat/kombinasi data bebas bug.

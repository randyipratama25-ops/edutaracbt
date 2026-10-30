# Tahap 3 — Alur persiapan dan pelaksanaan

Basis: main `8c34f8f6c9a81dc58d80b5ac3b3ee646b7016ce8`. Halaman baru `/dashboard/preparation` untuk Admin/Guru dalam konteks staf; 19 halaman produksi. Wizard dan publikasi jadwal hanya Admin. Guru membaca kesiapan pada seluruh kelas–mapel authoring yang ditugaskan dan tetap menyusun soal melalui bank soal.

## Alur

1. Wizard: Identitas → Peserta → Jadwal → Soal → Aturan → Pemeriksaan → Publikasi. Draf disimpan saat Jadwal dan Aturan. Langkah Soal membuka bank soal yang ada pada tab baru. Parameter `?exam=` membuka bank yang dituju. Wizard tidak menyimpan PIN ke storage browser.
2. Checklist server memeriksa mapel/kelas aktif, siswa aktif, jadwal/durasi/PIN, konfigurasi lima tipe, soal/kunci, dan keberadaan objek media. Aktivasi email dan ruang/pengawas adalah peringatan yang perlu ditinjau, bukan pemblokiran publikasi. Aktivasi email bukan bukti uji login/kehadiran.
3. Publikasi jadwal memerlukan konfirmasi eksplisit dan validasi ulang dalam transaksi. Form jadwal lama/direct RPC juga melewati gate kesiapan. Perubahan soal sebelum mulai mengembalikan jadwal terpublikasi ke draf; Admin perlu memeriksa dan mempublikasikan kembali. Ujian yang telah berjalan tidak diubah oleh migrasi.
4. Siklus diturunkan dari status, waktu server, finalisasi, pending koreksi dan kebijakan publikasi hasil: Draf, Siap Ditinjau, Terjadwal, Berlangsung, Selesai, Dinilai, Dipublikasikan, Diarsipkan. Ini label operasional, bukan enum baru atau duplikasi sumber status. Publikasi jadwal dan publikasi hasil adalah tindakan berbeda.
5. Ringkasan staf menampilkan agenda dalam cakupan authoring; portal pengawas/monitor memuat peserta aktif/belum mulai, koneksi perlu dicek, bantuan, serta penjelasan lanjut sesi/unlock/reset/dispensasi. Kontak writer berhasil disimpan maksimal sekali per 10 detik; player sudah memeriksa server setiap 15 detik. Kontak >45 detik diberi label perlu diperiksa; bukan bukti pelanggaran atau kepastian offline. Tidak ada tambahan request heartbeat pada player.
6. Siswa dapat membuat satu bantuan terbuka per attempt sendiri (maksimal 20 sepanjang attempt). Admin/pengawas efektif dapat memberi tanggapan dan menutupnya; Guru dengan hak baca monitoring saja tidak dapat menutup. Tidak ada hak edit/hapus riwayat bantuan.
7. Dispensasi waktu hanya Admin staf, sesi in_progress belum final dan belum lewat deadline, versi sesuai, alasan 5–1000 karakter, konfirmasi TAMBAH WAKTU, tambahan 1–60 menit per tindakan dan tidak melewati akhir jadwal. Tidak membuka ulang sesi, tidak mengubah jawaban/snapshot atau writer epoch. Riwayat menyimpan keadaan sebelum tindakan di attempt_overrides dan audit. Timer siswa mengikuti deadline baru pada resume/heartbeat berikutnya.
8. Impor pengguna memeriksa duplikat username dalam berkas dan keberadaan username di server, serta role/kelas aktif/penugasan Guru. Pratinjau tidak membuat akun atau mengirim email; gateway memvalidasi ulang setiap baris. Template TSV, referensi ID kelas, pratinjau, progress, laporan hasil/daftar kesalahan TSV tersedia. Duplikat soal dalam satu berkas juga ditandai sebelum impor. Keberhasilan parsial tidak disembunyikan.

## Database dan otorisasi

Migrasi `20261030033230_preparation_execution_workflow.sql` bersifat tambahan. Tabel private `attempt_presence`, `exam_help_requests`, `workflow_requests` memakai RLS tanpa grant tabel klien. RPC publik `workflow_command(jsonb)` security invoker memanggil fungsi private dengan actor/session/cakupan yang diperiksa eksplisit dan search_path kosong. Anon tidak mempunyai EXECUTE. Implementasi lama author/attempt tetap dibungkus; akses langsung ke implementasi internal lama dicabut.

Request mutasi baru menggunakan idempotency key. Pembuatan draf wizard juga memiliki key; fingerprint SHA-256 mencegah penyimpanan PIN mentah dalam tabel deduplikasi. Lock publikasi memakai baris exam; tambahan waktu mengunci exam lalu attempt. Jalur autosave, pemulihan, takeover, finalisasi, grading dan audit lama dipertahankan. Backup sistem yang menginventarisasi tabel private otomatis mencakup data alur baru; tidak ada prosedur restore baru.

## Validasi

- `npm run check`: lint, TypeScript, unit/regresi, build.
- `npm run test:database`: suite lama serta `scripts/workflow-integration.mjs` untuk readiness, invalidasi publikasi, direct RPC, assignment/role isolation, preflight impor, bantuan/tanggapan, presence, idempotensi dispensasi, batas waktu/versi/window dan grant private.
- `node scripts/ui/stage3-browser.mjs`: fixture/API simulasi, wizard sampai publikasi, aksi Guru, bantuan siswa, tanggapan pengawas, dispensasi Admin, impor/duplikat/laporan dan overflow 320/390/768/1440. Route sementara dihapus sebelum build. Tidak mencakup UAT akun produksi atau perangkat fisik.

## Operasional

Terapkan migrasi dan verifikasi hak RPC di staging sebelum produksi; deploy kode sesudah skema tersedia. Gunakan checklist dengan data nyata untuk meninjau aktivasi email, roster dan tugas pengawas. Jika perlu rollback UI, pertahankan migrasi tambahan agar riwayat bantuan/dispensasi tidak hilang; jangan menghapus tabel atau mengembalikan deadline/jawaban secara massal.

Migrasi telah diterapkan dan diverifikasi di staging serta produksi: RLS aktif pada ketiga tabel private, grant baca langsung klien ditolak, RPC anon ditolak dan implementasi internal lama tidak dapat dipanggil authenticated. Versi riwayat migrasi diselaraskan ke timestamp file CLI `20261030033230`. Advisori keamanan tidak menambah WARN/ERROR; INFO RLS tanpa policy pada tabel private disengaja karena akses hanya lewat RPC. WARN leaked-password protection yang sudah ada tetap di luar perubahan tahap ini.

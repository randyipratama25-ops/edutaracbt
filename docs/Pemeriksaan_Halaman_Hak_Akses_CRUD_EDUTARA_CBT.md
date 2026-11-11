# Pemeriksaan Halaman, Hak Akses, dan CRUD EDUTARA CBT

Tanggal pemeriksaan: 12 November 2026 (WIB). Versi dokumen: 1.41 — Panitia Ujian.

## Panitia Ujian — 12 November 2026

Inventaris menjadi **25 halaman**. Admin membuat akun berperan Panitia Ujian di Pengguna atau memberi tugas Panitia Ujian kepada akun Guru yang sudah ada. Login menyediakan konteks Panitia Ujian bagi kedua jenis akun. Admin menjadwalkan petugas, mengonfirmasi kehadiran pada hari tugas, dan menunjuk pengganti. Pengganti memiliki catatan kehadiran sendiri dan wajib dikonfirmasi Admin.

Panitia yang sudah dikonfirmasi dapat membaca jadwal pengawas, mencatat kehadiran, dan menunjuk serta mengonfirmasi pengawas pengganti. RPC memeriksa sesi aktif, organisasi, tugas aktif, konfirmasi Admin, dan tanggal mulai sesi menurut zona waktu organisasi pada setiap permintaan. Jadwal lintas hari dikelompokkan menurut tanggal mulai sesi; penugasan lama tanpa sesi memakai tanggal mulai ujian. Kehadiran pengawas awal dan pengganti disimpan terpisah, dan perubahan tercatat dalam audit. Panitia yang diganti kehilangan akses dari tugas tersebut.

| Tindakan | Admin | Panitia Ujian dan Guru dalam konteks panitia |
|---|---|---|
| Penugasan panitia | C/R tugas, U konfirmasi, C tugas pengganti | R status tugas sendiri pada hari berjalan |
| Jadwal pengawas | Kelola melalui Ruang & pengawas | R jadwal hari tugas setelah kehadiran dikonfirmasi |
| Kehadiran dan pengganti pengawas | Kelola penugasan melalui Ruang & pengawas | C konfirmasi kehadiran dan C penggantian pengawas pada hari tugas |

Perubahan menggunakan migrasi `20261111172724_exam_committee.sql`, pembaruan Edge Function `identity-gateway`, dan deployment aplikasi Next.js.

## Orientasi landscape siswa — 7 November 2026

Inventaris tetap **23 halaman**. Pada `/login`, konteks Siswa di ponsel/tablet Android, iPhone, dan iPad memerlukan landscape sebelum permintaan autentikasi dikirim. Tombol Masuk dinonaktifkan selama portrait dan pemeriksaan diulang dalam submit handler, termasuk submit lewat keyboard. Input tidak direset saat rotasi. Jika perangkat menjadi portrait saat respons login masih ditunggu, pembukaan portal menunggu landscape tanpa autentikasi ulang. Login Admin/Guru dan Pengawas tetap tersedia pada kedua orientasi.

Pada player ujian aktif `/student`, portrait menampilkan dialog layar penuh yang tidak dapat ditutup melalui Escape, tombol tutup, atau klik di luar. Dialog berisi petunjuk rotasi dan pengingat waktu tetap berjalan; otomatis hilang saat landscape. Pemutar tetap terpasang sehingga timer, antrean jawaban, sinkronisasi, deadline, dan pengumpulan otomatis tetap memakai mekanisme yang ada. Hasil final tidak diblokir. Deteksi memakai orientasi layar dengan fallback Safari/media query, sehingga keyboard virtual tidak dianggap rotasi pada browser dengan API orientasi fisik.

Perubahan merupakan pembatas interaksi di browser. Tidak ada halaman, endpoint, hak akses, dependency, atau skema database baru; migrasi tidak diperlukan. Pengujian regresi ditambahkan pada `tests/student-orientation.test.ts`, `scripts/ui/login-browser.mjs`, dan `scripts/ui/student-browser.mjs`. Validasi: 520 tes lulus/3 dilewati, lint, TypeScript, build produksi, serta browser Chromium dengan emulasi orientasi/perangkat mobile; modal, fokus/Escape, timer, retensi jawaban, dan rotasi selama login terverifikasi. API autentikasi dan ujian disimulasikan; pengujian ini tidak menggantikan UAT pada perangkat Android/iOS fisik.

## Audit Bank soal — 5 November 2026

Inventaris tetap **23 halaman**. `/dashboard/bank` tetap hanya Admin/Guru konteks staf, dengan kategori, pemilik/reviewer, lampiran dan ujian sasaran diperiksa RPC menurut organisasi/penugasan. Editor lima tipe, versi immutable, review terpisah, impor/ambil dari ujian, kualitas dan kisi-kisi/perakitan maksimal tiga paket dipertahankan. Tidak ada migrasi, dependency, role/grants/RLS atau perubahan jawaban, snapshot, deadline dan formula penilaian.

Read daftar/metadata/detail/sumber/kualitas dan receipt mutation divalidasi runtime. Pagination/filter divalidasi sebelum RPC; daftar/versi duplikat atau tidak lengkap menjadi error, bukan kosong/sukses palsu. Pagination menyusut dikoreksi. Pembacaan memakai timeout/abort/generation/single-flight, termasuk metadata pada Strict Mode. Detail membuka loading seketika, memiliki retry dan mengabaikan respons setelah ditutup. SQL/transport error dipetakan tanpa membocorkan rincian internal; badan impor dibatasi berdasarkan byte.

Fieldset, lock sinkron dan dialog melindungi penyimpanan/review/impor/perakitan dari perubahan isian atau submit ganda. Hasil belum pasti menahan payload/request_id untuk retry eksplisit, termasuk tutup/buka dialog sementara; tidak ada retry tulis otomatis. State ini hanya bertahan selama halaman/komponen terbuka. Review tidak dapat dikirim saat versi lama sedang ditampilkan; item diarsipkan hanya menawarkan pembukaan sebagai draf kepada pemilik/Admin. Backend tetap memeriksa izin dan expected_version.

Receipt impor wajib lengkap dan unik; nomor hasil dipetakan ke blok sumber asli meskipun blok invalid tidak dikirim. Kandidat harus mencakup semua target/kelompok sebelum perakitan tersedia; perubahan aturan/target mengosongkan kandidat. Receipt perakitan harus sesuai jumlah soal dan seluruh ujian sasaran. Penghitungan kualitas mengosongkan statistik lama sebelum baca, dan proyeksinya tetap tidak menambah nama/jawaban individu. Pengecekan SQL tetap membatalkan seluruh paket bila kandidat tumpang tindih/tidak cukup.

Tabel bergulir lokal, header sticky, filter/teks panjang/modal/form/rubrik reflow dan tombol sentuh diperbaiki. Pilihan kelas dibatasi area gulir; kelas nonaktif pada kategori lama tetap terlihat agar dapat diperbaiki, sementara kategori baru hanya menawarkan kelas aktif. Total tetap **34 penggunaan Dialog pada 20 komponen**. Validasi: 495 tes lulus/3 dilewati, lint/typecheck/build, database terisolasi dan browser produksi 320–1440px/orientasi/teks 200%/axe. Bukti, kode dan batas pengujian: `docs/bank-page-audit.md`; API tulis browser disimulasikan tanpa mengubah bank atau ujian produksi.

## Audit Persiapan ujian — 4 November 2026

Inventaris tetap **23 halaman**. `/dashboard/preparation` tetap untuk Admin/Guru dalam konteks staf; pembuatan/pengaturan jadwal dan publikasi tetap hanya Admin. Guru membaca kesiapan serta memperbaiki soal/media sesuai penugasan; kesiapan akun dan ruang tetap diarahkan ke Admin. Tujuh tahap wizard, penyimpanan draf, bank soal, checklist dan publikasi jadwal dipertahankan; hasil ujian tetap dikelola terpisah.

Respons kesiapan, metadata aktif, ID unik, tautan perbaikan dan receipt divalidasi. Read single-flight dibatasi waktu, dapat dibatalkan dan memakai generation/mounted guard; cleanup Strict Mode tidak menahan flight yang sudah dibatalkan. Selection dari tautan atau daftar lama hanya dipertahankan jika ujian masih tersedia. Data terakhir yang gagal diperbarui tidak mengizinkan publikasi; langkah pemeriksaan tidak maju ketika refresh gagal, dan jumlah soal yang belum diketahui tidak dinyatakan nol.

Pembukaan wizard dan mutation dikunci sinkron; fieldset/dialog mencegah perubahan isian, submit ganda atau penutupan selama tulis. Hasil draf belum pasti menahan payload/request_id yang sama untuk pemeriksaan eksplisit, termasuk setelah dialog ditutup dan dibuka kembali. Publikasi mengikat identitas retry pada ujian sasaran dan mensyaratkan receipt published/id yang sesuai. Tidak ada retry tulis otomatis atau penyimpanan PIN ke storage browser. State retry hanya bertahan selama komponen/tab masih terbuka; navigasi/reload tidak dijanjikan menyimpan wizard.

Jadwal input/output memakai WIB terlepas zona perangkat; durasi divalidasi harus muat dalam jendela jadwal. Metadata kelas/mapel nonaktif tidak ditawarkan. Tautan perbaikan checklist di dialog membuka tab baru agar wizard tidak hilang. Enter di tahap Publikasi menjalankan form publikasi. Progress mobile menampilkan tahap berjalan beserta nomor langkah; daftar kelas dan dialog bergulir lokal, konfigurasi tipe reflow, teks panjang membungkus dan tombol mudah disentuh. Kesalahan, hasil belum pasti, sukses tulis dan gagal refresh dibedakan.

Tidak ada migrasi, dependency, role/grants/RLS atau perubahan formula penilaian, jawaban, snapshot, deadline dan aturan kesiapan/publikasi SQL. Total tetap **34 penggunaan Dialog pada 20 komponen**. Validasi: 475 tes lulus/3 dilewati, lint/typecheck/build dan browser fixture produksi dengan 51 ujian/69 kelas aktif; 320–1440px, orientasi, teks 200% dan axe. Bukti dan batas pengujian pada `docs/preparation-page-audit.md`; browser memakai API simulasi tanpa membuat jadwal, PIN atau publikasi palsu pada produksi.

## Audit Portal pengawas — 4 November 2026

Inventaris tetap **23 halaman**. `/supervisor` hanya untuk Pengawas atau Guru dalam konteks pengawas dengan penugasan efektif yang diverifikasi actor/RPC. Tindakan reset, buka kunci, diskualifikasi, pesan, riwayat, bantuan/tanggapan dan kartu peserta dipertahankan. Pengelolaan ruang/sesi/penugasan dan dispensasi waktu tetap hanya Admin; tidak menambah hak CRUD pengawas, mengubah RLS, data jawaban, deadline atau rumus penilaian. Tidak diperlukan migrasi database atau dependency baru.

Dialog bantuan mengunci operasi sinkron, membekukan sasaran dan menjeda monitor induk. Pembacaan bantuan dibatasi, dibatalkan dan diberi generation agar respons lama tidak menimpa sesi dialog. Sukses tindakan dibedakan dari kegagalan refresh. API memvalidasi daftar/riwayat/sinyal/bantuan, ID duplikat dan receipt; batch intervensi memerlukan hasil untuk seluruh target. Respons parsial/malformed menjadi hasil belum pasti, tanpa retry mutation otomatis atau penghapusan isian gagal.

Bantuan menyediakan pencarian, filter menunggu/ditangani/semua dan pagination 10 baris. Indikator jeda tidak lagi dinyatakan terus memuat. Riwayat menampilkan lini masa kejadian/tindakan, alasan, status perhitungan insiden dan waktu WIB; rincian bukti tetap dapat dibuka. Pintasan bantuan menuju panel yang sesuai. Pintasan kartu membuka panel tertutup; pemuatan kartu dimulai saat diperlukan, polling berhenti saat ditutup, pilihan dan identitas retry tetap dipertahankan.

Header, filter bantuan, teks panjang, tombol sentuh, tabel dengan gulir lokal dan dialog memakai batas viewport. Total tetap **34 penggunaan Dialog pada 20 komponen**. Validasi otomatis: 461 tes lulus/3 dilewati, lint/typecheck/build serta regresi database operasional/workflow. Bukti dan batas pengujian tercatat dalam `docs/supervisor-page-audit.md`; browser memakai API simulasi, tanpa intervensi, pesan atau data bantuan palsu pada ujian produksi.

## Audit Portal siswa — 4 November 2026

Inventaris tetap **23 halaman**. `/student` tetap hanya Siswa dalam konteks siswa, dengan kepemilikan/organisasi/writer epoch/deadline diperiksa backend. Daftar, PIN/preflight, mulai/lanjut/ambil alih, lima tipe soal, autosave, pemulihan, canvas, bantuan, pengumpulan dan hasil dipertahankan. Total **34 penggunaan Dialog pada 20 komponen**; tidak ada dependency baru.

Migrasi **`20261104152013_student_payload_privacy.sql`** diterapkan di staging dan produksi untuk menghapus metadata `distractors` dari proyeksi siswa, termasuk snapshot lama. Pilihan gabungan/acak menjodohkan tetap tersedia. Payload penilaian, snapshot immutable, jawaban, perhitungan nilai dan deadline tidak diubah; grants/RLS tetap. Uji RPC pada database terisolasi membuktikan privasi, pilihan lengkap, snapshot/penilaian tetap identik dan epoch/deadline tidak berubah.

Kontrak runtime mencegah daftar/soal/terminal malformed dan ACK berulang masuk ke state. Metadata policy/saved_at/checksum dipertahankan; recovery tambahan yang rusak tidak memblokir canonical resume. Pembukaan terkunci sinkron dan memakai timeout/abort/generation; pesan sesi tidak tersembunyi di player. Dialog ambil alih menjelaskan konsekuensi. Reload pada pengumpulan belum pasti mempertahankan instance aktif, edit lock dan request_id yang sama; respons lama tidak menurunkan epoch atau membuka kembali sesi final. Operasi submit/pindah perangkat/reload diselaraskan dan deadline mengikuti respons server.

Canvas memvalidasi ID unggahan, menjaga draf saat gagal, mengabaikan callback setelah unmount dan menangani pointer terputus. Bantuan pengawas memiliki loading/error/retry dan receipt yang divalidasi tanpa menghapus isian pada kegagalan. Hasil menyediakan kembali ke daftar sesudah finalisasi dan bukti untuk graded. Jadwal/PIN/kartu dirapikan; header/menu/teks/modal beradaptasi pada layar sempit dan pendek. Ujian closed tanpa attempt tidak menyediakan form mulai.

Validasi: 448 tes lulus/3 dilewati; lint/typecheck/build, browser fixture produksi dengan 43 ujian/70 soal, lima tipe jawaban, uncertain reload/retry, preflight, canvas, keyboard/axe, 320–1440px, orientasi/layar pendek dan teks 200%. API tulis browser disimulasikan tanpa menjalankan ujian atau mengubah jawaban siswa produksi. Bukti dan batas: `docs/student-page-audit.md`.

## Audit Otomasi dan backup — 4 November 2026

Inventaris tetap **23 halaman**. `/dashboard/jobs` tetap hanya Admin konteks staf. Panel Jobs dipisahkan dari Pengaturan/Audit, dan halaman mengimpor panelnya langsung. Semua tindakan lama dipertahankan: backup manual, retry, pembatalan backup, rekonsiliasi reminder, manifest/ZIP/bagian serta catatan latihan pemulihan. Tidak ada perubahan skema, dependency, role/RLS atau penjadwal; tidak diperlukan migrasi database.

Daftar/status/receipt divalidasi; pembacaan single-flight memakai timeout, abort dan generation. Polling dijeda saat halaman tersembunyi/offline dan saat konfirmasi/bagian backup dibuka. Pengunci sinkron serta fieldset mencegah tindakan ganda/perubahan isian pending; draf gagal tetap tersedia. Request_id backup identik dipertahankan saat hasil belum pasti, termasuk bila tindakan lain dijalankan. Sukses tulis dengan gagal refresh dibedakan dari gagal simpan.

Pencarian/filter jenis/status dan pagination 10 baris hanya mencakup maksimal 100 pekerjaan terbaru; waktu WIB, label status Indonesia, progres dan jumlah percobaan tampil jelas. Guard tindakan selaras dengan cancelled/retention_pending/retired dan reminder uncertain. Ringkasan kondisi layanan menampilkan jumlah tindak lanjut; rincian pemeriksaan dapat dibuka sesuai kebutuhan. Daftar pekerjaan menjadi kartu pada mobile dan tetap tabel pada desktop. Modal konfirmasi menjelaskan konsekuensi sesuai tindakan. Modal bagian membersihkan data lama, mengabaikan respons terlambat dan menyediakan loading/error/empty. Nomor unduhan divalidasi sebagai integer aman; prefix organisasi/job dan pemetaan error RPC dipertahankan. Total **33 penggunaan Dialog pada 20 komponen**; formulir latihan tetap inline.

Validasi: 430 tes lulus/3 dilewati, lint/typecheck/build lulus, pengujian browser 320–1440px, orientasi/layar pendek, teks 200%, axe dan pageerror. API tulis browser disimulasikan, tanpa membuat backup/email/bukti latihan produksi. Rincian temuan, alur, kode dan batas pada `docs/jobs-page-audit.md`.

## Feedback dan kondisi aplikasi — 4 November 2026

Inventaris tetap **23 halaman**. Komponen status bersama mencakup Empty, Loading, Error, Offline, Slow Network, No Search Result, Permission Denied, Session Expired, Validasi Form dan Success. Integrasi pada 112 pesan status, 33 formulir dan 12 tampilan kosong; loading/error boundary root/dashboard/global serta dialog bersama ikut diperbarui. Pemberitahuan koneksi tidak menutup kontrol ujian dan tidak menghapus draf atau melakukan retry mutation baru.

Status offline mengikuti browser; respons tertunda 8 detik menampilkan panduan menunggu. Perubahan halaman membersihkan pemberitahuan akses lama. Respons 401/403 pada area privat diperiksa melalui **GET `/api/auth/session`** yang bersifat read-only, private/no-store, menggunakan pemeriksaan `getUser` server dan hanya mengembalikan status autentikasi tanpa identitas/token. Gangguan layanan Auth tidak dinyatakan sebagai sesi kedaluwarsa. Masuk kembali memakai tab baru, lalu pengguna dapat memeriksa sesi lagi; actor/RLS/izin API tetap berlaku.

Enam halaman Admin menampilkan Permission Denied dan tautan kembali bagi peran yang tidak berhak, tanpa memuat komponen/data privat. Validasi native/handler bisnis tetap berlaku; ringkasan isian invalid dapat diklik untuk fokus dan diperbarui saat isi/struktur form berubah. Sukses eksplisit memakai konfirmasi visual, sedangkan antrean dan hasil belum pasti tetap informatif. Tidak ada skema, role, dependency atau migrasi database baru. Rincian pengujian dan batas pada `docs/feedback-states.md`.

## Audit aktivitas — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/audit` hanya Admin dalam konteks staf; tidak menyediakan tambah/ubah/hapus log. `SystemPanel` mempertahankan API komponen, dengan `AuditPanel` terpisah dari Jobs/Pengaturan. API audit memvalidasi page integer, rentang waktu, respons runtime, jumlah dan ID unik sebelum render. RLS, tenant, RPC `system_command` dan struktur data dipertahankan. Migrasi `audit_stable_order` menambahkan ID DESC pada pemilihan dan agregasi audit untuk memastikan urutan timestamp yang sama stabil, tanpa mengubah tindakan lain atau isi log.

Pencarian/filter memakai debounce, timeout/abort dan generation. Loading/error/empty serta muat ulang terpisah; total yang gagal dibaca tidak dinyatakan nol. Pagination 50 baris mengoreksi halaman di luar batas. Input dan tampilan WIB eksplisit; CSV ISO UTC. Tabel bergulir secara lokal dengan kolom waktu sticky. Modal Detail hanya menampilkan field catatan yang sudah tersedia, tetap memakai focus trap/pengembalian fokus dan batas viewport. Total penggunaan dialog kini **32 pada 20 komponen**.

Ekspor membekukan filter/batas atas waktu saat mulai, maksimal 10.000 baris/200 halaman/120 detik. Setiap halaman diperiksa; data kosong tak konsisten, ID duplikat atau total berubah menolak unduhan. Lock, cancel, cleanup, CSV escaping/formula guard dan pelepasan object URL mencegah pengiriman ganda/berkas parsial yang diketahui. Tidak mengklaim snapshot transaksi. Bukti dan batas pengujian pada `docs/audit-page-audit.md`.

## Penyelarasan UI dan UX seluruh halaman — 2 November 2026

Inventaris tetap **23 halaman**. Komponen bersama diperbarui untuk hierarki judul, jarak konten, kelompok pencarian/filter, dan dialog. Seluruh 31 penggunaan dialog pada 19 komponen menerima pembaruan bersama. Dialog Radix mempertahankan portal, focus trap, pengembalian fokus, kontrol penutupan serta penguncian selama simpan. Area formulir tetap dapat digulir pada layar pendek; tabel mempertahankan area gulir sendiri. Tidak ada perubahan skema, API, hak akses, struktur data atau aturan penilaian; tidak diperlukan migrasi database.

Judul halaman menjelaskan alur utama secara singkat. Petunjuk pengguna tentang snapshot, engine, ledger, worker dan hash diganti dengan bahasa tindakan atau konsekuensi yang relevan. Panduan keamanan dan uji koneksi AI tersedia dalam pengungkapan terpisah; persetujuan pengiriman data tetap terlihat dan checkbox memakai baris sentuh yang sesuai. Peringatan kehilangan draf, biaya AI, penyimpanan belum pasti, batas akses, data publik dan keterbatasan SEB tetap tersedia.

Cakupan: Beranda, Masuk, Atur password, portal Siswa, portal Pengawas, Ringkasan, Pengguna, Data master, Bank soal, Persiapan, Ujian, Monitoring, Ruang/sesi, Kartu, Media, Koreksi/moderasi, Hasil, Analitik, Fitur lanjutan, Penerimaan operasional, Pengaturan, Audit dan Otomasi/backup. Halaman yang tidak memerlukan perubahan khusus menerima penyelarasan melalui CSS dan komponen bersama. Bukti dan batas validasi dicatat pada `docs/global-ui-cleanup.md`.

## Audit Pengaturan aplikasi — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/settings` hanya Admin dalam konteks staf. Formulir pengaturan dipisahkan dari daftar audit/job tanpa mengubah API `system_command`, CAS/version, Vault, branding publik atau scheduler. Tidak diperlukan migrasi database, dependency maupun endpoint baru.

Pembacaan memakai kontrak runtime, timeout, abort dan generation; loading/error/coba ulang terpisah. Draf umum terpisah dari status server/kredensial. Muat ulang draf meminta konfirmasi. Lock sinkron dan fieldset disabled mencegah submit bersamaan serta perubahan isian saat pending. Konflik409, hasil tak pasti atau refresh setelah simpan gagal mengunci perubahan sampai status diperiksa, tanpa retry mutation otomatis.

Penyimpanan secret tidak membuang draf umum atau menaikkan versi CAS draf secara diam-diam. Input password dikosongkan setelah ACK valid, pergantian jenis, discard atau hasil secret yang tidak pasti; nilai tidak dibaca kembali. Pilihan kunci AI lama tetap kompatibel, dengan tautan ke penyedia aktif di `/dashboard/advanced`. Pengingat yang sudah aktif tetap dapat dinonaktifkan ketika worker SMTP tidak tersedia.

Uji SMTP memakai konfigurasi tersimpan dan memerlukan worker, sender serta App password. ACK pembuatan job tidak ditampilkan sebagai keberhasilan koneksi; hasil diarahkan ke `/dashboard/jobs`. Request_id dipertahankan saat percobaan yang sama belum pasti dan dipisah ketika versi/sender atau kredensial berubah. Uji tidak mengirim pesan. Identitas, kebijakan, email/template dan kredensial dikelompokkan, kontrol reflow mobile, tautan diberi penanda visual dan dialog tetap berbatas viewport.

API memvalidasi konfigurasi serta receipt mutasi, menolak null/false/malformed ACK dan menyamarkan detail SQL/transport. Respons secret hanya metadata, bukan nilai. RLS/grant, kebijakan branding gambar publik, CAS dan audit tetap dipertahankan. Metadata produksi diperiksa read-only; tidak ada secret, pengaturan produksi, email atau job nyata dibuat dalam QA. Bukti uji dan batas ada di `docs/settings-audit.md`.

## Audit Ruang, sesi dan pengawas — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/rooms` hanya Admin dalam konteks staf; API pembacaan rooms dan seluruh mutasi ruang/sesi/roster/penugasan memeriksa hak yang sama sebelum RPC. Batas organisasi, kapasitas nol tanpa batas, roster peserta yang sudah mulai terkunci, penugasan efektif dan perlindungan riwayat tetap berlaku.

Tampilan ruang dipisahkan dari aturan kolom checkbox monitor. Ada ringkasan, pencarian ruang/sesi/pengawas, pagination 25 dengan clamp, empty/loading/error state dan daftar sesi responsif. Penghapusan ruang/sesi yang masih dirujuk dijelaskan dan dinonaktifkan pada UI; database tetap otoritatif. Penugasan memerlukan ruang/sesi/staf aktif, pengganti mengecualikan pengawas asal, pencabutan hanya ditawarkan bila ada pengganti yang belum dicabut.

Dialog memakai judul dan identitas sasaran; roster memiliki pencarian, pagination 25, pilihan unik maksimal 500, pilih hasil dan kosongkan. Pilihan bertahan antarhalaman/pencarian dalam dialog dan dibersihkan ketika dialog dibuka kembali. Muatan/waktu divalidasi, isian serta penutupan dikunci selama submit. Hasil tak pasti/konflik meminta pemeriksaan daftar; request_id tetap untuk payload sama, tanpa retry mutation otomatis.

Waktu sesi dan periode pengganti ditampilkan/diisi sebagai WIB, dikonversi eksplisit ke UTC, tidak mengikuti zona waktu perangkat. Pembacaan memakai kontrak/abort/generation/single-flight yang sudah ada dan polling dijeda saat dialog. API menolak peserta duplikat, receipt salah, acknowledgement saved:false serta akses non-Admin.

Migrasi `rooms_audit` memperbaiki update sesi yang tidak menemukan target: kini konflik, bukan receipt sukses palsu. Hanya definisi fungsi terkait yang diubah; data, ledger, grant, RLS, audit, idempotensi dan struktur tabel dipertahankan. Pengujian staging/isolasi, browser dan regresi monitor dijelaskan di `docs/rooms-audit.md`.

## Audit Kartu peserta — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/cards` mempertahankan akses Admin/Guru dalam konteks staf, dan komponen kartu bersama tetap tersedia bagi pengawas efektif melalui `/supervisor`. Cakupan peserta, kepemilikan job, RLS, bucket privat, lease dan batas retry tetap ditentukan RPC `card_command`; kata sandi/PIN tidak dicetak.

Pembacaan opsi/peserta/job memvalidasi respons, membatasi waktu, membatalkan permintaan usang dan mencegah polling tumpang tindih. Error peserta dan job dipisahkan; kegagalan daftar job mempertahankan snapshot terakhir dengan peringatan. Pagination lokal 50 peserta, pilihan unik maksimal 500 PDF/50 ZIP, pencarian/pergantian ujian mengosongkan pilihan. Penggantian format tidak diam-diam memangkas pilihan. Kontrol dikunci selama mutation dan request_id pembuatan dipertahankan pada hasil tidak pasti.

API memperoleh claim/lease sebelum menjadwalkan worker. Job berjalan/siap dilaporkan sesuai keadaan tanpa worker pesaing; penolakan akses dan batas retry tidak dianggap sukses. Receipt kosong/null dan signed URL tidak tersedia ditangani, detail SQL disamarkan. Unduhan tetap memeriksa izin terbaru dan memakai URL privat 60 detik. Worker memvalidasi snapshot, memuat CSS sekali per job, membatasi ZIP mentah/artifak 50 MiB dan penjadwalan batch 180 detik.

Kontrol, identitas panjang, checkbox, pagination dan kartu status dirapikan untuk viewport kecil, fokus keyboard dan pembaca layar. Tidak ada halaman, endpoint, dependency atau migrasi database baru. Rincian temuan, kode dan validasi ada di `docs/cards-audit.md`.

## Audit Media soal — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/media` tetap untuk Admin/Guru dalam konteks staf; Admin dapat mengelola media dalam organisasi dan impor Drive, Guru tetap pada media/cakupan RLS miliknya. Berkas bersifat immutable: perubahan memakai unggahan baru, bukan overwrite. Penghapusan tetap ditolak bila media direferensikan soal, bank soal, snapshot, branding, logo atau laporan; proteksi backup tetap berlaku.

Migrasi `20261102022942_media_search_audit.sql` memperbaiki konflik alias m pada fungsi daftar, menerapkan pencarian ID/path literal sebelum pagination, serta urutan created_at/id deterministik. Nama asli unggahan lokal lama tidak tersimpan, sehingga label pencarian disesuaikan tanpa mengarang atau mengubah struktur data. Cleanup_done kini menolak penutupan tiket selama objek Storage masih ada. Admin mempertahankan akses baca terhadap target cleanup berizin setelah metadata dihapus melalui helper proteksi yang sudah ada; grant dan RLS tidak dibuka untuk publik.

UI memakai kontrak respons, abort/sequence/single-flight, debounce dan clamp halaman. Error daftar dan cleanup dipisah; kegagalan cleanup tidak menutup daftar media valid. Lock sinkron mencakup unggah/drop, hapus, cleanup dan Drive, dialog tidak ditutup selama mutation. Batch lokal maksimal 25, tipe/ukuran diperiksa sebelum kirim; unggah berhenti pada hasil tak pasti dan meminta pemeriksaan daftar. Pratinjau menangani gagal muat/putar dan coba ulang, renewal URL tidak mengganti audio aktif atau posisi jedanya. Clipboard yang tidak tersedia ditangani tanpa JavaScript error.

API memvalidasi page/UUID/multipart, menolak receipt kosong dan menyamarkan detail SQL. Hapus/cleanup hanya menyatakan bersih setelah acknowledgement path valid; kegagalan Storage/transport/ack tetap pending. Pencatatan unggah yang hasilnya belum pasti tidak menghapus bytes yang mungkin sudah terdaftar. Drive tetap Admin-only, folder server, 5 MiB, 25 pilihan, deduplikasi berbasis sumber+hash; ada anggaran waktu batch dan timeout klien yang sesuai.

Galeri/tabel, sticky header/identitas, wrapping path, kontrol unggah/pencarian, pagination, dialog dan daftar Drive/cleanup dirapikan untuk mobile. Tidak ada halaman, endpoint atau dependency baru; struktur tabel/data bisnis dan fitur lama dipertahankan. Bukti uji/migrasi dan batas ada di `docs/media-audit.md` serta PR terkait.

## Audit Peninjauan/monitoring ujian — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/monitor` tetap hanya Admin/Guru dalam konteks staf; `/supervisor` mempertahankan komponen monitoring bersama dalam konteks pengawas efektif. R/C/U tindakan tetap melalui ops_command/workflow_command, tanpa D bukti/jawaban/audit. Dispensasi waktu hanya Admin, bantuan hanya petugas berizin; Guru tanpa tugas efektif tetap read-only pada peserta terkait. Pengelolaan ruang/sesi/penugasan tetap hanya Admin.

Pembacaan options/monitor/ruang, sinyal, bantuan dan riwayat memakai kontrak runtime, batas waktu dan pembatalan saat lifecycle berubah. Monitor dan bantuan single-flight, respons ujian/riwayat lama ditolak, opsi gagal memiliki coba ulang. Nilai version/pending/deadline null bagi peserta tanpa attempt ditangani. Kegagalan baca tidak dianggap hasil kosong/sehat. Pagination lokal dikoreksi saat data menyusut; pilihan dibersihkan saat filter/ujian berubah, dibatasi 500, sedangkan tindakan tetap maksimal 100 attempt.

Dialog mengambil snapshot ID/version saat dibuka, menjeda polling terkait, mengunci isian/submit/penutupan selama pending dan mempertahankan request_id untuk payload yang sama. Tombol mengikuti transisi status: unlock hanya diskualifikasi, disqualify hanya aktif; reset mempertahankan bukti dan deadline sesuai SQL lama. Hasil tidak pasti/konflik meminta tutup dan pemeriksaan ulang; tidak ada retry mutation otomatis. Notifikasi memvalidasi sasaran terpilih dan menampilkan jumlah penerima. Riwayat pesan/kejadian memiliki loading/error/coba ulang tanpa isi dialog sebelumnya.

API mewajibkan ujian/attempt pada pembacaan terkait, menolak attempt duplikat dan rentang waktu tidak valid, mempertahankan alasan, konfirmasi, CAS, idempotensi dan batas database. Error SQL/transport disamarkan, konflik 409 dan respons RPC kosong tidak dianggap sukses. SSE memeriksa token, membersihkan channel/timer saat batal/gagal dan menangani rejection heartbeat; polling 5 detik tetap menjadi fallback. Tabel memakai scroll internal dan sticky identitas/header, toolbar/dialog reflow mobile, panduan panjang dilipat dan waktu pembaruan terlihat. Tidak ada migrasi database, dependency, endpoint atau halaman baru. Rincian uji dan batas ada di `docs/monitor-audit.md`.

## Audit Analitik dan laporan — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/analytics` mempertahankan hak staf sesuai can_grade, publikasi dan kop hanya Admin, tanpa perubahan ledger, struktur database atau API bisnis. Tidak diperlukan migrasi database, Edge Function maupun dependency baru.

Analisis memakai hasil final terbaru per siswa per ujian, membandingkan waktu sebagai instant dengan presisi mikrodetik dan tie-break ID. Nilai non-finite/tidak lengkap dikecualikan; rumus P, D, kelompok 27%, batas kategori dan pemisahan versi soal dipertahankan. Sebaran BS menyamakan boolean/string sesuai ekstraksi teks PostgreSQL, PG harus berbentuk array, label pasangan seperti __proto__/constructor dihitung dalam map tanpa prototype dan tetap utuh setelah validasi respons.

Analisis ditandai basis pilihan/revisi dan dibersihkan ketika pilihan/koreksi berubah atau permintaan baru dimulai. Error menyediakan coba ulang tanpa menampilkan statistik lama. Halaman memprioritaskan tindakan analisis dan jenis ekspor analitik, menampilkan nama ujian/versi, ringkasan hasil layak/dikecualikan, panduan sampel kecil, pencarian, filter lima tipe dan pagination 20 butir. Detail dirender saat dibuka; daftar peserta diperluas bertahap. Tabel memiliki scroll internal dan wrapping pada layar kecil.

API memvalidasi detail sebelum analisis, menormalisasi ID duplikat dan membatasi pembacaan 15 detik; izin RPC tetap berlaku. PDF/XLSX analitik menyertakan identitas ujian; XLSX mempertahankan isi soal panjang dan proteksi formula. Batas data worker 30 MB dihitung sebagai byte UTF-8. Delapan jenis laporan, revisi snapshot, kepemilikan job, lease dan audit tetap dipertahankan. Rincian temuan dan bukti validasi ada di `docs/analytics-audit.md`.

## Audit Hasil dan koreksi — 2 November 2026

Inventaris tetap **23 halaman**. `/dashboard/results` dan komponen bersama `/dashboard/analytics` mempertahankan R/C/U penilaian dalam can_grade, publikasi hanya Admin, kop laporan hanya Admin, tanpa D ledger. Koreksi tetap memanggil RPC results_command dengan expected_revision dan request_id, tanpa mengganti snapshot soal atau engine nilai. Rubrik per kriteria tetap melalui ruang koreksi/moderasi yang tersedia.

Daftar/detail, filter, kop, job, AI dan lampiran memakai validasi kontrak, batas waktu serta penjagaan lifecycle. Respons list lama ditolak dan error tidak dianggap data kosong. Pilihan dibatasi 500, dipertahankan antar halaman, dibersihkan saat filter berubah; pagination dikoreksi setelah jumlah hasil menyusut dan pilihan ujian aktif tetap memiliki opsi. Operasi memakai lock sinkron, fieldset dan pencegahan tutup modal selama pending. Hasil tak pasti/konflik diarahkan ke refresh terkoordinasi sebelum pengiriman ulang; tidak ada retry mutation otomatis.

Detail/manual tidak bergantung pada suksesnya pembacaan penyedia AI. Nilai kosong tetap pending; nol sah; nilai bukan angka/di luar batas ditolak. Alasan revisi nilai lama kini memiliki field dan validasi sesuai aturan database. AI hanya untuk esai non-rubrik dengan penyedia aktif; saran kedaluwarsa atau peserta diskualifikasi tidak dapat disetujui dari UI. Canvas dan lampiran memiliki feedback gagal/coba ulang.

Koreksi batch membaca detail maksimal empat permintaan bersamaan dan berhenti menjadwalkan saat gagal/unmount; pilihan soal dibedakan menurut ID dan versi snapshot, mengeluarkan diskualifikasi/rubrik kriteria dari koreksi sederhana. Publikasi meminta konfirmasi bahwa efeknya mencakup seluruh peserta pada ujian terkait, bukan hanya baris dicentang; hasil parsial antar ujian dilaporkan dan sisa pengiriman dihentikan saat gagal. Pengaturan kop memakai draft yang dibuang bila dibatalkan. Poll job single-flight mempertahankan status terakhir saat gagal; unduh tetap memeriksa akses server.

API memvalidasi page/JSON/ukuran byte, pasangan nilai unik, revisi wajib untuk rekalkulasi, nilai edit AI wajib dan publikasi Admin sebelum RPC. Respons kosong/transport gagal tidak dianggap sukses, SQL internal disamarkan dan worker tidak dijadwalkan tanpa ID laporan valid. API/receipt bisnis, private ledger, laporan PDF/XLSX, kepemilikan job, audit dan lease/version pinning tetap dipertahankan. Tidak ada halaman, role, dependency, migrasi database atau Edge Function baru. Tabel sticky/scroll internal, reflow toolbar/dialog dan feedback disempurnakan; batas uji ada di `docs/results-audit.md`.

## Audit Ujian dan bank soal — 1 November 2026

Inventaris tetap **23 halaman**. `/dashboard/exams` tetap bagi Admin/Guru konteks staf: Admin mengatur jadwal, PIN, konfigurasi lima tipe, kelas, periode dan arsip ujian; Guru mengelola soal hanya pada ujian yang berizin melalui RLS/RPC. Tidak ada D permanen. Aturan penguncian setelah mulai/ditutup/diarsipkan, periode Guru, kuota, lampiran dan immutable version serta snapshot sesi ujian tetap dipertahankan.

GET `/api/authoring` memvalidasi ID sebelum query dan mengambil seluruh halaman ujian/referensi/versi dengan urutan stabil dan deadline. Kegagalan dependency atau versi saat ini yang hilang tidak disamarkan sebagai bank kosong. Referensi nonaktif tetap dikenali untuk jadwal lama; server memvalidasi referensi aktif saat menyimpan. POST tetap memakai `authoring_command` dan format hasil lama; periode aktif divalidasi, batas body diperiksa dalam byte, operasi Admin ditolak lebih awal dari Guru, respons mutasi kosong/transport gagal diperlakukan tidak pasti.

UI memakai transport bounded, validasi kontrak, abort/sequence/live guard, lock sinkron, snapshot konteks dan pemulihan error. ID request editor terikat isi/versi/ujian; ID impor terpisah dan preview dihapus saat berganti ujian. Pergantian tipe saat edit mempertahankan question_id dan expected_version serta isi bersama, sehingga tetap membuat versi pada soal yang sama. Hasil impor tetap per blok, maksimal 500 soal / 5 MB, satu refresh setelah penyimpanan. Pilihan dipangkas setelah refresh; halaman soal dikoreksi setelah arsip, dengan konfirmasi. Status efektif mengikuti jam server; aksi penyusunan mengikuti lock, pratinjau/riwayat tetap tersedia. Upload/preview lampiran dibatasi waktu; modal tidak dapat ditutup saat operasi pending.

Tabel ber-scroll internal, toolbar dan dialog reflow, wrapping dan kontrol sentuh disempurnakan. Tidak ada halaman, role, dependency, migrasi database atau deployment Edge Function baru. `/dashboard/bank` tetap modul pustaka bank lintas ujian terpisah. Detail dan batas uji ada di `docs/exams-audit.md`; browser memakai fixture API tanpa mutasi data akademik produksi.

## Audit Data master — 1 November 2026

Inventaris tetap **23 halaman**. `/dashboard/master-data` tetap R dalam cakupan RLS bagi Admin/Guru konteks staf; seluruh C/U kelas, mapel, penugasan dan keanggotaan hanya Admin. Pengarsipan master memakai active=false, tanpa D permanen atau perubahan otomatis pada riwayat ujian/tautan yang sudah ada. Daftar keanggotaan siswa kini menampilkan hasil alur Siswa → kelas yang sudah tersedia di API; statusnya dapat diperbarui oleh Admin melalui operasi enrollment lama.

GET `/api/admin/master` mengambil seluruh halaman referensi dengan urutan ID, filter organisasi, RLS dan deadline; error pengguna tidak disamarkan sebagai array kosong. Nama referensi nonaktif ikut dibaca sesuai izin agar riwayat dapat dikenali, tetapi pilihan penugasan baru hanya pengguna/kelas/mapel aktif. POST memvalidasi payload sebelum mengakses field; aktivasi memeriksa role, organisasi dan referensi aktif, sedangkan penonaktifan tautan tetap diizinkan untuk pembersihan referensi nonaktif. Kontrak arrays, hasil id/saved, endpoint, scope dan audit database lama dipertahankan.

UI memvalidasi respons, membatasi waktu, membatalkan pekerjaan klien saat unmount dan menolak respons lama. Lock sinkron melindungi simpan/toggle/massal; kind dan isian ditangkap sebagai snapshot, pesan terpisah per operasi. Kegagalan refresh mempertahankan data terakhir bertanda dengan perubahan dinonaktifkan; halaman kosong dikoreksi setelah hasil berubah. Daftar guru dan siswa memiliki pencarian/pagination lokal 20 baris serta label referensi yang jelas.

Tambah massal tetap maksimal 100 nama, kini melalui pratinjau/konfirmasi, validasi panjang/duplikat, laporan per baris dan satu refresh setelah rangkaian selesai. Hasil tak pasti/sesi/izin/rate-limit menghentikan sisa pengiriman; baris yang belum dikirim ditandai. Transport memakai helper bersama dengan Halaman Pengguna, mempertahankan API userRequest dan pesannya agar tidak membuat fungsi fetch duplikat. Tidak ada retry mutation otomatis atau klaim pembatalan efek server yang sudah berjalan.

Tabel ber-scroll internal dengan header/kolom identitas sticky, dialog bounded, fokus dan reflow mobile dipertahankan/disempurnakan. Tidak ada migrasi database, endpoint, dependency atau deployment Edge Function baru. Detail dan batas uji ada di `docs/master-data-audit.md`; seluruh mutation browser memakai simulasi, bukan mengubah data akademik produksi.

## Audit Pengguna — 1 November 2026

Inventaris tetap **23 halaman**. `/dashboard/users` tetap bagi Admin/Guru konteks staf. Admin C/R akun, U nama/status, arsip/nonaktif dan kirim ulang undangan; Guru C siswa berkelas dalam penugasan dan R/U nama siswa berizin. Tidak ada D permanen, pengubahan password, peran, username atau email melalui edit. GET daftar tetap RLS dengan filter organisasi, 20 baris per halaman; pencarian underscore literal, filter/sort dan pemulihan halaman setelah jumlah hasil berkurang dipertahankan/diperbaiki. POST memvalidasi operasi/ID/isian dan menolak operasi Admin dari Guru sebelum meneruskan gateway; gateway tetap memeriksa kewenangan dan kelas.

Daftar/kelas/kelayakan undangan memakai deadline, pembatalan dan validasi envelope/payload; kegagalan kelas terlihat dan dapat dimuat ulang. Operasi perubahan dan pratinjau memiliki lock sinkron; modal perubahan tidak ditutup di tengah request. Hasil mutation tidak pasti tidak dikirim ulang otomatis: form dikunci dan Admin diarahkan memeriksa daftar/inbox. Undangan tidak dapat tertukar antar akun saat respons lama datang; status kelayakan diperiksa ulang, cooldown lokal melengkapi cooldown/budget server yang tetap otoritatif.

Impor tetap TSV maksimal 200 baris dengan pratinjau server dan laporan per baris. Jumlah kolom serta duplikat username/email diperiksa; hasil pemeriksaan server yang hilang tidak dianggap valid. Impor berjalan berurutan, berhenti pada hasil tak pasti/sesi kedaluwarsa/izin/rate limit dan menandai baris yang belum dikirim. Unmount menghentikan pengiriman berikutnya. Unduhan referensi kelas/hasil menetralkan formula spreadsheet tanpa mengubah data aplikasi.

UI memakai label peran Indonesia, dialog konfirmasi status/arsip, feedback terpisah per operasi, tabel ber-scroll internal dengan kolom username sticky, serta wrapping dan kontrol sentuh. Header mobile tetap terbaca pada teks 200%, tombol aksi tidak tertutup kolom sticky, dan fokus setelah simpan/status kembali ke judul daftar. API, RLS, mekanisme invite Auth/profil/enrollment, budget, aturan Admin aktif terakhir dan semua fitur lama dipertahankan. Tidak ada skema atau migrasi database/Edge Function baru. Pembuatan akun lintas Auth/profil bukan transaksi tunggal dan UI tidak mengklaim exactly-once lintas tab/perangkat; hasil parsial tetap memerlukan pemeriksaan Admin. Rincian dan batas validasi ada di `docs/users-audit.md`; pengujian undangan/mutation memakai simulasi dan tidak mengirim email operasional.

## Audit Ringkasan madrasah — 1 November 2026

Inventaris tetap **23 halaman**. `/dashboard` tetap R ringkasan untuk Admin/Guru konteks staf, tanpa C/U/D data akademik. Page memeriksa konteks sebelum mengambil ringkasan, selain pagar layout; siswa/pengawas dialihkan ke portal masing-masing. Total Admin memakai client/RLS yang sama dengan filter organisasi eksplisit, tetap menghitung seluruh data termasuk nonaktif. Gagal/null/timeout ditampilkan sebagai tidak tersedia, bukan nol; kegagalan satu total tidak mematikan total lainnya. Tidak ada API, role, skema atau migrasi database baru.

Agenda memakai GET `/api/workflow` dan koreksi Guru GET `/api/results?state=pending&page=1` yang sudah ada. Snapshot divalidasi, mempunyai deadline 15 detik, pembatalan saat unmount dan tombol pembaruan yang tidak bertumpuk. Kegagalan pembaruan mempertahankan data terakhir dengan penanda; error teknis backend tidak ditampilkan mentah. Status Berlangsung/Draf/Terjadwal/Selesai tetap bersumber dari backend, bukan jam perangkat. Hitungan selesai mencakup Selesai, Dinilai dan Dipublikasikan; seluruh kartu/agenda mengecualikan arsip. Enam agenda teratas diurutkan berdasarkan prioritas dan waktu absolut, disertai jumlah total, waktu snapshot WIB dan empty state khusus semua arsip.

UI tetap mempertahankan identitas hijau, pintasan peran, statistik, agenda, koreksi dan bantuan. Hierarki judul, wrapping, kartu adaptif, target sentuh, feedback dan fokus setelah menu ditutup saat orientasi berubah diperbaiki. Layar pendek/zoom memakai scroll dokumen alami agar tidak memotong konten. Sidebar desktop pendek dapat di-scroll seluruhnya agar navigasi dan tombol keluar tetap terjangkau meski nama akun panjang. Detail dan batas pengujian dicatat dalam `docs/dashboard-audit.md`; browser memakai komponen produksi dengan data/API simulasi, bukan UAT akun produksi.

## Audit Atur password akun — 1 November 2026

Inventaris tetap **23 halaman**. `/auth/reset` adalah halaman publik, tetapi U password tetap wajib memakai sesi terverifikasi. GET `/api/auth/password` hanya R readiness sesi (private/no-store, tanpa identitas akun). POST password dan aktivasi tetap same-origin; struktur data, peran dan panjang 12–128 karakter dipertahankan. Tidak ada CRUD akademik atau migrasi database.

Aktivasi fragment single-flight, token dibersihkan sebelum request, callback kode/email diteruskan ke handler lama dan marker nonrahasia mencegah fallback tidak sengaja ke sesi lama saat tautan gagal/di-refresh. Form menunggu sesi sah, memakai POST native, lock/deadline/no retry otomatis, validasi konfirmasi serta feedback hasil pasti/tidak pasti. Setelah sukses password dibersihkan dari input dan form dikunci. Audit gagal tidak melewatkan upaya global signout; flag additive signed_out menyatakan pengakhiran sesi terkonfirmasi/tidak pasti tanpa mengulang mutation.

UI memakai card berbatas lebar, toggle password, fokus/alert yang aksesibel serta bantuan/footer yang konsisten. Scroll alami dan dialog bounded menjaga konten tetap terjangkau pada layar pendek/zoom. Rincian dan batas validasi ada di `docs/password-reset-audit.md`; pengujian autentikasi memakai simulasi, tidak mengubah password produksi.

## Audit Login dan bantuan pemulihan — 1 November 2026

Inventaris tetap **23 halaman**. `/login` tetap publik: C sesi melalui username/password/konteks dan C permintaan pemulihan; bukan registrasi akun atau CRUD akademik. Tidak ada perubahan endpoint, database, rate limit, RLS atau aturan hak akses. Tidak diperlukan migrasi.

Form memakai satu lock login/pemulihan, validasi username bersama backend, pembacaan nilai autofill aktual, POST native, timeout klien 35 detik/no retry, validasi envelope dan destination tetap sesuai konteks. Password tidak dinormalisasi atau disimpan; penyimpanan username bersifat opsional dan kegagalannya tidak menghalangi login. Modal pemulihan boleh ditutup/dibuka lagi tanpa pengiriman ganda, mempertahankan hasil dan fokus. Respons tetap generik untuk menjaga privasi keberadaan akun.

Kegagalan aktivasi dari query whitelist ditampilkan dengan pesan aman. Branding memiliki deadline 6 detik dan fallback nilai/logo. UI mempertahankan identitas aplikasi, menambah navigasi Beranda/Bantuan dan feedback aksesibel. Layar pendek memakai scroll dokumen alami; dialog tetap dibatasi viewport. Rincian temuan dan batas uji ada pada `docs/login-audit.md`; API autentikasi disimulasikan dalam pengujian browser.

Audit LOGIN pada identity-gateway kini memakai organisasi profil akun, bukan ID statis. Perubahan hanya berlaku untuk pencatatan login baru; riwayat audit lama tidak ditulis ulang. Verifikasi JWT gateway dan pemeriksaan sesi/peran tetap mengikuti konfigurasi lama.

## Audit dan penyempurnaan Beranda — 1 November 2026

Inventaris tetap **23 halaman**. Beranda `/` adalah halaman publik R informasi saja; tidak memiliki CRUD akademik, daftar peserta, data nilai atau permintaan database. Pemberitahuan statis “ujian belum dibuka” dihapus karena tidak bersumber dari konfigurasi layanan. CTA masuk dan bantuan dipisahkan dengan hierarki yang jelas; panduan peran bersifat informatif dan tidak menggantikan pemeriksaan hak akses pada login/API.

`ActivationRedirect` tetap menangani undangan fragment melalui `/auth/reset`, serta mengenali kode PKCE dan token hash invite/recovery melalui `/auth/confirm`. Callback rusak/error menampilkan pesan umum tanpa nilai penyedia/token, membersihkan parameter autentikasi dari URL, dan menyediakan arahan ke bantuan/login. Perubahan fragment/history pada halaman yang sama diproses dengan listener yang dibersihkan saat unmount. Tidak mengubah endpoint login, aktivasi, reset, sesi atau hak akses.

CSS khusus Beranda memakai kolom intrinsik yang dapat menyusut, CTA sentuh minimal 44 px, wrapping teks, satu kolom pada mobile, dan scroll dokumen alami untuk layar pendek/zoom. Dialog bantuan lama tetap dipakai. Tidak ada migrasi database. Rincian audit dan validasi ada di `docs/home-audit.md`.

## Pemantauan operasional dan pemulihan berkala — 1 November 2026

Inventaris tetap **23 halaman**. Halaman `/dashboard/jobs` (Admin) diperluas dengan heartbeat scheduler, usia backup mingguan, antrean bermasalah, indikator latihan 30 hari dan riwayat 10 latihan. Admin R kondisi organisasi aktif; C catatan latihan (ID backup, checksum, waktu/durasi, hasil, bukti, tindak lanjut), tanpa U/D. Catatan append-only, retry idempotent, audit dicatat. Guru/Pengawas/Siswa tidak memiliki akses; API `/api/operational` Admin-only, mutasi wajib same-origin dan validasi database. Tidak ada restore produksi melalui UI.

Migrasi `20261101065304_operational_recovery.sql`: tabel private heartbeat dan bukti latihan, RLS tanpa grant tabel klien, RPC berotorisasi organisasi; scheduler lama diberi heartbeat dan backup mingguan ISO week dengan dedupe/backpressure, mengikuti otomasi aktif serta mendahulukan jendela semester. Bukti latihan ikut backup organisasi. Migrasi lanjutan `20261101070855_weekly_backup_cancelled_guard.sql` memastikan backup dibatalkan tidak memblokir jadwal berikutnya atau dihitung sebagai kegagalan antrean. Tidak menambah Cron. Workflow GitHub mingguan Senin 05.00 WIB menjalankan latihan fixture terisolasi; bukti backup asli tetap dicatat terpisah setiap 30 hari. Lihat `docs/operational-monitoring-recovery.md` untuk prosedur, keterbatasan dan tindak lanjut.

## Notifikasi yang dapat ditindaklanjuti — 1 November 2026

Inventaris tetap **23 halaman**. Notifikasi di portal Siswa menampilkan judul, prioritas Informasi/Penting, isi, waktu WIB, status dibaca dan konteks ujian. Siswa R hanya pesan milik penerima dalam organisasi aktif; U dibaca satu pesan atau maksimal 20 pesan halaman saat ini. Filter belum dibaca, pagination 20, serta jumlah belum dibaca global tidak terbatas 100 pesan terakhir. Dibaca bukan bukti penyelesaian tindakan.

Tombol Lihat ujian terkait memfokuskan kartu ujian yang sedang tersedia di halaman yang sama, tanpa URL eksternal, reload, mulai/submit attempt atau pergantian sesi. Jika player aktif/kartu tidak tersedia, UI memberi petunjuk untuk menyelesaikan sesi atau menghubungi pengawas. API hanya mengembalikan identitas/judul ujian jika siswa masih terdaftar aktif dan ujian bukan draf/arsip. Pencabutan akses membuat konteks ujian tidak tersedia, tanpa membocorkan judulnya.

Admin/Guru/Pengawas tetap C notifikasi melalui Monitoring/portal Pengawas dalam cakupan penerima lama. Form baru menambah judul (1–120), prioritas dan konteks ujian opsional untuk sasaran exam/selected; sasaran all tidak membawa tautan ujian. Rate limit, request idempoten dan audit tetap berlaku. R riwayat pengiriman kini berupa kartu/status penerima berizin, bukan JSON mentah. Tidak ada hak U/D isi notifikasi.

Endpoint lama `/api/operations` diperluas dengan GET inbox_page dan POST read_batch. Tabel tetap private dengan RLS dan tanpa grant tabel langsung; RPC anonim tetap ditolak. Migrasi `20261101062737_actionable_notifications.sql` menambah metadata dan indeks serta mempertahankan kontrak array inbox/sent lama. Pesan lama default Informasi/Pesan petugas, tanpa konteks ujian. Helper latihan restore mengisi default untuk backup lama yang belum memiliki kolom baru. Tidak ada email/push/browser notification atau pengiriman pesan nyata selama implementasi. Bukti: `docs/actionable-notifications.md`.

## Penyempurnaan aksesibilitas — 1 November 2026

Inventaris tetap **23 halaman**. Dialog bersama menyimpan elemen pembuka sebelum fokus dipindahkan ke portal, mempertahankan Tab/Shift+Tab di modal, serta mengembalikan fokus saat ditutup. Jika pembuka telah dihapus, fokus diarahkan ke main yang tersedia; handler khusus pemanggil tetap dihormati. Navigasi dashboard mengumumkan judul dan memfokuskan konten utama setelah perpindahan route; tombol navigasi mobile mengumumkan status terbuka.

Kontras teks footer diperkuat, begitu pula batas kontrol/placeholder/outline fokus. Dukungan forced-colors ditambahkan; prefers-reduced-motion yang sudah ada dipertahankan. Label login/password serta pesan konfirmasi password dihubungkan ke input; mismatch ditandai aria-invalid dan alert. Esai terhubung ke keterangan panjang jawaban, sedangkan timer secara eksplisit aria-live=off agar perubahan tiap detik tidak terus diumumkan.

Tidak ada halaman, endpoint, tabel, skema, migrasi atau perubahan hak CRUD. Deadline, autosave, koreksi dan izin server tetap seperti sebelumnya. Dependency axe-core hanya untuk pengujian pengembangan; tidak diimpor oleh komponen aplikasi.

Validasi otomatis meliputi 18 scan WCAG-tag pada login/password/dashboard/player serta dialog, navigasi mobile, peta soal dan esai; keyboard skip link, perangkap/pengembalian fokus, fallback pembuka hilang, perpindahan route, aria-invalid, timer dan autosave, ukuran 320/768/1440 serta emulasi reduced-motion/forced-colors. Pemindaian tidak membuktikan kepatuhan WCAG penuh; uji manual pembaca layar/perangkat fisik masih diperlukan. Bukti implementasi: `docs/accessibility-refinement.md`.

## Pencarian dan filter yang konsisten — 1 November 2026

Inventaris tetap **23 halaman**. Sepuluh panel daftar memakai kontrol bersama: Pengguna, Data Akademik, Ujian/Soal, Bank Soal, Monitoring (termasuk portal Pengawas), Kartu Peserta (termasuk portal Pengawas), Media, Hasil/Analitik, Audit, serta antrean koreksi. Pencarian bertipe search dengan label, tombol hapus/fokus kembali, batas panjang sesuai endpoint (80/100/150), ringkasan hasil, penanda kategori filter aktif dan Reset filter bertipe button.

Perubahan filter pada daftar berhalaman kembali ke halaman pertama. Reset membersihkan pencarian/filter/urutan pada cakupan daftar; jenis data master, ujian operasional kartu/monitor, serta tampilan/template/format keluaran tidak diubah. Reset tidak mengubah data, jawaban, penilaian atau pilihan massal; tombol pilihan tetap terpisah. Hasil/Analitik dapat mereset kelas, mapel, ujian, status dan urutan ke kondisi awal.

Daftar server Pengguna, Bank, Media, Hasil dan Audit memakai jeda input 250 ms dengan pembatalan/invalidation respons lama. Status memuat, gagal dan hasil kosong dibedakan; baris lama disembunyikan selama pemuatan filter pada daftar server tersebut. Kegagalan tidak dianggap pencarian sukses tanpa hasil. Media kini mengirim pencarian nama/path berkas ke kemampuan endpoint yang sudah tersedia. Pencarian lokal memakai substring literal tanpa membedakan kapital dan mengabaikan spasi awal/akhir. Audit memvalidasi urutan tanggal sebelum permintaan.

Tidak ada halaman, endpoint, tabel, skema, migrasi atau perubahan hak CRUD baru. Query tetap melalui pemeriksaan role/organisasi/cakupan server yang sudah ada; filter UI tidak memperluas akses atau jumlah data yang diizinkan. Tidak ada persistensi/riwayat pencarian baru. Bukti implementasi: `docs/consistent-search-filters.md`.

## Pusat bantuan sesuai konteks — 1 November 2026

Inventaris tetap **23 halaman**. Tombol Bantuan membuka dialog panduan pada shell 18 halaman dashboard, portal siswa, ruang ujian/status/hasil, portal pengawas, beranda, login dan pengaturan password. Panduan awal mengikuti halaman serta konteks peran. Admin/Guru memakai peran dari shell yang sudah diotorisasi, Pengawas memakai konteks pengawasan, Siswa memakai portal/keadaan attempt sendiri, dan halaman publik menampilkan panduan akun umum.

Pengguna R panduan, mencari kata, membuka langkah/penanganan kendala, serta memperluas pencarian ke panduan perannya. Guru tidak ditawari panduan khusus Admin; Siswa/Pengawas/publik tidak ditawari modul staf. Perubahan halaman/peran menutup dialog lama dan membersihkan pencarian. Panduan statis bukan pembatas otorisasi; hak endpoint dan data tetap diperiksa server sebagaimana sebelumnya.

Selama ujian, panduan dibuka di halaman yang sama tanpa navigasi/tindakan attempt. Timer dan autosave tetap berjalan. Panduan mengingatkan bahwa Minta bantuan adalah fitur terpisah untuk mengirim pesan ke pengawas; pencarian panduan tidak mengirim tiket. Tidak ada tautan keluar dari panduan ruang ujian. Kata pencarian dan state dialog tidak dikirim ke server atau disimpan sebagai riwayat.

Tidak ada halaman, endpoint, tabel, skema, hak C/U/D data atau migrasi baru. Panduan hanya R; form kendala pengawas tetap memakai hak dan pembatasan yang sudah ada. Bukti implementasi: `docs/context-help.md`.

## Pemeriksaan perangkat sebelum ujian — 1 November 2026

Inventaris tetap **23 halaman**. Pada `/student`, Siswa konteks siswa aktif menjalankan pemeriksaan sebelum memulai ujian baru: HTTPS/identitas sesi, tulis–baca–hapus penyimpanan lokal dan tab, canvas, lebar layar, serta koneksi dan sesi siswa melalui endpoint R `/api/attempts/preflight`. Endpoint hanya mengembalikan kesiapan sesi, tidak membuat attempt, mengubah deadline atau menulis data ujian. Anonim serta peran/konteks lain ditolak; respons no-store.

UI mengaktifkan Mulai setelah hasil terkini dan konfirmasi siswa. Hasil berlaku 5 menit pada tab tersebut dan dibatalkan ketika offline; handler memeriksa umur hasil kembali saat mulai. Kegagalan koneksi/sesi atau kemampuan identitas sesi menghalangi Mulai di UI. Penyimpanan, canvas, layar sempit atau respons lambat adalah peringatan dengan petunjuk dan konfirmasi; bukan penolakan perangkat otomatis. Lanjutkan/lihat status serta pengambilalihan attempt lama tetap tersedia tanpa menunggu pemeriksaan ini.

Contoh teks/rumus, gambar, nada audio, ketik serta goresan canvas tersedia lokal tanpa unggahan atau penyimpanan jawaban contoh. Siswa memastikan daya dan mencoba media yang diperlukan. Uji satu permintaan bukan jaminan internet stabil; tidak menguji media ujian sebenarnya atau mengesahkan SEB/antikecurangan. Hak mulai, PIN, jadwal, deadline dan kepemilikan tetap diverifikasi server pada perintah attempt yang sudah ada; pemeriksaan UI bukan kontrol keamanan server.

Tidak ada halaman, tabel, skema, hak CRUD data ujian atau migrasi database baru. Laporan perangkat hanya state browser; tidak membuat fingerprint/riwayat identitas perangkat. Probe penyimpanan memakai key acak tersendiri dan tidak membersihkan draf siswa. Bukti implementasi: `docs/device-preflight.md`.

## Penyempurnaan pengaturan AI — 1 November 2026

Halaman tetap 23. Pada Fitur Lanjutan, Admin melihat kartu delapan penyedia, konfigurasi tersimpan, status key/uji/aktif, pemakaian esai harian UTC dan waktu uji berhasil terakhir. Pengaturan model memakai ID pada dokumentasi resmi penyedia; bukan katalog model dinamis. Jumlah esai bukan biaya/token; uji koneksi dibatasi terpisah.

Uji koneksi tidak lagi mengaktifkan penyedia. Admin U aktivasi eksplisit setelah key, izin data dan uji konfigurasi terkini tersedia; U nonaktif menolak permintaan baru dan membatalkan status uji. Penggantian konfigurasi tetap menonaktifkan sampai uji/aktivasi ulang. Key tidak dibaca kembali. Perubahan belum disimpan dilindungi saat pergantian penyedia/muat ulang; error/retry tidak dianggap data kosong.

Migrasi `20261101015721_refine_ai_settings.sql` menambah waktu uji terakhir dan indeks penggunaan serta membungkus konfigurasi dengan pengecekan Admin/organisasi/versi. Tidak ada grant klien pada tabel key atau worker. Hak penilaian, esai teks, dan keputusan manusia tetap seperti implementasi AI sebelumnya.

## Dashboard per peran — 1 November 2026

Halaman tetap 23. `/dashboard` memisahkan prioritas Admin (persiapan, monitoring, penerimaan operasional dan statistik organisasi) dan Guru (bank soal, koreksi, hasil, jumlah hasil peserta pending sesuai can_grade serta agenda sesuai can_author). Guru tidak menjalankan query statistik organisasi pada halaman ini. Perbedaan cakupan penyusunan seluruh kelas–mapel dan penilaian snapshot dipertahankan.

`/supervisor` menampilkan pintasan pelaksanaan/bantuan/kartu pada modul yang tetap tunduk pada penugasan efektif. `/student` menampilkan ringkasan dari daftar ujian sendiri yang telah diterima: belum dimulai, attempt belum final dan dikumpulkan. Ringkasan bukan izin mulai ujian dan bukan penentu deadline. Loading/error tidak dianggap nol. Tidak ada endpoint, hak CRUD atau skema baru; migrasi tidak diperlukan.

## Penyederhanaan UI global — 1 November 2026

Inventaris tetap 23 halaman. Header 18 halaman dashboard diseragamkan; petunjuk tambahan pada pengguna, penyusunan soal, bank, penilaian, persiapan, penerimaan, sistem dan fitur lanjutan tersedia melalui panel Panduan dengan keyboard native. Beranda, login, pengaturan password serta header portal siswa/pengawas diringkas. Jarak dan tipografi workspace disesuaikan untuk layar kecil. Status, validasi, izin data dan konfirmasi tindakan tetap terlihat. Tidak ada perubahan role, endpoint, CRUD, skema atau migrasi database.

## Pembaruan AI — 1 November 2026

Jumlah halaman tetap 23. Pada `/dashboard/advanced`, Admin dapat C/R/U konfigurasi model, izin data, batas permintaan dan API key untuk OpenAI, Anthropic, Google Gemini, DeepSeek, Mistral, Groq, xAI serta OpenRouter. Key disimpan di Vault; tidak dapat dibaca kembali oleh browser. Uji koneksi memakai soal sintetis dan mengaktifkan penyedia jika izin data diberikan. Perubahan konfigurasi menonaktifkan penyedia sampai diuji ulang.

Pada `/dashboard/results`, Admin/Guru dapat memilih penyedia aktif dan meminta saran untuk maksimal lima esai teks dalam cakupan penilaiannya. Worker menambahkan saran pending tanpa mengubah nilai resmi. Persetujuan/edit/penolakan memakai izin dan pemeriksaan revisi penilaian yang sudah ada. Canvas, lampiran dan rubrik per kriteria tetap manual. Tidak ada fallback otomatis ke penyedia lain.

Endpoint `/api/ai/providers` hanya Admin untuk pengaturan; `/api/grading/ai` Admin/Guru staf. Worker memverifikasi JWT pengguna dan cakupan database; akses worker berprivilege hanya layanan. Migrasi dan worker telah diterapkan ke staging/produksi, PR #16 digabung. Uji key asli dan akurasi model belum dilakukan. Bagian AI nonaktif pada catatan Tahap 6 di bawah adalah historis.

## Pembaruan Tahap 6 — Fitur lanjutan

Inventaris terbaru **23 halaman produksi**, dengan tambahan `/dashboard/advanced`. AI belum diaktifkan karena penyedia belum dikonfigurasi; pertukaran nilai menggunakan XLSX dan PDF. Tahap sebelumnya merupakan catatan historis pada masing-masing versi.

| Area | Fungsi dan tujuan | Izin CRUD dan batasan |
|---|---|---|
| Fitur lanjutan `/dashboard/advanced` | Status AI, konfigurasi uji SEB, pemeriksaan browser lokal dan riwayat evaluasi perangkat | Hanya Admin staf aktif. R status/riwayat organisasi sendiri; C hasil pengamatan. Tidak ada U/D riwayat. Guru/Pengawas/Siswa tidak mendapat halaman baru |
| Evaluasi perangkat | Enam skenario login, soal/rumus, media, canvas, pemulihan dan submit; SHA kandidat, platform/versi, catatan serta referensi artefak | Admin C dengan validasi server, request idempoten, dan audit. R maksimal 50 per halaman. Hasil manual bukan sertifikasi atau pengesahan cutover; pengujian ulang menambah catatan baru |
| Konfigurasi SEB | Unduh berkas `.seb` XML tidak terenkripsi untuk akun/perangkat uji, membuka login HTTPS aplikasi, dapat ditutup | Admin R/unduh saja; bukan konfigurasi ujian terkunci. Tidak ada pemaksaan SEB, validasi Browser Exam Key/Config Key, atau perluasan akses attempt. Pemeriksaan API browser/UA bukan bukti keamanan |
| AI | Status nonaktif; penyedia belum dikonfigurasi | Endpoint web mengembalikan 503 tanpa memanggil penyedia atau mencatat permintaan koreksi baru. Koreksi manual/moderasi tetap berjalan. Aktivasi kelak membutuhkan pilihan penyedia, evaluasi dan persetujuan data; nilai resmi tetap membutuhkan keputusan penilai |
| Pertukaran nilai | Jenis laporan `exchange` pada Hasil/Analitik, format XLSX/PDF dengan ID peserta/ujian/attempt, kelas, revisi ledger, status, nilai final dan kelulusan | Admin/Guru C/R pekerjaan ekspor milik sendiri dalam cakupan can_grade snapshot. Revisi dipatok saat job dibuat; izin diperiksa ulang saat proses/unduh. Nilai belum final/diskualifikasi kosong, nol final tetap numerik 0. Tidak ada push ke LMS, CSV, atau CRUD nilai melalui ekspor |

Endpoint baru `/api/advanced` (GET daftar, POST pencatatan Admin) dan `/api/advanced/seb` (GET unduhan Admin). Tabel `private.advanced_evaluations` RLS tanpa grant tabel langsung anon/authenticated; trigger menolak U/D. Backup otomatis yang memakai cakupan organisasi dan inventaris rollback mencakup catatan evaluasi. Migrasi `20261030063153_advanced_features.sql` tidak mengubah jawaban, nilai atau deadline historis. Bukti implementasi: `docs/stage6-advanced-features.md`.

## Pembaruan Tahap 5 — Penerimaan operasional

Inventaris saat Tahap 5 **22 halaman produksi**. Halaman baru `/dashboard/acceptance` hanya untuk Admin konteks staf organisasi aktif. Fungsinya membaca kondisi teknis dan mengunduh ringkasan observasi JSON tanpa identitas peserta, jawaban, token atau nilai secret. Izin **R**; unduhan dibuat lokal. Tidak ada C/U/D bukti, pengesahan UAT, deployment, pengiriman email atau aktivasi konfigurasi melalui halaman ini. Guru/Pengawas/Siswa tidak memiliki akses; RPC mengulang pemeriksaan Admin dan organisasi.

Snapshot memuat sesi belum final, konfigurasi otomasi/SMTP, tiga scheduler berdasarkan fungsi, antrean bermasalah, moderasi/publikasi tertahan dan backup terbaru. Snapshot >5 menit ditandai kedaluwarsa. Kelulusan indikator teknis tidak mengesahkan penerimaan: UAT semua peran/perangkat fisik, SLO 150 siswa, legacy/freeze/delta, inbox/pemulihan, latihan cloud dan persetujuan pemilik memerlukan bukti asli.

Backup kini mencakup versi dan riwayat review bank yang sebelumnya terlewat; transport `record` berupa teks JSON PostgreSQL mempertahankan presisi numerik. Helper restore menerima teks baru dan objek lama. Backup lama tidak otomatis menjadi bukti cakupan atau presisi baru. Inventaris rollback melindungi snapshot/rubrik, bank/versi/review/paket/pemakaian, moderasi, publikasi dan bantuan selain jawaban/ledger. Tidak ada restore produksi atau perubahan jawaban/nilai historis melalui migrasi.

Endpoint R baru `/api/acceptance`; migrasi `20261030055417_operational_acceptance.sql`. Runbook dan manifest pemeriksaan rilis v2 mengikuti satu scheduler operasi, satu retensi draf dan satu publikasi hasil. Laporan implementasi terdapat di `docs/acceptance/stage5-operational-acceptance.md`.

## Pembaruan Tahap 4 — Bank soal dan penilaian

Inventaris saat Tahap 4 **21 halaman produksi**, dengan tambahan `/dashboard/bank` dan `/dashboard/grading`. Bagian Tahap 1–3 di bawah merupakan catatan historis; matriks dan ketentuan Tahap 4 ini berlaku untuk implementasi terbaru.

| Area/objek | Fungsi dan tujuan | Hak akses dan CRUD |
|---|---|---|
| Bank soal `/dashboard/bank` | Taksonomi mapel, kelas, materi, indikator, kesulitan dan C1–C6; pencarian, impor, versi, review dan kualitas butir | Admin organisasi C/R/U. Guru C/R dalam **seluruh** kelas–mapel penugasan; U konten milik sendiri, Admin dapat U konten organisasi. Perubahan membuat versi draf. Tidak ada D permanen; pemilik/Admin dapat mengarsipkan |
| Review bank | Draf → Disetujui / Perlu revisi; arsip dan pembukaan kembali | Guru peninjau dalam cakupan tidak dapat menyetujui soal sendiri; Admin dapat meninjau soal organisasi. Versi dan alasan wajib. Pengawas/Siswa tidak mendapat akses |
| Kisi-kisi dan paket | Distribusi tipe/jumlah/bobot, materi, kesulitan, kognitif; sampling acak dari versi disetujui | Admin/Guru C paket hanya pada ujian draf dalam cakupan authoring, maksimal 3 ujian, 20 kelompok dan 200 soal/paket. Semua kelas sasaran harus tercakup. Kegagalan kuota/stok/duplikat membatalkan transaksi seluruh paket. Bobot esai mengikuti rubrik sumber. Kesamaan komposisi bukan jaminan kesetaraan psikometrik |
| Media/versi/pemakaian | Validasi lampiran dan kunci, pelacakan pemakaian versi, deteksi duplikat persis dan kemiripan stem | R sesuai cakupan bank; lampiran yang direferensikan versi bank tidak dapat dihapus. Versi soal dan snapshot attempt lama tidak diubah saat bank diperbarui |
| Koreksi `/dashboard/grading` | Antrean dengan kode peserta, rubrik per kriteria, umpan balik dan alasan revisi | Admin/Guru R/C/U nilai resmi pada attempt final sesuai kewenangan penilaian lama: Guru memiliki penugasan pada setidaknya satu kelas snapshot untuk mapel ujian. Bukan cakupan authoring seluruh kelas. Tidak ada D nilai/riwayat |
| Mode anonim | Menyembunyikan identitas pada antrean/detail alur koreksi | Bukan pembatas tambahan terhadap hak melihat identitas di modul Hasil. Kunci/rubrik/kriteria tidak dikirim ke DTO siswa |
| Moderasi | Usulan nilai, keputusan penilai kedua, riwayat alasan | Penilai berizin C usulan; penilai lain dalam cakupan U keputusan. Pengusul tidak dapat memutuskan sendiri termasuk Admin. Usulan tidak mengubah nilai resmi sampai disetujui. Revisi dasar usang tidak dapat disetujui |
| Publikasi terjadwal | Penerbitan setelah akhir ujian, semua koreksi final dan moderasi selesai | **Hanya Admin** C/U jadwal, pembatalan dan publikasi langsung. Worker tiap menit memeriksa kembali status, revisi dan kewenangan Admin pembuat. Revisi nilai berikutnya menyembunyikan hasil dan memblokir jadwal; perlu tinjauan/publikasi ulang |
| Analisis dan laporan | Kesulitan, daya pembeda, distraktor, rincian rubrik di PDF/XLSX dan alasan revisi | R sesuai cakupan hasil. Sampel <30 ditandai kecil, <4 belum cukup data untuk interpretasi daya pembeda. Riwayat pemakaian bank membatasi butir yang dianalisis. AI tetap adaptor tidak aktif; keputusan nilai pada manusia |

Endpoint baru `/api/bank` dan `/api/assessment` memerlukan Admin/Guru konteks staf. RPC mengulang pemeriksaan organisasi, role, kepemilikan/penugasan, versi, status dan idempotensi. Tabel bank, moderasi dan jadwal publikasi berada di schema private dengan RLS dan tanpa grant tabel langsung kepada anon/authenticated. Tidak ada izin halaman baru bagi Siswa/Pengawas.

Migrasi `20261030052445_bank_assessment_stage4.sql` telah diterapkan dan diverifikasi di staging serta produksi. Catatan penerapan dan bukti verifikasi dicatat di `docs/stage4-bank-assessment.md`. Pemeriksaan browser menggunakan data simulasi; bukan UAT akun produksi atau perangkat fisik.

## Pembaruan Tahap 3 — Alur persiapan dan pelaksanaan

Implementasi branch `feat/stage3-preparation-operations`, berbasis main `8c34f8f6c9a81dc58d80b5ac3b3ee646b7016ce8`. Inventaris saat Tahap 3 **19 halaman produksi**. Bagian Tahap 1/2 di bawah adalah catatan historis pada versinya; tambahan dan perubahan izin terbaru di bagian ini serta matriks berlaku saat ini.

| Area/objek | Fungsi terbaru | Izin CRUD dan batasan |
|---|---|---|
| **Persiapan ujian** `/dashboard/preparation` (baru) | Wizard Identitas → Peserta → Jadwal → Soal → Aturan → Pemeriksaan → Publikasi; checklist server dan status siklus ujian | Admin/Guru konteks staf dapat masuk. Admin C/U draf, R checklist, U publikasi jadwal. Guru R checklist pada cakupan authoring seluruh kelas–mapel; C/U soal tetap melalui bank soal. Tidak ada D permanen atau izin Pengawas/Siswa ke halaman ini |
| Kesiapan dan publikasi jadwal | Memeriksa mapel/kelas aktif, peserta aktif, jadwal/durasi/PIN, lima konfigurasi tipe, soal/kunci, keberadaan lampiran | Hanya Admin mempublikasikan jadwal dengan konfirmasi. Server memeriksa ulang, termasuk jika memakai form jadwal lama/direct RPC. Akun belum konfirmasi email dan kelengkapan ruang/pengawas menjadi peringatan; bukan bukti login maupun penghalang publikasi |
| Perubahan bank soal sebelum mulai | Jadwal scheduled kembali ke draft ketika soal/versinya berubah | Admin perlu meninjau dan mempublikasikan kembali. Penguncian soal setelah ujian mulai tetap berlaku |
| Ringkasan staf | Agenda ujian, draf belum lengkap dan tindak lanjut penilaian | R sesuai authoring yang sudah ada; bukan akses seluruh ujian Guru |
| Monitoring dan portal pengawas | Ringkasan aktif/belum mulai, indikasi kontak server dan antrean bantuan | Admin/Guru staf R sesuai ops_student; Pengawas efektif R peserta tugas. Kontak >45 detik perlu dicek, bukan otomatis dianggap offline/curang |
| Bantuan ujian | Siswa mengirim kendala dari player atau layar penguncian, melihat status/tanggapan | Siswa C/R bantuan attempt sendiri selama sesi belum final dan deadline belum lewat; satu terbuka, maksimal 20 per attempt. Admin/pengawas efektif C tanggapan/U penutupan dalam cakupan. Guru dengan hak baca saja R, tidak dapat menutup. Tidak ada D/edit pesan historis |
| Dispensasi waktu | Tambahan waktu eksplisit, terpisah dari lanjut sesi/unlock/reset | **Hanya Admin staf** U deadline attempt in_progress yang belum final/belum lewat deadline. Versi harus cocok; alasan dan konfirmasi wajib; 1–60 menit per tindakan, tidak melewati akhir jadwal. Pengawas/Guru/Siswa tidak mendapat izin dispensasi |
| Impor pengguna | Template TSV, referensi ID kelas, validasi/duplikat/pratinjau server, progress dan unduhan hasil per baris | Admin C akun sesuai izin lama; Guru C siswa kelas penugasan. Pratinjau R ketersediaan username dan kelayakan kelas tanpa membuat akun/mengirim undangan. Gateway tetap memvalidasi ulang saat C; baris bermasalah dilewati dan dilaporkan |
| Impor soal | Deteksi duplikat dalam satu berkas sebelum simpan | Izin C soal, kuota, periode, lampiran dan penguncian tetap sama |

Status siklus tampilan: **Draf → Siap Ditinjau → Terjadwal → Berlangsung → Selesai → Dinilai → Dipublikasikan → Diarsipkan**. Label dihitung dari status/waktu server, finalisasi/pending koreksi dan publikasi hasil; bukan enum baru. Publikasi jadwal berarti tampil di daftar ujian Siswa, sedangkan publikasi hasil tetap memakai aturan modul Hasil.

Endpoint baru `/api/workflow` menyediakan kesiapan/preflight impor, indikator pelaksanaan, bantuan/tanggapan, publikasi jadwal dan dispensasi. Role, konteks, organisasi, penugasan/ownership, status, versi dan waktu diperiksa pada API serta RPC terkontrol. Jalur direct RPC tetap memeriksa role/cakupan; konteks login ditangani API. PIN/hash/kunci soal tidak ada dalam payload checklist.

Migrasi tambahan `20261030033230_preparation_execution_workflow.sql` telah diterapkan dan diverifikasi di staging serta produksi: tabel private `attempt_presence`, `exam_help_requests`, `workflow_requests`, RPC workflow, pembungkus authoring/attempt serta trigger invalidasi kesiapan. RLS aktif; tidak ada grant tabel langsung ke anon/authenticated. Request mutasi bersifat idempoten; draf wizard menyimpan fingerprint request, bukan PIN mentah, untuk deduplikasi. Dispensasi menyimpan before_state dan alasan dalam attempt_overrides serta audit. Migrasi tidak mengubah massal jawaban, nilai, snapshot, deadline atau status ujian yang sudah ada.

Verifikasi mencakup tes database/regresi dan browser fixture pada 320/390/768/1440: wizard, gate publikasi, role, bantuan/tanggapan, dispensasi, pratinjau impor/duplikat/laporan, serta responsivitas. Ini bukan pengesahan UAT akun produksi/perangkat fisik. Bukti implementasi dan batas operasional terdapat di `docs/stage3-preparation-execution.md`.

## Pembaruan Tahap 2 — UI/UX global dan player

Implementasi pada branch `feat/stage2-global-player-ui`, berbasis `main` commit `7e6670d66e8371f3bf45f7a8c00fd3c5d10a6287`. Jumlah halaman produksi tetap **18**; tidak ada role, endpoint, tabel, kolom atau aturan CRUD baru.

| Area | Perubahan antarmuka | Hak akses dan perilaku |
|---|---|---|
| Dashboard dan seluruh halaman staf | Sidebar dikelompokkan menjadi Ruang kerja, Ujian, Penilaian dan Administrasi; halaman aktif ditandai; breadcrumb dan identitas peran ditampilkan | Tetap Admin/Guru konteks staf. Menu Administrasi serta Ruang & pengawas hanya ditampilkan untuk Admin; guard server yang ada dipertahankan |
| Navigasi mobile | Menu dibuka dalam dialog yang mendukung keyboard, Escape, penguncian fokus dan pengembalian fokus ke pembuka | Tidak menambah akses halaman; pilihan menu mengikuti peran yang sama |
| Desain global | Warna, tipografi, jarak, panel, tombol, form, dialog, tabel dan indikator loading diseragamkan | Tidak mengubah validasi maupun proses CRUD |
| Tabel modul | Header/kolom identitas tetap sticky; zebra striping; kontainer gulir dapat difokuskan dan diberi label untuk keyboard/pembaca layar | Data dan cakupan filter tetap ditentukan layanan/RLS yang sudah ada |
| Login dan atur password | Form responsif, status loading, tombol tampil/sembunyikan password login dan petunjuk minimum password | Tidak mengubah kredensial, aturan password, konteks login atau autentikasi |
| Portal siswa | Loading, error, retry dan empty state dibedakan; daftar ujian memiliki kartu status; waktu jadwal ditampilkan WIB | Tetap hanya ujian siswa berizin; bukan pembukaan ujian di luar jadwal |
| Player `/student` | Header/timer tetap terlihat di mobile; status koneksi/simpan diringkas; kontrol tambahan ada di Alat; ukuran tulisan dapat disesuaikan | Deadline server, autosave, pemulihan draf, takeover dan submit tetap memakai mekanisme Tahap 1 |
| Navigasi soal | Peta soal pada desktop dan dialog Daftar soal pada mobile; status kosong, parsial, terjawab dan ragu memiliki label teks/aksesibel | Status terjawab tidak menunjukkan benar/salah; penilaian tetap di server |
| Konfirmasi pengumpulan | Ringkasan terjawab/belum lengkap/ragu serta tombol menuju soal belum lengkap | Tidak melewati pemeriksaan wajib/minimum karakter, penyimpanan, canvas dan deadline server |
| Lampiran soal | Player menghindari duplikasi pilihan pada pratinjau; kegagalan lampiran memiliki feedback dan tombol coba ulang | Endpoint/media dan izin lampiran tetap; tidak membocorkan kunci/rubrik |

Preferensi tampilan player (ukuran tulisan, nomor soal terakhir, tanda ragu) disimpan lokal per siswa/attempt dengan key `edutara:player-ui:v1:<student_id>:<attempt_id>`. Ini preferensi UI, bukan jawaban/nilai dan bukan tambahan izin CRUD. Preferensi ini tidak disinkronkan lintas perangkat. Cadangan jawaban Tahap 1 tetap terpisah dan berlaku seperti bagian berikut.

**Migrasi database tidak diperlukan** untuk Tahap 2 karena seluruh perubahan berada pada komponen, CSS dan preferensi tampilan lokal. Tidak ada perubahan skema atau kebijakan akses.

Verifikasi mencakup tes regresi, build produksi dan browser dengan data simulasi pada lebar 320/390/768/1440 piksel: overflow, tabel gulir, menu/dialog keyboard, fokus kembali setelah Escape, status jawaban parsial, ukuran tulisan, timer sticky, ringkasan pengumpulan serta loading/error/empty/retry siswa. Route sementara pemeriksaan browser dibuat hanya oleh skrip uji, dihapus setelah selesai, dan tidak termasuk halaman produksi. Pengujian ini bukan UAT perangkat fisik siswa atau sertifikasi WCAG.

## Pembaruan Tahap 1 — pemulihan persisten dan lintas perangkat

Versi implementasi: PR #10, branch `feat/answer-session-reliability`; baseline inventaris terdapat pada bagian 1. Jumlah halaman tetap **18**, tanpa role atau URL halaman baru.

Perubahan pada `/student`:

- Draf teks/pilihan dan PNG canvas memakai **localStorage**, sehingga tetap tersedia setelah tab/browser ditutup pada perangkat, profil browser dan origin yang sama. Namespace mencakup siswa, attempt, client dan writer epoch. Data yang dihapus/diblokir oleh browser tidak dapat dipulihkan dari perangkat.
- Salinan tab/sesi lama ditawarkan sebagai pilihan eksplisit setelah siswa membuka sesi yang sah. Draf berbeda tidak menimpa jawaban otomatis; perbedaan revisi masuk alur konflik. Salinan identik dengan jawaban server disaring/dibersihkan.
- Tombol **Pindah perangkat** membantu menyimpan dan memeriksa kesiapan jawaban. Siswa kemudian login di perangkat tujuan, memilih Lanjutkan dan melakukan **ambil alih sesi**. Deadline tetap berjalan.
- API mencoba menyimpan cadangan draf server sebelum autosave jawaban utama. Kegagalan cadangan tidak menghalangi percobaan penyimpanan utama. Salinan yang sudah mencapai server dapat dipilih di perangkat lain setelah takeover; jawaban utama yang tersimpan tetap tersedia melalui resume.
- Canvas yang sudah diunggah tetapi belum terhubung ke jawaban tersedia dalam pilihan pemulihan. Draf PNG yang masih offline hanya tersedia di perangkat asal. Penggambaran dikunci bila canvas lama belum berhasil dimuat agar gambar tidak tertimpa.
- Perangkat lama kehilangan hak menulis setelah takeover. Server tetap memeriksa siswa pemilik, sesi Auth aktif, writer client/session/epoch, snapshot soal, revisi, status dan deadline. Pemulihan tidak memberi tambahan waktu atau hak mengubah jawaban setelah ujian berakhir.
- Status simpan, waktu respons terakhir, sinkronisasi heartbeat/koneksi/visibility, pencegahan klik ganda, dan retry submit identik tetap berlaku. Hasil pengumpulan yang belum pasti mengunci isian sementara.
- Bukti `EDU-<attempt_id>` dan unduhan TXT hanya muncul untuk submitted/time_expired dengan finalized_at dari server. Ini referensi finalisasi, bukan tanda tangan digital, bukti seluruh draf offline diterima atau publikasi nilai.

### Hak akses dan CRUD pemulihan

| Objek | Siswa pemilik dengan writer aktif | Admin/Guru/Pengawas | Publik/siswa lain |
|---|---|---|---|
| Draf lokal | C/R/U salinan sendiri; hapus setelah terselesaikan/finalisasi | Tidak ada halaman akses tambahan | Tidak mendapat akses aplikasi ke draf siswa |
| Cadangan draf server | C/U melalui autosave; R setelah resume/takeover sah | Tidak mendapat hak baru pada fitur ini | Ditolak |
| Canvas pemulihan | R media/metadata sendiri dan U tautan jawaban selama ujian terbuka | Tetap mengikuti kewenangan peninjauan yang sudah ada | Ditolak |
| Pembersihan cadangan | Otomatis setelah ACK identik, finalisasi/reset atau retensi | Pekerjaan internal, bukan editor draf | Tidak ada |

Tidak ada endpoint baru: `/api/attempts` memakai RPC `attempt_recovery` untuk cadangan dan pilihan pemulihan. Tabel `private.attempt_recovery_drafts` menggunakan RLS dan tidak memberikan akses tabel langsung kepada anon/authenticated. RPC membatasi kepemilikan dan writer aktif. Draf belum menjadi dasar penilaian sebelum tersimpan sebagai jawaban utama.

Migrasi `20261029184135_durable_attempt_recovery.sql` diterapkan serta diverifikasi di staging dan produksi. Perubahannya bersifat tambahan: tabel draf, RPC terkontrol, trigger pembersihan dan jadwal retensi setiap 15 menit. TTL server maksimal 24 jam dan tidak melewati deadline; maksimal tiga salinan writer per soal. Draf lokal berusia lebih dari 24 jam diabaikan/dibersihkan saat diperiksa. Jawaban, nilai dan deadline yang sudah ada tidak diubah.

Pengujian meliputi penutupan tab/client baru, pilihan cadangan server, konflik revisi, takeover dan penolakan writer lama, isolasi siswa/Guru, snapshot, ACK cleanup, finalisasi serta retensi. UAT perangkat nyata tetap diperlukan untuk kompatibilitas browser dan jaringan madrasah.

**Batas teknis:** draf yang belum pernah keluar dari perangkat offline tidak tersedia di perangkat lain. Penyimpanan lokal tidak melindungi dari penghapusan data browser, kerusakan perangkat atau penghapusan profil browser. Seluruh penerimaan jawaban tetap mengikuti waktu server.

## 1. Dasar dan batas pemeriksaan

Repositori: https://github.com/randyipratama25-ops/edutaracbt — branch `main`, commit `bc2970528e07e6a5ebe3e0110ca9d6707b4e4c0c`.

Dokumen ini merupakan inventaris implementasi Next.js berdasarkan pemeriksaan awal 18 file `page.tsx` (kini 19 setelah Tahap 3), layout, komponen antarmuka, API, identity gateway, serta migrasi SQL otorisasi. Inventaris awal mengikuti commit tersebut dan disinkronkan dengan pembaruan Tahap 1–3 di atas; bukan semata rencana fitur atau perilaku aplikasi GAS lama. File legacy `index.html` dan `Code.gs` masih ada di repositori, tetapi tidak dihitung sebagai halaman App Router yang aktif. Status migrasi di database produksi, konfigurasi layanan, dan hasil UAT login setiap peran tidak diverifikasi dalam pemeriksaan ini. Karena itu, dokumen ini bukan sertifikasi bahwa seluruh fitur berhasil dijalankan di produksi.

### Arti izin

- **C (Create):** membuat data atau pekerjaan baru.
- **R (Read):** melihat data dalam cakupan izin.
- **U (Update):** mengubah data atau status.
- **D (Delete):** menghapus permanen. **Arsip** merupakan perubahan status, bukan hapus permanen.
- **—:** tidak tersedia untuk objek tersebut melalui alur aplikasi yang diperiksa.
- Akses URL tidak otomatis memberi akses seluruh data atau semua tindakan. Pemeriksaan actor, API, RLS, dan fungsi SQL tetap berlaku.

## 2. Peran dan konteks login

| Peran | Nilai kode | Konteks | Tujuan dan cakupan |
|---|---|---|---|
| Admin | `admin` | `staff` | Mengelola data organisasi/madrasah, akun, ujian, operasional, dan pengaturan. Tetap tunduk pada penguncian data dan aturan integritas. |
| Guru | `teacher` | `staff` | Mengelola siswa dan pembelajaran/ujian sesuai penugasan kelas–mapel aktif. |
| Pengawas | `supervisor` | `supervisor` | Memantau peserta pada ruang/sesi yang menjadi penugasan efektif. Harus memiliki penugasan yang diizinkan. |
| Guru sebagai Pengawas | `teacher` | `supervisor` | Guru dapat masuk sebagai Pengawas jika ditugaskan; kewenangan operasional mengikuti ruang/sesi, bukan seluruh kelas yang diajarnya. |
| Siswa | `student` | `student` | Mengikuti ujian, menyimpan jawaban, menerima pesan, dan melihat hasil sendiri yang diizinkan. |
| Publik | Tanpa akun | Tidak ada | Beranda, login, dan halaman pengaturan password; tindakan sensitif tetap memerlukan sesi/token sah. |

Tidak ditemukan role Kepala Madrasah, Operator, TU, Wali Kelas, atau Orang Tua pada enum peran versi ini. Jangan memberikan izin kepada peran tersebut tanpa pengembangan otorisasi tersendiri.

Akun harus aktif dan terautentikasi untuk menjadi actor. `/dashboard/*` memerlukan konteks `staff`; konteks siswa/pengawas dialihkan ke portalnya. Tiga konteks login tidak boleh dianggap sebagai tiga izin tambahan yang bebas dipilih oleh semua akun.

## 3. Daftar lengkap halaman dan tujuan

| No. | Halaman | URL | Fungsi dan tujuan | Izin masuk | Ringkasan CRUD |
|---|---|---|---|---|---|
| 1 | Beranda | `/` | Pintu masuk publik; tombol masuk, bantuan kontekstual dan panduan peran. Callback aktivasi fragment, kode PKCE, dan token hash email diteruskan ke handler autentikasi lama; kesalahan dibersihkan dari URL dengan pesan aman. | Publik | R informasi publik; tidak ada CRUD akademik. |
| 2 | Login dan bantuan pemulihan | `/login` | Login username/password berdasarkan konteks; validasi, feedback aktivasi dan bantuan pemulihan melalui modal yang dapat dibuka kembali tanpa mengirim ulang request berjalan. Branding memiliki fallback/deadline. | Publik | Membuat sesi/permintaan pemulihan; bukan membuat akun sendiri. |
| 3 | Atur password akun | `/auth/reset` | Memeriksa sesi/tautan, menetapkan password 12–128 karakter dan menampilkan hasil perubahan serta status pengakhiran sesi secara jujur. | Halaman publik; perubahan memerlukan sesi/token sah | U password akun terkait; tidak dapat mengubah akun lain. |
| 4 | Ringkasan madrasah | `/dashboard` | Total organisasi untuk Admin; prioritas koreksi untuk Guru; agenda nonarsip, waktu snapshot dan pintasan sesuai peran. | Admin, Guru dalam konteks staf | R total/agenda/koreksi dan pembaruan snapshot; C/U/D tetap melalui modul terkait. |
| 5 | Pengguna | `/dashboard/users` | Cari/filter/sort/paginasi pengguna; tambah akun, impor, edit nama, status/arsip, serta kirim ulang undangan. | Admin, Guru dalam konteks staf | Admin C/R/U dan arsip; Guru C/R/U terbatas pada siswa berizin; tidak ada D permanen pengguna. |
| 6 | Data master | `/dashboard/master-data` | Mengelola kelas/mapel, penugasan guru dan keanggotaan siswa; pencarian, pagination, status/arsip dan pratinjau tambah massal. | Admin, Guru dalam konteks staf | Admin C/R/U; Guru R sesuai cakupan; D tidak disediakan endpoint ini. |
| 7 | Ujian dan bank soal | `/dashboard/exams` | Jadwal, kelas peserta, PIN, konfigurasi lima tipe, periode input, penyusunan/impor/salin soal, versi/pratinjau; validasi kontrak, lock operasi, pemulihan error dan tabel/modal responsif. | Admin, Guru dalam konteks staf | Admin mengelola ujian dan soal; Guru mengelola soal pada ujian berizin. Arsip terpisah dari D. |
| 8 | Hasil dan koreksi | `/dashboard/results` | Daftar/detail, koreksi esai dan alasan revisi, batch per versi snapshot, rekalkulasi, publikasi seluruh ujian, riwayat/AI dan pemulihan error; tabel/modal responsif. | Admin, Guru dalam konteks staf | R dan C/U penilaian sesuai cakupan; publikasi hanya Admin; tidak ada D ledger. |
| 9 | Analitik dan laporan | `/dashboard/analytics` | Analisis kelompok peserta dan pembuatan/unduh laporan PDF/XLSX. Memakai komponen hasil yang sama, dengan analitik didahulukan. | Admin, Guru dalam konteks staf | R analitik, C pekerjaan ekspor; kop laporan C/U hanya Admin. Hak koreksi mengikuti modul hasil yang sama. |
| 10 | Peninjauan/monitoring ujian | `/dashboard/monitor` | Status peserta, kejadian integritas, tindakan operasional, pesan dan riwayat tindakan. | Admin, Guru dalam konteks staf | R sesuai cakupan; Admin dapat reset/unlock/diskualifikasi; Guru staf biasa tidak otomatis boleh intervensi. C pesan sesuai penerima berizin; R bantuan, U tanggapan sesuai hak pengawas; dispensasi waktu hanya Admin. |
| 11 | Media soal | `/dashboard/media` | Daftar, unggah/impor sumber media, akses media dan pembersihan berkas yang tidak dirujuk. | Admin, Guru dalam konteks staf | C/R/D bersyarat; Guru atas media miliknya, Admin dalam organisasi. Tidak ada edit isi berkas umum. |
| 12 | Kartu peserta ujian | `/dashboard/cards` | Membuat serta mengunduh kartu peserta PDF/ZIP sesuai peserta berizin. | Admin, Guru dalam konteks staf | C pekerjaan kartu, R status/hasil; tidak ada CRUD akun/PIN melalui kartu. |
| 13 | Ruang, sesi dan pengawas | `/dashboard/rooms` | Ruang/kapasitas, sesi, roster siswa, penugasan pengawas, pengganti dan pencabutan. | Admin saja | C/R/U/D ruang/sesi bersyarat; tambah/hapus roster; penugasan dicabut/nonaktif, riwayat dipertahankan. |
| 14 | Pengaturan aplikasi | `/dashboard/settings` | Identitas/branding, zona waktu, kebijakan ujian, hasil/canvas, otomasi, reminder, retensi, sender dan referensi secret. | Admin saja | R/U konfigurasi, simpan/ganti secret; tidak ada baca balik nilai secret. |
| 15 | Audit aktivitas | `/dashboard/audit` | Menelusuri tindakan, pelaku, sasaran dan waktu untuk pengawasan operasional. | Admin saja | R; tidak ada edit/hapus audit melalui halaman. |
| 16 | Otomasi dan backup | `/dashboard/jobs` | Memantau pekerjaan, meminta backup/probe SMTP, retry, membatalkan backup dan rekonsiliasi status email yang tidak pasti. | Admin saja | C pekerjaan, R status/unduhan, U tindakan terkontrol; bukan halaman restore atau hapus semua data. |
| 17 | Portal siswa / player ujian | `/student` | Daftar ujian sendiri, mulai/lanjut ujian, jawaban/canvas, sinkronisasi, submit, hasil yang diizinkan, kotak pesan dan permintaan bantuan. | Siswa dalam konteks siswa | C attempt/jawaban sendiri; R sendiri; U jawaban selama ujian terbuka dan status baca pesan; tidak ada D attempt/hasil. |
| 18 | Portal pengawas | `/supervisor` | Monitoring peserta dan intervensi pada ruang/sesi tugas efektif; pesan, bantuan dengan pencarian/filter/pagination, indikator koneksi, lini masa riwayat, serta kartu peserta yang dimuat saat dibuka. Pemeriksaan receipt dan jeda dialog/panel menjaga konsistensi. | Pengawas atau Guru dalam konteks pengawas dengan penugasan sah | R peserta tugas, U reset/unlock/diskualifikasi beralasan, C pesan/kartu dalam cakupan; tidak mengelola ruang/penugasan. |
| 19 | Persiapan ujian | `/dashboard/preparation` | Wizard pembuatan draf, checklist kesiapan, siklus ujian dan publikasi jadwal. | Admin, Guru konteks staf | Admin C/R/U draf dan U publikasi jadwal setelah pemeriksaan; Guru R kesiapan dalam cakupan authoring. Tidak ada D permanen. |
| 20 | Bank soal | `/dashboard/bank` | Taksonomi, versi, review, impor, kisi-kisi, paket dan kualitas butir. | Admin, Guru konteks staf | C/R sesuai organisasi/seluruh kelas–mapel; U konten pemilik/Admin, review penilai lain; arsip tanpa D permanen. |
| 21 | Koreksi dan moderasi | `/dashboard/grading` | Koreksi anonim, rubrik kriteria, moderasi dan jadwal publikasi. | Admin, Guru konteks staf | C/R/U penilaian dalam cakupan snapshot; keputusan moderasi oleh penilai lain; publikasi dan jadwal hanya Admin; tanpa D riwayat. |
| 22 | Penerimaan operasional | `/dashboard/acceptance` | Snapshot teknis, tindak lanjut dan unduhan observasi; checklist bukti UAT. | Admin konteks staf | R organisasi sendiri; ekspor lokal. Tidak ada C/U/D bukti atau pengesahan otomatis. |
| 23 | Fitur lanjutan | `/dashboard/advanced` | AI nonaktif, pilot SEB, evaluasi perangkat dan akses panduan pertukaran nilai. | Admin konteks staf | R status/riwayat/konfigurasi uji; C catatan evaluasi organisasi sendiri; tanpa U/D. Ekspor XLSX/PDF tetap tersedia bagi Admin/Guru melalui Hasil/Analitik. |
| 24 | Penugasan Panitia Ujian | `/dashboard/committee` | Jadwalkan, konfirmasi kehadiran, dan tunjuk panitia pengganti. | Admin konteks staf | C tugas, R daftar organisasi, U konfirmasi dan penggantian; riwayat dipertahankan. |
| 25 | Ruang Panitia Ujian | `/committee` | Jadwal pengawas dan kehadiran petugas pada hari tugas. | Panitia Ujian atau Guru dalam konteks panitia | R jadwal setelah konfirmasi Admin; C pengganti dan kehadiran pengawas dalam cakupan tanggal tugas; tanpa penghapusan. |

`/auth/confirm` merupakan route handler konfirmasi email/token, bukan halaman `page.tsx`. File loading/error dashboard merupakan tampilan status, bukan halaman navigasi tersendiri. Modal soal, pratinjau, detail hasil, impor, kartu, inbox dan form pemulihan tidak memiliki route halaman tersendiri dalam inventaris ini.

## 4. Matriks CRUD terperinci per objek

Cakupan Admin pada tabel ini adalah organisasi yang sama. Seluruh tanda izin tetap tunduk pada validasi status, relasi, kepemilikan, penugasan dan batas waktu.

| Objek / tindakan | Admin | Guru staf | Pengawas efektif | Siswa |
|---|---|---|---|---|
| Akun/profil pengguna | C/R/U; arsip | C siswa di kelas penugasan; R siswa tercakup; U nama siswa yang terlihat | — melalui modul Pengguna | R identitas sendiri untuk kebutuhan sesi; bukan direktori |
| Aktif/nonaktif/arsip akun | U; admin aktif terakhir dilindungi | — | — | — |
| Hapus permanen pengguna | — | — | — | — |
| Status undangan/kirim ulang | R status/email; kirim ulang bersyarat | — | — | — |
| Kelas dan mapel | C/R/U termasuk aktif/nonaktif | R kelas/mapel penugasan | Tidak ada modul master | Data kelas sendiri sesuai RLS, bukan modul master |
| Penugasan guru dan enrollment | C/R/U | R penugasan sendiri/enrollment berizin | — melalui master | R enrollment sendiri sesuai RLS |
| Jadwal/PIN/config/status ujian | C/R/U; duplikasi/arsip | R ujian yang memenuhi cakupan authoring | R informasi operasional berizin tanpa pengelolaan jadwal | R daftar ujian eligible tanpa kunci/hash PIN |
| Periode penyusunan soal | C/R/U | R | — | — |
| Soal, kunci, pembahasan, versi | C/R/U; arsip bersyarat | C/R/U; arsip sesuai authoring guard | Tidak mendapat akses bank kunci melalui portal | R payload ujian yang disanitasi; bukan bank kunci |
| Media soal | C/R; D jika tidak dirujuk | C/R milik sendiri; D jika tidak dirujuk | R media yang diperlukan untuk tindakan berizin | R media snapshot ujian sendiri |
| Ruang/sesi ujian | C/R/U/D dengan batas relasi/status | — melalui pengelolaan ruang | R informasi tugas | R informasi yang diperlukan ujian sendiri |
| Roster ruang | C/R; tambah/hapus sebelum peserta terkunci | R untuk monitoring berizin | R peserta tugas | Tidak boleh mengubah |
| Penugasan/pengganti pengawas | C/R/U; nonaktif/cabut | — | R tugas efektif; tidak menunjuk pengganti | — |
| Attempt dan jawaban | R operasional/hasil; bukan menulis jawaban siswa | R sesuai monitoring/penilaian | R operasional ruang tugas | C/R/U milik sendiri selama status/deadline mengizinkan |
| Reset/unlock/diskualifikasi | U dengan alasan dan pemeriksaan versi | Tidak otomatis; perlu konteks/penugasan pengawas yang sesuai | U sesuai peserta tugas dan prasyarat status | — |
| Checklist kesiapan | R seluruh ujian organisasi | R jika can_author seluruh kelas–mapel | — melalui halaman persiapan | — |
| Publikasi jadwal | U sesudah checklist wajib lulus; konfirmasi | — | — | R daftar ujian eligible |
| Bantuan dan tanggapan | R; C tanggapan/U penutupan | R monitoring tercakup; U hanya dengan hak pengawas efektif | R/C tanggapan/U penutupan peserta tugas | C/R bantuan attempt sendiri; tidak dapat menutup/edit/hapus |
| Dispensasi waktu | U deadline dengan alasan, konfirmasi, versi, sesi aktif, batas akhir jadwal | — | — | R deadline sendiri dari server |
| Indikator kontak server | R operasional | R monitoring tercakup | R peserta tugas | C/U otomatis hanya melalui perintah writer sah; bukan akses tabel |
| Koreksi esai/rekalkulasi | C/R/U sesuai status attempt | C/R/U kelas–mapel snapshot berizin | — melalui portal pengawas | — |
| Publikasi/sembunyikan hasil | U | — | — | R hasil sendiri jika dipublikasikan dan kebijakan mengizinkan |
| Saran koreksi AI | Minta/R/terima/edit/tolak bila layanan tersedia | Sama dalam cakupan penilaian | — | — |
| Analitik | R kelompok berizin | R kelompok berizin | — | — |
| Laporan PDF/XLSX | C/R pekerjaan milik peminta dengan izin hasil tetap sah | C/R milik peminta dan cakupan berizin | — melalui modul laporan | — |
| Kop laporan | C/R/U | R | — | — |
| Kartu peserta | C/R pekerjaan berizin | C/R peserta monitoring berizin | C/R peserta tugas | Tidak ada panel kartu di portal siswa |
| Broadcast/notifikasi | C/R sesuai penerima eligible; R pesan terkirim organisasi | C/R sesuai cakupan; bukan seluruh organisasi secara bebas | C/R sesuai peserta tugas | R inbox sendiri; U status baca |
| Pengaturan/secret | R/U setting; C/U secret; nilai secret tidak dibaca balik | — | — | — |
| Audit | R | — melalui halaman audit | Riwayat intervensi peserta berizin, bukan log audit global | — |
| Backup/otomasi | C/R/U tindakan job; unduh backup selesai | — | — | — |

### 4.1 Pengguna dan undangan

Form tambah pengguna juga tersedia bagi Guru; peran dipaksa menjadi siswa dan server mewajibkan kelas penugasan aktif. Edit akun saat ini berfokus pada nama, bukan editor bebas username/email/peran. Guru tidak boleh mengubah status aktif atau mengarsipkan siswa. Impor TSV memproses pembuatan akun per baris, tetap melewati gateway; role dalam berkas impor tidak dapat memperluas izin Guru.

Kirim ulang undangan hanya Admin; sasaran harus satu organisasi, aktif, tidak diarsipkan, dan masih memenuhi kondisi undangan. Tidak tersedia fitur pendaftaran mandiri publik. Reset password ke angka default bukan izin yang ditemukan di endpoint pengguna ini.

### 4.2 Ujian dan soal

Cakupan authoring Guru lebih ketat daripada sekadar mengajar salah satu kelas: Guru harus memiliki penugasan mapel yang sesuai untuk **seluruh kelas** pada ujian tersebut, dan ujian memiliki kelas sasaran. Jangan menggantinya dengan aturan salah satu kelas tanpa keputusan pengembangan eksplisit.

Admin saja yang membuat/mengubah jadwal, PIN, konfigurasi dan periode, mengarsipkan ujian, serta menduplikasi ujian. Duplikasi ujian memerlukan PIN baru dan menyalin konfigurasi/kelas; penyalinan soal merupakan tindakan tersendiri.

Soal terkunci setelah waktu mulai atau status active/closed/archived. Guru juga mengikuti periode input jika diaktifkan dan tidak dibypass. Revisi soal menambahkan versi; riwayat versi tidak diedit bebas. Arsip soal bukan menghapus permanen. Jenis soal yang ditemukan: PG, PG_KOMPLEKS, BS, JODOH, dan Esai.

### 4.3 Monitoring dan pengawas

Guru dalam konteks staf dapat membaca monitoring berdasarkan mapel dan kelas penugasan. Hak menulis intervensi membutuhkan Admin atau penugasan pengawas efektif; hak baca monitoring saja tidak cukup. Route `/api/review` lebih eksplisit membatasi pemanggil ke Admin staf atau konteks pengawas; `/api/operations` juga memeriksa cakupan melalui fungsi SQL.

Pengawas efektif memperhitungkan pengganti, pencabutan, akun aktif dan sesi waktu yang berlaku. Karena itu, role `supervisor` saja tidak menjamin daftar peserta maupun tindakan tersedia. Pengawas asli dapat kehilangan cakupan saat pengganti efektif berlaku. Reset mempertahankan deadline dan riwayat; tidak memberi tambahan waktu otomatis. Dispensasi merupakan tindakan terpisah khusus Admin: sesi aktif sebelum deadline, maksimal 60 menit per tindakan dan tidak melewati akhir jadwal, dengan alasan/konfirmasi/versi serta audit. Roster peserta yang telah mulai dikunci. Hapus ruang/sesi dapat ditolak ketika masih dirujuk data lain.

### 4.4 Hasil, laporan, dan AI

Penilaian Guru mengacu pada mapel dan salah satu kelas dalam snapshot attempt, bukan aturan authoring seluruh kelas ujian. Attempt harus telah difinalisasi dan bukan berstatus reset agar masuk cakupan koreksi. Hasil esai yang belum selesai dinilai tidak boleh dianggap nilai nol final.

Publikasi hasil hanya Admin. Hak publikasi tidak memberi Siswa akses hasil orang lain atau semua kunci soal. Hasil/laporan memiliki ledger/revisi, pemeriksaan versi, dan jejak koreksi. Laporan tersedia dalam jenis recap, class, student, paper, answers, blank, analytics, dan exchange, dengan format PDF/XLSX sesuai validasi/pembuatan dokumennya. Pekerjaan laporan dibatasi ke peminta dan izin setiap attempt diperiksa kembali; Admin tidak otomatis mendapat semua job laporan milik orang lain.

Alur saran AI ditemukan, tetapi kode penilaian memuat jalur penyedia belum dikonfigurasi. Keberadaan tombol/alur AI bukan bukti provider aktif atau koreksi otomatis berhasil. Koreksi manual tetap menjadi alur yang tersedia untuk penilai berizin.

### 4.5 Media, sistem, dan backup

Media milik Guru dan media organisasi untuk Admin memiliki pembatasan rujukan. Media yang dipakai soal, snapshot attempt, laporan, atau branding tidak boleh diperlakukan sebagai berkas bebas hapus. Mengganti isi media yang telah dibekukan oleh attempt tidak sama dengan mengunggah media baru.

Halaman pengaturan menyimpan nilai setting serta referensi secret. Status keberadaan secret dapat dibaca; nilai secret tidak dikembalikan. Pengaturan retensi/reminder/SMTP dan tombol otomasi tidak membuktikan worker telah diaktifkan di produksi: kode memiliki pemeriksaan kapabilitas worker.

Pembatalan backup dan penyelesaian status email tidak pasti membutuhkan alasan/konfirmasi yang divalidasi. Unduh backup memerlukan pekerjaan selesai. Tidak ditemukan alur restore database umum pada halaman yang diperiksa; jangan menjanjikan restore melalui halaman jobs. Log audit dan ledger tidak memiliki tombol hapus/edit umum.

## 5. Peta endpoint untuk pengembangan

Endpoint bukan tambahan halaman. Daftar ini membantu menelusuri kontrol server dan mencegah penambahan tombol tanpa otorisasi backend.

| Kelompok | Endpoint | Kontrol utama |
|---|---|---|
| Akun | `/api/auth/login`, `/recover`, `/activate`, `/password`, `/logout` di bawah `/api/auth` | Validasi kredensial/token/sesi, konteks, akun aktif, pembatasan percobaan. |
| Pengguna/master | `/api/admin/users`, `/api/admin/master` | Actor staf; operasi akun melalui gateway; master tulis hanya Admin. |
| Penyusunan | `/api/authoring`, `/api/authoring/media` | Actor staf; authoring_command dan author_guard. |
| Ujian siswa | `/api/attempts`, `/api/attempts/canvas`, `/api/attempts/latex`, `/api/attempts/media` | Konteks Siswa, ownership, epoch/versi, status dan deadline. |
| Alur persiapan/pelaksanaan | `/api/workflow` | Staf untuk kesiapan/preflight, Siswa untuk bantuan sendiri, petugas sesuai monitoring/penugasan untuk indikator/tanggapan; publikasi dan dispensasi hanya Admin staf. |
| Bank soal | `/api/bank` | Admin/Guru staf; scope seluruh kelas–mapel, ownership, review dan versi. |
| Koreksi/moderasi | `/api/assessment` | Admin/Guru staf dalam cakupan penilaian; jadwal/cancel hanya Admin. |
| Peninjauan | `/api/review` | Admin staf atau konteks Pengawas; cakupan attempt SQL. |
| Operasional | `/api/operations`, `/api/operations/live` | Operator dan ops_command; baca/tulis dibedakan. |
| Hasil | `/api/results`, `/api/results/media`, `/api/grading/ai` | Admin/Guru staf; can_grade dan pembatasan publikasi. |
| Laporan | `/api/reports`, `/api/reports/run`, `/api/reports/download` | Staf; kepemilikan job dan cakupan attempt. |
| Kartu | `/api/cards`, `/api/cards/download` | Operator, peserta berizin dan akses job. |
| Media | `/api/media`, `/api/media/manage`, `/api/media/drive` | Hak sumber/ownership/rujukan, tindakan sesuai endpoint. |
| Sistem | `/api/system`, `/api/backups/export`, `/api/backups/download` | Admin; status dan cakupan backup. |
| Penerimaan | `/api/acceptance` | GET saja, Admin staf; RPC memeriksa ulang organisasi/akun aktif. |
| Fitur lanjutan | `/api/advanced`, `/api/advanced/seb` | Admin staf; R/C evaluasi dan R konfigurasi pilot. Tidak ada aktivasi AI atau pemaksaan SEB. |
| Infrastruktur | `/api/health`, `/api/load-info` | Status layanan; bukan halaman pengelolaan akademik. |
| Konfirmasi email | `/auth/confirm` | Validasi konfirmasi dan pengalihan autentikasi. |

## 6. Catatan yang perlu dipertahankan saat pengembangan

1. Pisahkan role, konteks sesi, penugasan, ownership, organisasi, serta status/waktu. Menyembunyikan tombol saja tidak cukup.
2. Pertahankan perbedaan **authoring seluruh kelas** dan **grading kelas snapshot**. Keduanya memakai rumus izin yang berbeda.
3. Guru dapat menambah siswa, tetapi tidak mengatur status akun atau membuat role lain. Filter yang menampilkan pilihan role bukan bukti seluruh data role tersebut dapat dibaca.
4. Halaman Analitik dan Hasil memakai `ResultsPanel` yang sama. `analyticsFirst` mengubah prioritas tampilan; bukan batas otorisasi terpisah.
5. Guru staf dapat membaca monitoring, tetapi intervensi memerlukan hak pengawas efektif/Admin. Tampilkan feedback izin yang jelas ketika tombol umum dipakai oleh akun dengan cakupan baca saja.
6. Arsip akun/ujian/soal, reset attempt, cabut tugas dan hapus permanen harus diberi label berbeda. Riwayat ujian dan audit perlu dipertahankan.
7. Beranda masih menampilkan teks bahwa pelaksanaan ujian belum dibuka. Selaraskan pesan ini dengan keputusan operasional aktual ketika aplikasi dibuka.
8. Dokumen ini tidak mengesahkan cutover final. UAT perangkat, rekonsiliasi legacy, uji beban/SLO dan penerimaan operasional tetap perlu dibuktikan tersendiri.

## 7. Acuan bukti kode

Semua path relatif terhadap repositori pada commit di awal dokumen.

| Bukti | Lokasi |
|---|---|
| Inventaris 25 halaman | `app/**/page.tsx` dan `app/page.tsx` |
| Pagar dashboard dan menu Admin | `app/dashboard/layout.tsx`; halaman rooms/settings/audit/jobs |
| Tahap 3 persiapan/pelaksanaan | `components/workflow`, `app/dashboard/preparation/page.tsx`, `app/api/workflow/route.ts`, `lib/workflow/schema.ts`, migrasi `20261030033230_preparation_execution_workflow.sql` |
| Role/konteks dan akun aktif | `lib/domain/validation.ts`, `lib/auth/actor.ts` |
| Hak akun dan kirim ulang undangan | `app/api/admin/users/route.ts`, `components/admin/users-panel.tsx`, `supabase/functions/identity-gateway/index.ts`, `invitations.ts` |
| Master dan RLS dasar | `app/api/admin/master/route.ts`, migrasi `20261028193445_foundation.sql`, `20261028193853_authorization_hardening.sql` |
| Authoring dan penguncian | `app/api/authoring/route.ts`, migrasi `20261029065220_authoring_stages_2.sql`, `20261029071542_authoring_command_resolution.sql` |
| Ujian siswa dan peninjauan | `app/api/attempts/route.ts`, `app/api/review/route.ts`, migrasi attempts/canvas/closure/immutable media tanggal 29 Oktober |
| Penilaian dan laporan | `lib/results/server.ts`, `app/api/results/route.ts`, migrasi `20261029102717_grading_results_reports.sql` |
| Operasional, media, kartu | `lib/operations/server.ts`, `app/api/operations/route.ts`, migrasi `20261029120103_operational_stages_5.sql` |
| Pengaturan dan otomasi | `lib/system/validation.ts`, `app/api/system/route.ts`, migrasi `20261029133618_system_stages_6_backup_only.sql` dan migrasi retensi berikutnya |

## 8. Cara memakai sebagai acuan

Saat menambah atau mengubah halaman, perbarui baris URL, fungsi, role/konteks, C/R/U/D, cakupan baris data, dan bukti implementasi. Jika kebijakan baru berbeda dari kode sekarang, catat sebagai perubahan yang direncanakan sampai implementasi dan verifikasinya selesai.

Validasi lanjutan yang disarankan: uji URL langsung setiap role; coba API tanpa tombol UI; coba ID milik organisasi/pengguna lain; uji Guru dengan sebagian kelas ujian; uji pengawas asli/pengganti di luar sesi; uji akun nonaktif; serta uji perubahan setelah ujian dimulai, setelah hasil final, dan setelah izin dicabut.

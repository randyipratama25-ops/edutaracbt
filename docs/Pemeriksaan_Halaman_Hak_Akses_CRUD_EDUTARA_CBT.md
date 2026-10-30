# Pemeriksaan Halaman, Hak Akses, dan CRUD EDUTARA CBT

Tanggal pemeriksaan: 30 Oktober 2026 (WIB). Versi dokumen: 1.5 — Bank soal dan penilaian.

## Pembaruan Tahap 4 — Bank soal dan penilaian

Inventaris saat ini **21 halaman produksi**, dengan tambahan `/dashboard/bank` dan `/dashboard/grading`. Bagian Tahap 1–3 di bawah merupakan catatan historis; matriks dan ketentuan Tahap 4 ini berlaku untuk implementasi terbaru.

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
| 1 | Beranda | `/` | Pintu masuk aplikasi; tombol login dan penanganan pengalihan aktivasi. Masih memuat pemberitahuan aplikasi dalam pengembangan. | Publik | R informasi publik; tidak ada CRUD akademik. |
| 2 | Login dan bantuan pemulihan | `/login` | Login username/password berdasarkan konteks staf, pengawas, atau siswa; permintaan pemulihan akun berada dalam form login. | Publik | Membuat sesi/permintaan pemulihan; bukan membuat akun sendiri. |
| 3 | Atur password akun | `/auth/reset` | Menetapkan password melalui tautan aktivasi atau pemulihan. | Halaman publik; perubahan memerlukan sesi/token sah | U password akun terkait; tidak dapat mengubah akun lain. |
| 4 | Ringkasan madrasah | `/dashboard` | Statistik pengguna, kelas, dan mapel sesuai akses; tautan ke pengelolaan dasar. | Admin, Guru dalam konteks staf | R statistik; C/U/D melalui modul terkait. |
| 5 | Pengguna | `/dashboard/users` | Cari/filter/sort/paginasi pengguna; tambah akun, impor, edit nama, status/arsip, serta kirim ulang undangan. | Admin, Guru dalam konteks staf | Admin C/R/U dan arsip; Guru C/R/U terbatas pada siswa berizin; tidak ada D permanen pengguna. |
| 6 | Data master | `/dashboard/master-data` | Mengelola kelas, mapel, penugasan guru dan keanggotaan kelas siswa sebagai dasar cakupan akses. | Admin, Guru dalam konteks staf | Admin C/R/U; Guru R sesuai cakupan; D tidak disediakan endpoint ini. |
| 7 | Ujian dan bank soal | `/dashboard/exams` | Jadwal, kelas peserta, PIN, konfigurasi tipe soal, periode input, penyusunan/impor/salin soal, versi dan pratinjau. | Admin, Guru dalam konteks staf | Admin mengelola ujian dan soal; Guru mengelola soal pada ujian berizin. Arsip terpisah dari D. |
| 8 | Hasil dan koreksi | `/dashboard/results` | Daftar/detail hasil, koreksi esai, rekalkulasi, publikasi, riwayat dan saran AI bila tersedia. | Admin, Guru dalam konteks staf | R dan C/U penilaian sesuai cakupan; publikasi hanya Admin; tidak ada D ledger. |
| 9 | Analitik dan laporan | `/dashboard/analytics` | Analisis kelompok peserta dan pembuatan/unduh laporan PDF/XLSX. Memakai komponen hasil yang sama, dengan analitik didahulukan. | Admin, Guru dalam konteks staf | R analitik, C pekerjaan ekspor; kop laporan C/U hanya Admin. Hak koreksi mengikuti modul hasil yang sama. |
| 10 | Peninjauan/monitoring ujian | `/dashboard/monitor` | Status peserta, kejadian integritas, tindakan operasional, pesan dan riwayat tindakan. | Admin, Guru dalam konteks staf | R sesuai cakupan; Admin dapat reset/unlock/diskualifikasi; Guru staf biasa tidak otomatis boleh intervensi. C pesan sesuai penerima berizin; R bantuan, U tanggapan sesuai hak pengawas; dispensasi waktu hanya Admin. |
| 11 | Media soal | `/dashboard/media` | Daftar, unggah/impor sumber media, akses media dan pembersihan berkas yang tidak dirujuk. | Admin, Guru dalam konteks staf | C/R/D bersyarat; Guru atas media miliknya, Admin dalam organisasi. Tidak ada edit isi berkas umum. |
| 12 | Kartu peserta ujian | `/dashboard/cards` | Membuat serta mengunduh kartu peserta PDF/ZIP sesuai peserta berizin. | Admin, Guru dalam konteks staf | C pekerjaan kartu, R status/hasil; tidak ada CRUD akun/PIN melalui kartu. |
| 13 | Ruang, sesi dan pengawas | `/dashboard/rooms` | Ruang/kapasitas, sesi, roster siswa, penugasan pengawas, pengganti dan pencabutan. | Admin saja | C/R/U/D ruang/sesi bersyarat; tambah/hapus roster; penugasan dicabut/nonaktif, riwayat dipertahankan. |
| 14 | Pengaturan aplikasi | `/dashboard/settings` | Identitas/branding, zona waktu, kebijakan ujian, hasil/canvas, otomasi, reminder, retensi, sender dan referensi secret. | Admin saja | R/U konfigurasi, simpan/ganti secret; tidak ada baca balik nilai secret. |
| 15 | Audit aktivitas | `/dashboard/audit` | Menelusuri tindakan, pelaku, sasaran dan waktu untuk pengawasan operasional. | Admin saja | R; tidak ada edit/hapus audit melalui halaman. |
| 16 | Otomasi dan backup | `/dashboard/jobs` | Memantau pekerjaan, meminta backup/probe SMTP, retry, membatalkan backup dan rekonsiliasi status email yang tidak pasti. | Admin saja | C pekerjaan, R status/unduhan, U tindakan terkontrol; bukan halaman restore atau hapus semua data. |
| 17 | Portal siswa / player ujian | `/student` | Daftar ujian sendiri, mulai/lanjut ujian, jawaban/canvas, sinkronisasi, submit, hasil yang diizinkan, kotak pesan dan permintaan bantuan. | Siswa dalam konteks siswa | C attempt/jawaban sendiri; R sendiri; U jawaban selama ujian terbuka dan status baca pesan; tidak ada D attempt/hasil. |
| 18 | Portal pengawas | `/supervisor` | Monitoring peserta dan intervensi pada ruang/sesi tugas efektif; pesan, bantuan/tanggapan, indikator koneksi, riwayat, serta kartu peserta dalam panel tambahan. | Pengawas atau Guru dalam konteks pengawas dengan penugasan sah | R peserta tugas, U reset/unlock/diskualifikasi beralasan, C pesan/kartu dalam cakupan; tidak mengelola ruang/penugasan. |
| 19 | Persiapan ujian | `/dashboard/preparation` | Wizard pembuatan draf, checklist kesiapan, siklus ujian dan publikasi jadwal. | Admin, Guru konteks staf | Admin C/R/U draf dan U publikasi jadwal setelah pemeriksaan; Guru R kesiapan dalam cakupan authoring. Tidak ada D permanen. |
| 20 | Bank soal | `/dashboard/bank` | Taksonomi, versi, review, impor, kisi-kisi, paket dan kualitas butir. | Admin, Guru konteks staf | C/R sesuai organisasi/seluruh kelas–mapel; U konten pemilik/Admin, review penilai lain; arsip tanpa D permanen. |
| 21 | Koreksi dan moderasi | `/dashboard/grading` | Koreksi anonim, rubrik kriteria, moderasi dan jadwal publikasi. | Admin, Guru konteks staf | C/R/U penilaian dalam cakupan snapshot; keputusan moderasi oleh penilai lain; publikasi dan jadwal hanya Admin; tanpa D riwayat. |

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

Publikasi hasil hanya Admin. Hak publikasi tidak memberi Siswa akses hasil orang lain atau semua kunci soal. Hasil/laporan memiliki ledger/revisi, pemeriksaan versi, dan jejak koreksi. Laporan tersedia dalam jenis recap, class, student, paper, answers, blank, dan analytics, dengan format PDF/XLSX sesuai validasi/pembuatan dokumennya. Pekerjaan laporan dibatasi ke peminta dan izin setiap attempt diperiksa kembali; Admin tidak otomatis mendapat semua job laporan milik orang lain.

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
| Inventaris 21 halaman | `app/**/page.tsx` dan `app/page.tsx` |
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

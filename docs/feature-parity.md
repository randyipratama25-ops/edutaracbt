# Matriks fitur

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Seluruh fitur BELUM DIIMPLEMENTASIKAN dan BELUM DIUJI. Kepemilikan tahap dari rencana berikut.

## 7. Matriks keterlacakan fitur

Setiap baris wajib dilengkapi lokasi implementasi, API/service, policy, tes dan bukti UAT saat pengerjaan. Tahap pada tabel adalah penanggung jawab utama, bukan batas eksklusif.

| ID | Kemampuan dari dokumen dasar | Tahap pemilik | Status awal |
|---|---|---|---|
| F01 | Halaman login responsif, pilihan peran Siswa / Admin-Guru / Pengawas, validasi form, PIN ujian siswa, remember username, status jaringan, sesi tersimpan, pemulihan login, logout | 1.3 | BELUM DIMULAI |
| F02 | Peran Admin, Guru, Pengawas, Siswa; status aktif; Guru memiliki pasangan mata pelajaran–kelas; Guru dapat menjadi pengawas saat mendapat penugasan | 1.3 | BELUM DIMULAI |
| F03 | Dashboard admin/guru dengan statistik, informasi terkini, command palette dan lonceng aktivitas; UI sidebar collapse/mobile | 1.1/1.3 | BELUM DIMULAI |
| F04 | CRUD jadwal ujian: mapel, beberapa kelas, waktu mulai/akhir, durasi, PIN, status, passing grade, pengacakan, konfigurasi jenis & kuota soal, bypass periode input, duplikasi dan hapus massal | 2.1 | BELUM DIMULAI |
| F05 | Otomatisasi status ujian dari jadwal, aktif/nonaktif, penutupan, timeout otomatis | 2.1/6.1 | BELUM DIMULAI |
| F06 | Bank soal lima tipe: PG, PG kompleks, BS, JODOH, Esai, poin, wajib/tidak, kunci, pembahasan/rubrik, lampiran gambar/audio, min karakter esai | 2.2 | BELUM DIMULAI |
| F07 | Pembatasan tipe soal per ujian (`enabled`, `max`, `optCount`, `defaultPoint`), validasi dan kuota saat menambah, edit, menyalin, dan impor | 2.1/2.3 | BELUM DIMULAI |
| F08 | Editor rich text (TinyMCE), rumus MathJax/LaTeX, keyboard karakter/simbol/Arab/matematika, pratinjau, sisip gambar/audio | 2.2 | BELUM DIMULAI |
| F09 | Input soal satuan, bulk text multi-format dengan parser/validator serta pratinjau blok valid-gagal, copy template, impor Excel, impor Google Forms, salin antarujian, hapus massal | 2.3 | BELUM DIMULAI |
| F10 | Periode global input soal Guru, pengecualian per ujian, guard server, indikator progress/target pembuatan soal per guru dan per ujian | 2.1/2.3 | BELUM DIMULAI |
| F11 | Siswa login menggunakan PIN yang cocok dengan kelas dan ujian; validasi waktu/status; dapat masuk hasil saja bila telah menyelesaikan ujian | 3.1/4.1 | BELUM DIMULAI |
| F12 | Pemilihan soal berdasarkan tipe, urutan tipe, acak soal tiap tipe dan acak pilihan PG/PG kompleks, navigasi prev/next dan nomor soal, jawaban tiap tipe | 3.1 | BELUM DIMULAI |
| F13 | Timer ujian, resume, autosave/jeda sinkronisasi, status `In Progress`/`Completed`/`Waktu Habis`/`Curang`, submit manual/otomatis | 3.1/3.2 | BELUM DIMULAI |
| F14 | Kontrol anti-kecurangan: full screen, deteksi kehilangan fokus/pindah tab, Windows/Meta, pagehide, copy/cut/paste/menu konteks; catat insiden, blur, intervensi pengawas | 3.3 | BELUM DIMULAI |
| F15 | Dukungan ujian ponsel landscape, toleransi perubahan orientasi & keyboard virtual, wake lock, modal konfirmasi/peringatan dan toleransi waktu | 3.3 | BELUM DIMULAI |
| F16 | Esai rich text, batas karakter opsional, pratinjau MathJax, mode menggambar di canvas, konversi gambar/rumus menjadi LaTeX via layanan eksternal | 3.1 | BELUM DIMULAI |
| F17 | Penilaian objektif (termasuk kredit parsial tipe tertentu), nilai akhir 0–100, passing grade dan label kelulusan | 4.1 | BELUM DIMULAI |
| F18 | Koreksi esai per peserta/per soal, batch save, progress koreksi, skor esai manual, rekalkulasi nilai | 4.2 | BELUM DIMULAI |
| F19 | Bantuan penilaian esai AI, skor saran beserta alasan, satu soal/batch, terima/ubah lalu simpan oleh pengajar | 4.2 | BELUM DIMULAI |
| F20 | Rekap hasil ujian, filter, sortir, pencarian, pagination, status, buka blokir, reset percobaan, detail jawaban, cetak/unduh per siswa | 4.1/5.2 | BELUM DIMULAI |
| F21 | Analisis butir PG/PG kompleks/BS/JODOH, tingkat kesukaran, daya pembeda, sebaran pilihan, data peserta salah, analisis esai | 4.3 | BELUM DIMULAI |
| F22 | Laporan per peserta, ringkasan per kelas, ekspor Excel, PDF dan cetak massal | 4.3 | BELUM DIMULAI |
| F23 | CRUD pengguna semua peran, aktif/nonaktif, penugasan guru, impor massal siswa/pengguna, unduh template, filter, pagination | 1.4 | BELUM DIMULAI |
| F24 | Data master kelas/mapel; tambah/ubah/hapus/search/sort/bulk paste | 1.4 | BELUM DIMULAI |
| F25 | Manajemen gambar dan audio: upload batch, drag/drop, sinkron dari folder, galeri/tabel, salin URL, proteksi akses, pemilihan lampiran dan hapus | 1.2/2.2/5.3 | BELUM DIMULAI |
| F26 | Kartu ujian siswa perorangan/massal, template, ekspor PDF dan ZIP, progress pembuatan | 5.3 | BELUM DIMULAI |
| F27 | Pemantauan ujian real-time/polling, statistik siswa, jumlah jawaban, waktu, status login/ujian/curang, detail pelanggaran, filter, export, unlock/reset, operasi bulk | 5.2 | BELUM DIMULAI |
| F28 | Kirim notifikasi dari petugas ke semua peserta/ujian/peserta terpilih, terima notifikasi di layar ujian, status terbaca dan riwayat | 5.3 | BELUM DIMULAI |
| F29 | Manajemen pengawas per ujian-ruang-sesi, penunjukan pengawas pengganti, pencabutan, otorisasi pengawas efektif dan audit | 5.1 | BELUM DIMULAI |
| F30 | Dashboard/monitor khusus Pengawas sesuai penugasan; akses terbatas peserta di ruangnya; aksi unlock/reset/notifikasi sesuai izin | 5.1/5.2 | BELUM DIMULAI |
| F31 | CRUD ruang ujian, kapasitas, penugasan pengawas, tambah/hapus peserta, penolakan siswa ganda antar-ruang pada ujian sama, sinkron nama ruang/penugasan | 5.1 | BELUM DIMULAI |
| F32 | Konfigurasi identitas dan tampilan aplikasi, logo, gambar login, hasil siswa, batas pelanggaran, fitur canvas, pengaturan kop PDF, folder media, kartu, kunci AI | 6.1 | BELUM DIMULAI |
| F33 | Audit log tindakan admin/pengawas/guru: login/logout, perubahan data, blokir/unlock, nilai, backup, penugasan | 1.3/6.1 | BELUM DIMULAI |
| F34 | Backup manual/terjadwal akhir semester, pemeriksaan trigger, backup data dan lampiran | 6.1 | BELUM DIMULAI |
| F35 | Pengingat email progres input soal Guru (periode mendekati akhir), verifikasi status email dari sumber lama dan mekanisme anti-duplikasi pengiriman | 6.1 | BELUM DIMULAI |
| F36 | Format dokumen institusi: kop, identitas pejabat, daftar soal PDF, rekap hasil PDF, laporan per siswa, kartu peserta | 4.3/5.3 | BELUM DIMULAI |

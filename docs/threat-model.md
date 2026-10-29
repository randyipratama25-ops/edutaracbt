# Threat model awal

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Aset: kredensial dan sesi, PIN, identitas siswa, soal dan kunci, jawaban, skor, file, log dan backup. Aktor: siswa, guru, pengawas, admin, akun dinonaktifkan, pengguna lintas kelas/ruang dan penyerang tanpa autentikasi.

| Ancaman | Pengendalian rancangan | Bukti yang dibutuhkan |
|---|---|---|
| IDOR lintas siswa/kelas/ruang | Identitas tervalidasi server + role + resource scope; RLS | Tes negatif tiap endpoint dan channel |
| Kebocoran kunci/secret/password | DTO khusus siswa, secret server, data akun tanpa password terbaca | Uji response, logs, storage dan exports |
| Pemalsuan waktu/skor/status | Deadline dan transisi server, grading terpusat | Uji manipulasi jam/request dan timeout |
| Hilangnya jawaban akibat retry/race | Revisi, idempotensi, ack persisten, penanganan konflik | Uji offline, dua tab, submit ganda |
| XSS/rich text dan file | Sanitasi, CSP, validasi file, private storage | Uji payload berbahaya dan izin file |
| Pengawas pengganti berubah | Otorisasi efektif pada setiap aksi dan subscription | Tes pencabutan hak segera |
| Restore tidak lengkap | Backup metadata dan bytes, checksum, latihan restore | Laporan restore staging |

Model ini belum merupakan pengujian penetrasi atau verifikasi konfigurasi Supabase.

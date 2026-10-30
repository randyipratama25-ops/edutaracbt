# Penerimaan UAT dan cutover — BELUM DISAHKAN

Persetujuan mengerjakan Tahap 7/merge PR tidak berarti skenario UAT telah lulus.

| Bukti wajib | Status | Penanggung jawab / artefak |
|---|---|---|
| Admin/Guru/Pengawas/Siswa end-to-end | Belum lengkap | Belum ditetapkan |
| Desktop/tablet/ponsel fisik | Belum disahkan | Belum tersedia |
| Beban staging dan SLO | Target 150 disepakati; burst backend TIDAK LULUS | docs/acceptance/operational-report.md |
| Audit keamanan SEC-01–SEC-26 final | Belum ditutup seluruhnya | Register dan bukti perlu rekonsiliasi |
| Inbox dan pemulihan akun end-to-end | Belum diverifikasi | Konfigurasi aplikasi aktif; bukti inbox/tautan tetap harus dilengkapi |
| Dataset legacy/freeze/delta parity | Sumber belum tersedia | Tidak diasumsikan fresh start |
| Rollback cloud, media/Auth/Vault | Belum dilatih penuh | Latihan lokal terbatas tersedia |
| Masa observasi rilis | Usulan 60 menit; belum disepakati | Pemilik belum mengesahkan durasi |
| Persetujuan rilis operasional final | Belum disahkan | Tidak ada tanda tangan sintetis |

Penguji mengisi actual result, candidate SHA, lingkungan, tanggal dan artefak untuk setiap skenario T026/T029/T035/T037/T046/T048 serta smoke tiap peran berdasarkan acuan. Jangan mencentang berdasarkan implementasi kode saja. Dispensasi harus menyebut ruang lingkup, risiko dan persetujuan pemilik; tidak diperlakukan sebagai bukti tes lulus oleh release gate.

## Matriks UAT setelah Saran Tahap 5

Kolom aktual dan penguji masih menunggu observasi manusia. Pengujian otomatis/viewport tidak boleh mengisi kelulusan perangkat fisik.

| Peran | Skenario | Kriteria hasil | Hasil aktual / bukti |
|---|---|---|---|
| Admin | Pemeriksaan operasional dan ekspor | Snapshot sesuai organisasi, tidak ada secret/PII, unduhan tetap belum disahkan | Menunggu |
| Guru | URL/API penerimaan langsung | Ditolak; menu Admin tersembunyi | Menunggu UAT; regresi otomatis tersedia |
| Guru | Bank soal kelas penuh/sebagian, review sendiri | Sebagian kelas ditolak; self-review ditolak; penilai lain berizin dapat meninjau | Menunggu |
| Admin/Guru | Koreksi rubrik, nilai 0, moderasi, revisi usang | Kriteria lengkap, proposal tidak mengubah nilai resmi, keputusan penilai lain, revisi usang ditolak | Menunggu |
| Admin | Jadwal publikasi dan perubahan nilai | Jadwal memeriksa ulang revisi; perubahan menyembunyikan hasil; tidak ada publikasi tak berizin | Menunggu |
| Pengawas | Bantuan, unlock/reset, penugasan dicabut | Cakupan waktu/ruang ditegakkan; bukti/deadline dipertahankan; akses hilang setelah pencabutan | Menunggu |
| Siswa | Putus jaringan, tab ditutup, pindah perangkat, submit ulang | ACK server sesuai revisi, pemulihan eksplisit, satu writer, deadline tetap, finalisasi satu kali | Menunggu |
| Semua peran | Undangan/reset/password dan login kembali | Tautan menuju domain aplikasi, akun/konteks benar, feedback jelas | Menunggu verifikasi terbaru |
| Operator | Backup baru, verifikasi checksum, restore terisolasi | Versi/review bank, nilai/rubrik dan presisi desimal identik; media/Auth/Vault ditinjau terpisah | Menunggu latihan cloud; regresi lokal tersedia |

Ulangi pada desktop, tablet dan ponsel fisik, keyboard/touch, koneksi lambat/terputus. Catat waktu, candidate SHA, perangkat/OS/browser, identitas penguji, actual result dan artefak privat; jangan simpan password atau token dalam laporan/repository.

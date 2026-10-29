# Penerimaan UAT dan cutover — BELUM DISAHKAN

Persetujuan mengerjakan Tahap 7/merge PR tidak berarti skenario UAT telah lulus.

| Bukti wajib | Status | Penanggung jawab / artefak |
|---|---|---|
| Admin/Guru/Pengawas/Siswa end-to-end | Belum lengkap | Belum ditetapkan |
| Desktop/tablet/ponsel fisik | Belum disahkan | Belum tersedia |
| Beban staging dan SLO | Belum dijalankan/disepakati | Belum tersedia |
| Audit keamanan SEC-01–SEC-26 final | Belum ditutup seluruhnya | Register dan bukti perlu rekonsiliasi |
| Inbox dan pemulihan akun end-to-end | Belum diverifikasi | SMTP kustom nonaktif |
| Dataset legacy/freeze/delta parity | Sumber belum tersedia | Tidak diasumsikan fresh start |
| Rollback cloud, media/Auth/Vault | Belum dilatih penuh | Latihan lokal terbatas tersedia |
| Masa observasi rilis | Usulan 60 menit; belum disepakati | Pemilik belum mengesahkan durasi |
| Persetujuan rilis operasional final | Belum disahkan | Tidak ada tanda tangan sintetis |

Penguji mengisi actual result, candidate SHA, lingkungan, tanggal dan artefak untuk setiap skenario T026/T029/T035/T037/T046/T048 serta smoke tiap peran berdasarkan acuan. Jangan mencentang berdasarkan implementasi kode saja. Dispensasi harus menyebut ruang lingkup, risiko dan persetujuan pemilik; tidak diperlakukan sebagai bukti tes lulus oleh release gate.

# Kirim ulang undangan — Halaman Pengguna

Admin membuka Aksi > Kirim ulang undangan, memeriksa email terdaftar dan status akun, lalu menekan Kirim undangan. Modal menampilkan proses, hasil atau alasan penolakan. Email tujuan diambil dari Auth berdasarkan ID pengguna di organisasi yang sama, bukan dari input browser.

Pembatasan: hanya Admin aktif; target aktif/tidak diarsipkan, pernah diundang, dan email belum dikonfirmasi. Akun yang sudah dikonfirmasi diarahkan ke Lupa password tanpa otomatis mengirim email pemulihan. Tidak membuat ulang profil atau mengganti password/peran/kelas.

Server memakai inviteUserByEmail ke /auth/reset pada domain utama. Request dibatasi oleh budget bersama per organisasi/target (10 permintaan dalam 15 menit), pemeriksaan invited_at 60 detik, serta rate limit penyedia. UI mengunci pengiriman pada klik pertama dan tidak retry otomatis jika jaringan bermasalah. Ini bukan jaminan exactly-once lintas tab/perangkat; hasil yang tidak pasti meminta Admin memeriksa inbox sebelum mencoba lagi.

Audit RESEND_INVITATION mencatat aktor/target/request tanpa token atau isi email. Detail error SMTP tidak dikirim ke browser. Kegagalan audit setelah email diterima layanan tidak dilaporkan sebagai kegagalan pengiriman agar tidak memicu retry yang tidak perlu.

Validasi: 11 tes baru mencakup akses Admin, lintas organisasi, status akun, cooldown/budget, rate limit penyedia, konfirmasi bersamaan, kegagalan jaringan/SMTP dan audit. Pengiriman di tes memakai mock, bukan alamat operasional. Verifikasi inbox dan klik aktivasi tetap perlu dilakukan setelah Admin mengirim kepada pengguna yang dimaksud.

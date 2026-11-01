# Pemeriksaan perangkat sebelum ujian

Siswa membuka `/student`, menekan Periksa perangkat, meninjau hasil/contoh, lalu mengonfirmasi kesiapan sebelum memulai ujian baru. Hasil bertahan lima menit dalam memori tab; offline membatalkan, dan handler Mulai mengecek umur hasil secara langsung. Resume/status/takeover tidak diblokir. PIN serta izin/jadwal tetap diperiksa server; gate UI bukan bukti keamanan.

Enam hasil: HTTPS/UUID, localStorage, sessionStorage, canvas, layar dan permintaan ke `/api/attempts/preflight`. Endpoint GET memakai actor aktif konteks siswa dan respons private no-store. Tidak membuat attempt atau mutasi database. Penyimpanan menggunakan key probe unik dan hanya menghapus key tersebut. Kegagalan HTTPS/UUID atau koneksi/sesi memerlukan perbaikan; kendala storage/canvas/lebar layar/respons lambat dapat dilanjutkan setelah siswa membaca dan konfirmasi.

Contoh menggunakan renderer rumus aplikasi, SVG statis dua bentuk, WAV sintetis 440 Hz setengah detik, input sementara dan canvas tanpa unggahan. Tidak meminta kamera/mikrofon, tidak mendeteksi SEB/fingerprint, tidak memeriksa baterai secara otomatis. Contoh media bukan uji lampiran ujian sesungguhnya. Audio tidak diputar otomatis. Latensi satu permintaan bukan tes bandwidth atau jaminan kestabilan internet.

Tidak ada skema, tabel, hak CRUD atau migrasi database baru. Inventaris halaman tetap 23.

Validasi: tes batas akses endpoint/no-store, umur hasil/konfirmasi, kegagalan dan isolasi probe penyimpanan; uji browser API simulasi untuk gate Mulai, sesi gagal/retry, offline, kedaluwarsa, peringatan storage, resume, rumus/ketik/media/canvas, serta lebar 320/390/768/1440. Uji otomatis bukan UAT perangkat fisik atau jaminan output audio terdengar pada perangkat pengguna.

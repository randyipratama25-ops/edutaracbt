# Notifikasi yang dapat ditindaklanjuti

Notifikasi petugas sekarang memiliki judul, prioritas, isi, waktu WIB dan opsional konteks ujian. Siswa memfilter belum dibaca, berpindah halaman 20 pesan dan menandai pesan/halaman dibaca. Badge menghitung seluruh pesan belum dibaca dalam organisasi. Membuka tindakan tidak otomatis menandai dibaca atau menyatakan pekerjaan selesai.

Tindakan ujian hanya fokus/scroll kartu DOM portal saat tersedia. UUID tervalidasi; tidak menerima URL, tidak menavigasi atau memuat ulang, tidak memanggil perintah attempt. Player aktif tidak ditutup; jika kartu tidak tersedia, tampilkan petunjuk. Grant ujian/jadwal/PIN/deadline tetap diperiksa server seperti sebelumnya. Tidak ada pesan nyata, email, push atau izin browser yang dikirim/diminta saat implementasi.

Petugas mengirim pada cakupan lama dengan judul/prioritas dan opsi ujian hanya untuk exam/selected. Default payload lama tetap kompatibel. SQL mempertahankan rate limit, idempotensi dan audit broadcast. Metadata bukan hasil interpretasi otomatis pesan. Riwayat pengiriman merangkum penerima berizin dan status baca, bukan bukti tindakan selesai.

RPC inbox_page/read_batch dibatasi penerima dan organisasi; konteks ujian hanya diproyeksikan jika kelas/enrollment aktif dan status ujian tersedia. Kolom/indeks baru berada pada tabel private yang sudah RLS tanpa grant langsung. Legacy inbox/sent masih array. Read idempoten mempertahankan waktu baca pertama; batch maksimal 20. UI menolak klik ganda dan tidak mengubah status secara optimistis saat server gagal. Respons konteks lama diabaikan; cached data diberi keterangan jika polling gagal.

Migrasi 20261101062737_actionable_notifications.sql diterapkan di staging dan produksi. Restore-drill (lokal terisolasi) mengisi title/priority default bila record backup lama tidak memiliki kolom itu; record baru tetap mempertahankan metadata. Tidak ada perubahan deadline, jawaban, nilai, halaman atau hak mengedit isi pesan. Inventaris tetap 23.

Validasi: PGlite mencakup idempotensi, metadata, penerima/tenant, akses ujian dicabut, 106 pesan/global count, read/batch/grants dan restore backup lama. API/schema tests memeriksa origin, konteks, page/filter, batch 20 serta penolakan URL pada helper fokus. Browser API simulasi: 25 pesan, pagination/filter, read failure/retry, batch halaman, fokus kartu, player tanpa reload dan autosave, form broadcast terstruktur, 320/390/768/1440. Bukan UAT akun/perangkat fisik atau bukti pengiriman nyata.

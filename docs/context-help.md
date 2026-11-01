# Pusat bantuan sesuai konteks

Tombol Bantuan membuka dialog di halaman yang sama: shell dashboard 18 halaman, siswa (portal, player, penguncian, hasil, snapshot tidak tersedia), pengawas, beranda, login dan atur password. Inventaris tetap 23 halaman. Tidak ada migrasi, tabel, endpoint, tiket baru atau mutasi data.

Katalog statis memuat tujuan/langkah dan penanganan kendala per halaman, pemulihan jawaban, pengumpulan serta cara melaporkan kendala dengan aman. Panduan ditapis menurut konteks peran yang diberikan host; pencarian awal Halaman ini dapat diperluas ke Semua panduan peran saya. Perubahan halaman/peran mereset dialog dan kata pencarian. Konteks ini mengatur panduan, bukan otorisasi data; server tetap menentukan izin sebenarnya.

Pencarian dibatasi 120 karakter, tidak peka kapital dan mencocokkan seluruh kata pada judul, langkah, kendala serta kata kunci. Keadaan kosong menyediakan reset/perluasan cakupan. Search/state hanya memori browser: tidak ada telemetry, simpan lokal, request pencarian atau panggilan AI. Artikel generik fallback tersedia pada halaman yang tidak dikenal.

Ruang ujian memakai dialog tanpa tautan navigasi. Timer dan autosave tidak dihentikan. Minta bantuan pengawas tetap terpisah dan memakai endpoint/izin lamanya. Panduan tidak menyatakan laporan sudah terkirim; siswa offline diminta menghubungi pengawas langsung. Isi panduan tidak memuat secret atau data peserta.

Validasi: cakupan seluruh halaman produksi, isolasi peran, konteks route tepat, pencarian/hasil kosong; browser fixture untuk dialog/fokus/Escape, pencarian offline, pergantian konteks, integrasi shell/siswa/player, timer/autosave ketika panduan terbuka dan ukuran 320/390/768/1440. Bukan UAT akun produksi atau seluruh perangkat fisik.

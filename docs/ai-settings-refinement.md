# Penyempurnaan pengaturan AI

Kartu delapan penyedia, hydrate konfigurasi tersimpan, status key/uji/aktif, penggunaan harian UTC dan uji berhasil terakhir. Pisahkan simpan/uji/aktivasi; nonaktifkan provider secara eksplisit. Lindungi perubahan belum disimpan dan tampilkan error/retry tanpa membaca key kembali. Model tetap memakai ID dari tautan dokumentasi resmi, bukan daftar dinamis atau jaminan akses model.

Migrasi menambah last_tested_at dan indeks ai_calls_usage, konfigurasi Admin/organisasi/versi serta menonaktifkan auto-activation pada hasil tes worker. Hasil koreksi tetap saran, tidak mengubah nilai otomatis. Batas harian jumlah esai bukan batas biaya.

Database tests: Vault/grants, test tidak mengaktifkan, aktivasi dan disable/version, status false dan total nol, penolakan Guru. Browser: 8 provider, hydrate, key clearing, switch unsaved, test/activate/disable, error/retry, 320/390/768/1440 dengan API simulasi. Tidak memakai API key nyata, bukan pengesahan akurasi model.

# Fixture penilaian awal

12 contoh data sintetis tanpa data siswa. Nilai expected diturunkan dari rulebook; bukan bukti hasil runtime source. `pg-shuffled-options` memakai ID kanonik usulan, bukan format legacy; harus dilengkapi adapter. `essay-ungraded` dan `essay-manual-zero` menandai perbedaan status yang harus dipertahankan aplikasi baru, bukan klaim bahwa source menyimpannya demikian. Tambahkan kasus duplikat opsi PG kompleks, F, BS tanpa statements, jodoh duplikat, grade dan total nol. Differential test masih belum dijalankan.

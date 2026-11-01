# Konfigurasi AI multi-penyedia

Implementasi menggunakan OpenAI, Anthropic, Google, DeepSeek, Mistral, Groq, xAI dan OpenRouter. Admin menyimpan satu model dan API key per penyedia di Fitur Lanjutan. API key disimpan di Vault, tidak dibaca kembali atau dimasukkan ke audit.

Simpan model, key, izin data dan batas harian; lalu gunakan Uji koneksi, kemudian Aktifkan sebagai tindakan terpisah. Uji memakai pertanyaan sintetis, bukan jawaban siswa. Perubahan konfigurasi menonaktifkan penyedia sampai diuji ulang. Nonaktifkan tersedia secara eksplisit. Penggunaan API dapat dikenai biaya penyedia. Hitungan harian menunjukkan esai, bukan biaya atau token. Status menampilkan hasil uji terakhir dan pemakaian harian UTC. Pilihan model menggunakan ID manual dengan tautan dokumentasi resmi penyedia.

Penilai memilih penyedia aktif di detail Hasil. Batch maksimal lima esai teks; canvas/lampiran dan rubrik per kriteria tetap dikoreksi manual. Worker hanya menambahkan saran pending; nilai resmi memerlukan keputusan penilai dan pemeriksaan revisi yang sudah ada. Tidak ada fallback lintas penyedia secara otomatis.

Penyimpanan Vault dan integrasi worker telah diterapkan di staging dan produksi. Migrasi penyempurnaan menambahkan waktu uji, kendali aktivasi/nonaktivasi dengan versi konfigurasi, serta penguncian baris saat uji untuk mencegah konfigurasi yang berubah disahkan oleh hasil uji lama.

Validasi: lint, TypeScript, tes aplikasi dan build lulus. Tes database terisolasi memastikan penyimpanan Vault, non-readback, konfigurasi nonaktif awal dan grants. Uji koneksi nyata dengan key pemilik belum dilakukan. Halaman tetap 23.

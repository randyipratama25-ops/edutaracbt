# Konfigurasi AI multi-penyedia

Implementasi menggunakan OpenAI, Anthropic, Google, DeepSeek, Mistral, Groq, xAI dan OpenRouter. Admin menyimpan satu model dan API key per penyedia di Fitur Lanjutan. API key disimpan di Vault, tidak dibaca kembali atau dimasukkan ke audit.

Simpan model, key, izin data dan batas harian; lalu gunakan Uji koneksi dan aktifkan. Uji memakai pertanyaan sintetis, bukan jawaban siswa. Perubahan konfigurasi menonaktifkan penyedia sampai diuji ulang. Penggunaan API dapat dikenai biaya penyedia.

Penilai memilih penyedia aktif di detail Hasil. Batch maksimal lima esai teks; canvas/lampiran dan rubrik per kriteria tetap dikoreksi manual. Worker hanya menambahkan saran pending; nilai resmi memerlukan keputusan penilai dan pemeriksaan revisi yang sudah ada. Tidak ada fallback lintas penyedia secara otomatis.

Staging: penyimpanan dan integrasi server telah diterapkan. Produksi: hanya migrasi penyimpanan yang berhasil; integrasi dan deployment worker ditolak peninjauan persetujuan otomatis karena target produksi dinilai belum cukup terkonfirmasi. Belum merge atau rilis.

Validasi: lint, TypeScript, tes aplikasi dan build lulus. Tes database terisolasi memastikan penyimpanan Vault, non-readback, konfigurasi nonaktif awal dan grants. Uji koneksi nyata dengan key pemilik belum dilakukan. Halaman tetap 23.

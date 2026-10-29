# Daftar pemeriksaan anomali

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Status seluruh pemeriksaan: BELUM DIUJI PADA DATA PRODUKSI.

| Pemeriksaan | Tindakan jika ditemukan |
|---|---|
| Duplikasi UserID, ExamID, QuestionID, ResponseID | Karantina; simpan baris sumber dan ID stabil; jangan menggabungkan otomatis |
| Referensi user/exam/soal/ruang yatim | Karantina dan rekonsiliasi dengan pemilik data |
| JSON rusak atau struktur campuran | Catat posisi, tipe, transformasi; jangan membuang isi |
| Kunci F/opsi keenam dan BS tanpa statements | Fixture dan review hasil sebelum regrading |
| Assignment guru berupa string atau JSON, kelas mirip | Normalisasi ke FK; exact match; review ambigu |
| Media URL tidak dapat diakses / checksum | Catat kekurangan dan retry berizin; jangan klaim migrasi selesai |
| Password/token dan data sensitif | Jangan salin ke fixture/log; reset akun melalui prosedur disetujui |
| Timestamp, zona waktu, status dan nilai historis | Catat nilai asli, konversi eksplisit dan selisih; jangan timpa nilai |

Sampel tersamarkan, counts, pemeriksaan sheet/header aktual dan ERD final memerlukan akses dataset; tidak dapat disimpulkan dari kode.

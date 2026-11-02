# Audit Analitik dan laporan — 2 November 2026

## Temuan dan perbaikan

- Waktu final dibandingkan secara leksikografis: offset zona waktu dapat memilih attempt lama. Pemilihan kini memakai instant, mikrodetik PostgreSQL dan ID sebagai tie-break; tetap satu hasil final layak terbaru per siswa per ujian.
- Data final tidak lengkap/non-finite dapat menghasilkan statistik keliru. Kelayakan memeriksa skor, timestamp, poin dan earned; API memvalidasi detail, deduplikasi ID dan timeout baca 15 detik. Rumus P/D, kelompok 27%, batas kategori, pemisahan versi dan nilai resmi tidak berubah.
- Penghitung pasangan memakai objek ber-prototype, label __proto__/constructor dapat rusak; Zod record juga membuang __proto__. Map tanpa prototype dipertahankan melalui JSON/validasi kontrak. BS boolean/string disetarakan sesuai PostgreSQL ->>; PG malformed tidak dianggap pilihan.
- Analisis lama tetap tampil setelah pilihan/revisi berubah atau analisis baru gagal. Basis pilihan/revisi, pembersihan saat perubahan/mutation, error lokal dan coba ulang menjaga kesesuaian UI. Respons list usang diperiksa sebelum page-clamp.
- Analisis lintas ujian tidak jelas identitasnya dan seluruh detail dirender sekaligus. Tampilan bersama menampilkan nama ujian, versi, metrik, panduan, pencarian, filter lima tipe, pagination 20, detail lazy dan perluasan peserta bertahap. Analytics menempatkan tindakan utama lebih dahulu dalam DOM dan memakai ekspor analitik sebagai default; Results tetap default rekap.
- PDF/XLSX analitik menyertakan nama ujian; XLSX menambahkan ID ujian/soal dan isi soal utuh melalui splitCell dengan proteksi formula. Batas data worker 30 MB dihitung byte UTF-8, sebelumnya panjang string UTF-16.
- CSS analitik terisolasi, wrapping dan scroll tabel internal; tidak menutup overflow halaman untuk menyembunyikan konten.

## Cakupan dan kompatibilitas

Sumber yang ditelusuri: page Analytics, ResultsPanel, DashboardShell/CSS/list filters/dialog/client request, kontrak dan engine analitik, route results/reports/run/download, worker/render/schema/exchange, SQL report_command/results_command/grade_one/check_answer/can_grade dan pengujian terkait. Tidak ada halaman baru (tetap 23), migrasi database, dependency, Edge Function atau perubahan struktur API/data bisnis. Hak staf can_grade, publikasi/kop Admin, ledger, alasan/revisi, rubrik/moderasi, delapan laporan, snapshot/version pinning, kepemilikan job dan lease dipertahankan.

## Validasi

- `npm run check`: lint tanpa error (satu warning AI settings yang sudah ada), TypeScript, 302 passed/3 skipped dan build produksi lulus.
- 11 regresi baru: offset/mikrodetik/tie, BS, prototype, PG malformed, data final, cohort/version/P/D, kontrak API/ID, akses anonim, HTML/XLSX panjang dan formula, batas byte worker.
- Browser Results pada komponen produksi: Admin/Guru, mobile 390, orientation/layar pendek/text 200%/touch/axe; koreksi nol/alasan/revisi, lock dialog, batch, AI, pilihan/filter/pagination, kop batal/simpan, analisis/ekspor/rekalkulasi/publikasi, error/konflik/timeout dan polling lulus. Penulisan API disimulasikan.
- PDF Chromium nyata: laporan analitik dua ujian mempertahankan nama keduanya, P=1 dan marker soal terakhir; laporan rinci Arab/matematika panjang mempertahankan marker jawaban terakhir. XLSX dibaca kembali dengan ExcelJS.

Interaksi browser memakai fixture API pada halaman produksi, tanpa mengubah nilai, publikasi, job atau email produksi. Bukan klaim UAT seluruh perangkat fisik atau jaminan tidak ada bug pada semua kondisi. Browser analitik produksi lulus pada 320/390/768/1024/1440, orientation/layar pendek/text 200%, axe tanpa pelanggaran WCAG A/AA, 41 butir, lazy detail, pagination, pencarian, tipe, perluasan peserta, invalidasi pilihan, empty/error/retry dan akses Guru. Tidak teridentifikasi pageerror atau horizontal overflow pada matriks ini. CI dan deployment dicatat dalam PR.

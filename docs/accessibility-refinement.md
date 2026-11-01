# Penyempurnaan aksesibilitas

Komponen dialog bersama menangkap pembuka sebelum portal autofocus, mempertahankan mekanisme modal Radix, mengembalikan fokus ke pembuka, atau main jika pembuka dihapus. Handler onCloseAutoFocus khusus tetap didahulukan. Tombol tutup eksplisit type=button. Navigasi dashboard memberi status buka pada tombol menu, memfokuskan main dan mengumumkan judul setelah perubahan pathname; tidak dijalankan pada player ujian.

Kontras footer, placeholder dan batas input/outline diperkuat. Forced-colors memakai system Highlight/ButtonText. Pengurangan animasi yang telah tersedia dipertahankan. Login menghubungkan username/password dengan feedback, password memiliki label eksplisit; atur password menandai konfirmasi berbeda dengan aria-invalid serta aria-describedby. Esai merujuk keterangan panjang jawaban; timer aria-live=off. Tidak ada perubahan deadline, penyimpanan jawaban atau keputusan nilai.

Tidak ada migrasi, endpoint, halaman atau hak CRUD baru. Inventaris tetap 23. Tidak mengklaim canvas menggambar sepenuhnya dapat digunakan dengan keyboard; alternatif teks yang tersedia tetap dapat digunakan dan kebutuhan khusus perlu didampingi pengawas.

Jalankan `npm run test:accessibility` dengan Chrome yang sesuai melalui EDUTARA_TEST_CHROME jika diperlukan. Script membuat route fixture sementara lalu membersihkannya; jangan commit route fixture atau cache pengujian. axe-core dipatok pada devDependencies, memakai puppeteer-core/Chromium yang sudah tersedia; tidak memerlukan paket puppeteer dengan pengunduh browser tambahan. Test menghasilkan laporan JSON lokal sementara, bukan data siswa.

Validasi: 18 scan axe pada tag wcag2a/wcag2aa/wcag21aa/wcag22aa, login/password/dashboard/player 320/768/1440, dialog pemulihan/generik, invalid password, menu mobile, peta soal dan esai. Keyboard skip link, Tab/Escape dan pengembalian fokus/fallback; route SPA, timer/autosave serta emulasi reduced-motion/forced-colors. Chrome fixture menggunakan API simulasi; bukan UAT akun produksi, sertifikasi WCAG atau uji manual NVDA/VoiceOver. Status incomplete pada scan perlu diperiksa manual jika relevan; tidak dihitung sebagai kelulusan.

Acuan: https://www.w3.org/TR/WCAG22/ dan https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ .

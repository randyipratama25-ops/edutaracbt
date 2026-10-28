# Keputusan implementasi fondasi — 29 Oktober 2026

Status: dipilih untuk implementasi terbatas berdasarkan perintah menjalankan 1.1–1.4. Tidak menutup semua keputusan produk D01–D18.

- D01: internal Supabase Auth untuk implementasi saat ini; tidak ada Central SSO.
- D02: satu organisasi aplikasi aktif; semua relasi akademik menggunakan organization_id dan FK komposit. Tidak diklaim sebagai produk multi-tenant penuh.
- D18: Guru dapat melihat/membuat siswa pada kelas penugasan exact ID; pengarsipan/deaktivasi hanya Admin. Perlu UAT dan pengesahan kebijakan final.
- Akun baru mendapat undangan aktivasi, tanpa password default. Email bukan credential yang dikirim pada DTO daftar pengguna; pemetaan username ke email dilakukan pada server identity-gateway saja.
- Tidak membuat admin produksi atau mengirim undangan nyata tanpa email tujuan yang ditentukan pemilik melalui prosedur bootstrap.
- Prasyarat audit dataset 0.2 belum selesai. Skema baseline disiapkan dari sumber/dokumen; ETL dan finalisasi model legacy tetap tertunda.

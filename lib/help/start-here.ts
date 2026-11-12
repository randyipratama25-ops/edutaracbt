type PageGuide = {
  first: string;
  next: string;
  keywords?: string;
};

export const pageGuides: Readonly<Record<string, PageGuide>> = {
  "/": { first: "Siapkan akun yang diberikan madrasah.", next: "Pilih Masuk, lalu pilih peran Anda. Hubungi Admin madrasah jika belum memiliki akun." },
  "/login": { first: "Pilih peran yang sesuai dengan tugas Anda.", next: "Masukkan nama pengguna dan password dari madrasah. Gunakan Lupa password jika perlu membuat password baru." },
  "/auth/reset": { first: "Buka halaman ini dari tautan terbaru di email.", next: "Setelah tautan terverifikasi, isi password baru dua kali. Gunakan password baru saat masuk kembali." },
  "/dashboard": { first: "Pilih pekerjaan yang ingin Anda lakukan dari pintasan.", next: "Periksa agenda sebelum menyiapkan ujian, memantau peserta, atau menilai jawaban.", keywords: "beranda agenda jadwal" },
  "/dashboard/users": { first: "Cari nama pengguna sebelum menambahkan akun.", next: "Jika akun sudah ada, buka akun tersebut untuk melihat tindakan yang tersedia.", keywords: "akun siswa guru undangan" },
  "/dashboard/master-data": { first: "Periksa kelas dan mata pelajaran yang akan dipakai.", next: "Pastikan siswa terdaftar di kelas dan guru memiliki penugasan yang sesuai.", keywords: "kelas mapel penugasan data akademik" },
  "/dashboard/preparation": { first: "Pilih ujian yang ingin disiapkan.", next: "Ikuti langkah peserta, jadwal, soal, dan aturan. Tinjau pemeriksaan sebelum ujian diterbitkan oleh Admin.", keywords: "publikasi terbitkan jadwal pin persiapan" },
  "/dashboard/exams": { first: "Pilih ujian sebelum menambah atau mengedit soal.", next: "Buka formulir soal, tentukan tipe dan poin, lalu periksa pratinjau sebelum menyimpan.", keywords: "buat ujian jadwal edit soal tinymce" },
  "/dashboard/bank": { first: "Buat draf soal atau cari soal yang sudah ada.", next: "Periksa isi dan kunci jawaban. Ajukan tinjauan sebelum memakai soal dalam paket ujian.", keywords: "tambah soal draf tinymce kisi paket" },
  "/dashboard/monitor": { first: "Pilih ujian untuk melihat status peserta.", next: "Periksa waktu pembaruan dan hubungi peserta atau pengawas saat ada kendala.", keywords: "monitoring pantau peserta koneksi notifikasi" },
  "/dashboard/committee": { first: "Pilih tanggal dan tugaskan Guru atau Panitia Ujian.", next: "Pada hari tugas, konfirmasi kehadiran. Jika petugas berhalangan, pilih pengganti dan konfirmasi kehadirannya.", keywords: "panitia jadwal kehadiran pengganti" },
  "/committee": { first: "Minta Admin mengonfirmasi kehadiran Anda. Jadwal diperbarui secara berkala.", next: "Konfirmasi pengawas yang hadir. Jika diperlukan, tunjuk pengganti dan konfirmasi setelah ia hadir." },
  "/dashboard/rooms": { first: "Siapkan ruang dan sesi ujian.", next: "Tempatkan peserta pada sesi, lalu pilih pengawas yang bertugas.", keywords: "ruang sesi pengawas penempatan" },
  "/dashboard/cards": { first: "Pilih ujian dan peserta yang perlu kartu.", next: "Buat kartu, tunggu hingga siap, lalu unduh dan periksa sebelum mencetak.", keywords: "cetak kartu peserta pdf zip" },
  "/dashboard/media": { first: "Unggah gambar atau audio yang akan dipakai pada soal.", next: "Periksa pratinjau. Lampiran juga dapat diunggah langsung saat mengedit soal.", keywords: "gambar audio berkas file lampiran unggah" },
  "/dashboard/grading": { first: "Pilih peserta dari antrean koreksi.", next: "Baca jawaban dan pedoman penilaian. Simpan nilai atau ajukan tinjauan kepada penilai lain.", keywords: "nilai esai koreksi rubrik moderasi" },
  "/dashboard/results": { first: "Pilih ujian dan cari hasil peserta.", next: "Buka rincian untuk memeriksa nilai atau melanjutkan koreksi. Admin dapat menerbitkan hasil ketika siap.", keywords: "nilai hasil koreksi esai publikasi" },
  "/dashboard/analytics": { first: "Pilih ujian dan hasil peserta yang ingin dianalisis.", next: "Tinjau analisis atau pilih jenis laporan, lalu tunggu hingga berkas siap diunduh.", keywords: "ekspor laporan pdf excel analisis" },
  "/dashboard/advanced": { first: "Pilih penyedia AI yang ingin digunakan.", next: "Simpan konfigurasi, uji koneksi, lalu aktifkan. Evaluasi perangkat ujian tersedia di bagian bawah.", keywords: "ai model api key seb perangkat" },
  "/dashboard/acceptance": { first: "Muat ulang pemeriksaan untuk melihat kondisi layanan terbaru.", next: "Tindak lanjuti bagian yang belum terpenuhi dan lengkapi bukti pengujian sebelum pengesahan.", keywords: "kesiapan kesehatan pemeriksaan uat" },
  "/dashboard/settings": { first: "Tentukan pengaturan yang perlu diubah.", next: "Periksa kembali isian sebelum menyimpan, terutama aturan ujian dan pengiriman email.", keywords: "identitas logo email smtp aturan" },
  "/dashboard/audit": { first: "Pilih rentang waktu untuk menelusuri aktivitas.", next: "Persempit pencarian dengan jenis tindakan, lalu buka rincian catatan yang relevan.", keywords: "audit log riwayat aktivitas" },
  "/dashboard/jobs": { first: "Periksa status pekerjaan dan cadangan data.", next: "Buka rincian jika ada pekerjaan yang gagal sebelum mencoba menjalankannya kembali.", keywords: "backup cadangan antrean unduhan pekerjaan otomasi" },
  "/student": { first: "Cari jadwal ujian Anda.", next: "Periksa perangkat sebelum mulai, lalu gunakan PIN dari pengawas. Jika sudah mulai, pilih Lanjutkan / lihat status." },
  "/supervisor": { first: "Pilih pelaksanaan ujian sesuai penugasan Anda.", next: "Pantau status peserta dan tanggapi permintaan bantuan. Hubungi Admin jika tindakan yang dibutuhkan memerlukan izin tambahan." },
};

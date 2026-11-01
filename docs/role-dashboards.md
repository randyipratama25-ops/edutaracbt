# Dashboard per peran

Admin: prioritas kesiapan, pelaksanaan, penerimaan dan statistik organisasi. Guru: bank/koreksi/hasil, total hasil peserta pending dari results API, agenda authoring terpisah. Pengawas: pintasan ke modul pelaksanaan dan kartu tugas. Siswa: ringkasan daftar ujian berizin, hanya di luar player aktif.

Tidak ada sumber data atau endpoint baru. Cakupan RLS/RPC lama dipertahankan, tanpa migrasi. Tidak ada pengubahan jawaban, deadline atau peran. Halaman tetap 23.

Pengujian browser memakai API simulasi untuk empat peran pada lebar 320/390/768/1440; memeriksa overflow, total pending Guru, ringkasan Siswa dan pintasan peran. Bukan UAT akun produksi/perangkat fisik.

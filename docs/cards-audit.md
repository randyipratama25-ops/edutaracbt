# Audit Kartu peserta — 2 November 2026

## Temuan dan perbaikan

- Pembacaan peserta dan job memakai Promise.all: satu kegagalan menghapus kedua daftar. Keduanya kini ditangani independen, dengan peringatan dan snapshot job terakhir yang valid.
- Respons ujian lama/polling bisa saling menimpa. Pembacaan kini memakai abort, generation dan single-flight bersama, termasuk saat mutation/unmount. Pilihan opsi memiliki timeout/error/coba ulang.
- Pilih seluruh hasil tidak membatasi jumlah, perubahan pencarian mempertahankan pilihan tersembunyi, dan daftar besar dirender sekaligus. Pilihan unik dibatasi 500 PDF/50 ZIP; pencarian/ujian membersihkan pilihan; pagination 50 dengan clamp. Ganti format mempertahankan pilihan dan menampilkan batas terlampaui.
- Tombol dan input dapat berubah selama submit. Lock sinkron dan fieldset disabled menjaga payload; request_id stabil untuk pembuatan yang hasilnya belum pasti. Tidak ada retry mutation otomatis.
- Retry mengabaikan penolakan download dan selalu menyatakan queued. API kini memperoleh claim/izin/lease sebelum after; ready/busy dilaporkan tanpa worker baru. Penolakan hak/batas retry tidak diakui sebagai sukses. Worker menerima claim yang sama, tanpa claim kedua.
- Receipt null/format salah dan signed URL hilang dapat menghasilkan error tak tertangani. Kontrak Zod dan pemeriksaan receipt menangani kasus ini, error SQL disamarkan melalui mapper bersama tanpa mengganti import resultData lama.
- ZIP memuat ulang CSS setiap peserta dan baru membatasi ukuran setelah seluruh PDF selesai. CSS sekali per job, batas ZIP mentah 50 MiB sebelum penambahan berkas, batas penjadwalan PDF 180 detik; batas artefak final 50 MiB tetap berlaku. Snapshot/lease/logo divalidasi dan error worker dicatat aman.
- Kontrol, checkbox, teks panjang dan job memakai grid responsif, wrapping, target sentuh, label progres/status, empty/error state dan fokus bawaan aplikasi.

## Kompatibilitas

Tidak ada perubahan skema, migrasi database, dependency, halaman atau endpoint baru. Payload/API bisnis, dua template, PDF gabungan/ZIP, nama berkas unik, cakupan Admin/Guru/pengawas efektif dan snapshot tetap dipertahankan. API cards/download memeriksa izin terkini; URL privat tetap 60 detik. PDF tidak mencetak kata sandi atau PIN. Mapper RPC diekstrak ke lib/http.ts dan diekspor kembali dengan nama resultData yang lama.

Pemeriksaan metadata produksi read-only: card_jobs RLS aktif, bucket exam-cards privat/batas52428800, authenticated tidak dapat SELECT tabel job langsung, anon tidak dapat EXECUTE card_command. Tidak ada job/objek/nilai produksi dibuat dalam QA.

## Validasi

- 17 regresi baru API/worker/kontrak/seleksi: sesi/origin/null, duplikat/ZIP51, claim sebelum scheduling, ready/busy, retry budget/denial, receipt, signed URL, claim handoff, ZIP bytes/deadline.
- Browser produksi CardsPanel + DashboardShell dengan API fixture:320/390/768/1024/1440, orientasi, teks200%, axe WCAG A/AA,501 peserta, PDF500/ZIP50, format/selection/search/pagination, idempotency/running, partial error dan download. Mutation API disimulasikan.
- Chromium nyata:15 identitas termasuk Arab pada compact/large, beberapa halaman, peserta terakhir dan WIB terverifikasi pdftotext; halaman pertama kedua template diperiksa secara visual. ZIP dibuka ulang dengan JSZip pada unit worker.
- `npm run check` lulus:349 passed,3 skipped,49 file; lint, TypeScript dan build produksi berhasil. Satu warning lint lama pada pengaturan AI di luar cakupan.

## Batas verifikasi

Browser memakai fixture tanpa masuk sebagai akun produksi atau membuat kartu nyata di produksi. Tidak mengklaim seluruh kombinasi data/perangkat bebas bug. Anggaran180 detik menghentikan penjadwalan PDF berikutnya; operasi render yang sedang berlangsung tetap memakai timeout renderer yang sudah ada. Scroll vertikal isi panjang tetap tersedia, tanpa pemotongan konten untuk memaksakan satu layar.

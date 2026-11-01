# Audit Hasil dan koreksi — 2 November 2026

## Lingkup dan alur

Halaman `/dashboard/results`, `ResultsPanel` bersama `/dashboard/analytics`, daftar/detail dan koreksi `results_command`, penyedia AI, canvas/media, laporan/settings/job/run/download, serta kontrak dan hak akses terkait dibaca sebelum refactoring. Alur tetap: daftar berizin → detail snapshot → persetujuan dengan expected_revision → ledger resmi; atau pilihan hasil → laporan berikat revisi → job privat → unduh dengan pemeriksaan akses. Render/engine laporan dan RPC database tidak diganti.

## Temuan dan perbaikan

- Fetch tidak memiliki deadline/envelope/schema; dependensi master/kop/job/canvas diam-diam gagal. Transport bersama kini memakai validasi kontrak, deadline, abort/live/sequence guard dan pemisahan status error/retry. Snapshot list/job terakhir tidak disamarkan sebagai hasil kosong; halaman list dikoreksi setelah jumlah berkurang. Parameter page yang NaN/pecahan/tak berbatas ditolak sebelum RPC.
- Detail ditampilkan lalu menunggu GET penyedia AI sebelum mereset form; AI gagal bisa mempertahankan isian peserta sebelumnya atau menghambat manual. Detail mereset isian sendiri dan penyedia dimuat terpisah, dengan retry dan tanpa mengunci manual.
- busy berbasis state tidak mencegah double-submit/penutupan modal/pergantian konteks. Lock sinkron dan fieldset menjaga operasi; unmount menghentikan pekerjaan klien berikutnya. Konflik atau hasil mutation tidak pasti memerlukan refresh terkoordinasi daftar/detail/kop/job sebelum mencoba lagi; tidak ada retry mutation otomatis atau klaim membatalkan efek server yang sudah terjadi.
- Pilihan tidak dibatasi 500 dan berlanjut di filter lain; dropdown ujian terpilih bisa kehilangan option setelah hasil berubah. Pilihan kini dibatasi, tetap lintas halaman, dibersihkan saat filter berubah, dan option ujian aktif dipertahankan. Urutan mengembalikan halaman 1. Server tetap memeriksa izin/revisi setiap pilihan.
- Batch membuka hingga 500 HTTP bersamaan serta mengelompokkan ID soal tanpa versi. Pembacaan kini empat per kelompok, berhenti menjadwalkan saat gagal/unmount. UI mengelompokkan ID+versi snapshot dan mengecualikan diskualifikasi/rubrik kriteria dari koreksi sederhana, tetapi POST tetap memakai question_id/expected_revision lama dan transaksi tunggal.
- Blank pada edit AI bisa menjadi Number('')=0. Validasi membedakan blank dari nol, memastikan finite dan batas poin; nilai manual kosong tetap pending. Revisi nilai lama kini memiliki alasan 5–1000 karakter sesuai aturan database, dengan fallback catatan yang memenuhi aturan lama. Jawaban null ditampilkan sebagai belum dijawab, bukan teks null.
- UI menawarkan AI untuk esai rubrik/kosong/diskualifikasi dan persetujuan saran kedaluwarsa. Kelayakan teks dan revisi diperiksa untuk tombol; server tetap otoritatif. Saran tidak menjadi nilai resmi tanpa persetujuan. Pengiriman maksimal lima esai, tanpa fallback penyedia otomatis.
- Publikasi bertuliskan hasil terpilih padahal database mengubah seluruh peserta pada ujian. Konfirmasi kini menjelaskan cakupannya; jumlah ujian selesai dilaporkan jika loop berhenti sebagian. Tidak mengklaim transaksi tunggal lintas ujian. Hanya Admin dan moderasi server tetap berlaku.
- Draft kop diedit langsung pada settings sehingga batal tetap terlihat tersimpan. Draft kini terpisah, tervalidasi dan dibuang saat batal. GET job polling single-flight mempertahankan status terakhir/error; worker tidak dijadwalkan tanpa ID create valid. Download tetap melalui RPC akses dan URL bertanda tangan.
- API JSON/byte, pasangan nilai unik, revisi rekalkulasi, field edit AI dan publikasi Admin divalidasi sebelum RPC. Missing receipt/transport error tidak dianggap sukses; error SQL internal disamarkan, exception bisnis/revisi tetap dapat ditindaklanjuti.
- Tabel memakai scroll internal dan sticky peserta/header, toolbar grid mobile, dialog bounded, wrapping jawaban, label/fokus Radix dan target sentuh. Identitas visual aplikasi dipertahankan.

## Kompatibilitas dan batas

Tidak ada halaman, role, endpoint, dependency, schema/migrasi database atau Edge Function baru. Ledger, snapshot/engine, expected_revision, alasan audit, moderasi/rubrik kriteria, publikasi, PDF/XLSX, delapan jenis laporan, version pinning/kepemilikan/lease job dan pemeriksaan izin tetap berlaku. Nullable class_name, actor ledger dan source riwayat diselaraskan pada tipe TypeScript sesuai data database yang sudah ada. Analitik memakai komponen yang sama dan turut diverifikasi.

Pengujian interaksi memakai fixture aktor/API pada halaman/komponen produksi; tidak ada perubahan nilai, publikasi, job atau email operasional pada produksi. RLS sebelas tabel penilaian/laporan/media diperiksa read-only dan tetap aktif. UAT pengguna/perangkat fisik dan semua kemungkinan kondisi produksi tidak diklaim.

## Validasi

`npm run check`: **291 tes lulus, 3 dilewati, 44 file**, termasuk 19 kasus audit baru; typecheck dan production build lulus. Lint tidak memiliki error baru, dengan satu warning lama pada pengaturan AI.

Browser pada halaman/komponen produksi dengan fixture aktor/API: Admin/Guru; 320/390/768/1024/1440 px, layar pendek 320×320, orientasi, teks 200%, touch dan axe. Koreksi kosong/nol/alasan/revisi, penguncian modal, kegagalan AI tanpa menghambat manual, batch empat permintaan dan versi terpisah, perubahan filter/pagination, draft kop batal/simpan, analisis/ekspor/rekalkulasi/publikasi, konflik/hasil tak pasti, payload malformed, timeout baca, respons lama dan polling single-flight lulus. Tidak ditemukan pageerror atau overflow dokumen/dialog pada skenario tersebut. Analitik bersama dan regresi 10 panel filter pada 320/390/768/1440 px lulus.

CI dan pemeriksaan runtime deployment dicatat pada PR/laporan akhir. Pengujian browser tidak mengubah data akademik produksi.

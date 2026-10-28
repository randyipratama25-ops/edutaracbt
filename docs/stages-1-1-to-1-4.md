# Pelaksanaan Tahap 1.1–1.4 — 29 Oktober 2026

Status: IMPLEMENTASI TERSEDIA; penerimaan operasional dan UAT belum disahkan. Ini tidak menyatakan kesetaraan seluruh CBT.

## 1.1 — Fondasi

Next.js/TypeScript dan dependency terkunci; domain validation, UI primitives Radix/shadcn pattern, Tailwind, Lucide; shell responsif, dialog accessible, tabel sticky/zebra/scroll, loading/error/empty/retry. CI YAML lint/typecheck/test/build pada PR dan main. Request ID pada respons dan error log tersaring. `.env.example` tanpa secret. Build lokal, lint, typecheck dan 5 unit tests lulus. TypeScript diturunkan dari 7.0.2 ke 6.0.3 karena typescript-eslint belum mendukung API TS7. CI remote dan penerimaan perangkat dicatat terpisah.

## 1.2 — Skema, RLS, Storage

Migrasi `20261028193445_foundation.sql` dan `20261028193853_authorization_hardening.sql` sesuai versi migration history remote, diterapkan pada database kosong. Timestamp awal dibuat CLI lalu diselaraskan dengan versi server. 21 tabel public dengan RLS, FK/UNIQUE/CHECK, satu attempt aktif, satu ruang per siswa per ujian, capacity lock, penugasan exact ID, audit dan login budget. Fungsi elevated ada di schema private; RPC publik pengawas SECURITY INVOKER. Bucket privat exam-media, 5 MiB; signed upload/read adapter. Generated database types tersimpan.

Uji SQL rollback lulus termasuk scope organisasi/kelas/siswa, akun nonaktif, sesi invalid, akses anonim, kapasitas dan roster unik, pengawas pengganti dan pemulihan hak. Uji nyata upload/download PNG lulus; lintas pengguna dan anonim ditolak. Info advisor 14 tabel tanpa policy merupakan default-deny yang disengaja (terutama domain ujian belum dibuka); tidak menambahkan policy allow-all untuk menghilangkan INFO. Advisor security terakhir tidak memiliki WARN/ERROR.

## 1.3 — Akun dan konteks

Username dipetakan ke identitas Auth hanya pada Edge Function server; tidak memakai spreadsheet. Password/session tidak ada pada DTO daftar. Cookie HttpOnly/SameSite/Secure saat produksi, proxy refresh dan request-scoped clients, CSRF same-origin, budget login, revoke access lewat auth.sessions dan status akun. Context staff/supervisor/student divalidasi server. Login Siswa/PIN sengaja ditolak dengan pesan tahap mesin ujian, bukan sukses palsu. Login Admin/Guru, penolakan pengawas tanpa assignment, akun dinonaktifkan dan logout diuji melalui HTTP ke Auth dan database nyata.

Aktivasi dan recovery code tersedia, tetapi pengiriman email nyata serta allowlist redirect/Site URL belum diuji/dikonfigurasi melalui connector. Tidak ada akun Admin operasional dibuat; prosedur bootstrap tersedia di development.md. Tidak ada undangan nyata dikirim. T001–T003 menunggu tahap 2.1/3.1; bukan gagal atau selesai palsu.

## 1.4 — Pengguna dan akademik

UI/API pengguna: daftar role-scoped, search, status/role filter, sorting, pagination, pembuatan melalui undangan, edit nama, aktif/nonaktif dan arsip; tidak ada delete permanen. UI data master: kelas/mapel, edit/arsip, filter/pagination, bulk paste; penugasan guru dan enroll siswa exact ID; deactivate assignment. Impor pengguna TSV 200 baris dengan preview dan hasil per baris, request per akun agar batch tidak melampaui durasi server. Guru dapat membuat/mengubah nama siswa di kelasnya; deaktivasi/arsip hanya Admin. Username dan role hanya ditetapkan ketika membuat akun pada iterasi ini; perubahan peran/username dan tata kelola penempatan kelas memerlukan penambahan UI/aturan bila diperlukan. Uji API Admin/Guru terhadap kelas/mapel/assignment/student scope lulus; impor nyata tidak dikirim untuk menghindari undangan ke orang lain tanpa tujuan.

## Bukti uji dan batas

- `npm run lint`, `npm run typecheck`, `npm test`: lulus; 5 unit tests.
- `npm run build`: lulus setelah cache build lokal rusak dipindahkan; tidak mengubah sumber untuk menutupi error.
- HTTP anonim: 7 skenario lulus (home/login 200, dashboard 307, user/media ditolak, CSRF ditolak, credential salah 401).
- HTTP autentikasi/otorisasi: 12 checkpoint lulus dengan empat akun sintetis sementara; tidak menggunakan akun sekolah. Identitas, sesi, class/subject/assignment/enrollment dan file uji dibersihkan.
- SQL `supabase/tests/rls.sql`: lulus dan rollback, termasuk substitusi, kapasitas dan hak baca kunci tertutup.
- Storage: 4 checkpoint lulus dengan PNG nyata, file dihapus setelah uji.
- UAT perangkat nyata, email/SMTP, admin operasional, load/SLO, ujian dan migrasi legacy belum diuji. Semua 36 F, 26 SEC dan 56 T tidak ditandai selesai sekaligus.

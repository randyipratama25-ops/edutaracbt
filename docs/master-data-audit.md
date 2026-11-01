# Audit Data master (/dashboard/master-data)

## Alur dan lingkup

Page → MasterPanel → GET/POST /api/admin/master → actor/client pengguna → RLS dan constraint/audit lama pada classes, subjects, teacher_assignments, student_enrollments, profiles. Admin C/R/U dan soft archive; Guru R berizin. Form nama, tambah massal 100 nama dan dua jenis tautan tetap ada. Keanggotaan siswa yang dulu tersimpan tanpa daftar kini ditampilkan memakai operasi enrollment yang sudah tersedia. Tidak menambah halaman, endpoint, dependency atau D permanen.

## Temuan dan perbaikan

- Select tanpa range membatasi referensi secara diam-diam; people dibatasi 1000 dan error-nya diabaikan. Semua tabel kini dibaca per 500 baris dalam urutan ID, RLS+organisasi dan deadline15s. Read error menjadi error, bukan daftar pengguna kosong. Nama nonaktif ikut menjadi referensi berizin; dropdown tetap memfilter aktif.
- Payload null/jenis invalid dapat dibaca sebelum validasi dan menjadi error500. Schema memvalidasi command terlebih dahulu; write hanya Admin staf, read hanya Admin/Guru staf. Aktivasi memeriksa role/user dan kelas/mapel aktif di organisasi. Penonaktifan tautan lama tetap boleh saat referensi nonaktif. UPDATE memakai filter organisasi eksplisit; upsert tetap memakai kunci unik lama.
- UI mempercayai respons, tidak memiliki deadline, membiarkan respons lama memperbarui state setelah unmount, dan mengganti seluruh tampilan dengan error setelah gagal reload. Schema/deadline20s(read)/35s(write), cancellation/live guard, last snapshot bertanda dan retry read-only memperbaikinya; write dinonaktifkan saat read gagal/loading.
- Klik cepat dapat mengirim perubahan ganda; modal dapat berganti/menutup saat proses, tujuan kind/assignmentType juga bisa berubah. Lock sinkron, fieldset disabled, snapshot payload/tujuan dan dialog konfirmasi menjaga konsistensi. Feedback form/penugasan/massal/status dipisahkan; fokus setelah simpan/status kembali ke judul daftar.
- Massal melakukan refresh seluruh referensi pada setiap baris dan tidak berhenti sesudah unmount/hasil tak pasti. Kini validasi/pratinjau, sequential writes, laporan per baris, satu reload di akhir, stop pada uncertain/401/403/429 dan penandaan baris belum diproses. Duplikat termasuk arsip dan panjang nama ditandai sebelum request.
- Penugasan siswa tidak memiliki daftar untuk memeriksa hasil atau menonaktifkan hubungan. Daftar keanggotaan berizin sekarang memakai kontrak enrollment lama. Kedua daftar memiliki pencarian/pagination20 dan lookup nama; orang nonaktif tidak lagi tampil sebagai UUID mentah saat referensinya masih berizin.
- Page dapat kosong setelah perubahan filter/data pada halaman terakhir. Clamp menjaga halaman valid. Dialog konfirmasi menyebut identitas/kelas/mapel; form POST native, validasi nama, kontrol sentuh, wrapping, tabel scroll internal dan fokus menjaga reflow.
- Write response hilang/5xx/status0 tidak boleh dilaporkan sebagai penolakan pasti. API mengembalikan hasil tak pasti; UI mengunci pengiriman ulang otomatis dan meminta pemeriksaan data. Pembatalan klien tidak menjamin efek server dibatalkan.

## Kompatibilitas dan batas

Tetap23 halaman; tidak ada migrasi atau Edge deployment. RLS/constraint/audit tetap otoritatif, tanpa service-role client. Archive kelas/mapel tidak melakukan cascade perubahan penugasan, keanggotaan atau snapshot ujian yang sudah ada. Helper bounded transport diekstrak dan dipakai bersama; ekspor userRequest/UserRequestError dan pesan akun lama dipertahankan. Pengambilan berhalaman bukan transaksi snapshot lintas request: perubahan eksternal dapat memerlukan reload. Tidak ada polling atau klaim exactly-once lintas perangkat. API tetap mengembalikan arrays dan id/saved; people.active bersifat additive dan menyertakan referensi nonaktif sesuai RLS.

## Validasi

Tes API/read pagination>1000, error dependency, RLS/org scope/deadline, Origin/role/context, schema, kunci upsert, referensi aktif, deactivation cleanup, known rejection/uncertain receipt. Tes transport Pengguna lama turut dijalankan. Browser page produksi dengan API/actor fixture: Admin/Guru, desktop/tablet/mobile, layar pendek/orientasi/teks200%, keyboard/touch/axe, CRUD/arsip, assignment/enrollment/toggle, bulk duplicate/partial/uncertain/unmount, timeout, last snapshot/error/retry dan page clamp. Bukan UAT akun produksi/perangkat fisik atau sertifikasi aksesibilitas. Tidak mengubah data akademik atau mengirim email produksi. Perintah: npm run check, scripts/ui/master-browser.mjs, regresi UsersPanel dan search-filters serta CI integrasi database.

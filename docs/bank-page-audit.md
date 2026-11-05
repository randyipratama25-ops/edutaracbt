# Audit Bank soal — /dashboard/bank

Tanggal: 5 November 2026 (WIB). Basis: `2b8c846fac2f92fa91bb06e4e12a4f015b410d90`.

## Alur yang diperiksa

DashboardLayout/actor membatasi konteks staf. BankPanel memuat metadata authoring dan daftar bank berizin, filter/pagination; editor menulis versi baru; detail menampilkan versi/review/pemakaian dan kualitas. Impor menerima JSON/teks atau mengambil soal ujian lalu melakukan preview. Kisi-kisi memeriksa kandidat untuk 1–3 ujian draf sebelum perakitan atomik. bank_command memeriksa organisasi, penugasan kelas/mapel, pemilik/reviewer, lampiran, expected_version, periode authoring dan idempotency. Versi yang dipakai ujian dan payload penilaian tidak ditulis ulang.

Sebelum perubahan dibaca: page/layout, seluruh BankPanel/Taxonomy, preview/import/template/schema authoring, client transport/feedback, Dialog/ValidatedForm/ListFilters, API bank/authoring dan kontraknya, statistik analyze/result contracts, CSS, serta fungsi bank_scope/can_bank/bank_store/bank_pool/bank_command dan integrasi bank-assessment. Dependency metadata, filter, detail/version, editor, import preview/report, target/rule/candidates dan request_id dipetakan.

## Temuan dan perbaikan

| Penyebab | Perbaikan |
| --- | --- |
| Cast TypeScript menerima daftar, detail, kualitas dan receipt tanpa validasi runtime; error RPC seluruhnya dianggap forbidden atau validation. | Kontrak daftar/metadata/detail/sumber/kualitas dan receipt per aksi. Validasi parameter page/filter/target sebelum RPC, batas byte body, rpcData untuk transport/SQL masking, AUTH dan CONFLICT tetap dibedakan. Kualitas raw divalidasi sebelum analyze. |
| List/master reads tidak dibatasi atau dibatalkan; page di luar batas setelah penghapusan/filter dapat tetap kosong. | Timeout, abort, generation, mounted guard dan single-flight; metadata memiliki generation sendiri pada Strict Mode. Page menyusut dikoreksi; hasil tidak lengkap/duplikat ditolak dan error tidak dinyatakan sebagai nol. |
| Detail baru muncul setelah request selesai dan data lama dapat menimpa modal lain. | Dialog membuka loading seketika, retry terpisah, ID detail sesuai target, close membatalkan dan mengabaikan respons lama. |
| Melihat versi lama masih mengirim review untuk detail.item.version terbaru. | Keputusan review diblokir sampai versi terbaru dipilih; pesan menjelaskan perbedaan. Arsip hanya menawarkan buka sebagai draf kepada pemilik/Admin. Server tetap memeriksa izin/version. |
| Isian dapat berubah selama mutation; hasil belum pasti tidak dibedakan dari gagal pasti. | Fieldset dan lock sinkron membekukan isian/target/aturan, mencegah submit ganda dan menahan close selama request. Payload/request_id dipertahankan untuk retry eksplisit termasuk tutup/buka sementara. Tidak ada retry otomatis. |
| Receipt impor parsial/duplikat dianggap lengkap dan nomor SQL row tidak sesuai blok sumber saat blok invalid dilewati. | Validasi cardinality/row identity/saved-id/error, lalu memetakan row ke block preview asli. Impor parsial tetap ditampilkan per baris; input tidak hilang saat receipt belum pasti. |
| Kandidat paket/receipt perakitan tidak diverifikasi terhadap seluruh aturan/target. | Preview harus mencakup multiset kelompok pada semua target; perubahan aturan/target menghapus kandidat. Receipt assemble harus meliputi semua target dengan count yang sesuai. SQL tetap menentukan kecukupan kandidat/tumpang tindih dan membatalkan seluruh transaksi jika gagal. |
| Statistik lama tetap terlihat saat penghitungan ulang gagal; proyeksi analitik berpotensi melebar bila menggunakan tipe umum. | Statistik dikosongkan sebelum read; proyeksi kualitas tetap hanya agregat yang sebelumnya tersedia, tanpa menambahkan identitas/jawaban individu. Literal label jawaban seperti __proto__ dipertahankan oleh kontrak analitik bersama. |
| Teks/tabel/modal/rubrik/kelas panjang perlu reflow serta batas lokal. | Tabel scroll lokal dan header sticky, wrapping, konfigurasi/rubrik satu kolom pada mobile, daftar kelas/history bergulir, tombol sentuh dan batas viewport. Kategori baru tidak menawarkan kelas nonaktif; kelas nonaktif yang sudah melekat tetap terlihat agar dapat dilepas. Mapel nonaktif diberi label dan tidak dapat dipilih kembali. Editor menunggu metadata tersedia. |

## Kompatibilitas

Tidak ada migrasi, dependency, role/grants/RLS atau perubahan nilai, jawaban, snapshot, deadline, aturan review terpisah atau kisi-kisi SQL. Tetap 23 halaman dan 34 penggunaan Dialog pada 20 komponen. Seluruh fitur editor PG/PG kompleks/BS/menjodohkan/esai, rubrik/canvas/media, riwayat, review, impor/template/report, kualitas dan perakitan dipertahankan. Fixture stage4 diperbaiki agar memakai envelope success/data yang sebenarnya dan dapat memilih executable browser pengujian.

State isian/retry hanya bertahan selama komponen/halaman terbuka; tidak menambahkan penyimpanan draf lintas navigasi atau menjanjikan pemulihan setelah reload. Review UI memakai kapabilitas daftar yang dibekukan; RPC tetap mengevaluasi izin terkini saat menulis. Preview kandidat bukan reservasi dan tidak menjamin kesetaraan psikometrik. Halaman bank dibaca dari worktree baru main agar perubahan lokal lain tidak tersentuh.

## Validasi

- 495 tes lulus/3 dilewati, 62 berkas: kontrak/query/receipt, batas role/origin/SQL masking, proyeksi kualitas, review versi, late detail, lock, uncertain retry, pemetaan impor, metadata Strict Mode dan regresi aplikasi.
- Lint tanpa error (satu warning AI yang sudah ada), typecheck, build produksi dan rangkaian database lokal lengkap.
- Browser fixture build produksi dengan API simulasi: 51 soal, pagination menyusut, malformed/no-results/empty, late detail, editor lima tipe/rubrik, submit lock, uncertain close/reopen/payload-identik, review versi, kualitas, laporan baris sumber, invalidasi kandidat/perakitan dan pembatasan Guru.
- 320/390/768/1024/1440px, orientasi/320×320, teks 200%, touch, axe dan batas modal/halaman; tidak ditemukan pageerror atau horizontal overflow pada skenario tersebut. Gulir vertikal form panjang dan gulir tabel tetap tersedia.
- Database bank-assessment terisolasi membuktikan cakupan penugasan/organisasi, review terpisah, duplikat, immutable versions, komposisi/rollback paket, proteksi media, snapshot/rubrik, penilaian/moderasi/publikasi dan grants.

Tidak mengubah bank soal, merakit paket, melakukan review atau mengubah hasil siswa produksi untuk pengujian. Ini bukan sertifikasi aksesibilitas, uji semua perangkat fisik atau uji beban serentak.

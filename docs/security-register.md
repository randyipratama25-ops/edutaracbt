# Register keamanan

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Seluruh temuan TERBUKA; risiko dan bukti awal berasal dari audit statis, bukan hasil pentest.

## 12. Temuan audit yang wajib ditangani ketika pembangunan ulang

**Makna tingkat risiko:** evaluasi berdasarkan pola kode statis; bukan pernyataan bahwa insiden keamanan pernah terjadi. Prioritas tinggi berarti wajib ditutup sebelum sistem baru dipakai untuk ujian sebenarnya.

| ID | Tingkat | Bukti/pola dari source | Dampak potensial | Perbaikan target |
|---|---|---|---|---|
| SEC-01 | **KRITIS** | `Users.Password` untuk Siswa, sheet kredensial terpisah Admin/Guru/Pengawas, `_getAllExternalCredentials_`, `loginUser` membandingkan plaintext | Kredensial dapat terbaca dari data/backup; risiko reuse password | Supabase Auth, hashing & reset/aktivasi, pembatasan pembaca data mentah, rotasi |
| SEC-02 | **KRITIS** | `getUserList` membuat objek user dengan properti `password`, termasuk plaintext untuk siswa dan nilai staf bagi Admin | Eksposur massal password pada respons klien | Hapus password dari seluruh DTO/tampilan/ekspor; kartu pakai credential sekali pakai |
| SEC-03 | **KRITIS** | `saveAppConfig(formObject)` tidak menunjukkan cek sesi/role di fungsi | Konfigurasi/secret dapat berubah melalui jalur backend yang kurang terlindung bila callable | `requirePermission('settings:update')`, RLS, audit, secret manager |
| SEC-04 | **KRITIS** | `toggleUserStatus(userId,currentStatus)` tidak menerima/mengecek kredensial pemanggil | Penonaktifan/pengaktifan pengguna tidak berotorisasi bila endpoint bisa dipanggil | Role Admin, otorisasi dari sesi, validasi target + audit dan revoke |
| SEC-05 | **KRITIS** | `syncAnswers(userID,examID,answers,...)`, `submitExam(userID,examID,answers,status)`, `logViolation(...)` tidak menunjukkan pemeriksaan token/scope pemanggil di fungsi | IDOR, perubahan jawaban/status, potensi manipulasi nilai atau pengumpulan | Semua mutasi mengikat `attempt_id` ke user sesi; re-score server; deadline/version enforcement |
| SEC-06 | **TINGGI** | `getExamList(userID,token)` menggunakan userID untuk menentukan role, tanpa pemeriksaan token pada badan fungsi | Akses daftar ujian melalui identitas tidak terverifikasi bila callable | Ambil actor dari verified JWT/session; semua query role scoped |
| SEC-07 | **TINGGI** | `batchSaveEssayGrades` memanggil `saveEssayGrade(responseId, perQScores)` tanpa requestor; `saveEssayGrade` terlihat tidak memverifikasi actor pada awalnya | Koreksi nilai lintas peserta/mapel/kelas bisa tidak dibatasi | Require grade authority per exam & student, transaksi, reject unknown question IDs |
| SEC-08 | **TINGGI** | Pencocokan guru pada `checkUserAccess`/`getExamList` memakai `.includes()` terhadap mapel/kelas string | Guru dapat memperoleh scope lebih luas jika nama mirip | FK `teacher_assignments` + exact ID equality, policy test |
| SEC-09 | **TINGGI** | `localStorage` menyimpan token sesi `sipadu_session` dan banyak UI memakai `innerHTML` untuk markup dinamis | Token rentan saat XSS; untrusted content dapat menyisipkan kode bila lolos escaping | Cookie HttpOnly, React output escaping, rich-text sanitization, CSP |
| SEC-10 | **TINGGI** | Status `Curang`/`Waktu Habis` dan score dapat dikirim melalui parameter `customStatus`; ada beberapa fungsi keamanan client-side | Pelanggaran/submit dipengaruhi data klien | State transition dan jenis finalisasi diputuskan server, event log dan policy |
| SEC-11 | **TINGGI** | Perhitungan nilai tersebar di `submitExam`, `saveEssayGrade`, `recalculateExamScores`, fungsi analisis; normalisasi HTML/kunci beda | Nilai tidak konsisten; analisis dapat tidak sejalan dengan rapor | Satu grading engine versi; golden parity fixtures + audit perhitungan |
| SEC-12 | **TINGGI** | Nilai `AnswersJSON` dapat dipotong bila melebihi limit sel 49.000 karakter, canvas besar diganti marker | Hilangnya jawaban gambar/kanvas | Simpan blob di Storage + metadata JSON; autosave versioned dan checksum |
| SEC-13 | **TINGGI** | Kunci AI dalam sheet `Konfigurasi`; grading diarahkan ke gateway custom eksternal | Kebocoran secret/data jawaban, ketergantungan gateway | Server secret, endpoint/provider yang disetujui, minimisasi PII, fallback operasional |
| SEC-14 | **TINGGI** | Parser AI pada kegagalan tertentu mengembalikan `success: true, score: 0` | Jawaban benar bisa mendapatkan rekomendasi nol palsu | Error eksplisit terpisah dari grading sah, supervisi manusia |
| SEC-15 | **TINGGI** | Beberapa fungsi reset/unlock dan pengelolaan siswa berwenang tidak memeriksa scope mapel/kelas/ruang secara konsisten | Petugas dapat memodifikasi attempt di luar tanggung jawab | Central authorization service dan policy unit/integration test |
| SEC-16 | **SEDANG** | `Exams` menyimpan PIN secara langsung; contoh seed username/password umum | Bocornya PIN dan akses tak diinginkan jika dapat dibaca | Hash/rotasi PIN, rate limit, nonproduksi seed diabaikan |
| SEC-17 | **SEDANG** | `getExamQuestions` mengacak opsi setiap request; hasil acak tidak terlihat disimpan sebagai snapshot permanen | Resume bisa menukar label jawaban dan posisi pilihan | Snapshot urutan dan ID opsi per attempt |
| SEC-18 | **SEDANG** | `ExamRooms.StudentIDs` dan `Notifications.ReadBy` berupa JSON array dalam sel | Race/duplikasi/overwrite ketika banyak pemanggil | Relational roster & receipts dengan UNIQUE dan transaksi |
| SEC-19 | **SEDANG** | Identifikasi ruang dan penugasan berdasarkan kombinasi nama ujian/ruang serta sinkronisasi manual | Setelah rename, referensi dapat usang | Foreign key ID ruang, transaksi atomik |
| SEC-20 | **SEDANG** | `autoActivateExams`/`getExamList` memperbarui status bersamaan dengan pembacaan, cron GAS terpisah | Status balapan dengan perubahan manual, status tidak konsisten | Derived effective status + override manual + scheduler tunggal |
| SEC-21 | **SEDANG** | `getExamResults`, analisis dan monitor memiliki guard role yang bervariasi; beberapa hanya menolak `Siswa` | Pengawas/Guru mungkin melihat peserta di luar scope | RLS dan query scoped per organisasi, kelas, ruang, ujian |
| SEC-22 | **SEDANG** | Kartu ujian legacy mengganti placeholder `{{password}}`; file ZIP dibagi via Drive shared link | Paparan password/kartu dalam file yang diedarkan | PIN/activation one-time, signed download, retensi singkat, audit ekspor |
| SEC-23 | **SEDANG** | UI monolitik 50k baris, fungsi global, handler/event listener dan modal direkayasa via string HTML | Kebocoran listener, state antarhalaman, navigasi berat, regressions | Route/component isolation, React lifecycle cleanup, typed state, lazy load |
| SEC-24 | **SEDANG** | Toleransi keyboard/mobile/fullscreen kompleks dan bersifat browser-dependent | Salah deteksi kecurangan, siswa kehilangan kesempatan ujian | UAT perangkat nyata; policy anti-cheat yang dapat ditinjau dan di-override |
| SEC-25 | **SEDANG** | Banyak laporan dan akses media bergantung pada Drive URL atau file template eksternal | URL mati, akses file tersebar, ekspor gagal jika akun pemilik berubah | Storage private, migrasi file bytes, validasi template dan monitoring job |
| SEC-26 | **SEDANG** | Status `Waktu Habis`, `Completed`, `Selesai`, `Curang` diproses dengan normalisasi bercabang | Laporan/analisis dan resumption bisa memiliki interpretasi berbeda | State machine tunggal + compatibility adapter |

**Temuan lain yang harus diverifikasi dengan data nyata:** bentuk `Options` yang berbeda antar tipe, duplikasi user ID/ExamID, `QuestionID` lama tidak unik, campuran boolean string, guru berassignment JSON/CSV, potensi `0` defaultPoint, `optCount=6` versus scorer A–E, dan kebijakan pendaftaran siswa ke ruangan yang tidak wajib saat login. Jangan mengambil keputusan final atas konflik semantik tanpa golden test dan keputusan pemilik produk.

### 12.1 Ancaman utama dan mitigasi wajib

**Penipuan identitas:** login/submit/penilaian menggunakan actor dari server, bukan UserID yang dikirim dari form; rate limit, cookie aman, CSRF protection untuk mutasi cookie-based, session revocation.

**IDOR/akses horizontal:** setiap resource dikaitkan organisasi, mata pelajaran, kelas, ujian, ruang, atau attempt; query/filter dan RLS memastikan actor hanya melihat/mengubah scope yang sah. Terapkan *deny-by-default* dan jangan membiarkan metadata peran yang bisa diedit pengguna menjadi dasar policy.

**Kebocoran kunci jawaban:** soal untuk siswa berbeda DTO dari guru. API siswa tidak pernah mengirim `isCorrect`, `correctAnswer`, `rubricAnswer` atau kunci dalam source/React Server Component payload sebelum kebijakan rilis soal mengizinkan. Penyimpanan key di browser adalah bug kritis.

**Manipulasi deadline/skor:** timestamp dari server; grade engine server; transaksi status; optimistic concurrency untuk jawaban; *server authoritative policy* untuk cheating/timeout/unlock.

**Injeksi/XSS:** sanitasi HTML question, rubric, jawaban esai, preview; file uploads ditinjau MIME dan isi, SVG/HTML dibatasi; render HTML menggunakan sanitizer allowlist dan Content Security Policy; SQL selalu parameterized.

**RLS di Supabase:** aktifkan RLS pada semua tabel skema exposed; bagi tabel sensitif atau layanan internal pertimbangkan skema privat dan nonexposed. Kebijakan `TO authenticated` tanpa predicate ownership tidak memadai. Hindari views yang tak sengaja bypass RLS, `SECURITY DEFINER` fungsi publik, dan jangan masukkan secret di `NEXT_PUBLIC_*`.

**Privileged service role:** hanya untuk server/job tepercaya; bila request memerlukan kemampuan privileged, lakukan verifikasi identitas dan objek terlebih dahulu, *audit* aksi, lalu baru lakukan operasi. Service key **bukan solusi pengganti RLS**.

**Supply chain dan konfigurasi:** `npm audit`, pin dependency, Dependabot, lint/test/build sebelum merge; preview secrets terpisah, tidak mengirim daftar pengguna sungguhan ke staging, pembatasan API AI dan email.

### 12.2 Indikator audit/regresi

- Semua endpoint mutasi mempunyai middleware/session guard dan *domain policy* yang menguji resource target.
- Tidak ada kolom `password`, raw `pin_hash`, `service_role` atau AI secret dalam JSON respons browser, storage publik, log, CSV/XLSX umum, screenshot/HTML.
- Tidak ada query langsung berdasarkan `requestorID` yang dikirim browser tanpa verifikasi actor saat server memutuskan akses.
- Semua operasi sumber yang dahulu melempar `success=false` sekarang menghasilkan kode error yang dapat ditangani, tidak berupa HTML stack trace yang membocorkan rahasia.
- Dalam pengujian red-team, siswa A tidak dapat menyimpan, mengumpulkan, membaca hasil tersembunyi, atau membuka attempt siswa B meskipun mengetahui ID-nya.

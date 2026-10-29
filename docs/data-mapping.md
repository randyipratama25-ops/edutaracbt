# Pemetaan data awal

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Pemetaan berikut adalah hipotesis dari kode/dokumen, bukan inventaris header produksi. Identitas dan isi dataset produksi belum diperiksa.

### 6.2 Pemetaan database legacy → entitas baru

| Sumber legacy | Kolom utama yang dibaca | Tabel/entitas baru | Catatan transformasi |
|---|---|---|---|
| `Users` | `UserID`, `Nama`, `Password`, `Role`, `Class`, `SessionToken`, `IsActive` | `auth.users`, `profiles`, `user_roles`, `student_enrollments`, `teacher_assignments` | Siswa: `Class` menunjuk kelas; Guru: string/JSON assignment; jangan impor token/password plaintext ke tabel aplikasi |
| Spreadsheet kredensial `Users` eksternal | `Updated`, `Username`, `Password` | Supabase Auth + `profiles.legacy_username` | Lakukan aktivasi/reset akun staf secara aman; bukan menyimpan password terbaca |
| `Exams` | `ExamID`, `Subject`, `Class`, `Date`, `Duration`, `PIN`, `Status`, `EndDate`, `ShuffleConfig`, `TypeConfig`, `PassingGrade`, `BypassInputPeriod` | `exams`, `exam_classes`, `exam_type_configs` | Pecah daftar kelas; PIN berupa hash server; type config dinormalisasi/JSON terstruktur |
| `Questions` | `QuestionID`, `ExamID`, `Type`, `Content`, `ImageURL`, `Options`, `CorrectAnswer`, `IsRequired`, `Point`, `Rubric`, `MinChar`, `MinCharEnabled`, `AudioURL` | `questions`, `question_options`, `question_statements`, `question_pairs`, `question_versions`, `media_assets` | Tipe legacy persis dan semua representasi kunci tetap punya adapter; konten HTML disanitasi |
| `Responses` | `ResponseID`, `UserID`, `ExamID`, `AnswersJSON`, `Score`, `StartTime`, `SubmitTime`, `Status` | `exam_attempts`, `attempt_answers`, `answer_revisions`, `grade_items`, `grading_runs` | Metadata khusus `_essay_scores_per_question`, `_manual_essay_score`, `_ai_scores`, `_ai_reasons`, `__pausedElapsedSec__` diekstrak menjadi kolom terpisah |
| `Logs` | `LogID`, `UserID`, `ExamID`, `ViolationCount`, `Details`, `Timestamp` | `exam_integrity_events` | Simpan event mentah beserta kategori, waktu server, perangkat, tindakan, decision; jumlah diolah terpisah |
| `AdminLogs` | `LogID`, `Timestamp`, `ActorID`, `ActorName`, `Action`, `TargetType`, `TargetID`, `Details` | `audit_logs` | *append-only*, metadata tersaring, sebelum/sesudah bila aman dan relevan |
| `Gambar`, `Audio` | ID, nama, tautan, folder, pengunggah, proteksi password | `media_assets`, Supabase Storage | Migrasi file bytes; catat origin/legacy URL; privat, signed URL; jangan pertahankan password media plaintext |
| `Konfigurasi` | `Key`, `Value` | `app_settings`, `document_templates`, *secret manager* | Pisahkan pengaturan publik, konfigurasi sensitif, dan pengaturan internal cron |
| `Master_Data` | `List_Kelas`, `List_Mapel` | `classes`, `subjects` | Unik dalam organisasi dan nama ternormalisasi; jangan hilangkan label aslinya |
| `Notifications` | ID pengirim, tipe sasaran, IDs, exam, pesan, waktu, `ReadBy` | `notifications`, `notification_targets`, `notification_reads` | Jangan terus menulis satu JSON `ReadBy` yang rawan race-condition |
| `Supervisors` | ID tugas, exam, room name, session label, ID/nama pengawas asli, ID/nama pengganti | `supervisor_assignments`, `supervisor_substitutions` | Pengawas efektif dihitung dari pengganti aktif; gunakan FK ruang stabil |
| `ExamRooms` | `RoomID`, `ExamID`, `RoomName`, `SupervisorAssignID`, `StudentIDs`, `Capacity` | `exam_rooms`, `exam_room_students` | Satu siswa maksimal satu ruang per ujian; kapasitas `0` tanpa batas |
| GAS trigger/cache | setup/reminder/backup/timeout flags dan progress key | `scheduled_jobs`, `job_runs`, `email_deliveries`, `export_jobs`, `backup_jobs` | Terjadwal, *retry* aman, deduplikasi dan observabilitas |

### 6.3 Daftar tabel yang disarankan

**Identitas dan akademik**

- `organizations(id, name, timezone, settings, created_at)`; pada fase pertama isi satu organisasi.
- `profiles(id [FK auth.users], organization_id, legacy_user_id, username_normalized, full_name, active, created_at, updated_at)`; normalisasi username *case-insensitive*.
- `user_roles(user_id, organization_id, role)` dengan enum operasional `admin|teacher|supervisor|student`; role kontekstual Pengawas untuk Guru disimpan di sesi konteks terpisah, bukan mengubah `user_roles`.
- `classes(id, organization_id, name, active)`; `subjects(id, organization_id, name, active)`.
- `student_enrollments(student_id, class_id, organization_id, active_since, active_until)`.
- `teacher_assignments(teacher_id, class_id, subject_id, organization_id, active)`; indeks komposit, unik untuk assignment aktif.
- `identity_migration_map(legacy_user_id, auth_user_id, migration_status, activation_status)` dalam skema privat.

**Ujian dan soal**

- `exams(id, organization_id, legacy_exam_id, subject_id, title, starts_at, ends_at, duration_minutes, pin_hash, status_override, passing_grade, show_results_override, shuffle_config jsonb, bypass_input_period boolean, created_by, version, archived_at)`.
- `exam_classes(exam_id, class_id, organization_id)`; satu ujian boleh memiliki lebih dari satu kelas.
- `exam_type_configs(exam_id, type, enabled, max_questions, option_count, default_points)` untuk `PG`, `PG_KOMPLEKS`, `BS`, `JODOH`, `Esai`.
- `questions(id, organization_id, exam_id, legacy_question_id, type, content_html, required, points, rubric, min_chars, enforce_min_chars, image_asset_id, audio_asset_id, position, current_version, created_by, deleted_at)`.
- `question_versions(question_id, version, payload jsonb, created_by, created_at)` immutable; `payload` mempertahankan opsi/kunci/rubrik/attachment pada versi itu.
- `question_options(id, question_id, order_index, content_html, is_correct)` untuk PG dan PG kompleks; alternatif: simpan seluruh snapshot pada `question_versions` sebagai model kanonik. Pilih satu desain agar konsisten.
- `question_statements(id, question_id, order_index, content_html, correct_value)` untuk BS.
- `question_pairs(id, question_id, order_index, left_html, right_html)` untuk JODOH; jawaban klien menunjuk ID pasangan.
- `question_import_batches(id, exam_id, actor_id, source_type, idempotency_key, parsed_count, inserted_count, skipped_count, errors jsonb, status)`.

**Pengerjaan dan penilaian**

- `exam_attempts(id, organization_id, exam_id, student_id, legacy_response_id, attempt_number, status, started_at, deadline_at, submitted_at, resumed_at, paused_elapsed_seconds, device_session_id, shuffle_snapshot jsonb, exam_policy_snapshot jsonb, score_percent, passing_status, graded_at, version, updated_at)`.
- `attempt_answers(id, attempt_id, question_id, question_version, value jsonb, revision, saved_at)`; unik `(attempt_id, question_id)`.
- `answer_revisions(id, attempt_answer_id, revision, value jsonb, saved_at, request_id)` untuk *replay*, audit, dan penanganan sinkronisasi.
- `grade_items(id, attempt_id, question_id, question_version, source [auto|manual|ai_suggestion], awarded_points, max_points, rubric_snapshot, evaluator_id, reason, approved_at)`; skor AI saran **tidak** otomatis masuk nilai resmi.
- `grading_runs(id, attempt_id, version, computed_by, computed_at, objective_points, essay_points, maximum_points, score_percent, policy_version, notes)`; simpan histori hitung ulang.
- `exam_integrity_events(id, attempt_id, type, client_occurred_at, server_received_at, severity, client_context jsonb, countable, resolved_by, resolution)`.
- `attempt_overrides(id, attempt_id, action [unlock|reset|extend|finish], actor_id, reason, previous_state jsonb, next_state jsonb, created_at)`.

**Pengawas, ruang, komunikasi**

- `exam_rooms(id, organization_id, exam_id, legacy_room_id, name, capacity, created_at, updated_at)`; unik nama ternormalisasi pada satu ujian.
- `exam_room_students(id, room_id, exam_id, student_id, enrolled_at)`; unik `(exam_id, student_id)`.
- `supervisor_assignments(id, organization_id, exam_id, room_id, legacy_assignment_id, session_label, original_supervisor_id, active, created_at)`.
- `supervisor_substitutions(id, assignment_id, substitute_supervisor_id, effective_from, effective_until, appointed_by, revoked_by, reason)`; tentukan satu pengganti aktif per assignment.
- `notifications(id, organization_id, sender_id, exam_id, message, target_type, sent_at, expires_at)`.
- `notification_targets(notification_id, student_id)` dan `notification_reads(notification_id, user_id, read_at)`; unik pasangan.
- `teacher_input_periods(id, organization_id, enabled, starts_at, ends_at, updated_by)`; jika kebutuhan sumber global satu periode, hanya satu baris aktif per organisasi.
- `email_delivery_log(id, organization_id, teacher_id, template_code, period_id, notification_date, notification_hour, status, provider_message_id, sent_at)`; indeks unik untuk deduplikasi.

**Operasional, media, dokumen**

- `media_assets(id, organization_id, kind [image|audio|drawing], bucket, object_path, original_name, mime_type, byte_size, uploader_id, visibility, checksum, legacy_url, deleted_at)`.
- `document_templates(id, organization_id, type [exam_card|header|recap|question_sheet|student_report], config jsonb, version, active)`.
- `export_jobs(id, organization_id, requested_by, kind, scope jsonb, status, output_asset_id, progress, error, created_at, completed_at)`.
- `backup_jobs(id, organization_id, trigger [manual|semester], status, completed_at, storage_location, checksum, retention_until, restore_tested_at)`.
- `audit_logs(id, organization_id, actor_id, action, target_type, target_id, context jsonb, request_id, created_at)`.
- `app_settings(organization_id, key, value jsonb, is_secret boolean, updated_at)`; **nilai rahasia hanya di server/secret manager**, bukan di baris yang bisa dibaca lewat Data API.
- `scheduled_jobs`, `job_runs` dan `outbox_events` untuk pemrosesan asinkron yang andal.

### 6.4 Kendala integritas wajib di database

- `exam_attempts`: `(exam_id, student_id, attempt_number)` unik; satu *active attempt* per `(exam_id, student_id)` memakai partial unique index atas status aktif, atau aturan retry serializable dalam transaksi.
- `exam_room_students`: `(exam_id, student_id)` unik; *exam_id* harus sama dengan yang dimiliki `room_id` (enforce dengan FK komposit atau trigger teruji).
- Penugasan Guru: `(teacher_id, subject_id, class_id)` unik untuk penugasan aktif.
- Pertanyaan: `points > 0`, `question type` salah satu dari lima nilai; validasi jumlah opsi/kunci dan bobot dipusatkan di service domain.
- Ujian: `ends_at > starts_at`, `duration_minutes > 0`, `passing_grade BETWEEN 0 AND 100`, kapasitas ruang nonnegatif.
- Nilai esai: `0 <= awarded_points <= max_points` dalam transaksi; hanya skor yang disetujui Guru/Admin masuk agregat resmi.
- Auto-submit dan sinkronisasi harus idempoten: jangan membiarkan request berulang membuat dua attempt/dua finalisasi atau mengubah jawaban setelah final.
- Semua tabel yang memuat data siswa memiliki FK organisasi/ujian/kelas sesuai cakupan. Jangan membuat policy RLS yang bergantung pada field `role` atau `organization_id` dari body klien.

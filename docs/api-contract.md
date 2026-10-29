# Kontrak API rancangan

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

## 9. Kontrak API dan kompatibilitas dengan fungsi GAS

### 9.1 Konvensi umum

Semua request dengan body disaring menggunakan Zod, semua respons memiliki bentuk konsisten:

```ts
type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId: string;
};
type ApiFailure = {
  success: false;
  error: {
    code: 'AUTH' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' |
          'PERIOD' | 'CONFIG_MISSING' | 'TYPE_DISABLED' |
          'QUOTA' | 'CONFLICT' | 'EXAM_CLOSED' |
          'TIME_EXPIRED' | 'RATE_LIMIT' | 'SYSTEM';
    message: string;
    details?: unknown;
  };
  requestId: string;
};
```

Gunakan HTTP status sesuai kategori: `400/422` validasi, `401` belum login, `403` akses ditolak, `404` objek di luar scope atau tidak ditemukan, `409` versi/idempotency/kuota, `429` rate limit, `5xx` error server. **Jangan pernah mempercayai userID, role, score, answerKey, atau token sumber dari body sebagai identitas berwenang.** Gunakan subject sesi yang diverifikasi di server.

### 9.2 Endpoint utama dan pemetaan legacy

| Route + metode baru | Operasi | GAS lama yang sepadan |
|---|---|---|
| `POST /api/auth/login` | Login username/password, konteks dan optional PIN Siswa; set sesi aman | `loginUser`, `validateExamPIN` |
| `GET /api/auth/session` | Validasi dan data aktor/konteks terkini | `checkSession`, `isValidSession` |
| `POST /api/auth/logout` | Logout dan revoke sesi | `logoutUser` |
| `GET /api/exams` | Daftar ujian sesuai scope, status, konfigurasi | `getExamList` |
| `POST /api/exams` | Buat ujian | `createExam` |
| `PATCH /api/exams/:id` | Edit ujian | `updateExam`, `toggleExamStatus` |
| `DELETE /api/exams/:id` | Arsip/hapus aman | `deleteExam`, `deleteExamsBulk` |
| `GET /api/exams/:id/questions` | Soal untuk staf, termasuk kunci jika berizin | `getQuestionsByExam` |
| `POST /api/exams/:id/questions` | Tambah soal | `addQuestion` |
| `PATCH /api/questions/:id` | Perbarui soal berversi | `updateQuestion` |
| `DELETE /api/questions/:id` | Soft delete atau bulk delete | `deleteQuestion`, `deleteQuestionsBulk` |
| `POST /api/exams/:id/questions/batch` | Validasi/commit bulk soal, maksimal 500 | `saveBatchQuestions`, `backendValidateBatch_`, `enforceTypeConfig_` |
| `POST /api/imports/questions/excel` | Impor Excel + preview | `saveImportedQuestions`, parsing frontend |
| `POST /api/imports/questions/forms` | Impor dari Google Forms | `importQuestionsFromForm` |
| `POST /api/exams/:id/questions/copy` | Copy bank soal | `copyQuestions` |
| `GET /api/question-progress` | Progres target guru | `getQuestionProgressData`, `evaluateAllTeachersProgress_` |
| `POST /api/attempts/start` | Verifikasi PIN/kelas/jadwal; buat/resume attempt | `validateExamPIN`, `getExamQuestions` |
| `GET /api/attempts/:id` | Soal tanpa kunci, snapshot, jawaban dan sisa waktu | `getExamQuestions` |
| `PATCH /api/attempts/:id/answers` | Autosave batch + revision | `syncAnswers` |
| `POST /api/attempts/:id/submit` | Finalisasi aman dan hitung skor | `submitExam` |
| `POST /api/attempts/:id/integrity-events` | Catat kejadian keamanan ujian | `logViolation` |
| `POST /api/attempts/:id/unlock` | Buka blokir sesuai izin | `unlockStudentExam`, `bulkUnlockStudents` |
| `POST /api/attempts/:id/reset` | Reset attempt dengan alasan | `resetStudentExam`, `bulkResetStudents` |
| `GET /api/results` | Rekap hasil role-scoped | `getExamResults` |
| `GET /api/results/:attemptId` | Detail jawaban peserta yang berizin | `getStudentAnswerDetail(s)` |
| `GET /api/students/me/results/:id` | Hasil milik siswa jika show-results aktif | `getMyExamResult` |
| `GET /api/essay-grading` | Progres dan detail koreksi | `getEssayGradingProgress`, `getEssayGradingDetail`, `getEssayData` |
| `POST /api/grading/essay` | Koreksi esai manual/batch | `saveEssayGrade`, `batchSaveEssayGrades` |
| `POST /api/grading/essay/suggest` | Saran skor AI, bukan final | `scoreEssayWithAI`, `saveAIScoreToResponse` |
| `POST /api/grading/recalculate` | Hitung ulang nilai berotorisasi | `recalculateExamScores` |
| `GET /api/analytics/items` | Analisis PG, PGK, BS, JODOH, esai | `getItemAnalysis`, `getBSItemAnalysis`, `getJODOHItemAnalysis`, `getEssayAnalysisData` |
| `GET /api/reports/student/:id` | Laporan peserta | `getStudentDetailReport`, `generateStudentDetailPDF` |
| `GET /api/reports/class/:id` | Ringkasan kelas | `getClassSummaryReport`, `generateExamRecapPDF` |
| `POST /api/exports` | PDF/Excel/ZIP sebagai job | `generateLembarSoalPDF`, `generateExamHTML`, `downloadKartuMassal` |
| `GET /api/exports/:jobId` | Progress dan URL unduhan aman | `checkDownloadProgress` |
| `GET /api/users` | Daftar pengguna berizin, TANPA password | `getUserList` |
| `POST/PATCH/DELETE /api/users` | CRUD, aktif/nonaktif, impor massal | `createUser`, `updateUser`, `deleteUser`, `toggleUserStatus`, `importUsersBulk` |
| `GET/POST/PATCH /api/master-data` | Kelas/mapel | `getMasterData`, `saveMasterData` |
| `GET/POST/DELETE /api/media` | Gambar/audio/rekaman canvas | `getSavedImages`, `getSavedAudio`, `uploadImageFile`, `uploadAudioFile`, `processFolderImages`, `processFolderAudio`, `deleteSavedImage`, `deleteSavedAudio` |
| `POST /api/media/:id/access` | Akses media dan signed URL | `verifyImageAccess`, `verifyAudioAccess` |
| `GET /api/monitor` | Dashboard live/polling | `getExamMonitorData` |
| `GET /api/supervisor/dashboard` | Statistik pengawas | `getDashboardDataForSupervisor` |
| `GET /api/supervisor/monitor` | Monitor hanya penugasan efektif | `getMonitorDataForSupervisor` |
| `GET/POST/PATCH/DELETE /api/supervisors/assignments` | CRUD penugasan | `getSupervisorAssignments`, `createSupervisorAssignment`, `updateSupervisorAssignment`, `deleteSupervisorAssignment` |
| `PUT/DELETE /api/supervisors/assignments/:id/substitute` | Tetapkan/cabut pengganti | `setSubstituteSupervisor`, `clearSubstituteSupervisor` |
| `GET/POST/PATCH/DELETE /api/rooms` | CRUD, sinkron roster dan pengawas | `getExamRooms`, `createExamRoom`, `updateExamRoom`, `deleteExamRoom` |
| `POST/DELETE /api/rooms/:id/students` | Enroll/remove peserta | `addStudentsToRoom`, `removeStudentFromRoom`, `getExamRoomStudentData` |
| `POST/GET /api/notifications` | Kirim/riwayat pesan ke siswa | `sendStudentNotification`, `getStudentNotifications`, `getSentNotifications` |
| `POST /api/notifications/:id/read` | Mark read per pengguna | `ReadBy` legacy |
| `GET/PATCH /api/settings` | Konfigurasi termasuk jadwal input soal | `getAppConfig`, `saveAppConfig`, `getInputPeriod`, `saveInputPeriod` |
| `GET /api/audit-logs` | Jejak perubahan | `getAdminLogs` |
| `POST /api/backups` | Backup manual Admin | `manualBackup`, `backupDataToDrive` |
| `POST /api/cron/*` | Aktivasi otomatis, timeout, pengingat, backup | `autoActivateExams`, `autoTimeoutInProgressExams`, `sendInputReminderNotifications`, `setupSemesterBackupTrigger` |

**Peta di atas adalah kontrak layanan yang disarankan**, bukan route yang sudah ada di repositori. Satu fungsi GAS boleh dipecah ke beberapa service baru dan beberapa fungsi GAS boleh disatukan pada satu API dengan *authorization check* yang sama. Jangan mengimplementasikan endpoint yang mengizinkan client meminta soal ujian beserta kuncinya.

### 9.3 Contoh kontrak mulai/resume ujian

```http
POST /api/attempts/start
Content-Type: application/json

{"examPin":"12345"}

HTTP/1.1 200 OK
{
  "success": true,
  "data": {
    "attemptId": "uuid-attempt",
    "examId": "uuid-exam",
    "status": "in_progress",
    "deadlineAt": "2026-10-27T02:00:00Z",
    "serverNow": "2026-10-27T01:20:00Z",
    "remainingSeconds": 2400,
    "questionSetVersion": 7,
    "isResumed": false
  },
  "requestId": "req-id"
}
```

Contoh hanya ilustrasi bentuk, bukan PIN atau data sistem sebenarnya. Sesi mengidentifikasi siswa secara server-side, bukan field `userId` dari browser. PIN dicocokkan secara *timing-safe* terhadap hash/identitas ujian yang berada dalam cakupan kelas dan jadwal valid. Jika lebih dari satu ujian memakai PIN serupa, server tidak boleh memilih ujian arbitrer; tetapkan aturan disambiguasi.

### 9.4 Contoh kontrak autosave aman

```http
PATCH /api/attempts/{attemptId}/answers
Content-Type: application/json

{
  "clientMutationId": "uuid-mutation",
  "expectedAttemptVersion": 8,
  "answers": [
    {"questionId":"uuid-q1", "type":"PG", "value":{"optionId":"uuid-o1"}},
    {"questionId":"uuid-q2", "type":"BS", "value":{"statementAnswers":{"uuid-s1":"benar"}}}
  ]
}

HTTP/1.1 200 OK
{
  "success": true,
  "data": {
    "savedCount": 2,
    "attemptVersion": 9,
    "savedAt": "2026-10-27T01:20:15Z"
  },
  "requestId": "req-id"
}
```

Server memverifikasi attempt milik siswa dari sesi, status masih dapat disimpan, versi dan batas waktu. Untuk `clientMutationId` yang sama hasil wajib sama, tidak melakukan perubahan ulang. Jika versi sudah maju, kembalikan `409 CONFLICT` beserta versi terbaru dan petunjuk refresh/merge yang tidak menghilangkan isi input.

### 9.5 Kontrak penilaian dan impor batch

```ts
// Jawaban per tipe disatukan sebagai discriminated union.
type AnswerValue =
  | { type: 'PG'; optionId: string | null }
  | { type: 'PG_KOMPLEKS'; optionIds: string[] }
  | { type: 'BS'; statementAnswers: Record<string, 'benar' | 'salah'> }
  | { type: 'JODOH'; pairAnswers: Record<string, string> }
  | { type: 'Esai'; html: string; drawingAssetIds?: string[] };

// Batch soal: satu respons untuk satu batch, dengan hasil per item.
type BatchQuestionsResult = {
  inserted: number;
  skipped: number;
  items: Array<{
    blockNumber: number;
    status: 'inserted' | 'invalid' | 'disabled' | 'quota' | 'duplicate';
    questionId?: string;
    errors?: string[];
  }>;
};
```

Penilaian dan analisis memakai `questionId`+`questionVersion`, bukan `contentHtml` sebagai identitas logis. Untuk impor legacy, buat adaptor tersendiri yang bisa memetakan kunci huruf/teks menjadi ID opsi dari versi yang sama.

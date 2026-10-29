# Baseline sumber

Acuan: dokumen dasar v1.0 dan commit `1a4407c727f2660e40019177c5920bab45afb815`. Status: rancangan; belum divalidasi terhadap dataset atau runtime produksi.

Commit terikat: `1a4407c727f2660e40019177c5920bab45afb815`.

| File | Byte | Git blob SHA | Bukti |
|---|---:|---|---|
| Code.gs | 513051 | 9f7ebec17a4a7103a51417db3e00c62f647eda91 | Unduh pada commit dan `git hash-object` |
| index.html | 2242276 | 71bcdc15134ad5baf35bc17d99d93f7bee169fd5 | Unduh pada commit dan `git hash-object` |

Dokumen dasar SHA-256 `94c55f4a62267c4dba103666cc981c56107e4a16257a7c288f70b56f5758f934`; dokumen tahapan `1d5410ae06adfcba4058bfe5ea2cafe276e806c43b40861bb61bf5aae8d1edca`.
Repositori baru terverifikasi: `randyipratama25-ops/edutaracbt`; runtime awal `db18656`. Catatan pencarian lama berikut bersifat historis. Pencarian repositori terpasang dengan kata edutara mengembalikan kosong; ini bukan bukti bahwa repositori tidak ada. Kode asli tidak disertakan karena memuat informasi sensitif.

## 15. Indeks keterlacakan ke kode sumber

Bagian ini penting ketika agen pengembang menerapkan modul. Nomor baris adalah **referensi kira-kira pada commit yang diaudit**, tidak boleh dianggap stabil setelah perubahan di GitHub. Selalu gunakan nama fungsi + SHA blob sebagai acuan bersama. Fungsi callback/anonymous di dalam file besar tidak semua tercantum; daftar berfokus pada *entry points* dan implementasi domain yang harus di-porting, bukan menyalin setiap helper DOM 1:1.

### 15.1 Backend `Code.gs`: referensi fungsi kritis

| Area bisnis | Fungsi GAS yang relevan | Kisaran / baris awal |
|---|---|---|
| Database schema dan seeding | `initializeSheets`, `migrateSchema`, `migrateDefaultPointsInTypeConfig_` | 122, 211, 299 |
| Spreadsheet kredensial staf | `_getExternalUsersSheet_`, `_getAllExternalCredentials_`, `_getExternalCredential_`, `_upsertExternalCredential_`, `_removeExternalCredential_`, `migrateAdminGuruPasswordsToExternal` | 9–98 |
| Autentikasi & akses | `loginUser`, `checkSession`, `validateExamPIN`, `logoutUser`, `isValidSession`, `verifyAdminAccess`, `checkUserAccess`, `verifyRequestor_` | 1368–1654; 349–474 |
| Konfigurasi kuota/batch soal | `loadExamTypeConfig_`, `countExistingQuestionsByType_`, `backendValidateBatch_`, `enforceTypeConfig_`, `persistBatchQuestionsAtomic_`, `saveBatchQuestions`, `_saveBatchQuestionsLocked_` | 474–1365 |
| Penyajian soal dan attempt | `getExamQuestions`, `syncAnswers`, `submitExam`, `logViolation`, `convertCanvasToLatex` | 1655, 1789, 1951, 2103, 1836 |
| CRUD jadwal ujian | `createExam`, `getExamList`, `deleteExam`, `deleteExamsBulk`, `toggleExamStatus`, `updateExam` | 2112, 2165, 2567, 2584, 2612, 2624 |
| CRUD / impor bank soal | `addQuestion`, `getQuestionsByExam`, `deleteQuestion`, `importQuestionsFromForm`, `copyQuestions`, `saveImportedQuestions`, `deleteQuestionsBulk` | 2256, 2316, 2342, 2440, 2525, 3097, 6271 |
| Nilai, koreksi esai | `getPassingStatus`, `getExamResults`, `getEssayData`, `saveEssayGrade`, `recalculateExamScores`, `getMyExamResult` | 1940, 2386, 2753, 2840, 6065, 6240 |
| AI penilaian esai | `getEssayAnalysisData`, `scoreEssayWithAI`, `saveAIScoreToResponse`, `batchSaveEssayGrades`, `getEssayGradingProgress`, `getEssayGradingDetail` | 7660, 7813, 7994, 8032, 11930, 12244 |
| Pengguna & assignment Guru | `getUserList`, `createUser`, `updateUser`, `deleteUser`, `toggleUserStatus`, `importUsersBulk`, `getTeacherAssignments`, `getSiswaForGuru` | 3285–3440; 5907; 6300 |
| Data master dan progres pembuatan soal | `getMasterData`, `saveMasterData`, `getQuestionProgressData`, `computeExamTarget_`, `evaluateAllTeachersProgress_` | 3255, 3270, 3211, ±9070, ±9152 |
| Rekap, laporan dan PDF | `generateExamRecapPDF`, `generateExamHTML`, `getStudentAnswerDetail`, `getStudentAnswerDetails`, `generateStudentDetailPDF`, `generateLembarSoalPDF`, `getStudentDetailReport`, `getClassSummaryReport` | 3460, 3579, 3657, 3922, 4324, 4738, 8327, 8489 |
| Kartu ujian siswa | `getKartuConfig`, `validateKartuConfig`, `downloadKartuSiswa`, `checkDownloadProgress`, `downloadKartuMassal` | 104, 5709, 5947, 5996, 6000 |
| Gambar/audio/Storage | `getSavedImages`, `getSavedAudio`, `processFolderImages`, `deleteSavedImage`, `getAllImages`, `getAllAudio`, `uploadImageFile`, `uploadAudioFile`, `processFolderAudio`, `deleteSavedAudio`, `verifyImageAccess`, `verifyAudioAccess` | 5074–5197; 5408–5905 |
| App settings | `getAppConfig`, `saveAppConfig`, `getInputPeriod`, `saveInputPeriod`, `enforceInputPeriod_` | 5198–5390; 8836–9070 |
| Analisis butir | `getItemAnalysis`, `getBSItemAnalysis`, `getJODOHItemAnalysis`, `getEssayAnalysisData` | 6799, 7136, 7368, 7660 |
| Admin audit dan event keamanan | `addAdminLog`, `getAdminLogs`, `getExamMonitorData`, `unlockStudentExam`, `bulkUnlockStudents`, `bulkResetStudents` | 6671, 6691, 6353, 6208, 6605, 6638 |
| Backup dan auto-exam | `autoActivateExams`, `setupAutoActivateTrigger`, `backupDataToDrive`, `setupSemesterBackupTrigger`, `manualBackup`, `autoTimeoutInProgressExams`, `setupDailyTimeoutTrigger` | 6726–6798, 7057–7136, 9762–9883 |
| Email pengingat pembuatan soal | `getEmailVerificationStatus_`, `recheckEmailVerification`, `shouldSendAtTime_`, `composeReminderEmail_`, `sendInputReminderNotifications`, `setupInputReminderTrigger`, `removeInputReminderTrigger` | ±9361–9738 |
| Pesan ke siswa | `sendStudentNotification`, `getStudentNotifications`, `getSentNotifications` | 9932, 10020, 10121 |
| Supervisor dan pengganti | `_getOrCreateSupervisorsSheet_`, `_verifySupervisorSession_`, `getSupervisorAssignments`, `createSupervisorAssignment`, `updateSupervisorAssignment`, `deleteSupervisorAssignment`, `setSubstituteSupervisor`, `clearSubstituteSupervisor`, `getSupervisorUserList` | 10183–10695 |
| Dashboard dan monitor Supervisor | `getDashboardDataForSupervisor`, `getMonitorDataForSupervisor`, `_getSupervisorRoomStudents_` | 10695, 10803, 11852 |
| Manajemen ruang dan roster | `_getOrCreateExamRoomsSheet_`, `syncAllExamRoomSupervisors`, `getExamRooms`, `createExamRoom`, `updateExamRoom`, `deleteExamRoom`, `addStudentsToRoom`, `removeStudentFromRoom`, `getExamRoomStudentData` | 11164–11852 |

### 15.2 Frontend `index.html`: wilayah kode berdasarkan kelompok

| Kisaran baris | Entry point/contoh fungsi sumber | Modul React baru |
|---|---|---|
| Awal–±15.000 | HTML halaman login/admin/siswa/pengawas; CSS, tema, tabel, dialog, elemen UI | app layouts, design system, login/exam shell |
| ±15.000–16.680 | `toggleDesktopSidebar`, `toggleMobileSidebar`, `lpSetRole`, `handleLogin`, `checkSavedSession`, `logout` | responsive shell, auth components |
| ±16.680–18.500 | `showAdminTab`, `renderMasterDataPage`, `renderQuestionProgress`, `renderAdminHome` | routing, dashboard/master/progress |
| ±18.500–20.500 | `renderExamForm`, `handleExamSubmit`, `duplicateExam`, `handleBulkDeleteExams`, `refreshExamList` | exam management |
| ±20.500–24.500 | `renderQuestionBank`, `handleAddQuestion`, editor tipe, image picker, upload queue, `downloadLembarSoalPDF`, `loadQuestionsTable` | question editor + media picker |
| ±24.500–26.200 | `renderResults`, `loadResultsTable`, `downloadResultPDF`, `viewStudentAnswers` | result management |
| ±26.200–28.900 | `initStudentExam`, `renderQuestion`, `selectOption`, `toggleComplexPG`, `saveAnswer`, `debouncedSync`, `enableAntiCheat`, `handleSecurityTrigger`, `executeSubmission`, `startTimer` | exam player, autosave, integrity |
| ±28.900–30.200 | `checkSavedSession`, `downloadTemplateExcel`, `processExcelImport`, `previewBatchInput`, `processBatchInput`, `doSaveBatchQuestions` | session restore, import pipeline |
| ±30.200–33.500 | `renderUserManagement`, `loadUserTable`, `handleUserSubmit`, `processUserImport`, `loadMonitorData`, `renderMonitorTable`, notification polling | users + admin monitor |
| ±33.500–36.000 | `renderAudioFolder`, `renderImageFolder`, file queue/upload, media verification, picker, lightbox, copy link | Storage browser/attachment selector |
| ±36.000–38.300 | karakter/simbol/Arab/math keyboard, `initEssayCanvas`, `convertCanvasToLatex`, `renderConfigPage`, `handleSaveConfig` | essay editor, virtual keyboard, settings |
| ±38.300–40.100 | `showStudentResultPage`, `renderKartuSiswaPage`, `handleKartuMassal`, `handleSetupInputReminderTrigger`, `handleSetupAutoTrigger` | result/student cards/jobs |
| ±40.100–44.900 | `renderEssayGradingProgress`, `renderItemAnalysis`, `loadItemAnalysis`, `loadBSAnalysis`, `loadJODOHAnalysis`, `loadEssayAnalysis`, `scoreAllPendingWithAI`, report/print/export functions | grading, five-type analytics, printing |
| ±44.900–45.500 | `renderAdminLogs`, `handleManualBackup`, `handleSetupSemesterBackup` | audit + backup admin |
| ±45.500–47.400 | `initSupervisorPanel`, `renderSupervisorHome`, `renderSupervisorMonitor`, `openViolationPanel` | supervisor dashboard/monitor |
| ±47.400–50.000 | `renderSupervisorManagement`, `_svMgmtSubSave`, `_svMgmtClearSubstitute`, `renderExamRoomPage` | assignments + substitute + rooms |
| ±50.000–akhir | `_erRenderStudentPanel`, `_erBulkAdd`, `_erRemoveStudent`, `_erSaveRoom`, `_erDeleteRoom`, `_erSyncIfActive` | roster, capacity, room CRUD |

**Kewajiban analisis lanjutan per task implementasi:** sebelum memigrasikan satu modul, inspeksi ulang potongan fungsi source lengkap (termasuk callback dan variabel global yang dipakai), dokumentasikan *input*, *output*, error states, side effects, dependensi sheet, lalu buat tes untuk kasusnya. Tabel ini memandu pencarian; tidak menggantikan test runtime.

### 15.3 Relasi silang terpenting yang tidak boleh putus

- `loginUser` ↔ `validateExamPIN` ↔ `getExamQuestions` ↔ `syncAnswers` ↔ `submitExam` ↔ hasil siswa: satu rangkaian state, bukan enam fitur terpisah.
- `createExam/updateExam` ↔ `TypeConfig` ↔ bank soal/import/copy ↔ progres Guru ↔ reminder email: perubahan target langsung memengaruhi kelengkapan dan penolakan input.
- `Questions` ↔ grading ↔ essay grading ↔ analisis butir ↔ laporan: hanya satu versi soal/kunci dan satu engine perhitungan berlaku untuk satu attempt.
- `ExamRooms` ↔ `Supervisors` ↔ `SubstituteUserID` ↔ login konteks Pengawas ↔ monitor/unlock/notifikasi: perubahan pengganti mengubah hak akses efektif dengan segera.
- `Konfigurasi` ↔ `show_exam_result`, `violation_limit`, `essay_canvas_enabled`, `auto_timeout_hour`, `input_period_*`, header PDF, AI key: setiap perubahan harus tercermin pada fitur terkait tanpa mengubah attempt historis secara tak terduga.
- `Gambar`/`Audio` ↔ Questions/Essay/Export: referensi ke file harus dapat dipakai dalam HTML soal, preview, halaman ujian dan PDF melalui izin/URL yang sesuai.
- `Responses` ↔ monitor ↔ timeout cron ↔ reset/unlock ↔ grade ledger ↔ reports: perubahan status harus konsisten dan atomik.

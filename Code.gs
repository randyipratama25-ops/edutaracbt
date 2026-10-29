const SS = SpreadsheetApp.openById('13CGzz0Rmtonoyk1ddert3jJ-_7dpI55zpl4jZ1-Bx4Q');

const TEMPLATE_ID = 'ubah template id nya di sini'; 
const FOLDER_ID   = 'ubah folder id tempat menyimpan kartu ujian di sini';

const EXTERNAL_USERS_SS_ID  = '13FjTGSqVkNcaB9CjpkC-ClLkmqBo0gVgCnFwjIxPClI';
const EXTERNAL_USERS_SHEET  = 'Users';

function _getExternalUsersSheet_() {
  try {
    const ss = SpreadsheetApp.openById(EXTERNAL_USERS_SS_ID);
    let sheet = ss.getSheetByName(EXTERNAL_USERS_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(EXTERNAL_USERS_SHEET);
      sheet.getRange(1, 1, 1, 3).setValues([['Updated','Username','Password']])
           .setFontWeight('bold').setBackground('#e2e8f0');
      sheet.setFrozenRows(1);
    }
    return sheet;
  } catch (e) {
    Logger.log('External Users sheet error: ' + e.message);
    return null;
  }
}

function _getAllExternalCredentials_() {
  const map = {};
  const sheet = _getExternalUsersSheet_();
  if (!sheet || sheet.getLastRow() < 2) return map;
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    const u = String(data[i][0] || '').trim();
    if (!u) continue;
    map[u.toLowerCase()] = {
      row:      i + 2,
      username: u,
      password: String(data[i][1] || '').trim()
    };
  }
  return map;
}

function _getExternalCredential_(username) {
  const u = String(username || '').trim().toLowerCase();
  if (!u) return null;
  const map = _getAllExternalCredentials_();
  return map[u] || null;
}

function _upsertExternalCredential_(username, password) {
  const sheet = _getExternalUsersSheet_();
  if (!sheet) throw new Error('Spreadsheet kredensial eksternal tidak dapat diakses.');
  const u = String(username || '').trim();
  if (!u) throw new Error('Username eksternal tidak boleh kosong.');
  const pwd = String(password == null ? '' : password).trim();
  const existing = _getExternalCredential_(u);
  if (existing) {
    sheet.getRange(existing.row, 2).setValue(u);
    sheet.getRange(existing.row, 3).setValue("'" + pwd);
    sheet.getRange(existing.row, 1).setValue(new Date());
  } else {
    const newRow = Math.max(sheet.getLastRow(), 1) + 1;
    sheet.getRange(newRow, 1).setValue(new Date());
    sheet.getRange(newRow, 2).setValue(u);
    sheet.getRange(newRow, 3).setValue("'" + pwd);
  }
  return true;
}

function _removeExternalCredential_(username) {
  const sheet = _getExternalUsersSheet_();
  if (!sheet) return;
  const existing = _getExternalCredential_(username);
  if (existing) sheet.deleteRow(existing.row);
}

function migrateAdminGuruPasswordsToExternal() {
  const userSheet = SS.getSheetByName('Users');
  if (!userSheet) return { success:false, message:'Sheet internal Users tidak ditemukan.' };
  const data = userSheet.getDataRange().getValues();
  const extMap = _getAllExternalCredentials_();
  let migrated = 0, skipped = 0;
  for (let i = 1; i < data.length; i++) {
    const role = String(data[i][3] || '').trim();
    if (role !== 'Admin' && role !== 'Guru' && role !== 'Pengawas') continue;
    const userId = String(data[i][0] || '').trim();
    const pwd    = String(data[i][2] || '').trim();
    if (!userId) continue;
    if (extMap[userId.toLowerCase()]) { skipped++; continue; }
    _upsertExternalCredential_(userId, pwd);
    migrated++;
  }
  const msg = `Migrasi kredensial eksternal: ${migrated} ditambahkan, ${skipped} sudah ada.`;
  Logger.log(msg);
  return { success:true, message: msg, migrated, skipped };
}

function _isFinishedStatus(rawStatus) {
  const s = String(rawStatus || '').toLowerCase().trim();
  return s === 'completed' || s === 'selesai' || s === 'waktu habis';
}

function getKartuConfig() {
  let templateId = TEMPLATE_ID;
  let folderId   = FOLDER_ID;
  try {
    const sheet = SS.getSheetByName('Konfigurasi');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const k = String(data[i][0]).trim();
        const v = String(data[i][1] || '').trim();
        if (k === 'kartu_template_id' && v) templateId = v;
        if (k === 'kartu_folder_id'   && v) folderId   = v;
      }
    }
  } catch(e) {}
  return { templateId, folderId };
}

function initializeSheets() {
  const schema = {
    'Users':      ['UserID','Nama','Password','Role','Class','SessionToken','IsActive'],
    'Exams':      ['ExamID','Subject','Class','Date','Duration','PIN','Status','EndDate','ShuffleConfig','TypeConfig','PassingGrade'],
    'Questions':  ['QuestionID','ExamID','Type','Content','ImageURL','Options','CorrectAnswer','IsRequired','Point','Rubric','MinChar','MinCharEnabled'],
    'Responses':  ['ResponseID','UserID','ExamID','AnswersJSON','Score','StartTime','SubmitTime','Status'],
    'Logs':       ['LogID','UserID','ExamID','ViolationCount','Details','Timestamp'],
    'AdminLogs':  ['LogID','Timestamp','ActorID','ActorName','Action','TargetType','TargetID','Details'],
    'Gambar':     ['ImageID','FileName','DirectLink','Preview','FolderID','DateAdded','UploaderID','Password'],
    'Audio':      ['AudioID','FileName','DirectLink','Preview','FolderID','DateAdded','UploaderID','Password'],
    'Konfigurasi':['Key','Value'],
    'Master_Data':['List_Kelas','List_Mapel'],
    'Notifications':['NotifID','SenderID','SenderName','TargetType','TargetIDs','ExamID','Message','SentAt','ReadBy']
  };
 
  for (const [name, headers] of Object.entries(schema)) {
    let sheet = SS.getSheetByName(name);
    if (!sheet) {
      sheet = SS.insertSheet(name);
      sheet.appendRow(headers);
      sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#e2e8f0');
      sheet.setFrozenRows(1);
 
      if (name === 'Konfigurasi') {
        const sampleConfig = [
          ['app_name','Ujian Online V.3'],
          ['app_subtitle','Sistem Ujian Terintegrasi'],
          ['app_logo','https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg/250px-Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg.png'],
          ['app_background','https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1986&auto=format&fit=crop'],
          ['show_exam_result','true'],
          ['violation_limit','3']
        ];
        sheet.getRange(2,1,sampleConfig.length,2).setValues(sampleConfig);
      }
 
      if (name === 'Master_Data') {
        const defaultClasses = [['X-IPA 1'],['X-IPA 2'],['X-IPS 1'],['XI-IPA 1'],['XI-IPA 2'],['XI-IPS 1'],['XII-RPL'],['XII-TKJ'],['XII-MM']];
        sheet.getRange(2,1,defaultClasses.length,1).setValues(defaultClasses);
        const defaultSubjects = [['Matematika'],['Bahasa Indonesia'],['Bahasa Inggris'],['Fisika'],['Kimia'],['Biologi'],['Sejarah'],['Geografi'],['Ekonomi'],['Pemrograman Dasar'],['Basis Data']];
        sheet.getRange(2,2,defaultSubjects.length,1).setValues(defaultSubjects);
      }
    }
  }
 
  const userSheet = SS.getSheetByName('Users');
  if (userSheet.getLastRow() === 1) {
    userSheet.appendRow(['ADM-001','Admin Utama','','Admin','-','','TRUE']);
    userSheet.appendRow(['SIS-001','Siswa Contoh','siswa123456','Siswa','XII-RPL','','TRUE']);
    userSheet.appendRow(['GUR-001','Guru Contoh','','Guru','-','','TRUE']);
    userSheet.appendRow(['PWS-001','Pengawas Contoh','','Pengawas','-','','TRUE']);
    try {
      _upsertExternalCredential_('ADM-001', 'admin123');
      _upsertExternalCredential_('GUR-001', 'guru123');
      _upsertExternalCredential_('PWS-001', 'pengawas123');
    } catch(e) {
      Logger.log('Seed kredensial eksternal gagal: ' + e.message);
    }
  }
 
  const examSheet = SS.getSheetByName('Exams');
  const demoExamID = 'EXM-DEMO-001';
  if (examSheet.getLastRow() === 1) {
    const now = new Date();
    const endTime = new Date(now.getTime() + 7*24*60*60*1000);
    examSheet.appendRow([demoExamID,'Simulasi Ujian AKM & Standar','XII-RPL',now,60,'12345','Aktif',endTime,'','',75]);
  }
 
  const qSheet = SS.getSheetByName('Questions');
  if (qSheet.getLastRow() === 1) {
    qSheet.appendRow(['Q-001',demoExamID,'PG','Berapakah hasil dari 5 x 5?','',JSON.stringify(['10','20','25','55','50']),'25','TRUE',10]);
    qSheet.appendRow(['Q-002',demoExamID,'PG','Ibu kota negara Indonesia saat ini adalah?','',JSON.stringify(['Bandung','Surabaya','Jakarta','Medan','Makassar']),'Jakarta','TRUE',10]);
    const statements1 = ["Global warming menyebabkan suhu bumi menurun.","Es di kutub mencair akibat kenaikan suhu rata-rata.","Perubahan iklim tidak berdampak pada cuaca."];
    // BUG FIX #1: key BS harus menggunakan teks pernyataan sebagai key (bukan index numerik),
    // agar konsisten dengan format yang dihasilkan UI Guru dan format jawaban siswa (index → nilai).
    const key1 = {
      "Global warming menyebabkan suhu bumi menurun.": "Salah",
      "Es di kutub mencair akibat kenaikan suhu rata-rata.": "Benar",
      "Perubahan iklim tidak berdampak pada cuaca.": "Salah"
    };
    qSheet.appendRow(['Q-003',demoExamID,'BS','Bacalah teks berikut:\n\nPemanasan global adalah peningkatan suhu rata-rata atmosfer, laut, dan daratan Bumi.','',JSON.stringify(statements1),JSON.stringify(key1),'TRUE',10]);
    const pairs1 = [{q:'Jepang',a:'Tokyo'},{q:'Inggris',a:'London'},{q:'Prancis',a:'Paris'}];
    qSheet.appendRow(['Q-004',demoExamID,'JODOH','Pasangkan Negara berikut dengan Ibu Kotanya:','',JSON.stringify(pairs1),'Auto-Check','TRUE',10]);
    qSheet.appendRow(['Q-005',demoExamID,'PG','Hewan yang memakan daging disebut?','',JSON.stringify(['Herbivora','Karnivora','Omnivora','Insektivora','Frugivora']),'Karnivora','TRUE',10]);
    qSheet.appendRow(['Q-009',demoExamID,'Esai','Jelaskan pendapat Anda tentang perkembangan kecerdasan buatan (AI) saat ini.','','[]','','FALSE',10]);
  }
 
  Logger.log('Database Initialized.');
}

function migrateSchema() {
  const examSheet = SS.getSheetByName('Exams');
  if (examSheet) {
    const headers = examSheet.getRange(1,1,1,examSheet.getLastColumn()).getValues()[0];
    if (!headers.includes('PassingGrade')) {
      examSheet.getRange(1, headers.length + 1).setValue('PassingGrade');
      examSheet.getRange(1, headers.length + 1).setFontWeight('bold').setBackground('#e2e8f0');
      Logger.log('Kolom PassingGrade ditambahkan ke sheet Exams.');
    }
  }
 
  if (!SS.getSheetByName('AdminLogs')) {
    const adminLogs = SS.insertSheet('AdminLogs');
    const alHeaders = ['LogID','Timestamp','ActorID','ActorName','Action','TargetType','TargetID','Details'];
    adminLogs.appendRow(alHeaders);
    adminLogs.getRange(1,1,1,alHeaders.length).setFontWeight('bold').setBackground('#fef9c3');
    adminLogs.setFrozenRows(1);
    Logger.log('Sheet AdminLogs dibuat.');
  }

  if (!SS.getSheetByName('Audio')) {
    const audioSheet = SS.insertSheet('Audio');
    const audHeaders = ['AudioID','FileName','DirectLink','Preview','FolderID','DateAdded','UploaderID','Password'];
    audioSheet.appendRow(audHeaders);
    audioSheet.getRange(1,1,1,audHeaders.length).setFontWeight('bold').setBackground('#e2e8f0');
    audioSheet.setFrozenRows(1);
    Logger.log('Sheet Audio dibuat.');
  }

  const questionsSheet = SS.getSheetByName('Questions');
  if (questionsSheet) {
    const qHeaders = questionsSheet.getRange(1,1,1,questionsSheet.getLastColumn()).getValues()[0];
    if (!qHeaders.includes('AudioURL')) {
      questionsSheet.getRange(1, qHeaders.length + 1).setValue('AudioURL');
      questionsSheet.getRange(1, qHeaders.length + 1).setFontWeight('bold').setBackground('#e2e8f0');
      Logger.log('Kolom AudioURL ditambahkan ke sheet Questions.');
    }
  }

  try {
    const extResult = migrateAdminGuruPasswordsToExternal();
    Logger.log(extResult.message);
  } catch(e) {
    Logger.log('Migrasi kredensial eksternal gagal: ' + e.message);
  }

  // Buat sheet Notifications jika belum ada
  try {
    _getOrCreateNotificationsSheet_();
    Logger.log('Sheet Notifications siap.');
  } catch(e) {
    Logger.log('Migrasi Notifications gagal: ' + e.message);
  }

  // Buat sheet Supervisors jika belum ada + migrasi kolom pengganti
  try {
    _getOrCreateSupervisorsSheet_();
    _migrateSupervisorsSubstituteColumns_();
    Logger.log('Sheet Supervisors siap.');
  } catch(e) {
    Logger.log('Migrasi Supervisors gagal: ' + e.message);
  }

  // Buat sheet ExamRooms jika belum ada
  try {
    _getOrCreateExamRoomsSheet_();
    Logger.log('Sheet ExamRooms siap.');
  } catch(e) {
    Logger.log('Migrasi ExamRooms gagal: ' + e.message);
  }

  // Migrasi defaultPoint: pastikan setiap TypeConfig di sheet Exams
  // memiliki field defaultPoint (untuk data lama yang belum punya field ini).
  try {
    migrateDefaultPointsInTypeConfig_();
    Logger.log('Migrasi defaultPoint TypeConfig selesai.');
  } catch(e) {
    Logger.log('Migrasi defaultPoint gagal: ' + e.message);
  }

  Logger.log('Migrasi selesai.');
}

/**
 * Migrasi: iterasi seluruh baris sheet Exams dan tambahkan field defaultPoint
 * ke dalam JSON TypeConfig (kolom 10, index 9) bila belum ada.
 * Hanya menulis ulang baris yang benar-benar berubah — aman untuk data produksi.
 */
function migrateDefaultPointsInTypeConfig_() {
  const fallbackDp = { PG:1, PG_KOMPLEKS:1, BS:1, JODOH:1, Esai:5 };
  const examSheet  = SS.getSheetByName('Exams');
  if (!examSheet) return;

  const data       = examSheet.getDataRange().getValues();
  const TC_COL     = 10; // kolom TypeConfig (1-based)

  for (let i = 1; i < data.length; i++) {
    const rawTc = data[i][TC_COL - 1]; // 0-based
    if (!rawTc) continue;

    let tc = null;
    try { tc = JSON.parse(rawTc); } catch(e) { continue; }
    if (!tc || typeof tc !== 'object') continue;

    let changed = false;
    ['PG','PG_KOMPLEKS','BS','JODOH','Esai'].forEach(t => {
      if (!tc[t] || typeof tc[t] !== 'object') { tc[t] = { enabled:true, max:0 }; changed = true; }
      if (!tc[t].hasOwnProperty('defaultPoint') ||
          tc[t].defaultPoint === null || tc[t].defaultPoint === undefined) {
        tc[t].defaultPoint = fallbackDp[t];
        changed = true;
      }
    });

    if (changed) {
      examSheet.getRange(i + 1, TC_COL).setValue(JSON.stringify(tc));
    }
  }
}

function doGet(e) {
  const configResult = getAppConfig();
  const defaultConfig = {
    app_name: 'Ujian Online V.3',
    app_subtitle: 'Sistem Ujian Online Terintegrasi',
    app_logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg/250px-Logo_of_Ministry_of_Education_and_Culture_of_Republic_of_Indonesia.svg.png',
    app_background: 'https://images.unsplash.com/photo-1562774053-701939374585?q=80&w=1986&auto=format&fit=crop'
  };
  const appConfig = (configResult.success && configResult.data) ? configResult.data : defaultConfig;
  const template = HtmlService.createTemplateFromFile('index');
  appConfig.timezone = Session.getScriptTimeZone();
  template.cfg = appConfig;
  return template.evaluate()
    .setTitle(appConfig.app_name)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

function checkUserAccess(userID, token, targetSubject, targetClass) {
  const sheet = SS.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  let userRow = null;
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===userID && String(data[i][5])===token) { userRow=data[i]; break; }
  }
  if (!userRow) return { allowed:false, message:'Sesi tidak valid.' };
  const role = userRow[3];
  if (role==='Admin') return { allowed:true };
  if (role==='Guru') {
    const assignments = String(userRow[4]).split(',');
    const tSub = String(targetSubject).toLowerCase().trim();
    const tCls = String(targetClass).toLowerCase().trim();
    const isMatch = assignments.some(rule => {
      const parts=rule.split(':');
      if (parts.length<2) return false;
      const rSub=parts[0].toLowerCase().trim();
      const rCls=parts[1].toLowerCase().trim();
      return (tSub.includes(rSub) && tCls.includes(rCls));
    });
    if (isMatch) return { allowed:true };
    return { allowed:false, message:'Anda tidak memiliki akses ke Mata Pelajaran/Kelas ini.' };
  }
  return { allowed:false, message:'Role tidak dikenali.' };
}

function verifyAdminAccess(requestorID, requestorToken) {
  if (!requestorID || !requestorToken) throw new Error("Akses Ditolak: Identitas tidak valid.");
  const sheet = SS.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  let userFound=false, isAdmin=false, tokenMatch=false, isActive=false;
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(requestorID)) {
      userFound=true;
      if (String(data[i][3]).toLowerCase()==='admin') isAdmin=true;
      if (String(data[i][5])===String(requestorToken)) tokenMatch=true;
      if (data[i][6]===true||String(data[i][6])==='true') isActive=true;
      break;
    }
  }
  if (!userFound)  throw new Error("Akses Ditolak: User tidak ditemukan.");
  if (!isAdmin)    throw new Error("Akses Ditolak: Anda bukan Admin.");
  if (!tokenMatch) throw new Error("Akses Ditolak: Sesi kadaluarsa/invalid.");
  if (!isActive)   throw new Error("Akses Ditolak: Akun dinonaktifkan.");
  return true;
}

function verifyRequestor_(requestorID, requestorToken, examID) {
  try {
    if (!requestorID || typeof requestorID !== 'string' ||
        !requestorToken || typeof requestorToken !== 'string' ||
        String(requestorID).trim() === '' || String(requestorToken).trim() === '') {
      return { ok: false, code: 'AUTH', message: 'Identitas tidak valid.' };
    }

    if (!examID || typeof examID !== 'string' || String(examID).trim() === '') {
      return { ok: false, code: 'AUTH', message: 'ID ujian tidak valid.' };
    }

    const reqIDNorm = String(requestorID).trim();
    const reqTokenNorm = String(requestorToken).trim();
    const examIDNorm = String(examID).trim();

    const usersSheet = SS.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let userRow = null;
    for (let i = 1; i < usersData.length; i++) {
      if (String(usersData[i][0]).trim() === reqIDNorm) {
        userRow = usersData[i];
        break;
      }
    }
    if (!userRow) {
      return { ok: false, code: 'AUTH', message: 'Pengguna tidak dikenali.' };
    }

    if (String(userRow[5]).trim() !== reqTokenNorm) {
      return { ok: false, code: 'AUTH', message: 'Sesi tidak valid atau telah berakhir.' };
    }

    const role = String(userRow[3] || '').trim();
    if (role !== 'Admin' && role !== 'Guru') {
      return { ok: false, code: 'AUTH', message: 'Akses ditolak: hanya Admin atau Guru yang diizinkan.' };
    }

    const rawActive = userRow[6];
    const activeStr = String(rawActive).trim().toLowerCase();
    const isActive = (rawActive === true) || (rawActive === 1) ||
                     activeStr === 'true' || activeStr === '1';
    if (!isActive) {
      return { ok: false, code: 'AUTH', message: 'Akun pengguna tidak aktif.' };
    }

    const examsSheet = SS.getSheetByName('Exams');
    const examsData = examsSheet.getDataRange().getValues();
    let examRow = null;
    for (let i = 1; i < examsData.length; i++) {
      if (String(examsData[i][0]).trim() === examIDNorm) {
        examRow = examsData[i];
        break;
      }
    }
    if (!examRow) {
      return { ok: false, code: 'AUTH', message: 'Ujian target tidak ditemukan.' };
    }

    const subject = examRow[1];
    const cls = examRow[2];

    const access = checkUserAccess(reqIDNorm, reqTokenNorm, subject, cls);
    if (!access || access.allowed !== true) {
      return { ok: false, code: 'AUTH', message: 'Akses ditolak: pengguna tidak punya akses ke ujian ini.' };
    }

    return {
      ok: true,
      role: role,
      userID: reqIDNorm,
      subject: subject,
      class: cls
    };
  } catch (e) {
    return { ok: false, code: 'AUTH', message: 'Verifikasi otorisasi gagal: ' + (e && e.message ? e.message : String(e)) };
  }
}

function loadExamTypeConfig_(examID) {
  try {
    if (!examID || String(examID).trim() === '') {
      return { ok: false, code: 'CONFIG_MISSING', message: 'ID ujian tidak valid.' };
    }
    const examIDNorm = String(examID).trim();

    const examsSheet = SS.getSheetByName('Exams');
    if (!examsSheet) {
      return { ok: false, code: 'CONFIG_MISSING', message: 'Sheet "Exams" tidak ditemukan.' };
    }
    const data = examsSheet.getDataRange().getValues();

    let row = null;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === examIDNorm) { row = data[i]; break; }
    }
    if (!row) {
      return { ok: false, code: 'CONFIG_MISSING', message: 'Ujian "' + examIDNorm + '" tidak ditemukan.' };
    }

    const subject = row[1];
    const cls     = row[2];
    const tcRaw   = row[9];

    if (tcRaw === '' || tcRaw === null || typeof tcRaw === 'undefined') {
      return {
        ok: false,
        code: 'CONFIG_MISSING',
        message: 'Konfigurasi tipe untuk ujian "' + (subject || examIDNorm) + '" belum diatur.'
      };
    }

    let parsed;
    try {
      parsed = (typeof tcRaw === 'string') ? JSON.parse(tcRaw) : tcRaw;
    } catch (parseErr) {
      return {
        ok: false,
        code: 'CONFIG_MISSING',
        message: 'Konfigurasi tipe untuk ujian "' + (subject || examIDNorm) + '" tidak dapat di-parse: ' + parseErr.message
      };
    }
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        code: 'CONFIG_MISSING',
        message: 'Konfigurasi tipe untuk ujian "' + (subject || examIDNorm) + '" tidak valid.'
      };
    }

    const TYPES = ['PG', 'PG_KOMPLEKS', 'BS', 'JODOH', 'Esai'];
    const normalized = {};
    for (let t = 0; t < TYPES.length; t++) {
      const key = TYPES[t];
      const src = (parsed[key] && typeof parsed[key] === 'object') ? parsed[key] : {};

      let enabled;
      if (typeof src.enabled === 'boolean') {
        enabled = src.enabled;
      } else if (typeof src.enabled === 'string') {
        enabled = String(src.enabled).trim().toLowerCase() !== 'false';
      } else if (typeof src.enabled === 'undefined' || src.enabled === null) {
        enabled = true;
      } else {
        enabled = !!src.enabled;
      }

      let max = parseInt(src.max, 10);
      if (!isFinite(max) || max < 0) max = 0;

      let optCount = parseInt(src.optCount, 10);
      if (!isFinite(optCount) || optCount < 2 || optCount > 6) optCount = 5;

      normalized[key] = { enabled: enabled, max: max, optCount: optCount };
    }

    return {
      ok: true,
      typeConfig: normalized,
      subject: subject,
      class: cls
    };
  } catch (e) {
    return {
      ok: false,
      code: 'CONFIG_MISSING',
      message: 'Konfigurasi tipe untuk ujian gagal dimuat: ' + (e && e.message ? e.message : String(e))
    };
  }
}

function countExistingQuestionsByType_(examID) {
  const zeroCounts = { PG: 0, PG_KOMPLEKS: 0, BS: 0, JODOH: 0, Esai: 0 };
  try {
    if (!examID || String(examID).trim() === '') {
      return { ok: true, counts: zeroCounts };
    }
    const examIDNorm = String(examID).trim();

    const qSheet = SS.getSheetByName('Questions');
    if (!qSheet) return { ok: true, counts: zeroCounts };

    const data = qSheet.getDataRange().getValues();
    const counts = { PG: 0, PG_KOMPLEKS: 0, BS: 0, JODOH: 0, Esai: 0 };
    for (let i = 1; i < data.length; i++) {
      const rowExamID = String(data[i][1] || '').trim();
      if (rowExamID !== examIDNorm) continue;
      const rowType = String(data[i][2] || '').trim();
      if (counts.hasOwnProperty(rowType)) {
        counts[rowType]++;
      }
    }
    return { ok: true, counts: counts };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    Logger.log('countExistingQuestionsByType_ error: ' + msg);
    return { ok: false, message: msg };
  }
}

function _findCIDuplicates_(arr) {
  const seen = Object.create(null);
  const dups = [];
  if (!Array.isArray(arr)) return dups;
  for (let i = 0; i < arr.length; i++) {
    const key = String(arr[i] == null ? '' : arr[i]).trim().toLowerCase();
    if (key === '') continue;
    if (seen[key] === undefined) {
      seen[key] = i;
    } else {
      dups.push(i);
    }
  }
  return dups;
}

function _letterFromIndex_(i) {
  if (typeof i !== 'number' || !isFinite(i) || i < 0 || i > 5) return '';
  return String.fromCharCode(65 + Math.floor(i));
}

function _isInLetterRange_(letter, optCount) {
  if (typeof letter !== 'string' || letter.length !== 1) return false;
  if (typeof optCount !== 'number' || !isFinite(optCount)) return false;
  const cnt = Math.floor(optCount);
  if (cnt < 2 || cnt > 6) return false;
  const code = letter.charCodeAt(0);
  return code >= 65 && code <= (65 + cnt - 1);
}

function backendValidateBatch_(questionsArr, typeConfig) {
  const result = { allowed: [], skippedInvalid: [] };

  if (!Array.isArray(questionsArr) || questionsArr.length === 0) return result;
  const cfg = (typeConfig && typeof typeConfig === 'object') ? typeConfig : {};

  const KNOWN_TYPES = { PG: 1, PG_KOMPLEKS: 1, BS: 1, JODOH: 1, Esai: 1 };
  const REQUIRED_VALUES = { 'TRUE': 1, 'FALSE': 1 };

  for (let i = 0; i < questionsArr.length; i++) {
    const q = questionsArr[i];
    const blockNumber = (q && typeof q.blockNumber === 'number') ? q.blockNumber : null;
    const rawType = q && q.type != null ? String(q.type) : null;
    const errors = [];
    let normalized = null;

    try {
      if (!rawType || !KNOWN_TYPES.hasOwnProperty(rawType)) {
        errors.push('tipe "' + (rawType == null ? '' : rawType) + '" tidak dikenali.');
        result.skippedInvalid.push({ blockNumber: blockNumber, type: rawType, errors: errors });
        continue;
      }

      const pointVal = (q && typeof q.point === 'number') ? q.point : Number(q && q.point);
      if (!isFinite(pointVal) || pointVal < 0.01 || pointVal > 100) {
        errors.push('bobot harus angka 0.01–100.');
      }

      const isReq = q && q.isRequired != null ? String(q.isRequired).toUpperCase() : '';
      if (!REQUIRED_VALUES.hasOwnProperty(isReq)) {
        errors.push('status wajib harus TRUE atau FALSE.');
      }

      const contentStr = q && q.content != null ? String(q.content).trim() : '';
      if (contentStr.length < 1 || contentStr.length > 2000) {
        errors.push('konten pertanyaan kosong atau melebihi 2000 karakter.');
      }

      const typeCfg = (cfg[rawType] && typeof cfg[rawType] === 'object') ? cfg[rawType] : {};

      if (rawType === 'PG') {
        const optCountRaw = Number(typeCfg.optCount);
        const optCount = (isFinite(optCountRaw) && optCountRaw >= 2 && optCountRaw <= 6)
          ? Math.floor(optCountRaw) : 5;

        if (!Array.isArray(q.options)) {
          errors.push('opsi harus berupa array.');
        } else {
          if (q.options.length < 2 || q.options.length > optCount) {
            errors.push('jumlah opsi harus 2–' + optCount + '.');
          }
          const trimmedOpts = [];
          for (let k = 0; k < q.options.length; k++) {
            const o = String(q.options[k] == null ? '' : q.options[k]).trim();
            trimmedOpts.push(o);
            if (o.length < 1 || o.length > 500) {
              errors.push('opsi ' + _letterFromIndex_(k) + ' kosong atau melebihi 500 karakter.');
            }
          }
          const dupIdx = _findCIDuplicates_(trimmedOpts);
          if (dupIdx.length > 0) {
            errors.push('opsi duplikat (case-insensitive).');
          }
        }

        const keyStr = q.correct == null ? '' : String(q.correct).trim().toUpperCase();
        if (keyStr.length !== 1 || !_isInLetterRange_(keyStr, optCount)) {
          errors.push('kunci jawaban harus 1 huruf dalam A–' + _letterFromIndex_(optCount - 1) + '.');
        }

      } else if (rawType === 'PG_KOMPLEKS') {
        const optCountRaw = Number(typeCfg.optCount);
        const optCount = (isFinite(optCountRaw) && optCountRaw >= 2 && optCountRaw <= 6)
          ? Math.floor(optCountRaw) : 5;

        if (!Array.isArray(q.options)) {
          errors.push('opsi harus berupa array.');
        } else {
          if (q.options.length < 2 || q.options.length > optCount) {
            errors.push('jumlah opsi harus 2–' + optCount + '.');
          }
          const trimmedOpts = [];
          for (let k = 0; k < q.options.length; k++) {
            const o = String(q.options[k] == null ? '' : q.options[k]).trim();
            trimmedOpts.push(o);
            if (o.length < 1 || o.length > 500) {
              errors.push('opsi ' + _letterFromIndex_(k) + ' kosong atau melebihi 500 karakter.');
            }
          }
          const dupIdx = _findCIDuplicates_(trimmedOpts);
          if (dupIdx.length > 0) {
            errors.push('opsi duplikat (case-insensitive).');
          }
        }

        if (!Array.isArray(q.correctList)) {
          errors.push('kunci jawaban PG_KOMPLEKS harus berupa daftar huruf.');
        } else {
          if (q.correctList.length < 2 || q.correctList.length > optCount) {
            errors.push('jumlah kunci jawaban harus 2–' + optCount + '.');
          }
          const upperKeys = [];
          let badLetter = false;
          for (let k = 0; k < q.correctList.length; k++) {
            const lt = String(q.correctList[k] == null ? '' : q.correctList[k]).trim().toUpperCase();
            upperKeys.push(lt);
            if (lt.length !== 1 || !_isInLetterRange_(lt, optCount)) {
              badLetter = true;
            }
          }
          if (badLetter) {
            errors.push('seluruh kunci jawaban harus huruf tunggal A–' + _letterFromIndex_(optCount - 1) + '.');
          }
          const dupKeyIdx = _findCIDuplicates_(upperKeys);
          if (dupKeyIdx.length > 0) {
            errors.push('kunci jawaban duplikat.');
          }
        }

      } else if (rawType === 'BS') {
        if (!Array.isArray(q.options)) {
          errors.push('pernyataan harus berupa array.');
        } else {
          if (q.options.length < 3 || q.options.length > 20) {
            errors.push('jumlah pernyataan harus 3–20.');
          }
          const trimmedStmts = [];
          for (let k = 0; k < q.options.length; k++) {
            const s = String(q.options[k] == null ? '' : q.options[k]).trim();
            trimmedStmts.push(s);
            if (s.length < 1 || s.length > 500) {
              errors.push('pernyataan ke-' + (k + 1) + ' kosong atau melebihi 500 karakter.');
            }
          }
          const dupIdx = _findCIDuplicates_(trimmedStmts);
          if (dupIdx.length > 0) {
            errors.push('pernyataan duplikat (case-insensitive).');
          }

          let keyMap = null;
          if (q.correct && typeof q.correct === 'object') {
            keyMap = q.correct;
          } else if (typeof q.correct === 'string') {
            try {
              const parsed = JSON.parse(q.correct);
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                keyMap = parsed;
              }
            } catch (e1) {
              keyMap = null;
            }
          }

          if (keyMap === null) {
            errors.push('kunci jawaban BS harus berupa objek (pernyataan → Benar/Salah).');
          } else {
            for (let k = 0; k < trimmedStmts.length; k++) {
              const stmt = trimmedStmts[k];
              if (stmt.length === 0) continue;
              const v = keyMap[stmt];
              if (v !== 'Benar' && v !== 'Salah') {
                errors.push('kunci jawaban pernyataan ke-' + (k + 1) + ' harus Benar atau Salah.');
              }
            }
          }
        }

      } else if (rawType === 'JODOH') {
        let pairsArr = null;
        if (Array.isArray(q.options)) {
          pairsArr = q.options;
        } else if (typeof q.options === 'string') {
          try {
            const parsed = JSON.parse(q.options);
            if (Array.isArray(parsed)) pairsArr = parsed;
          } catch (e2) {
            pairsArr = null;
          }
        }

        if (pairsArr === null) {
          errors.push('pasangan harus berupa array {q,a}.');
        } else {
          const pairs = [];
          const distractors = [];
          for (let k = 0; k < pairsArr.length; k++) {
            const it = pairsArr[k];
            if (!it || typeof it !== 'object') {
              errors.push('item ke-' + (k + 1) + ' bukan objek {q,a} valid.');
              continue;
            }
            const left = String(it.q == null ? '' : it.q).trim();
            const right = String(it.a == null ? '' : it.a).trim();
            if (left.length === 0) {
              distractors.push({ idx: k, right: right });
            } else {
              pairs.push({ idx: k, left: left, right: right });
            }
          }

          if (pairs.length < 3 || pairs.length > 50) {
            errors.push('jumlah pasangan harus 3–50.');
          }
          if (distractors.length < 1 || distractors.length > 3) {
            errors.push('jumlah pengacoh harus 1–3.');
          }

          const leftSides = pairs.map(function (p) { return p.left; });
          const dupLeft = _findCIDuplicates_(leftSides);
          if (dupLeft.length > 0) {
            errors.push('sisi kiri pasangan duplikat (case-insensitive).');
          }

          const allRights = pairs.map(function (p) { return p.right; })
            .concat(distractors.map(function (d) { return d.right; }));
          const dupRight = _findCIDuplicates_(allRights);
          if (dupRight.length > 0) {
            errors.push('sisi kanan duplikat (case-insensitive).');
          }
        }

      } else if (rawType === 'Esai') {
        if (q.minCharEnabled === true) {
          const mc = Number(q.minChar);
          if (!isFinite(mc) || Math.floor(mc) !== mc || mc < 1 || mc > 5000) {
            errors.push('MinKarakter harus integer 1–5000.');
          }
        }
        if (q.keywords != null && Array.isArray(q.keywords) && q.keywords.length > 0) {
          if (q.keywords.length > 20) {
            errors.push('jumlah kata kunci maksimum 20.');
          }
          for (let k = 0; k < q.keywords.length; k++) {
            const kw = String(q.keywords[k] == null ? '' : q.keywords[k]).trim();
            if (kw.length === 0) {
              errors.push('kata kunci ke-' + (k + 1) + ' kosong.');
            } else if (kw.length > 100) {
              errors.push('kata kunci ke-' + (k + 1) + ' melebihi 100 karakter.');
            }
          }
        }
      }

      if (errors.length === 0) {
        normalized = q;
      }
    } catch (errAny) {
      errors.push('kesalahan tak terduga saat validasi: ' +
        (errAny && errAny.message ? errAny.message : String(errAny)));
    }

    if (errors.length > 0) {
      result.skippedInvalid.push({ blockNumber: blockNumber, type: rawType, errors: errors });
    } else {
      result.allowed.push(normalized);
    }
  }

  return result;
}

function enforceTypeConfig_(allowedQuestions, typeConfig, existingCounts) {
  try {
    const TYPE_LABELS = {
      PG: 'PG',
      PG_KOMPLEKS: 'PG Kompleks',
      BS: 'Benar/Salah',
      JODOH: 'Menjodohkan',
      Esai: 'Esai'
    };

    const list = Array.isArray(allowedQuestions) ? allowedQuestions : [];
    const cfg = (typeConfig && typeof typeConfig === 'object') ? typeConfig : {};
    const existing = (existingCounts && typeof existingCounts === 'object') ? existingCounts : {};

    const accepted = [];
    const skippedByOptCount = [];

    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const rawType = q && q.type != null ? String(q.type).trim() : '';

      if (rawType === 'PG' || rawType === 'PG_KOMPLEKS') {
        const typeCfg = (cfg[rawType] && typeof cfg[rawType] === 'object') ? cfg[rawType] : {};
        const optCountRaw = Number(typeCfg.optCount);
        const optCount = (isFinite(optCountRaw) && optCountRaw >= 2 && optCountRaw <= 6)
          ? Math.floor(optCountRaw) : 5;

        if (Array.isArray(q.options)) {
          const n = q.options.length;
          if (n < 2 || n > optCount) {
            const blockNumber = (typeof q.blockNumber === 'number') ? q.blockNumber : null;
            skippedByOptCount.push({
              blockNumber: blockNumber,
              type: rawType,
              errors: ['jumlah opsi ' + n + ' di luar rentang 2..' + optCount + '.']
            });
            continue;
          }
        }
      }

      accepted.push(q);
    }

    const disabledPerType = Object.create(null);
    let hasDisabled = false;

    for (let i = 0; i < accepted.length; i++) {
      const t = String(accepted[i].type).trim();
      const typeCfg = (cfg[t] && typeof cfg[t] === 'object') ? cfg[t] : {};
      if (typeCfg.enabled === false) {
        if (!disabledPerType[t]) {
          disabledPerType[t] = { rejected: 0, label: TYPE_LABELS[t] || t };
        }
        disabledPerType[t].rejected += 1;
        hasDisabled = true;
      }
    }

    if (hasDisabled) {
      return {
        ok: false,
        code: 'TYPE_DISABLED',
        details: { perType: disabledPerType }
      };
    }

    const inBatchByType = Object.create(null);
    for (let i = 0; i < accepted.length; i++) {
      const t = String(accepted[i].type).trim();
      inBatchByType[t] = (inBatchByType[t] || 0) + 1;
    }

    const quotaPerType = Object.create(null);
    let hasQuotaViolation = false;

    const types = Object.keys(inBatchByType);
    for (let i = 0; i < types.length; i++) {
      const t = types[i];
      const typeCfg = (cfg[t] && typeof cfg[t] === 'object') ? cfg[t] : {};
      const maxRaw = Number(typeCfg.max);
      const max = (isFinite(maxRaw) && maxRaw > 0) ? Math.floor(maxRaw) : 0;
      if (max <= 0) continue;

      const existingRaw = Number(existing[t]);
      const existingCount = (isFinite(existingRaw) && existingRaw >= 0)
        ? Math.floor(existingRaw) : 0;
      const inBatchCount = inBatchByType[t];

      if (existingCount + inBatchCount > max) {
        const remaining = max - existingCount;
        quotaPerType[t] = {
          rejected: inBatchCount,
          max: max,
          existing: existingCount,
          allowed: remaining > 0 ? remaining : 0
        };
        hasQuotaViolation = true;
      }
    }

    if (hasQuotaViolation) {
      return {
        ok: false,
        code: 'QUOTA',
        details: { perType: quotaPerType }
      };
    }

    return {
      ok: true,
      accepted: accepted,
      skippedByOptCount: skippedByOptCount
    };
  } catch (e) {
    return {
      ok: false,
      code: 'SYSTEM',
      message: e && e.message ? e.message : String(e)
    };
  }
}

function persistBatchQuestionsAtomic_(examID, questions) {
  try {
    if (typeof examID !== 'string' || !examID.trim()) {
      return { ok: false, code: 'SYSTEM', message: 'examID wajib berupa string non-kosong.' };
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return { ok: false, code: 'SYSTEM', message: 'Tidak ada soal valid untuk disimpan.' };
    }

    const sheet = SS.getSheetByName('Questions');
    if (!sheet) {
      return { ok: false, code: 'SYSTEM', message: 'Sheet "Questions" tidak ditemukan.' };
    }

    const REQUIRED_HEADERS = [
      'QuestionID', 'ExamID', 'Type', 'Content', 'ImageURL', 'Options',
      'CorrectAnswer', 'IsRequired', 'Point', 'Rubric', 'MinChar', 'MinCharEnabled'
    ];
    const TARGET_WIDTH = REQUIRED_HEADERS.length;

    const lastCol = sheet.getLastColumn();
    if (lastCol < TARGET_WIDTH) {
      const missing = REQUIRED_HEADERS.slice(lastCol);
      sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    }

    const stamp = Date.now();
    const rows = new Array(questions.length);
    const ids = new Array(questions.length);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i] || {};
      const type = String(q.type || '').trim();

      const rand = Math.floor(Math.random() * 1000);
      const qid = 'Q-' + stamp + '-' + i + '-' + rand;
      ids[i] = qid;

      const content = String(q.content || '').trim();
      const imageUrl = String(q.imageUrl != null ? q.imageUrl : (q.image != null ? q.image : ''));
      const isRequired = (String(q.isRequired || '').toUpperCase() === 'FALSE') ? 'FALSE' : 'TRUE';
      const pointNum = Number(q.point);
      const point = isFinite(pointNum) && pointNum > 0 ? pointNum : 10;

      let optionsJson = '[]';
      let correctAnswer = '';

      if (type === 'PG') {
        optionsJson = JSON.stringify(Array.isArray(q.options) ? q.options : []);
        correctAnswer = String(q.correct || '');
      } else if (type === 'PG_KOMPLEKS') {
        optionsJson = JSON.stringify(Array.isArray(q.options) ? q.options : []);
        correctAnswer = JSON.stringify(Array.isArray(q.correctList) ? q.correctList : []);
      } else if (type === 'BS') {
        optionsJson = JSON.stringify(Array.isArray(q.options) ? q.options : []);
        if (typeof q.correct === 'string') {
          correctAnswer = q.correct;
        } else {
          correctAnswer = JSON.stringify(q.correct && typeof q.correct === 'object' ? q.correct : {});
        }
      } else if (type === 'JODOH') {
        if (typeof q.options === 'string') {
          try {
            const parsedOpts = JSON.parse(q.options);
            optionsJson = JSON.stringify(Array.isArray(parsedOpts) ? parsedOpts : []);
          } catch (e) {
            optionsJson = '[]';
          }
        } else {
          optionsJson = JSON.stringify(Array.isArray(q.options) ? q.options : []);
        }
        if (typeof q.correct === 'string' && q.correct.trim() !== '') {
          correctAnswer = q.correct;
        } else if (Array.isArray(q.correct)) {
          correctAnswer = JSON.stringify(q.correct);
        } else {
          correctAnswer = 'Auto-Check';
        }
      } else if (type === 'Esai') {
        optionsJson = '[]';
        // Simpan kunci jawaban Esai (kata kunci) ke kolom CorrectAnswer.
        // Frontend mengirim daftar kata kunci pada q.keywords; bila tidak ada,
        // gunakan q.correct sebagai cadangan.
        if (Array.isArray(q.keywords) && q.keywords.length > 0) {
          correctAnswer = q.keywords
            .map(function (kw) { return String(kw == null ? '' : kw).trim(); })
            .filter(function (kw) { return kw !== ''; })
            .join(', ');
        } else if (typeof q.correct === 'string') {
          correctAnswer = q.correct.trim();
        } else {
          correctAnswer = '';
        }
      } else {
        optionsJson = JSON.stringify(Array.isArray(q.options) ? q.options : []);
        correctAnswer = String(q.correct || '');
      }

      const rubric = String(q.rubric || '');
      const minCharNum = Number(q.minChar);
      const minChar = isFinite(minCharNum) && minCharNum > 0 ? minCharNum : 0;
      const minCharEnabled = (q.minCharEnabled === true) ? 'TRUE' : 'FALSE';

      rows[i] = [
        qid,
        examID,
        type,
        content,
        imageUrl,
        optionsJson,
        correctAnswer,
        isRequired,
        point,
        rubric,
        minChar,
        minCharEnabled
      ];
    }

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, TARGET_WIDTH).setValues(rows);
    SpreadsheetApp.flush();

    return {
      ok: true,
      count: rows.length,
      questionIDs: ids
    };
  } catch (e) {
    return {
      ok: false,
      code: 'SYSTEM',
      message: e && e.message ? e.message : String(e)
    };
  }
}


function saveBatchQuestions(examID, questionsArr, requestorID, requestorToken) {
  try {
    if (!examID || !requestorID || !requestorToken ||
        typeof examID !== 'string' ||
        typeof requestorID !== 'string' ||
        typeof requestorToken !== 'string' ||
        String(examID).trim() === '' ||
        String(requestorID).trim() === '' ||
        String(requestorToken).trim() === '') {
      return { success: false, code: 'AUTH', message: 'Sesi tidak valid.' };
    }
    if (!Array.isArray(questionsArr)) {
      return { success: false, code: 'SYSTEM', message: 'Payload soal tidak valid.' };
    }
    if (questionsArr.length === 0) {
      return { success: false, code: 'SYSTEM', message: 'Tidak ada soal yang dikirim.' };
    }
    if (questionsArr.length > 500) {
      return {
        success: false,
        code: 'SYSTEM',
        message: 'Jumlah soal melebihi batas (' + questionsArr.length + ' > 500).'
      };
    }

    const auth = verifyRequestor_(requestorID, requestorToken, examID);
    if (!auth || auth.ok !== true) {
      return {
        success: false,
        code: 'AUTH',
        message: (auth && auth.message) ? auth.message : 'Otorisasi gagal.'
      };
    }

    // --- GUARD JADWAL INPUT SOAL ---
    var role = resolveRequestorRole_(requestorID, requestorToken);
    if (role) {
      var periodCheck = enforceInputPeriod_(role, examID);
      if (!periodCheck.ok) return { success: false, code: 'PERIOD', message: periodCheck.message };
    }
    // -------------------------------

    let lock = null;
    try {
      lock = LockService.getScriptLock();
    } catch (lockErr) {
      lock = null;
    }
    if (lock) {
      try {
        if (!lock.tryLock(20000)) {
          return {
            success: false,
            code: 'SYSTEM',
            message: 'Sistem sedang sibuk memproses batch lain. Coba lagi sebentar.'
          };
        }
      } catch (lockTryErr) {
        return {
          success: false,
          code: 'SYSTEM',
          message: 'Gagal mengamankan kunci sistem. Coba lagi sebentar.'
        };
      }
    }

    try {
      return _saveBatchQuestionsLocked_(
        examID, questionsArr, requestorID, auth, _loadExamTypeConfigWithSubjectFallback_(examID, auth)
      );
    } finally {
      if (lock) { try { lock.releaseLock(); } catch (e) {} }
    }
  } catch (e) {
    return {
      success: false,
      code: 'SYSTEM',
      message: String(e && e.message || e)
    };
  }
}

function _loadExamTypeConfigWithSubjectFallback_(examID, auth) {
  const cfgRes = loadExamTypeConfig_(examID);
  if (cfgRes && cfgRes.ok === true && !cfgRes.subject && auth && auth.subject) {
    cfgRes.subject = auth.subject;
  }
  return cfgRes;
}

function _saveBatchQuestionsLocked_(examID, questionsArr, requestorID, auth, cfgRes) {
  try {
    if (!cfgRes || cfgRes.ok !== true) {
      return {
        success: false,
        code: 'CONFIG_MISSING',
        message: (cfgRes && cfgRes.message)
          ? cfgRes.message
          : 'Konfigurasi tipe untuk ujian tidak dapat dimuat.'
      };
    }
    const typeConfig = cfgRes.typeConfig;
    const subject = cfgRes.subject || (auth && auth.subject) || '';

    const countRes = countExistingQuestionsByType_(examID);
    if (!countRes || countRes.ok !== true) {
      return {
        success: false,
        code: 'SYSTEM',
        message: (countRes && countRes.message)
          ? ('Gagal membaca soal eksisting: ' + countRes.message)
          : 'Gagal membaca soal eksisting.'
      };
    }
    const existingCounts = countRes.counts;

    const validation = backendValidateBatch_(questionsArr, typeConfig);
    const allowed = (validation && Array.isArray(validation.allowed))
      ? validation.allowed : [];
    const skippedInvalid = (validation && Array.isArray(validation.skippedInvalid))
      ? validation.skippedInvalid : [];

    if (allowed.length === 0) {
      return {
        success: false,
        code: 'SYSTEM',
        message: 'Tidak ada soal yang lolos validasi backend.',
        details: { skippedInvalid: skippedInvalid }
      };
    }

    const enforced = enforceTypeConfig_(allowed, typeConfig, existingCounts);
    if (!enforced || enforced.ok !== true) {
      const code = (enforced && enforced.code) ? enforced.code : 'SYSTEM';
      const messages = {
        TYPE_DISABLED: 'Beberapa tipe soal dinonaktifkan untuk ujian ini.',
        QUOTA: 'Kuota soal terlampaui untuk ujian ini.',
        SYSTEM: 'Validasi konfigurasi tipe gagal.'
      };
      return {
        success: false,
        code: code,
        message: (enforced && enforced.message) ? enforced.message : (messages[code] || messages.SYSTEM),
        details: (enforced && enforced.details) ? enforced.details : undefined
      };
    }

    const accepted = Array.isArray(enforced.accepted) ? enforced.accepted : [];
    const skippedByOptCount = Array.isArray(enforced.skippedByOptCount)
      ? enforced.skippedByOptCount : [];

    if (accepted.length === 0) {
      return {
        success: false,
        code: 'SYSTEM',
        message: 'Tidak ada soal yang lolos enforcement TypeConfig.',
        details: {
          skippedInvalid: skippedInvalid,
          skippedByOptCount: skippedByOptCount
        }
      };
    }

    const persisted = persistBatchQuestionsAtomic_(examID, accepted);
    if (!persisted || persisted.ok !== true) {
      return {
        success: false,
        code: 'SYSTEM',
        message: (persisted && persisted.message)
          ? persisted.message
          : 'Gagal menulis soal ke spreadsheet.'
      };
    }

    const totalSkipped = skippedInvalid.length + skippedByOptCount.length;
    const perTypeBreakdown = Object.create(null);
    for (let i = 0; i < accepted.length; i++) {
      const t = String(accepted[i].type || '').trim();
      if (!t) continue;
      perTypeBreakdown[t] = (perTypeBreakdown[t] || 0) + 1;
    }
    try {
      const actorName = getActorName(requestorID);
      let perTypeStr = '';
      const tkeys = Object.keys(perTypeBreakdown);
      for (let k = 0; k < tkeys.length; k++) {
        perTypeStr += (k === 0 ? '' : ', ') + tkeys[k] + ':' + perTypeBreakdown[tkeys[k]];
      }
      addAdminLog(
        requestorID,
        actorName,
        'CREATE_QUESTION_BATCH',
        'Question',
        examID,
        persisted.count + ' soal ditambahkan via Batch ke ujian "' +
          (subject || examID) + '" (' + perTypeStr + ')' +
          (totalSkipped > 0 ? ', ' + totalSkipped + ' dilewati.' : '.')
      );
    } catch (logErr) {
      Logger.log('saveBatchQuestions addAdminLog error: ' +
        (logErr && logErr.message ? logErr.message : String(logErr)));
    }

    return {
      success: true,
      count: persisted.count,
      subject: subject,
      skipped: totalSkipped
    };
  } catch (e) {
    return {
      success: false,
      code: 'SYSTEM',
      message: String(e && e.message || e)
    };
  }
}


function loginUser(userIdInput, password, pinSesi, isAdminLogin) {
  const sheet = SS.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const inputID   = String(userIdInput || '').toLowerCase().trim();
  const inputPass = String(password   || '').trim();

  if (!inputID) return { success: false, message: 'Username tidak boleh kosong.' };

  // isAdminLogin dapat bernilai:
  //   true / 'true' / 'admin' → tab Admin / Guru
  //   'pengawas'              → tab Pengawas Ujian
  //   false / 'false'         → tab Siswa
  const isPengawasLogin = (isAdminLogin === 'pengawas' || String(isAdminLogin) === 'pengawas');
  // FIX BUG 8: tambahkan 'admin' sebagai nilai yang dikenali isStaffLogin
  const isStaffLogin    = (!isPengawasLogin && (isAdminLogin === true || isAdminLogin === 'true' || isAdminLogin === 'admin'));

  const extCredMap = _getAllExternalCredentials_();

  for (let i=1;i<data.length;i++) {
    const dbID    = String(data[i][0]).toLowerCase().trim();
    const role    = String(data[i][3] || '').trim();
    const isActive= String(data[i][6]).toUpperCase()==='TRUE';

    let dbPass;
    if (role === 'Admin' || role === 'Guru' || role === 'Pengawas') {
      const ext = extCredMap[dbID];
      if (!ext) continue;
      dbPass = String(ext.password || '').trim();
    } else {
      dbPass = String(data[i][2]).trim();
    }

    if (dbID===inputID && dbPass===inputPass) {
      if (!isActive) return { success:false, message:'Akun Anda dinonaktifkan. Hubungi Admin.' };

      const userClass  = data[i][4];
      const realUserID = data[i][0];
      const realName   = data[i][1];

      // ── Validasi silang tab ↔ role ──────────────────────────────────
      if (isPengawasLogin) {
        // Tab Pengawas: hanya Guru dan Pengawas yang boleh
        if (role !== 'Guru' && role !== 'Pengawas') {
          return { success:false, message:'Tab Pengawas hanya untuk Guru atau akun Pengawas.' };
        }
        // Guru perlu dicek apakah sudah ditugaskan sebagai pengawas di manapun
        if (role === 'Guru') {
          const svSheet = _getOrCreateSupervisorsSheet_();
          const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
          // Cek sebagai pengawas asli (kolom E, tanpa pengganti) ATAU pengawas pengganti aktif (kolom H)
          const hasAssignment = svData.some((row, idx) => {
            if (idx === 0) return false;
            const originalID   = String(row[4] || '').trim().toLowerCase();
            const substituteID = String(row[7] || '').trim().toLowerCase();
            if (originalID === dbID && substituteID === '') return true;
            if (substituteID === dbID) return true;
            return false;
          });
          if (!hasAssignment) {
            return { success:false, message:'Anda belum ditugaskan sebagai Pengawas Ujian. Hubungi Administrator.' };
          }
        }
      } else if (isStaffLogin) {
        // Tab Admin/Guru: hanya Admin dan Guru yang boleh
        if (role !== 'Admin' && role !== 'Guru') {
          return { success:false, message:'Akses ditolak. Harap pilih tab yang sesuai dengan peran Anda.' };
        }
      } else {
        // Tab Siswa: hanya Siswa yang boleh
        if (role !== 'Siswa') {
          return { success:false, message:'Akses ditolak. Gunakan tab yang sesuai (Admin / Guru atau Pengawas).' };
        }
      }

      let examData = null;

      if (role==='Siswa') {
        if (!pinSesi) return { success:false, message:'Siswa wajib mengisi PIN Sesi Ujian.' };
        const check = validateExamPIN(pinSesi, userClass);
        if (!check.valid) return { success:false, message:check.message };
        examData = check.data;

        const rSheet = SS.getSheetByName('Responses');
        const rData  = rSheet.getDataRange().getValues();
        let existingResponse=null, responseRow=null;
        for (let j=1;j<rData.length;j++) {
          if (String(rData[j][1])===String(realUserID) && String(rData[j][2])===String(examData.id)) {
            existingResponse=rData[j]; responseRow=j+1; break;
          }
        }

        if (existingResponse) {
          const startTime   = new Date(existingResponse[5]);
          const status      = String(existingResponse[7]).toLowerCase();
          const durationSec = examData.duration*60;

          let answers = {};
          try { answers = JSON.parse(existingResponse[3] || '{}'); } catch(e) { answers = {}; }
          const pausedRaw = answers['__pausedElapsedSec__'];
          const hasPauseSnapshot = pausedRaw !== undefined && pausedRaw !== null && !isNaN(Number(pausedRaw));

          if (status==='curang') {
            return { success:false, message:'Akun Anda diblokir karena terdeteksi melakukan kecurangan. Hubungi Admin/Guru.' };
          }

          if (status==='in progress' && hasPauseSnapshot) {
            const pausedElapsed = Math.max(0, Number(pausedRaw));
            if (pausedElapsed >= durationSec) {
              delete answers['__pausedElapsedSec__'];
              submitExam(realUserID, examData.id, answers, 'Waktu Habis');
              return { success:false, message:'Waktu ujian telah habis. Silakan lihat hasil.' };
            }
          } else if (status==='in progress' && ((Date.now()-startTime.getTime())/1000) >= durationSec) {
            submitExam(realUserID, examData.id, answers, 'Waktu Habis');
            return { success:false, message:'Waktu ujian telah habis. Silakan lihat hasil.' };
          } else if (_isFinishedStatus(status)) {
            const token = Utilities.getUuid();
            sheet.getRange(i+1,6).setValue(token);
            const cfgSheet = SS.getSheetByName('Konfigurasi');
            let showExamResult=true;
            if (cfgSheet) {
              const cfgData = cfgSheet.getDataRange().getValues();
              for (let c=1;c<cfgData.length;c++) {
                if (String(cfgData[c][0])==='show_exam_result') { showExamResult=String(cfgData[c][1]).toLowerCase()!=='false'; break; }
              }
            }
            return { success:true, token, role, userID:realUserID, username:realName, examData, viewResultsOnly:true, responseId:existingResponse[0], showExamResult };
          }
        }
      }

      const token = Utilities.getUuid();
      sheet.getRange(i+1,6).setValue(token);

      // Guru yang login lewat tab Pengawas: kembalikan role 'Pengawas'
      // agar frontend mengarahkan ke initSupervisorPanel()
      const effectiveRole = (isPengawasLogin && role === 'Guru') ? 'Pengawas' : role;

      let emailVerified = true;
      let emailVerificationDeterminable = true;

      // BUG FIX: catat login berhasil ke AdminLogs agar audit trail lengkap.
      // Hanya dicatat untuk Admin, Guru, dan Pengawas (bukan Siswa) karena
      // AdminLogs adalah log aktivitas pengelola sistem.
      if (role === 'Admin' || role === 'Guru' || role === 'Pengawas') {
        try {
          addAdminLog(realUserID, realName, 'LOGIN', 'User', String(realUserID),
            'Login berhasil sebagai ' + effectiveRole + '.');
        } catch(e) { Logger.log('loginUser: gagal catat AdminLog — ' + e.message); }
      }

      return {
        success: true,
        token: token,
        role: effectiveRole,
        originalRole: role,          // simpan role asli (Guru/Pengawas) untuk keperluan lain
        userID: realUserID,
        username: realName,
        examData: examData,
        emailVerified: emailVerified,
        emailVerificationDeterminable: emailVerificationDeterminable
      };
    }
  }
  return { success:false, message:'User ID atau Password salah.' };
}

function checkSession(userID, token) {
  const sheet = SS.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  // BUG FIX: normalisasi ID ke lowercase agar konsisten dengan loginUser
  // yang juga melakukan .toLowerCase().trim() sebelum perbandingan.
  const inputIDNorm = String(userID || '').toLowerCase().trim();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]).toLowerCase().trim()===inputIDNorm && String(data[i][5])===token) {
      const isActive = String(data[i][6]).toUpperCase()==='TRUE';
      if (!isActive) return { success:false, message:'Akun dinonaktifkan.' };

      const roleInSheet = String(data[i][3] || '').trim();

      // FIX BUG 2 & 6: Jika role di sheet adalah 'Guru', cek apakah ia punya
      // assignment sebagai Pengawas. Jika ya, kembalikan effectiveRole='Pengawas'
      // agar checkSavedSession di frontend bisa mengarahkan ke initSupervisorPanel.
      // Ini menyelaraskan auto-login dengan perilaku login manual.
      let effectiveRole = roleInSheet;
      if (roleInSheet === 'Guru') {
        try {
          const svSheet = _getOrCreateSupervisorsSheet_();
          if (svSheet.getLastRow() > 1) {
            const svData = svSheet.getDataRange().getValues();
            const lowerID = String(userID).trim().toLowerCase();
            // Cek sebagai pengawas asli (tanpa pengganti) ATAU pengawas pengganti aktif
            const hasSvAssignment = svData.some((row, idx) => {
              if (idx === 0) return false;
              const originalID   = String(row[4] || '').trim().toLowerCase();
              const substituteID = String(row[7] || '').trim().toLowerCase();
              if (originalID === lowerID && substituteID === '') return true;
              if (substituteID === lowerID) return true;
              return false;
            });
            // Hanya ganti ke Pengawas jika sesi sebelumnya memang disimpan sebagai Pengawas.
            // Kita tidak bisa tahu dari sini — kembalikan KEDUA info agar frontend memutuskan.
            if (hasSvAssignment) {
              effectiveRole = 'Guru'; // tetap Guru secara default
              return {
                success: true, token, role: roleInSheet,
                isSupervisorEligible: true,   // flag: Guru ini punya assignment pengawas
                userID, username: data[i][1], examData: null
              };
            }
          }
        } catch(e) { /* abaikan, fallthrough ke return normal */ }
      }

      return { success:true, token, role: effectiveRole, userID, username:data[i][1], examData:null };
    }
  }
  return { success:false, message:'Sesi kadaluarsa atau token tidak valid.' };
}

function validateExamPIN(pin, userClass) {
  const sheet = SS.getSheetByName('Exams');
  const data  = sheet.getDataRange().getValues();
  const now   = new Date();
 
  for (let i=1;i<data.length;i++) {
    const [id, subject, cls, startDate, rawDuration, examPin, status, endDate] = data[i];
    const passingGrade = data[i][10] ? parseFloat(data[i][10]) : 0;
 
    const startObj        = new Date(startDate);
    const endObj          = endDate ? new Date(endDate) : null;
    const duration        = parseInt(rawDuration);
    const allowedClasses  = String(cls).split(',').map(c=>c.trim().toLowerCase());
 
    if (String(examPin).trim()===String(pin).trim() && allowedClasses.includes(String(userClass).trim().toLowerCase())) {
      const examStatus = String(status).toLowerCase();
      const examId = String(id).trim();
      if (!examId) continue;
 
      if (examStatus==='completed'||examStatus==='selesai') {
        return { valid:true, data:{ id: examId, subject, duration: isNaN(duration)?60:duration, passingGrade }, viewResultsOnly:true };
      }
      if (examStatus!=='aktif') continue;
      if (now<startObj) return { valid:false, message:'Ujian belum dimulai. Harap tunggu.' };
      if (endObj && now>endObj) {
        sheet.getRange(i+1,7).setValue('Non-Aktif');
        return { valid:false, message:'Waktu ujian telah berakhir.' };
      }
      if (isNaN(duration)||duration<=0) return { valid:false, message:'Konfigurasi durasi ujian salah.' };
 
      return { valid:true, data:{ id: examId, subject, duration, passingGrade } };
    }
  }
  return { valid:false, message:'PIN salah, Kelas tidak sesuai, atau Ujian tidak aktif.' };
}

function logoutUser(userID) {
  const sheet = SS.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(userID)) {
      sheet.getRange(i+1,6).setValue('');
      // BUG FIX: catat aktivitas logout ke AdminLogs agar audit trail lengkap.
      try {
        const actorName = String(data[i][1] || userID);
        addAdminLog(userID, actorName, 'LOGOUT', 'User', String(userID), 'Pengguna berhasil logout.');
      } catch(e) { Logger.log('logoutUser: gagal catat AdminLog — ' + e.message); }
      break;
    }
  }
}

function isValidSession(userID, token) {
  const sheet = SS.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(userID)) {
      // BUG FIX: cek isActive agar user yang dinonaktifkan tidak bisa lanjut
      // mengerjakan soal hanya karena token masih tersimpan di sheet.
      const isActive = String(data[i][6]).toUpperCase() === 'TRUE';
      if (!isActive) return false;
      return String(data[i][5])===String(token);
    }
  }
  return false;
}

function getExamQuestions(examID, userID, token) {
  if (!isValidSession(userID, token)) return { error:'Sesi habis. Login di perangkat lain terdeteksi.' };
 
  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examDuration=60, examSubject='', examClass='';
  for (let i=1;i<examRows.length;i++) {
    if (String(examRows[i][0])===String(examID)) {
      examDuration = parseInt(examRows[i][4])||60;
      examSubject  = examRows[i][1];
      examClass    = examRows[i][2];
      break;
    }
  }
 
  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  let savedAnswers={}, startTime=null, existingResponse=false, responseRowIdx=-1;
 
  for (let i=1;i<rData.length;i++) {
    if (String(rData[i][1])===String(userID) && String(rData[i][2])===String(examID)) {
      existingResponse=true;
      startTime=new Date(rData[i][5]);
      responseRowIdx=i+1;
      try { savedAnswers=JSON.parse(rData[i][3]||'{}'); } catch(e) { savedAnswers={}; }
      break;
    }
  }
 
  const durationSec = examDuration*60;
  let remainingSeconds = durationSec;
 
  if (existingResponse && startTime) {
    const pausedRaw = savedAnswers && savedAnswers['__pausedElapsedSec__'];
    if (pausedRaw !== undefined && pausedRaw !== null && !isNaN(Number(pausedRaw))) {
      const pausedElapsed = Math.max(0, Number(pausedRaw));
      if (pausedElapsed >= durationSec) {
        delete savedAnswers['__pausedElapsedSec__'];
        submitExam(userID, examID, savedAnswers, 'Waktu Habis');
        return { error:'Waktu ujian telah habis. Silakan lihat hasil ujian.' };
      }
      const adjustedStart = new Date(Date.now() - pausedElapsed * 1000);
      delete savedAnswers['__pausedElapsedSec__'];
      if (responseRowIdx > 0) {
        rSheet.getRange(responseRowIdx, 4).setValue(JSON.stringify(savedAnswers));
        rSheet.getRange(responseRowIdx, 6).setValue(adjustedStart);
        rSheet.getRange(responseRowIdx, 7).setValue('');
        rSheet.getRange(responseRowIdx, 8).setValue('In Progress');
        SpreadsheetApp.flush();
      }
      startTime = adjustedStart;
      remainingSeconds = durationSec - pausedElapsed;
    } else {
      const elapsed = (Date.now()-startTime.getTime())/1000;
      remainingSeconds = Math.max(0, durationSec-elapsed);
      if (remainingSeconds<=0) {
        submitExam(userID, examID, savedAnswers, 'Waktu Habis');
        return { error:'Waktu ujian telah habis. Silakan lihat hasil ujian.' };
      }
    }
  } else {
    const newID = 'RSP-'+Date.now();
    rSheet.appendRow([newID,userID,examID,'{}',0,new Date(),'','In Progress']);
    startTime=new Date();
    remainingSeconds=durationSec;
  }
 
  const qSheet = SS.getSheetByName('Questions');
  const qData  = qSheet.getDataRange().getValues();
 
  const shuffleArray = arr => {
    for (let i=arr.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    return arr;
  };
 
  const listPG=[],listPG_Kompleks=[],listBS=[],listJodoh=[],listEsai=[];
 
  for (let i=1;i<qData.length;i++) {
    const row=qData[i];
    if (String(row[1])===String(examID)) {
      let options=[];
      try { options=JSON.parse(row[5]); } catch(e) { options=[]; }
      const qObj={ id:row[0], type:row[2], content:row[3], image:row[4], options, isRequired:row[7], audio:row[12] || '' };
      const type=String(row[2]).trim();
      if (type==='PG'||type==='PG_KOMPLEKS') qObj.options=shuffleArray(qObj.options);
      if (type==='Esai') {
        const rawMinChar = row[10];
        const rawEnabled = row[11];
        qObj.minChar        = rawMinChar ? (parseInt(rawMinChar) || 0) : 0;
        qObj.minCharEnabled = (String(rawEnabled).toLowerCase() === 'true');
      }
      if (type==='PG') listPG.push(qObj);
      else if (type==='PG_KOMPLEKS') listPG_Kompleks.push(qObj);
      else if (type==='BS') listBS.push(qObj);
      else if (type==='JODOH') listJodoh.push(qObj);
      else if (type==='Esai') listEsai.push(qObj);
    }
  }
 
  let shuffleCfg={PG:false,PG_KOMPLEKS:false,BS:false,JODOH:false,Esai:false};
  for (let i=1;i<examRows.length;i++) {
    if (String(examRows[i][0])===String(examID)) {
      const raw=examRows[i][8];
      if (raw) { try { shuffleCfg=JSON.parse(raw); } catch(e) {} }
      break;
    }
  }
 
  if (shuffleCfg.PG)          shuffleArray(listPG);
  if (shuffleCfg.PG_KOMPLEKS) shuffleArray(listPG_Kompleks);
  if (shuffleCfg.BS)          shuffleArray(listBS);
  if (shuffleCfg.JODOH)       shuffleArray(listJodoh);
  if (shuffleCfg.Esai)        shuffleArray(listEsai);
 
  const finalQuestions=[...listPG,...listPG_Kompleks,...listBS,...listJodoh,...listEsai];

  var essayCanvasEnabled = true;
  var cfgSheetQ = SS.getSheetByName('Konfigurasi');
  if (cfgSheetQ) {
    var cfgDataQ = cfgSheetQ.getDataRange().getValues();
    for (var ci = 1; ci < cfgDataQ.length; ci++) {
      if (String(cfgDataQ[ci][0]) === 'essay_canvas_enabled') {
        essayCanvasEnabled = String(cfgDataQ[ci][1]).toLowerCase() !== 'false';
        break;
      }
    }
  }

  return { questions:finalQuestions, savedAnswers, remainingTime:Math.floor(remainingSeconds), essayCanvasEnabled };
}

function syncAnswers(userID, examID, answers, violationCount) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) { return { status:'error', message:'Server sedang sibuk.' }; }
  try {
    const sheet   = SS.getSheetByName('Responses');
    const lastRow = sheet.getLastRow();
    let rowIdx=-1;
    if (lastRow>1) {
      const dataIds=sheet.getRange(2,2,lastRow-1,2).getValues();
      for (let i=0;i<dataIds.length;i++) {
        if (dataIds[i][0]==userID && dataIds[i][1]==examID) { rowIdx=i+2; break; }
      }
    }
    var ansJSON = JSON.stringify(answers);
    var CELL_LIMIT = 49000;
    if (ansJSON.length > CELL_LIMIT) {
      var safeAns = {};
      Object.keys(answers).forEach(function(k) {
        var v = answers[k];
        if (typeof v === 'string' && v.indexOf('data:image') === 0 && v.length > 40000) {
          safeAns[k] = v.slice(0, 40000);
        } else {
          safeAns[k] = v;
        }
      });
      ansJSON = JSON.stringify(safeAns);
      if (ansJSON.length > CELL_LIMIT) {
        Object.keys(safeAns).forEach(function(k) {
          if (typeof safeAns[k] === 'string' && safeAns[k].indexOf('data:image') === 0) {
            safeAns[k] = '__CANVAS_TOO_LARGE__';
          }
        });
        ansJSON = JSON.stringify(safeAns);
      }
    }
    if (rowIdx===-1) {
      sheet.appendRow(['RSP-'+Date.now(),userID,examID,ansJSON,0,new Date(),'','In Progress']);
    } else {
      sheet.getRange(rowIdx,4).setValue(ansJSON);
    }
    SpreadsheetApp.flush();
    return { status:'success', message:'Jawaban tersimpan.' };
  } catch(err) {
    return { status:'error', message:err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function convertCanvasToLatex(base64Image, qId) {
  var apiKey = '';
  var cfgSheet = SS.getSheetByName('Konfigurasi');
  if (cfgSheet) {
    var cfgData = cfgSheet.getDataRange().getValues();
    for (var c = 1; c < cfgData.length; c++) {
      if (String(cfgData[c][0]) === 'anthropic_api_key') {
        apiKey = String(cfgData[c][1]).trim();
        break;
      }
    }
  }

  if (!apiKey || apiKey.length < 10) {
    return {
      success: false,
      message: 'API Key Anthropic belum dikonfigurasi. ' +
               'Buka menu Konfigurasi → tambahkan baris: anthropic_api_key = <key Anda>.'
    };
  }

  if (!base64Image || base64Image.length < 100) {
    return { success: false, message: 'Data gambar tidak valid atau kosong.' };
  }

  var systemPrompt =
    'OCR math: output ONLY LaTeX, no explanation, no markdown, no backticks. ' +
    'Inline: $...$, display: $$...$$. Multiple lines: \\n. ' +
    'Plain text: return as-is. Blank/unclear image: return empty string.';

  var apiUrl = 'https://gateway.olagon.site/anthropic/v1/messages';

  var payload = {
    'model':      'claude-haiku-4-5-20251001',
    'max_tokens': 256,
    'system':     systemPrompt,
    'messages': [{
      'role': 'user',
      'content': [
        {
          'type': 'image',
          'source': {
            'type':       'base64',
            'media_type': 'image/jpeg',
            'data':       base64Image
          }
        },
        {
          'type': 'text',
          'text': 'Convert to LaTeX:'
        }
      ]
    }]
  };

  var options = {
    'method':      'post',
    'contentType': 'application/json',
    'headers': {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01'
    },
    'payload':            JSON.stringify(payload),
    'muteHttpExceptions': true
  };

  try {
    var response   = UrlFetchApp.fetch(apiUrl, options);
    var httpCode   = response.getResponseCode();
    var bodyText   = response.getContentText();
    var bodyObj;
    try {
      bodyObj = JSON.parse(bodyText);
    } catch(e) {
      return { success: false, message: 'Gateway API mengembalikan response tidak valid/HTML (HTTP ' + httpCode + ').' };
    }

    if (httpCode !== 200) {
      var errMsg = (bodyObj.error && bodyObj.error.message)
        ? bodyObj.error.message
        : 'HTTP ' + httpCode;
      return { success: false, message: 'Anthropic API error: ' + errMsg };
    }

    var latex = '';
    if (bodyObj.content && bodyObj.content[0]) {
      latex = (bodyObj.content[0].text || '').trim();
    }

    latex = latex
      .replace(/^```latex\s*/i, '')
      .replace(/^```\s*/,        '')
      .replace(/\s*```$/,        '')
      .trim();

    return { success: true, latex: latex };

  } catch (err) {
    return { success: false, message: 'Gagal menghubungi Anthropic API: ' + err.toString() };
  }
}

function getPassingStatus(score, passingGrade) {
  if (!passingGrade || passingGrade <= 0) return null;
  const passed = score >= passingGrade;
  return {
    passed:       passed,
    passingGrade: passingGrade,
    label:        passed ? 'LULUS' : 'TIDAK LULUS',
    color:        passed ? 'green' : 'red'
  };
}

function submitExam(userID, examID, answers, customStatus) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) { return { success:false, message:'Server sedang sibuk.' }; }
  try {
    const qSheet = SS.getSheetByName('Questions');
    const qData  = qSheet.getDataRange().getValues();
 
    let totalPoints=0, maxPoints=0;
 
    function stripHtml(str) {
      return String(str||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim().toLowerCase();
    }
 
    qData.forEach((row,i) => {
      if (i===0 || String(row[1])!==String(examID)) return;
      const qid    = row[0];
      const type   = String(row[2]).trim();
      const keyRaw = row[6];
      const userAns= answers[qid];
      const weight = row[8] ? parseFloat(row[8]) : 10;
      maxPoints += weight;
 
      if (type==='PG') {
        const cleanUser=stripHtml(userAns);
        const cleanKey =String(keyRaw||'').trim();
        let isCorrect=false;
        const mapHuruf=['A','B','C','D','E'];
        const keyIndex=mapHuruf.indexOf(cleanKey.trim().toUpperCase());
        if (keyIndex!==-1) {
          let optionsArr=[];
          try { optionsArr=JSON.parse(row[5]); } catch(e) { optionsArr=[]; }
          if (optionsArr[keyIndex]) { const ct=stripHtml(optionsArr[keyIndex]); if (cleanUser===ct&&ct!=='') isCorrect=true; }
        } else { if (cleanUser===stripHtml(cleanKey)) isCorrect=true; }
        if (isCorrect) totalPoints+=weight;
      } else if (type==='PG_KOMPLEKS') {
        let keyArr=[],userArr=[],optionsArr=[];
        try { const p=JSON.parse(keyRaw); keyArr=Array.isArray(p)?p:[]; } catch(e) { keyArr=String(keyRaw||'').split(',').map(s=>s.trim()).filter(s=>s); }
        if (Array.isArray(userAns)) { userArr=userAns; } else { try { const p=JSON.parse(userAns); userArr=Array.isArray(p)?p:[]; } catch(e) { userArr=String(userAns||'').split(',').map(s=>s.trim()).filter(s=>s); } }
        try { const p=JSON.parse(row[5]); optionsArr=Array.isArray(p)?p:[]; } catch(e) { optionsArr=[]; }
        const mapHuruf=['A','B','C','D','E'];
        const realKeyValues=keyArr.map(k=>{ const cleanK=String(k).trim().toUpperCase(); const idx=mapHuruf.indexOf(cleanK); if (idx!==-1&&optionsArr[idx]) return stripHtml(optionsArr[idx]); return stripHtml(k); }).filter(v=>v!=='');
        const realUserValues=userArr.map(u=>stripHtml(u)).filter(v=>v!=='');
        let matchCount=0,wrongCount=0;
        realUserValues.forEach(val=>{ if (realKeyValues.includes(val)) matchCount++; else wrongCount++; });
        if (wrongCount===0&&matchCount>0&&realKeyValues.length>0) totalPoints+=(matchCount/realKeyValues.length)*weight;
      } else if (type==='BS') {
        // BUG FIX RS-3 (KRITIS): Scoring BS di submitExam menggunakan for..in keyObj
        // yang key-nya bisa teks pernyataan, tetapi ansObj berisi key index numerik.
        // Iterasi via array statements dari row[5] (optionsRaw) sebagai jembatan.
        let bsStmtsSubmit = [];
        try { bsStmtsSubmit = JSON.parse(row[5] || '[]'); } catch(e) { bsStmtsSubmit = []; }
        if (!Array.isArray(bsStmtsSubmit)) bsStmtsSubmit = [];

        let keyObjSubmit = {};
        try { keyObjSubmit = JSON.parse(keyRaw); } catch(e) {
          // Jika keyRaw bukan JSON valid, tidak bisa dihitung — skip
          return;
        }

        const ansObjSubmit = (typeof userAns === 'object' && userAns !== null) ? userAns : {};
        const bsTotalSubmit = bsStmtsSubmit.length > 0 ? bsStmtsSubmit.length : Object.keys(keyObjSubmit).length;

        if (bsTotalSubmit > 0 && bsStmtsSubmit.length > 0) {
          let bsMatchSubmit = 0;
          bsStmtsSubmit.forEach(function(stmt, idx) {
            const expByText = keyObjSubmit[stmt];
            const expByIdx  = keyObjSubmit[String(idx)];
            const expected  = expByText || expByIdx;
            if (!expected) return;

            const stuByIdx  = ansObjSubmit[String(idx)];
            const stuByText = ansObjSubmit[stmt];
            const studentAns = stuByIdx || stuByText || '';

            const kVal = String(expected).trim().toLowerCase();
            const uVal = String(studentAns).trim().toLowerCase();
            if (kVal===uVal || (kVal==='benar'&&uVal==='sesuai') || (kVal==='salah'&&uVal==='tidak sesuai')) {
              bsMatchSubmit++;
            }
          });
          totalPoints += (bsMatchSubmit / bsTotalSubmit) * weight;
        } else if (bsTotalSubmit > 0) {
          // Fallback legacy: tidak ada array statements
          let matchLegacy = 0;
          for (const idx in keyObjSubmit) {
            const kVal = String(keyObjSubmit[idx]).trim().toLowerCase();
            const uVal = String(ansObjSubmit[idx] || '').trim().toLowerCase();
            if (kVal===uVal || (kVal==='benar'&&uVal==='sesuai') || (kVal==='salah'&&uVal==='tidak sesuai')) matchLegacy++;
          }
          totalPoints += (matchLegacy / bsTotalSubmit) * weight;
        }
      } else if (type==='JODOH') {
        let allPairs=[];
        try { allPairs=JSON.parse(row[5]); } catch(e) { allPairs=[]; }
        const correctPairs=allPairs.filter(pair=>pair.q&&String(pair.q).trim()!=='');
        if (correctPairs.length>0&&userAns&&typeof userAns==='object') {
          let matches=0;
          correctPairs.forEach(pair=>{ if (userAns[pair.q]===pair.a) matches++; });
          totalPoints+=(matches/correctPairs.length)*weight;
        }
      }
    });
 
    const finalScore  = maxPoints>0 ? Math.round((totalPoints/maxPoints)*10000)/100 : 0;
    const finalStatus = customStatus||'Completed';
 
    const examSheet = SS.getSheetByName('Exams');
    const examRows  = examSheet.getDataRange().getValues();
    let passingGrade = 0;
    for (let i=1;i<examRows.length;i++) {
      if (String(examRows[i][0])===String(examID)) {
        passingGrade = examRows[i][10] ? parseFloat(examRows[i][10]) : 0;
        break;
      }
    }
 
    const rSheet = SS.getSheetByName('Responses');
    const rData  = rSheet.getDataRange().getValues();
    let saved=false;
 
    for (let i=1;i<rData.length;i++) {
      if (String(rData[i][1])===String(userID) && String(rData[i][2])===String(examID)) {
        const rowIdx=i+1;
        if (finalStatus==='Curang'&&rData[i][5]) {
          const startTimeForCalc=new Date(rData[i][5]);
          const elapsedAtCheat=Math.floor((Date.now()-startTimeForCalc.getTime())/1000);
          answers['__pausedElapsedSec__']=elapsedAtCheat;
        }
        rSheet.getRange(rowIdx,4).setValue(JSON.stringify(answers));
        rSheet.getRange(rowIdx,5).setValue(finalScore);
        rSheet.getRange(rowIdx,7).setValue(new Date());
        rSheet.getRange(rowIdx,8).setValue(finalStatus);
        saved=true;
        break;
      }
    }
 
    if (!saved) {
      rSheet.appendRow(['RSP-'+Date.now(),userID,examID,JSON.stringify(answers),finalScore,new Date(),new Date(),finalStatus]);
    }
 
    const passingStatus = getPassingStatus(finalScore, passingGrade);
 
    return { success:true, score:finalScore, passingGrade, passingStatus };
 
  } catch(err) {
    return { success:false, message:'Gagal menyimpan: '+err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function logViolation(userID, examID, count, details) {
  const lock=LockService.getScriptLock();
  try { lock.waitLock(5000); } catch(e) { return { forceSubmit:true }; }
  try {
    SS.getSheetByName('Logs').appendRow(['LOG-'+Date.now(),userID,examID,1,details,new Date()]);
  } finally { lock.releaseLock(); }
  return { forceSubmit:true };
}

function createExam(form, userID, token) {
  try { verifyAdminAccess(userID, token); } catch(e) { return { success:false, message:'Akses Ditolak: '+e.message }; }
 
  const sheet = SS.getSheetByName('Exams');
  let rawSubject  = form.subject.toString().toUpperCase();
  let cleanSubject= rawSubject.replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const randomNum = Math.floor(1000+Math.random()*9000);
  const id        = `EXM-${cleanSubject}_${randomNum}`;
 
  const startDate = new Date(form.date);
  const endDate   = new Date(form.endDate);
 
  if (isNaN(startDate.getTime())||isNaN(endDate.getTime())) return { success:false, message:'Format tanggal tidak valid.' };
  if (endDate<=startDate) return { success:false, message:'Waktu Selesai harus lebih akhir dari Waktu Mulai.' };
 
  const now           = new Date();
  const initialStatus = now>=startDate ? 'Aktif' : 'Non-Aktif';
 
  const defaultShuffle    = { PG:false, PG_KOMPLEKS:false, BS:false, JODOH:false, Esai:false };
  const shuffleConfig     = form.shuffleConfig||defaultShuffle;
  const defaultTypeConfig = {
    PG:          { enabled:true, max:0, optCount:5, defaultPoint:1 },
    PG_KOMPLEKS: { enabled:true, max:0, optCount:5, defaultPoint:1 },
    BS:          { enabled:true, max:0, defaultPoint:1 },
    JODOH:       { enabled:true, max:0, defaultPoint:1 },
    Esai:        { enabled:true, max:0, defaultPoint:5 }
  };
  // Merge typeConfig dari form agar field baru (defaultPoint) tidak hilang bila
  // frontend lama mengirim typeConfig tanpa field tersebut.
  const rawTypeConfig = form.typeConfig || {};
  const typeConfig = {};
  ['PG','PG_KOMPLEKS','BS','JODOH','Esai'].forEach(t => {
    const def = defaultTypeConfig[t];
    const src = (rawTypeConfig[t] && typeof rawTypeConfig[t] === 'object') ? rawTypeConfig[t] : {};
    typeConfig[t] = {
      enabled:      src.hasOwnProperty('enabled')      ? src.enabled      : def.enabled,
      max:          src.hasOwnProperty('max')           ? (parseInt(src.max)||0) : def.max,
      defaultPoint: src.hasOwnProperty('defaultPoint') ? (parseFloat(src.defaultPoint)||def.defaultPoint) : def.defaultPoint
    };
    if (t === 'PG' || t === 'PG_KOMPLEKS') {
      typeConfig[t].optCount = src.hasOwnProperty('optCount') ? (parseInt(src.optCount)||5) : def.optCount;
    }
  });
  const passingGrade      = form.passingGrade ? parseFloat(form.passingGrade) : 0;
  const bypassInputPeriod = form.bypassInputPeriod ? true : false;
  sheet.appendRow([id, form.subject, form.class, startDate, form.duration, form.pin, initialStatus, endDate, JSON.stringify(shuffleConfig), JSON.stringify(typeConfig), passingGrade, bypassInputPeriod]);
 
  const actorName = getActorName(userID);
  addAdminLog(userID, actorName, 'CREATE_EXAM', 'Ujian', id, `Ujian baru dibuat: "${form.subject}" untuk kelas ${form.class}. Passing Grade: ${passingGrade}.`);
 
  return { success:true, examId:id };
}

function getExamList(userID, token) {
  const sheet = SS.getSheetByName('Exams');
  if (sheet.getLastRow()<=1) return [];
 
  const userSheet = SS.getSheetByName('Users');
  const userRows  = userSheet.getDataRange().getValues();
  let role='', teacherSubjects=[];
 
  for (let u=1;u<userRows.length;u++) {
    if (String(userRows[u][0]).toLowerCase()===String(userID).toLowerCase()) {
      role=userRows[u][3];
      if (role==='Guru') {
        const rawData=String(userRows[u][4]||'');
        rawData.split(',').forEach(item => {
          const parts=item.split(':');
          if (parts.length>=2) teacherSubjects.push({ subject:parts[0].trim().toLowerCase(), kelas:parts[1].trim().toLowerCase() });
        });
      }
      break;
    }
  }
 
  const data     = sheet.getDataRange().getValues();
  const timezone = Session.getScriptTimeZone();
  const now      = new Date();
  const result   = [];
 
  for (let i=1;i<data.length;i++) {
    const r=data[i];
    const examSubject=String(r[1]).toLowerCase();
    let include=false;
    if (role==='Admin') { include=true; }
    else if (role==='Guru') {
      const examClass=String(r[2]).toLowerCase();
      const match=teacherSubjects.some(tugas => {
        const kelasUjian=examClass.split(',').map(k=>k.trim());
        return examSubject.includes(tugas.subject) && kelasUjian.some(k=>k.includes(tugas.kelas)||tugas.kelas.includes(k));
      });
      if (match) include=true;
    }
 
    if (include) {
      let dateStartRaw=r[3], dateEndRaw=r[7];
      const startObj=dateStartRaw instanceof Date ? dateStartRaw : null;
      const endObj  =dateEndRaw   instanceof Date ? dateEndRaw   : null;
 
      if (endObj&&now>endObj) { sheet.getRange(i+1,7).setValue('Non-Aktif'); r[6]='Non-Aktif'; }
      else if (startObj&&endObj&&now>=startObj&&now<=endObj) { sheet.getRange(i+1,7).setValue('Aktif'); r[6]='Aktif'; }
      else if (startObj&&now<startObj) { sheet.getRange(i+1,7).setValue('Non-Aktif'); r[6]='Non-Aktif'; }
 
      let isoStartDate='',strStartDate='-',isoEndDate='',strEndDate='-';
      if (dateStartRaw instanceof Date) { strStartDate=Utilities.formatDate(dateStartRaw,timezone,'dd/MM/yyyy HH:mm'); isoStartDate=Utilities.formatDate(dateStartRaw,timezone,"yyyy-MM-dd'T'HH:mm"); }
      if (dateEndRaw instanceof Date)   {
        // If end-date is on the SAME calendar day as the start-date, only show the time;
        // otherwise show full dd/MM/yyyy HH:mm so the user always knows the actual end day.
        var sameDay = (dateStartRaw instanceof Date)
          && Utilities.formatDate(dateStartRaw, timezone, 'yyyy-MM-dd')
              === Utilities.formatDate(dateEndRaw, timezone, 'yyyy-MM-dd');
        strEndDate = Utilities.formatDate(dateEndRaw, timezone, sameDay ? 'HH:mm' : 'dd/MM/yyyy HH:mm');
        isoEndDate = Utilities.formatDate(dateEndRaw, timezone, "yyyy-MM-dd'T'HH:mm");
      }
 
      result.push({
        id:r[0], subject:r[1], class:r[2],
        date:isoStartDate, dateStr:strStartDate,
        endDate:isoEndDate, endDateStr:strEndDate,
        duration:r[4], pin:r[5], status:r[6],
        passingGrade: r[10] ? parseFloat(r[10]) : 0,
        bypassInputPeriod: r[11] === true || String(r[11]).toLowerCase() === 'true',
        shuffleConfig: r[8] ? (()=>{ try { return JSON.parse(r[8]); } catch(e) { return { PG:false,PG_KOMPLEKS:false,BS:false,JODOH:false,Esai:false }; } })() : { PG:false,PG_KOMPLEKS:false,BS:false,JODOH:false,Esai:false },
        typeConfig:    (()=>{
          // Parse typeConfig dan pastikan defaultPoint tersedia per tipe
          // (kompatibilitas mundur untuk data lama yang belum memiliki field ini).
          const _fallbackDp = { PG:1, PG_KOMPLEKS:1, BS:1, JODOH:1, Esai:5 };
          let tc = null;
          if (r[9]) { try { tc = JSON.parse(r[9]); } catch(e) { tc = null; } }
          if (!tc || typeof tc !== 'object') return null;
          ['PG','PG_KOMPLEKS','BS','JODOH','Esai'].forEach(t => {
            if (!tc[t] || typeof tc[t] !== 'object') tc[t] = { enabled:true, max:0 };
            if (!tc[t].hasOwnProperty('defaultPoint') || tc[t].defaultPoint === null || tc[t].defaultPoint === undefined) {
              tc[t].defaultPoint = _fallbackDp[t];
            } else {
              tc[t].defaultPoint = parseFloat(tc[t].defaultPoint) || _fallbackDp[t];
            }
          });
          return tc;
        })()
      });
    }
  }
  return result;
}

function addQuestion(data, requestorID, requestorToken) {
  // --- GUARD JADWAL INPUT SOAL ---
  var role = resolveRequestorRole_(requestorID, requestorToken);
  if (!role) return { success: false, message: 'Sesi tidak valid.' };
  var periodCheck = enforceInputPeriod_(role, data.examId);
  if (!periodCheck.ok) return { success: false, message: periodCheck.message };
  // -------------------------------
  const sheet = SS.getSheetByName('Questions');
  const id    = 'Q-'+Date.now();
  const opts  = JSON.stringify(data.options||[]);
  const isRequired = data.isRequired||'FALSE';
  const point = data.point ? parseFloat(String(data.point).replace(',','.')) : 10;
 
  if (data.examId) {
    const exSheet=SS.getSheetByName('Exams');
    const exData =exSheet.getDataRange().getValues();
    for (let k=1;k<exData.length;k++) {
      if (String(exData[k][0])===String(data.examId)) {
        const tcRaw=exData[k][9];
        if (tcRaw) {
          let tc=null; try { tc=JSON.parse(tcRaw); } catch(e) {}
          if (tc&&data.type) {
            const cfg    =tc[data.type];
            const labels ={PG:'Pilihan Ganda',PG_KOMPLEKS:'PG Kompleks',BS:'Benar/Salah',JODOH:'Menjodohkan',Esai:'Esai'};
            const label  =labels[data.type]||data.type;
            if (cfg&&cfg.enabled===false) return { success:false, message:'Tipe soal "'+label+'" tidak diizinkan.' };
            const max=cfg?(parseInt(cfg.max)||0):0;
            if (max>0) {
              const qData=SS.getSheetByName('Questions').getDataRange().getValues();
              let currentCount=0;
              qData.forEach((r,i)=>{ if (i>0&&String(r[1])===String(data.examId)&&String(r[2])===String(data.type)) currentCount++; });
              if (currentCount>=max) return { success:false, message:'Batas maksimal soal tipe "'+label+'" sudah tercapai ('+currentCount+'/'+max+').' };
            }
          }
        }
        break;
      }
    }
  }
 
  sheet.appendRow([id, data.examId, data.type, data.content, data.image, opts, data.correct, isRequired, point,
                   data.rubric || '',
                   (data.type === 'Esai' && data.minChar) ? parseInt(data.minChar) || 0 : 0,
                   (data.type === 'Esai') ? (data.minCharEnabled === true || data.minCharEnabled === 'true' ? 'TRUE' : 'FALSE') : 'FALSE',
                   data.audio || '']);

  // Log action (best-effort, doesn't block on failure)
  try {
    if (requestorID) {
      const actorName = getActorName(requestorID);
      const labels = {PG:'PG', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai'};
      const typeLabel = labels[data.type] || (data.type || '-');
      addAdminLog(requestorID, actorName, 'CREATE_QUESTION', 'Question', id,
                  'Soal baru ('+typeLabel+') ditambahkan ke ujian '+(data.examId || '-')+'.');
    }
  } catch(e) { Logger.log('addQuestion log error: '+e.message); }

  return { success:true, questionId:id };
}

function getQuestionsByExam(examID, userID, token) {
  const exSheet=SS.getSheetByName('Exams');
  const exData =exSheet.getDataRange().getValues();
  let subject='',cls='',typeConfigRaw=null;
  for (let k=1;k<exData.length;k++) {
    if (String(exData[k][0])===String(examID)) { subject=exData[k][1]; cls=exData[k][2]; typeConfigRaw=exData[k][9]||null; break; }
  }
  if (!subject) return { questions:[], typeConfig:null };
  const access=checkUserAccess(userID,token,subject,cls);
  if (!access.allowed) return { questions:[], typeConfig:null };
  let typeConfig=null;
  if (typeConfigRaw) { try { typeConfig=JSON.parse(typeConfigRaw); } catch(e) {} }
  const data=SS.getSheetByName('Questions').getDataRange().getValues();
  const res=[];
  data.forEach((r,i)=>{
    if (i>0&&String(r[1])===String(examID)) {
      res.push({ id:r[0],examId:r[1],type:r[2],content:r[3],image:r[4],options:r[5],key:r[6],isRequired:r[7],point:r[8],
                 rubric: r[9] ? String(r[9]) : '',
                 minChar: r[10] ? (parseInt(r[10]) || 0) : 0,
                 minCharEnabled: String(r[11] || '').toLowerCase() === 'true',
                 audio: r[12] || '' });
    }
  });
  return { questions:res, typeConfig };
}

function deleteQuestion(qId, requestorID, requestorToken) {
  var role = resolveRequestorRole_(requestorID, requestorToken);
  if (!role) return { success: false, message: 'Sesi tidak valid.' };

  const sheet=SS.getSheetByName('Questions');
  const data =sheet.getDataRange().getValues();
  let examId='', qType='';
  let targetRowIdx = -1;
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(qId)) {
      targetRowIdx = i + 1;
      examId = data[i][1];
      qType = data[i][2];
      break;
    }
  }

  if (targetRowIdx === -1) return { success:false, message:'Soal tidak ditemukan.' };

  // --- GUARD JADWAL INPUT SOAL ---
  var periodCheck = enforceInputPeriod_(role, examId);
  if (!periodCheck.ok) return { success: false, message: periodCheck.message };
  // -------------------------------

  // FIX: Gunakan targetRowIdx yang sudah dihitung di loop pertama — tidak perlu loop kedua.
  // Loop kedua sebelumnya berpotensi menghapus row yang salah (race condition) dan
  // menggunakan perbandingan == (loose equality) alih-alih === (strict equality).
  sheet.deleteRow(targetRowIdx);

  // Log action (best-effort)
  try {
    if (requestorID) {
      const actorName = getActorName(requestorID);
      const labels = {PG:'PG', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai'};
      const typeLabel = labels[qType] || (qType || '-');
      addAdminLog(requestorID, actorName, 'DELETE_QUESTION', 'Question', qId,
                  'Soal '+typeLabel+' (ID: '+qId+') dihapus dari ujian '+(examId || '-')+'.');
    }
  } catch(e) { Logger.log('deleteQuestion log error: '+e.message); }
  return { success:true };
}

function getExamResults(examID, requestorID, requestorToken) {
  const uSheet=SS.getSheetByName('Users');
  const uData =uSheet.getDataRange().getValues();
  let role='', isValidSessionCheck=false;
  for (let i=1;i<uData.length;i++) {
    if (String(uData[i][0])===String(requestorID)) {
      if (String(uData[i][5])===String(requestorToken)) { isValidSessionCheck=true; role=uData[i][3]; }
      break;
    }
  }
  if (!isValidSessionCheck) throw new Error("Akses Ditolak: Sesi tidak valid.");
  if (role==='Siswa')        throw new Error("SECURITY ALERT: Siswa dilarang mengakses data rekap nilai!");
 
  const users={};
  uData.forEach((r,i)=>{ if (i>0) users[String(r[0]).trim()]={ name:r[1], cls:r[4] }; });
 
  const examSheet=SS.getSheetByName('Exams');
  const examRows =examSheet.getDataRange().getValues();
  let passingGrade=0;
  for (let i=1;i<examRows.length;i++) {
    if (String(examRows[i][0])===String(examID)) { passingGrade=examRows[i][10]?parseFloat(examRows[i][10]):0; break; }
  }
 
  const rSheet=SS.getSheetByName('Responses');
  const rData =rSheet.getDataRange().getValues();
  const results=[];
  const targetID=String(examID).trim();
 
  for (let i=1;i<rData.length;i++) {
    if (String(rData[i][2]).trim()===targetID) {
      const studentId   =String(rData[i][1]).trim();
      const studentInfo =users[studentId]||{ name:'Unknown User',cls:'-' };
      const score       =rData[i][4];
      const passingStatus=getPassingStatus(parseFloat(score)||0, passingGrade);
 
      results.push({
        responseId:   rData[i][0],
        studentId,
        name:         studentInfo.name,
        class:        studentInfo.cls,
        examId:       rData[i][2],
        answers:      rData[i][3],
        score,
        passingGrade,
        passingStatus,
        startTime:    rData[i][5] ? Utilities.formatDate(new Date(rData[i][5]),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm') : '-',
        submitTime:   rData[i][6] ? Utilities.formatDate(new Date(rData[i][6]),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm') : '-',
        status:       rData[i][7]
      });
    }
  }
  return results;
}

function importQuestionsFromForm(examID, formURL, requestorID, requestorToken) {
  try {
    // Authorization: only Admin/Guru with access to this exam may import.
    const auth = verifyRequestor_(requestorID, requestorToken, examID);
    if (!auth || auth.ok !== true) {
      return { success:false, message:(auth && auth.message) ? auth.message : 'Otorisasi gagal.' };
    }

    const idMatch=formURL.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch||!idMatch[1]) return { success:false, message:'Link Form tidak valid.' };
    const formId=idMatch[1];
    const form=FormApp.openById(formId);
    const items=form.getItems();
    const sheet=SS.getSheetByName('Questions');
    let count=0, skipped=0;
    let typeConfig=null;
    const exSheet=SS.getSheetByName('Exams');
    const exData =exSheet.getDataRange().getValues();
    for (let k=1;k<exData.length;k++) { if (String(exData[k][0])===String(examID)) { const tcRaw=exData[k][9]; if (tcRaw) { try { typeConfig=JSON.parse(tcRaw); } catch(e) {} } break; } }
    const existingCount={PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0};
    const addedCount={PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0};
    if (typeConfig) { const qData=SS.getSheetByName('Questions').getDataRange().getValues(); qData.forEach((r,i)=>{ if (i>0&&String(r[1])===String(examID)&&existingCount.hasOwnProperty(r[2])) existingCount[r[2]]++; }); }

    // Extract the correct-answer letter from a quiz item's feedback/points (best-effort).
    // Returns the option letter (A/B/C...) for single-answer MC, or '' when unknown.
    function _detectCorrectLetter(choices) {
      try {
        for (let i = 0; i < choices.length; i++) {
          if (typeof choices[i].isCorrectAnswer === 'function' && choices[i].isCorrectAnswer()) {
            return String.fromCharCode(65 + i);
          }
        }
      } catch (e) { /* not a quiz / no answer key */ }
      return '';
    }
    function _detectCorrectLettersMulti(choices) {
      const letters = [];
      try {
        for (let i = 0; i < choices.length; i++) {
          if (typeof choices[i].isCorrectAnswer === 'function' && choices[i].isCorrectAnswer()) {
            letters.push(String.fromCharCode(65 + i));
          }
        }
      } catch (e) { /* ignore */ }
      return letters;
    }

    items.forEach(item=>{
      const type=item.getType();
      let qType='',options=[],content=item.getTitle(),key='';
      if (type===FormApp.ItemType.MULTIPLE_CHOICE) {
        qType='PG';
        const mc = item.asMultipleChoiceItem();
        const choices = mc.getChoices();
        options = choices.map(c=>c.getValue());
        key = _detectCorrectLetter(choices);
      }
      else if (type===FormApp.ItemType.TEXT||type===FormApp.ItemType.PARAGRAPH_TEXT) { qType='Esai'; }
      else if (type===FormApp.ItemType.CHECKBOX) {
        // Checkbox = multiple correct answers -> PG_KOMPLEKS when >1 key, else PG.
        const cb = item.asCheckboxItem();
        const choices = cb.getChoices();
        options = choices.map(c=>c.getValue());
        const letters = _detectCorrectLettersMulti(choices);
        if (letters.length > 1) { qType='PG_KOMPLEKS'; key = JSON.stringify(letters); }
        else { qType='PG'; key = letters[0] || ''; }
      }
      if (qType) {
        if (typeConfig) { const cfg=typeConfig[qType]; if (cfg&&cfg.enabled===false) { skipped++; return; } const max=cfg?(parseInt(cfg.max)||0):0; if (max>0) { const total=(existingCount[qType]||0)+(addedCount[qType]||0); if (total>=max) { skipped++; return; } } }
        const id='Q-'+Date.now()+'-'+Math.floor(Math.random()*100000);
        // Full 13-column row to match Questions schema:
        // [QuestionID, ExamID, Type, Content, ImageURL, Options, CorrectAnswer, IsRequired, Point, Rubric, MinChar, MinCharEnabled, AudioURL]
        sheet.appendRow([id, examID, qType, content, '', JSON.stringify(options), key, 'FALSE', 10, '', 0, 'FALSE', '']);
        if (addedCount.hasOwnProperty(qType)) addedCount[qType]++;
        count++;
      }
    });
    if (count===0&&skipped===0) return { success:false, message:'Tidak ada soal PG/Isian di Form.' };
    if (count===0&&skipped>0)   return { success:false, message:`Semua ${skipped} soal dilewati karena konfigurasi tipe.` };
    return { success:true, count, skipped };
  } catch(e) {
    Logger.log(e.toString());
    if (e.toString().includes('permission')||e.toString().includes('authorization')) return { success:false, message:'IZIN DITOLAK: Jalankan pancingIzinAkses() sekali di Editor.' };
    return { success:false, message:'Gagal: '+e.toString() };
  }
}

function copyQuestions(sourceExamId, destinationExamId, requestorID, requestorToken) {
  try {
    if (!sourceExamId||!destinationExamId||sourceExamId===destinationExamId) return { success:false, message:'ID Ujian Sumber dan Tujuan tidak valid atau sama.' };

    // Authorization: requestor must have access to BOTH source and destination exams.
    const authSrc = verifyRequestor_(requestorID, requestorToken, sourceExamId);
    if (!authSrc || authSrc.ok !== true) {
      return { success:false, message:(authSrc && authSrc.message) ? ('Sumber: ' + authSrc.message) : 'Otorisasi gagal (sumber).' };
    }
    const authDest = verifyRequestor_(requestorID, requestorToken, destinationExamId);
    if (!authDest || authDest.ok !== true) {
      return { success:false, message:(authDest && authDest.message) ? ('Tujuan: ' + authDest.message) : 'Otorisasi gagal (tujuan).' };
    }

    const sheet=SS.getSheetByName('Questions');
    const allData=sheet.getDataRange().getValues();
    allData.shift();
    const sourceQuestions=allData.filter(row=>String(row[1])===String(sourceExamId));
    if (sourceQuestions.length===0) return { success:false, message:'Tidak ada soal di mapel sumber.' };
    let typeConfig=null;
    const exSheet=SS.getSheetByName('Exams');
    const exData =exSheet.getDataRange().getValues();
    for (let k=1;k<exData.length;k++) { if (String(exData[k][0])===String(destinationExamId)) { const tcRaw=exData[k][9]; if (tcRaw) { try { typeConfig=JSON.parse(tcRaw); } catch(e) {} } break; } }
    const existingCount={PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0};
    const addedCount={PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0};
    if (typeConfig) { allData.forEach(r=>{ if (String(r[1])===String(destinationExamId)&&existingCount.hasOwnProperty(r[2])) existingCount[r[2]]++; }); }
    const newRows=[]; let skipped=0;
    sourceQuestions.forEach(sourceRow=>{
      const qType=String(sourceRow[2]);
      if (typeConfig) { const cfg=typeConfig[qType]; if (cfg&&cfg.enabled===false) { skipped++; return; } const max=cfg?(parseInt(cfg.max)||0):0; if (max>0) { const total=(existingCount[qType]||0)+(addedCount[qType]||0); if (total>=max) { skipped++; return; } } }
      let newRow=[...sourceRow];
      newRow[0]='Q-'+Date.now()+'-'+Math.round(Math.random()*100000);
      newRow[1]=destinationExamId;
      newRows.push(newRow);
      if (addedCount.hasOwnProperty(qType)) addedCount[qType]++;
    });
    if (newRows.length>0) sheet.getRange(sheet.getLastRow()+1,1,newRows.length,newRows[0].length).setValues(newRows);
    const msg=skipped>0 ? `${newRows.length} soal berhasil disalin. ${skipped} soal dilewati.` : `${newRows.length} soal berhasil disalin.`;
    return { success:true, count:newRows.length, skipped, message:msg };
  } catch(e) { return { success:false, message:'Error server: '+e.message }; }
}

function deleteExam(examId, userID, token) {
  try { verifyAdminAccess(userID, token); } catch(e) { return { success:false, message:'Akses Ditolak: '+e.message }; }
 
  const sheet=SS.getSheetByName('Exams');
  const data =sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(examId)) {
      const examSubject = data[i][1];
      sheet.deleteRow(i+1);
      const actorName=getActorName(userID);
      addAdminLog(userID, actorName, 'DELETE_EXAM', 'Ujian', examId, `Ujian dihapus: "${examSubject}".`);
      return { success:true };
    }
  }
  return { success:false, message:'ID Ujian tidak ditemukan.' };
}

function deleteExamsBulk(examIds, userID, token) {
  try { verifyAdminAccess(userID, token); } catch(e) { return { success:false, message:'Akses Ditolak: '+e.message }; }
  if (!Array.isArray(examIds) || examIds.length === 0) return { success:false, message:'Tidak ada ID ujian.' };

  const sheet = SS.getSheetByName('Exams');
  const data  = sheet.getDataRange().getValues();
  const idSet = new Set(examIds.map(String));
  const deleted = [];

  // Hapus dari bawah agar index tidak geser
  for (let i = data.length - 1; i >= 1; i--) {
    if (idSet.has(String(data[i][0]))) {
      const examSubject = data[i][1];
      sheet.deleteRow(i + 1);
      deleted.push({ id: String(data[i][0]), subject: examSubject });
    }
  }

  if (deleted.length > 0) {
    const actorName = getActorName(userID);
    deleted.forEach(d => {
      addAdminLog(userID, actorName, 'DELETE_EXAM', 'Ujian', d.id, `Ujian dihapus (bulk): "${d.subject}".`);
    });
  }

  return { success:true, deleted: deleted.length, notFound: examIds.length - deleted.length };
}

function toggleExamStatus(examId, newStatus, requestorID, requestorToken) {
  try { verifyAdminAccess(requestorID, requestorToken); } catch(e) { return { success:false, message:'Akses Ditolak: '+e.message }; }
  const sheet=SS.getSheetByName('Exams');
  const data =sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(examId)) { sheet.getRange(i+1,7).setValue(newStatus); return { success:true }; }
  }
  return { success:false };
}

function updateExam(data, userID, token) {
  try { verifyAdminAccess(userID, token); } catch(e) { return { success:false, message:'Akses Ditolak: '+e.message }; }
 
  const sheet=SS.getSheetByName('Exams');
  const rows =sheet.getDataRange().getValues();
  const now  =new Date();
 
  for (let i=1;i<rows.length;i++) {
    if (String(rows[i][0])===String(data.examId)) {
      const rowIdx   =i+1;
      const startDate=new Date(data.date);
      const endDate  =new Date(data.endDate);
      if (isNaN(startDate.getTime())||isNaN(endDate.getTime())) return { success:false, message:'Format tanggal invalid.' };
      if (endDate<=startDate) return { success:false, message:'Waktu Selesai harus lebih akhir dari Waktu Mulai.' };
 
      sheet.getRange(rowIdx,2).setValue(data.subject);
      sheet.getRange(rowIdx,3).setValue(data.class);
      sheet.getRange(rowIdx,4).setValue(startDate);
      sheet.getRange(rowIdx,5).setValue(data.duration);
      sheet.getRange(rowIdx,6).setValue(data.pin);
      sheet.getRange(rowIdx,8).setValue(endDate);
      const defaultShuffle   ={PG:false,PG_KOMPLEKS:false,BS:false,JODOH:false,Esai:false};
      const shuffleConfig    =data.shuffleConfig||defaultShuffle;
      sheet.getRange(rowIdx,9).setValue(JSON.stringify(shuffleConfig));
      const defaultTypeConfig_upd = {
        PG:          { enabled:true, max:0, optCount:5, defaultPoint:1 },
        PG_KOMPLEKS: { enabled:true, max:0, optCount:5, defaultPoint:1 },
        BS:          { enabled:true, max:0, defaultPoint:1 },
        JODOH:       { enabled:true, max:0, defaultPoint:1 },
        Esai:        { enabled:true, max:0, defaultPoint:5 }
      };
      const rawTypeConfig_upd = data.typeConfig || {};
      const typeConfig = {};
      ['PG','PG_KOMPLEKS','BS','JODOH','Esai'].forEach(t => {
        const def = defaultTypeConfig_upd[t];
        const src = (rawTypeConfig_upd[t] && typeof rawTypeConfig_upd[t] === 'object') ? rawTypeConfig_upd[t] : {};
        typeConfig[t] = {
          enabled:      src.hasOwnProperty('enabled')      ? src.enabled      : def.enabled,
          max:          src.hasOwnProperty('max')           ? (parseInt(src.max)||0) : def.max,
          defaultPoint: src.hasOwnProperty('defaultPoint') ? (parseFloat(src.defaultPoint)||def.defaultPoint) : def.defaultPoint
        };
        if (t === 'PG' || t === 'PG_KOMPLEKS') {
          typeConfig[t].optCount = src.hasOwnProperty('optCount') ? (parseInt(src.optCount)||5) : def.optCount;
        }
      });
      sheet.getRange(rowIdx,10).setValue(JSON.stringify(typeConfig));
      const passingGrade = data.passingGrade ? parseFloat(data.passingGrade) : 0;
      sheet.getRange(rowIdx,11).setValue(passingGrade);
      const bypassInputPeriod = data.bypassInputPeriod ? true : false;
      sheet.getRange(rowIdx,12).setValue(bypassInputPeriod);
 
      if (endDate>now) sheet.getRange(rowIdx,7).setValue('Aktif');
 
      const actorName=getActorName(userID);
      addAdminLog(userID, actorName, 'UPDATE_EXAM', 'Ujian', data.examId, `Ujian diperbarui: "${data.subject}" kelas ${data.class}. Passing Grade: ${passingGrade}.`);
 
      return { success:true };
    }
  }
  return { success:false, message:'Data ujian tidak ditemukan.' };
}

function pancingIzinAkses() {
  // Dijalankan manual sekali dari Editor Apps Script untuk memicu OAuth consent
  // FormApp (dan Spreadsheet). Tidak melewati importQuestionsFromForm() lagi
  // karena fungsi itu kini memerlukan otorisasi requestor (Admin/Guru).
  var linkDummy = "https://docs.google.com/forms/d/1MA8hdkedHXFdrZXNDvxTmjy9ggtUBcEmlbKs5RA2iDA/edit";
  try {
    var idMatch = linkDummy.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      var form = FormApp.openById(idMatch[1]);
      form.getItems(); // sentuh API agar scope diminta
    }
  } catch (e) {
    Logger.log('pancingIzinAkses: ' + e);
  }
  // Sentuh Spreadsheet juga (best-effort).
  try { SS.getSheetByName('Questions'); } catch (e2) { Logger.log('pancingIzinAkses SS: ' + e2); }
}

function updateQuestion(data, requestorID, requestorToken) {
  var role = resolveRequestorRole_(requestorID, requestorToken);
  if (!role) return { success: false, message: 'Sesi tidak valid.' };

  const sheet=SS.getSheetByName('Questions');
  const rows =sheet.getDataRange().getValues();
  for (let i=1;i<rows.length;i++) {
    if (String(rows[i][0])===String(data.questionId)) {
      const examId = rows[i][1];
      // --- GUARD JADWAL INPUT SOAL ---
      var periodCheck = enforceInputPeriod_(role, examId);
      if (!periodCheck.ok) return { success: false, message: periodCheck.message };
      // -------------------------------

      const rowIdx=i+1;
      const opts=JSON.stringify(data.options||[]);
      const isRequired=data.isRequired||'FALSE';
      const point=data.point?parseFloat(String(data.point).replace(',','.')):10;
      sheet.getRange(rowIdx,3).setValue(data.type);
      sheet.getRange(rowIdx,4).setValue(data.content);
      sheet.getRange(rowIdx,5).setValue(data.image);
      sheet.getRange(rowIdx,6).setValue(opts);
      sheet.getRange(rowIdx,7).setValue(data.correct);
      sheet.getRange(rowIdx,8).setValue(isRequired);
      sheet.getRange(rowIdx,9).setValue(point);
      sheet.getRange(rowIdx,10).setValue(data.rubric || '');
      sheet.getRange(rowIdx,11).setValue(
        (data.type === 'Esai' && data.minChar) ? parseInt(data.minChar) || 0 : 0
      );
      sheet.getRange(rowIdx,12).setValue(
        (data.type === 'Esai') ? (data.minCharEnabled === true || data.minCharEnabled === 'true' ? 'TRUE' : 'FALSE') : 'FALSE'
      );
      sheet.getRange(rowIdx,13).setValue(data.audio || '');
      // Log action (best-effort)
      try {
        if (requestorID) {
          const actorName = getActorName(requestorID);
          const labels = {PG:'PG', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai'};
          const typeLabel = labels[data.type] || (data.type || '-');
          addAdminLog(requestorID, actorName, 'UPDATE_QUESTION', 'Question', data.questionId,
                      'Soal '+typeLabel+' diperbarui (ujian: '+(data.examId || '-')+').');
        }
      } catch(e) { Logger.log('updateQuestion log error: '+e.message); }
      return { success:true };
    }
  }
  return { success:false, message:'ID Soal tidak ditemukan.' };
}

function getEssayData(responseId) {
  try {
    const rSheet = SS.getSheetByName('Responses');
    const rData = rSheet.getDataRange().getValues();

    let responseRow = null;
    for (let i = 1; i < rData.length; i++) {
      if (String(rData[i][0]) === String(responseId)) {
        responseRow = rData[i];
        break;
      }
    }
    if (!responseRow) return { success: false, message: 'Data siswa tidak ditemukan.' };

    const examID = responseRow[2];
    let answers = {};
    try {
      answers = JSON.parse(responseRow[3] || '{}');
    } catch (e) {
      answers = { _raw: responseRow[3] || '{}' };
      console.warn('Parsing AnswersJSON gagal, gunakan data mentah:', e.message);
    }

    const qSheet = SS.getSheetByName('Questions');
    const qData = qSheet.getDataRange().getValues();

    const existingPerQuestionScores = answers['_essay_scores_per_question'] || {};
    const essays = [];

    for (let i = 1; i < qData.length; i++) {
      const row = qData[i];
      if (String(row[1]) === String(examID) && row[2] === 'Esai') {
        const qId = row[0];
        const weight = (row[8] !== undefined && row[8] !== null && row[8] !== '' && !isNaN(parseFloat(row[8])))
          ? parseFloat(row[8]) : 10;

        let rawAnswer = answers[qId];
        let answerText = '(Tidak dijawab)';

        if (rawAnswer !== undefined && rawAnswer !== null) {
          if (typeof rawAnswer === 'string') {
            answerText = rawAnswer.trim() !== '' ? rawAnswer : '(Tidak dijawab)';
          } else if (typeof rawAnswer === 'object') {
            if (rawAnswer.hasOwnProperty('answer')) {
              answerText = String(rawAnswer.answer).trim() !== '' ? rawAnswer.answer : '(Tidak dijawab)';
            } else {
              answerText = JSON.stringify(rawAnswer);
            }
          }
        }

        answerText = answerText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        const existingScore = existingPerQuestionScores[qId] !== undefined
          ? parseFloat(existingPerQuestionScores[qId]) : 0;

        essays.push({
          id: qId,
          question: row[3],
          answer: answerText,
          maxPoint: weight,
          existingScore: existingScore
        });
      }
    }

    let savedTotalScore = 0;
    if (Object.keys(existingPerQuestionScores).length > 0) {
      savedTotalScore = Object.values(existingPerQuestionScores)
        .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
      savedTotalScore = Math.round(savedTotalScore * 100) / 100;
    } else if (answers['_manual_essay_score'] !== undefined && answers['_manual_essay_score'] !== null) {
      savedTotalScore = parseFloat(answers['_manual_essay_score']) || 0;
    }

    return {
      success: true,
      data: essays,
      studentName: responseRow[1],
      existingScore: savedTotalScore
    };
  } catch (e) {
    Logger.log('Error di getEssayData: ' + e.toString());
    return { success: false, message: 'Gagal memuat data esai: ' + e.message };
  }
}

function saveEssayGrade(responseId, perQuestionScores, requestorID, requestorToken) {
  const rSheet = SS.getSheetByName('Responses');
  const rData = rSheet.getDataRange().getValues();
  const qSheet = SS.getSheetByName('Questions');
  const qData = qSheet.getDataRange().getValues();
  
  let rowIndex = -1;
  let examID = '';
  let respUserID = '';
  let answers = {};
  
  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][0]) === String(responseId)) {
      rowIndex = i + 1;
      respUserID = rData[i][1];
      examID = rData[i][2];
      try {
        answers = JSON.parse(rData[i][3] || '{}');
      } catch (e) {
        answers = {};
      }
      break;
    }
  }
  
  if (rowIndex === -1) return { success: false, message: 'Data respon tidak ditemukan.' };

  if (!perQuestionScores || typeof perQuestionScores !== 'object' || Array.isArray(perQuestionScores)) {
    return { success: false, message: 'Format poin tidak valid. Kirim object {qid: score}.' };
  }

  const essayWeights = {};
  let maxEssayPoints = 0;
  qData.forEach((row, i) => {
    if (i > 0 && String(row[1]) === String(examID) && row[2] === 'Esai') {
      const w = (row[8] !== undefined && row[8] !== null && row[8] !== '' && !isNaN(parseFloat(row[8])))
        ? parseFloat(row[8]) : 10;
      essayWeights[row[0]] = w;
      maxEssayPoints += w;
    }
  });

  for (const qid in perQuestionScores) {
    const score = parseFloat(perQuestionScores[qid]) || 0;
    const maxW = essayWeights[qid] !== undefined ? essayWeights[qid] : 10;
    if (score < 0 || score > maxW) {
      return {
        success: false,
        message: `Poin untuk soal (${qid}) sebesar ${score} melebihi bobot maksimal (${maxW}).`
      };
    }
  }

  let totalEssayScore = 0;
  for (const qid in perQuestionScores) {
    totalEssayScore += parseFloat(perQuestionScores[qid]) || 0;
  }
  totalEssayScore = Math.round(totalEssayScore * 100) / 100;

  answers['_essay_scores_per_question'] = perQuestionScores;
  answers['_manual_essay_score'] = totalEssayScore;

  function extractAnswer(rawAns) {
    if (rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns) && rawAns.hasOwnProperty('answer')) {
      return rawAns.answer;
    }
    return rawAns;
  }

  function convertLetterKey(keyArr, optionsArr) {
    const mapHuruf = ['A', 'B', 'C', 'D', 'E'];
    return keyArr.map(k => {
      const cleanK = String(k).trim().toUpperCase();
      const idx = mapHuruf.indexOf(cleanK);
      if (idx !== -1 && optionsArr && optionsArr[idx]) {
        return String(optionsArr[idx]).trim().toLowerCase();
      }
      return cleanK.toLowerCase();
    });
  }

  function normalizeToMap(rawData) {
    let mapData = {};
    if (!rawData) return mapData;
    let parsed = rawData;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch(e) { return {}; }
    }
    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        const qKey = String(item.q || item.question || item.key || '').replace(/[\s"'{}]/g, '').toLowerCase().trim();
        const aVal = String(item.a || item.answer || item.value || '').replace(/[\s"'{}]/g, '').toLowerCase().trim();
        if (qKey) mapData[qKey] = aVal;
      });
    } else if (typeof parsed === 'object') {
      for (let k in parsed) {
        const cleanK = String(k).replace(/[\s"'{}]/g, '').toLowerCase().trim();
        const cleanV = String(parsed[k]).replace(/[\s"'{}]/g, '').toLowerCase().trim();
        mapData[cleanK] = cleanV;
      }
    }
    return mapData;
  }

  let totalPoints = 0;
  let maxPoints = 0;

  qData.forEach((row, i) => {
    if (i > 0 && String(row[1]) === String(examID)) {
      const qid     = row[0];
      const type    = row[2];
      const optRaw  = row[5];
      const keyRaw  = row[6];
      const weight = (row[8] !== '' && row[8] !== null && row[8] !== undefined && !isNaN(parseFloat(row[8]))) ? parseFloat(row[8]) : 10;
      maxPoints += weight;

      const userAns = extractAnswer(answers[qid]);

      if (type === 'Esai') {
        if (perQuestionScores[qid] !== undefined) {
          totalPoints += parseFloat(perQuestionScores[qid]) || 0;
        } else if (answers['_essay_scores_per_question'] && answers['_essay_scores_per_question'][qid] !== undefined) {
          totalPoints += parseFloat(answers['_essay_scores_per_question'][qid]) || 0;
        }
        return;
      }

      if (type === 'PG') {
        const cleanUser = String(userAns || '').trim().toLowerCase();
        const cleanKey  = String(keyRaw || '').trim();
        const mapHuruf  = ['A', 'B', 'C', 'D', 'E'];
        const keyIndex  = mapHuruf.indexOf(cleanKey.toUpperCase());
        let isCorrect   = false;
        if (keyIndex !== -1) {
          let opts = [];
          try { opts = JSON.parse(optRaw); } catch(e) {}
          if (opts[keyIndex]) {
            const txt = String(opts[keyIndex]).trim().toLowerCase();
            if (cleanUser === txt && txt !== '') isCorrect = true;
          }
        } else {
          if (cleanUser === cleanKey.toLowerCase()) isCorrect = true;
        }
        if (isCorrect) totalPoints += weight;
      }

      else if (type === 'PG_KOMPLEKS') {
        let keyArr = [], ansArr = [], optionsArr = [];
        try { keyArr = JSON.parse(keyRaw); }
        catch(e) { keyArr = String(keyRaw || '').split(',').map(s => s.trim()).filter(s => s); }
        try { optionsArr = JSON.parse(optRaw); } catch(e) { optionsArr = []; }
        if (Array.isArray(userAns)) { ansArr = userAns; }
        else { try { ansArr = JSON.parse(userAns); } catch(e) { ansArr = String(userAns || '').split(',').map(s => s.trim()).filter(s => s); } }
        const kNorm = convertLetterKey(keyArr, optionsArr);
        const uNorm = ansArr.map(s => String(s).trim().toLowerCase());
        let match = 0, wrong = 0;
        uNorm.forEach(u => { if (kNorm.includes(u)) match++; else wrong++; });
        if (wrong === 0 && match > 0) { totalPoints += (match / kNorm.length) * weight; }
      }

      else if (type === 'BS') {
        // BUG FIX RS-2 (KRITIS): Scoring BS di saveEssayGrade menggunakan for..in pada kObj
        // yang key-nya bisa berupa teks pernyataan, sementara uObj berisi key index numerik.
        // Perbaiki dengan iterasi melalui array statements (optRaw) sebagai jembatan.
        let bsStmts = [];
        try { bsStmts = JSON.parse(optRaw || '[]'); } catch(e) { bsStmts = []; }
        if (!Array.isArray(bsStmts)) bsStmts = [];

        let kObjBs = {};
        try { kObjBs = JSON.parse(keyRaw || '{}'); } catch(e) {}

        let uObjBs = {};
        if (typeof userAns === 'object' && userAns !== null && !Array.isArray(userAns)) {
          uObjBs = userAns;
        } else {
          try { uObjBs = JSON.parse(userAns); } catch(e) {}
        }
        if (!uObjBs || typeof uObjBs !== 'object') uObjBs = {};

        const bsTotal = bsStmts.length > 0 ? bsStmts.length : Object.keys(kObjBs).length;
        if (bsTotal > 0 && bsStmts.length > 0) {
          let bsMatch = 0;
          bsStmts.forEach(function(stmt, idx) {
            const expectedByText = kObjBs[stmt];
            const expectedByIdx  = kObjBs[String(idx)];
            const expected = expectedByText || expectedByIdx;
            if (!expected) return;

            const studentByIdx  = uObjBs[String(idx)];
            const studentByText = uObjBs[stmt];
            const studentAns = studentByIdx || studentByText || '';

            const ev = String(expected).trim().toLowerCase();
            const uv = String(studentAns).trim().toLowerCase();
            if (ev === uv || (ev === 'benar' && uv === 'sesuai') || (ev === 'salah' && uv === 'tidak sesuai')) {
              bsMatch++;
            }
          });
          totalPoints += (bsMatch / bsTotal) * weight;
        } else if (bsTotal > 0) {
          // Fallback legacy: tidak ada array statements, gunakan perulangan key
          let bsMatch = 0, count = 0;
          for (let k in kObjBs) {
            count++;
            const kv = String(kObjBs[k]).trim().toLowerCase();
            const uv = String(uObjBs[k] || '').trim().toLowerCase();
            if (kv === uv || (kv === 'benar' && uv === 'sesuai') || (kv === 'salah' && uv === 'tidak sesuai')) bsMatch++;
          }
          if (count > 0) totalPoints += (bsMatch / count) * weight;
        }
      }

      else if (type === 'JODOH' || type === 'MATCHING') {
        let allPairsRaw = keyRaw;
        if (!allPairsRaw || allPairsRaw === '') allPairsRaw = optRaw;
        let allPairs = [];
        try { allPairs = JSON.parse(allPairsRaw); } catch(e) { allPairs = []; }
        const realPairs = Array.isArray(allPairs)
          ? allPairs.filter(pair => pair.q && String(pair.q).trim() !== '')
          : [];
        const stuMap = normalizeToMap(userAns);
        const totalItems = realPairs.length;
        if (totalItems > 0) {
          let matchCount = 0;
          realPairs.forEach(pair => {
            const kQ = String(pair.q).replace(/[\s"'{}]/g, '').toLowerCase().trim();
            const kA = String(pair.a || '').replace(/[\s"'{}]/g, '').toLowerCase().trim();
            if (stuMap[kQ] === kA) matchCount++;
          });
          totalPoints += (matchCount / totalItems) * weight;
        }
      }
    }
  });

  const finalScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 10000) / 100 : 0;

  rSheet.getRange(rowIndex, 4).setValue(JSON.stringify(answers));
  rSheet.getRange(rowIndex, 5).setValue(finalScore);

  // Log action (best-effort, doesn't block on failure)
  try {
    if (requestorID) {
      const actorName = getActorName(requestorID);
      const numScored = Object.keys(perQuestionScores || {}).length;
      addAdminLog(requestorID, actorName, 'GRADE_ESSAY', 'Response', responseId,
                  'Penilaian esai disimpan untuk respon '+responseId+' (ujian '+(examID || '-')+', '+numScored+' soal, total esai: '+totalEssayScore+'/'+maxEssayPoints+', nilai akhir: '+finalScore+').');
    }
  } catch(e) { Logger.log('saveEssayGrade log error: '+e.message); }

  return { 
    success: true, 
    message: 'Nilai berhasil disimpan.', 
    finalScore: finalScore,
    essayScore: totalEssayScore,
    maxEssayPoints: maxEssayPoints
  };
}

function saveImportedQuestions(examID, questionsData, requestorID, requestorToken) {
  // FIX: Tambahkan autentikasi — fungsi ini sebelumnya tidak memvalidasi sesi sama sekali,
  // sehingga siapapun bisa menyuntikkan soal tanpa login. Sekarang wajib ada sesi valid.
  var role = resolveRequestorRole_(requestorID, requestorToken);
  if (!role) return { success: false, message: 'Sesi tidak valid. Silakan login ulang.' };

  // Guard periode input soal (sama seperti addQuestion dan updateQuestion)
  var periodCheck = enforceInputPeriod_(role, examID);
  if (!periodCheck.ok) return { success: false, message: periodCheck.message };

  const sheet = SS.getSheetByName('Questions');
  if (!examID) return { success: false, message: 'ID Ujian tidak valid.' };
  let count = 0;

  try {
    let typeConfig = null;
    const exSheet = SS.getSheetByName('Exams');
    const exData  = exSheet.getDataRange().getValues();
    for (let k = 1; k < exData.length; k++) {
      if (String(exData[k][0]) === String(examID)) {
        const tcRaw = exData[k][9];
        if (tcRaw) { try { typeConfig = JSON.parse(tcRaw); } catch(e) {} }
        break;
      }
    }

    const existingCount = { PG:0, PG_KOMPLEKS:0, BS:0, JODOH:0, Esai:0 };
    if (typeConfig) {
      const qData = SS.getSheetByName('Questions').getDataRange().getValues();
      qData.forEach((r, i) => {
        if (i > 0 && String(r[1]) === String(examID) && existingCount.hasOwnProperty(r[2])) {
          existingCount[r[2]]++;
        }
      });
    }

    const addedCount = { PG:0, PG_KOMPLEKS:0, BS:0, JODOH:0, Esai:0 };
    const labels = { PG:'Pilihan Ganda', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai' };

    questionsData.forEach(q => {
      const id = 'Q-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
      let opts = '[]';
      try {
        if (typeof q.options === 'object') opts = JSON.stringify(q.options);
        else if (typeof q.options === 'string') opts = q.options;
      } catch (e) { opts = '[]'; }
      
      const type      = q.type || 'PG';
      const content   = q.content || '-';
      const image     = q.image || '';
      const correct   = q.correct || '';
      const isRequired = q.isRequired ? String(q.isRequired).toUpperCase() : 'FALSE';
      const point     = q.point ? parseInt(q.point) || 10 : 10;
      const rubric    = q.rubric || '';
      const minChar   = (type === 'Esai' && q.minChar) ? (parseInt(q.minChar) || 0) : 0;
      const minCharEnabled = (type === 'Esai' && (q.minCharEnabled === true || q.minCharEnabled === 'true')) ? 'TRUE' : 'FALSE';

      if (typeConfig) {
        const cfg   = typeConfig[type];
        const label = labels[type] || type;

        if (cfg && cfg.enabled === false) {
          Logger.log('Dilewati (diblokir): ' + type);
          return;
        }

        const max = cfg ? (parseInt(cfg.max) || 0) : 0;
        if (max > 0) {
          const currentTotal = (existingCount[type] || 0) + (addedCount[type] || 0);
          if (currentTotal >= max) {
            Logger.log('Dilewati (penuh): ' + type + ' ' + currentTotal + '/' + max);
            return;
          }
        }
      }

      sheet.appendRow([id, examID, type, content, image, opts, correct, isRequired, point, rubric, minChar, minCharEnabled, q.audio || '']);
      if (addedCount.hasOwnProperty(type)) addedCount[type]++;
      count++;
    });

    return { success: true, count: count };
    
  } catch (e) {
    return { success: false, message: 'Error Server: ' + e.toString() };
  }
}

function resetStudentExam(responseId, requestorID, requestorToken) {
  const userSheet=SS.getSheetByName('Users');
  const userRows =userSheet.getDataRange().getValues();
  let requestorRole=null, isAuthenticated=false;
  for (let i=1;i<userRows.length;i++) {
    const row=userRows[i];
    if (String(row[0])===String(requestorID)&&String(row[5])===String(requestorToken)) { requestorRole=row[3]; isAuthenticated=true; break; }
  }
  if (!isAuthenticated)                                                          throw new Error("Akses Ditolak: Sesi tidak valid.");
  if (requestorRole!=='Admin'&&requestorRole!=='Guru'&&requestorRole!=='Pengawas') throw new Error("Akses Ditolak: Anda tidak memiliki izin.");
 
  const sheet=SS.getSheetByName('Responses');
  const data =sheet.getDataRange().getValues();
  for (let i=data.length-1;i>=1;i--) {
    if (String(data[i][0])===String(responseId)) {
      const studentID  = data[i][1];
      const examID     = data[i][2];
      sheet.deleteRow(i+1);
      const actorName=getActorName(requestorID);
      addAdminLog(requestorID, actorName, 'RESET_STUDENT_EXAM', 'Response', responseId, `Reset ujian siswa ID ${studentID} pada ujian ${examID}.`);
      return { success:true, message:'Data ujian berhasil di-reset. Siswa dapat login kembali.' };
    }
  }
  return { success:false, message:'Data respon tidak ditemukan atau sudah terhapus.' };
}

function getQuestionProgressData(userID, token) {
  try {
    const userSheet=SS.getSheetByName('Users');
    const userData =userSheet.getDataRange().getValues();
    let userRole=null,userClass=null;
    for (let i=1;i<userData.length;i++) {
      if (String(userData[i][0])===String(userID)&&String(userData[i][5])===String(token)) { userRole=String(userData[i][3]); userClass=String(userData[i][4]); break; }
    }
    if (!userRole) return { success:false, message:'Sesi tidak valid.' };
    if (userRole!=='Admin'&&userRole!=='Guru') return { success:false, message:'Akses ditolak.' };
 
    const examSheet=SS.getSheetByName('Exams');
    const examData =examSheet.getDataRange().getValues();
    const qSheet   =SS.getSheetByName('Questions');
    const qData    =qSheet.getDataRange().getValues();
 
    const qCountMap={};
    for (let j=1;j<qData.length;j++) {
      const eid=String(qData[j][1]); const type=String(qData[j][2]);
      if (!qCountMap[eid]) qCountMap[eid]={PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0,total:0};
      if (qCountMap[eid].hasOwnProperty(type)) qCountMap[eid][type]++;
      qCountMap[eid].total++;
    }
 
    const result=[];
    for (let i=1;i<examData.length;i++) {
      const examId=String(examData[i][0]),subject=String(examData[i][1]),kelas=String(examData[i][2]),status=String(examData[i][6]||'Non-Aktif');
      if (userRole==='Guru') {
        const assignments=userClass.split(',');
        const isMatch=assignments.some(rule=>{ const parts=rule.trim().split(':'); if (parts.length<2) return false; return subject.toLowerCase().includes(parts[0].toLowerCase().trim())&&kelas.toLowerCase().includes(parts[1].toLowerCase().trim()); });
        if (!isMatch) continue;
      }
      const counts=qCountMap[examId]||{PG:0,PG_KOMPLEKS:0,BS:0,JODOH:0,Esai:0,total:0};
      let typeConfig=null;
      const tcRaw=examData[i][9]||null;
      if (tcRaw) { try { typeConfig=JSON.parse(tcRaw); } catch(e) {} }
      result.push({ examId, subject, kelas, status, counts, typeConfig });
    }
    return { success:true, data:result };
  } catch(e) { return { success:false, message:e.message }; }
}

function getMasterData() {
  try {
    const sheet=SS.getSheetByName('Master_Data');
    if (!sheet) return { classes:[],subjects:[] };
    const data=sheet.getDataRange().getValues();
    const lastRow=sheet.getLastRow();
    let classes=[],subjects=[];
    for (let i=1;i<lastRow;i++) {
      if (data[i][0]&&String(data[i][0]).trim()!=='') classes.push(String(data[i][0]).trim());
      if (data[i][1]&&String(data[i][1]).trim()!=='') subjects.push(String(data[i][1]).trim());
    }
    return { classes:[...new Set(classes)].sort(), subjects:[...new Set(subjects)].sort() };
  } catch(e) { return { classes:[],subjects:[] }; }
}
 
function saveMasterData(data, requestorID, requestorToken) {
  try {
    verifyAdminAccess(requestorID, requestorToken);
    const sheet=SS.getSheetByName('Master_Data');
    if (!sheet) throw new Error('Sheet "Master_Data" tidak ditemukan.');
    const classes=data.classes||[],subjects=data.subjects||[];
    if (sheet.getLastRow()>1) sheet.deleteRows(2,sheet.getLastRow()-1);
    const maxLen=Math.max(classes.length,subjects.length);
    const newValues=[];
    for (let i=0;i<maxLen;i++) newValues.push([classes[i]||'',subjects[i]||'']);
    if (newValues.length>0) sheet.getRange(2,1,newValues.length,2).setValues(newValues);
    return { success:true, message:'Data Master berhasil diperbarui.' };
  } catch(e) { return { success:false, message:e.message }; }
}

function getUserList(requestorID, requestorToken) {
  const uSheet=SS.getSheetByName('Users');
  const uData =uSheet.getDataRange().getValues();
  let requestorRole=null, guruClasses=[];
  for (let i=1;i<uData.length;i++) {
    if (String(uData[i][0])===String(requestorID)&&String(uData[i][5])===String(requestorToken)) {
      requestorRole=String(uData[i][3]).trim();
      const isActive=String(uData[i][6]).toUpperCase()==='TRUE';
      if (!isActive) throw new Error('Akses Ditolak: Akun Anda dinonaktifkan.');
      if (requestorRole==='Guru') { const raw=String(uData[i][4]||''); raw.split(',').forEach(item=>{ const parts=item.split(':'); if (parts.length>=2) guruClasses.push(parts[1].trim().toLowerCase()); }); }
      break;
    }
  }
  if (!requestorRole) throw new Error('Akses Ditolak: Sesi tidak valid atau kadaluarsa.');
  if (requestorRole!=='Admin'&&requestorRole!=='Guru') throw new Error('Akses Ditolak: Anda tidak memiliki izin.');

  const extCredMap = (requestorRole === 'Admin') ? _getAllExternalCredentials_() : {};

  const users=[];
  for (let i=1;i<uData.length;i++) {
    const row=uData[i];
    if (!row[0]) continue;
    const role=String(row[3]).trim(), kelas=String(row[4]||'').trim();
    if (requestorRole==='Guru') { if (role!=='Siswa') continue; if (!guruClasses.includes(kelas.toLowerCase())) continue; }
    let displayPwd = String(row[2] || '');
    if (role === 'Admin' || role === 'Guru') {
      const ext = extCredMap[String(row[0]).toLowerCase()];
      displayPwd = ext ? String(ext.password || '') : '';
    }
    users.push({ id:row[0],username:row[1],password:displayPwd,role,class:kelas,isActive:row[6] });
  }
  return users;
}

function createUser(form, requestorID, requestorToken) {
  try {
    verifyAdminAccess(requestorID, requestorToken);
    const sheet=SS.getSheetByName('Users');
    const data =sheet.getDataRange().getValues();
    if (!form.userId||!form.username||!form.password) return { success:false, message:'Data tidak lengkap!' };
    const idExists=data.some(row=>String(row[0])===String(form.userId));
    if (idExists) return { success:false, message:'User ID sudah terdaftar!' };

    const role = String(form.role || '').trim();
    const isExternalRole = (role === 'Admin' || role === 'Guru');

    const internalPass = isExternalRole ? '' : "'"+form.password;
    sheet.appendRow(["'"+form.userId, form.username, internalPass, role, form.class||'-','','TRUE']);

    if (isExternalRole) {
      try {
        _upsertExternalCredential_(form.userId, form.password);
      } catch(extErr) {
        const newRow = sheet.getLastRow();
        sheet.deleteRow(newRow);
        return { success:false, message:'Gagal menyimpan kredensial eksternal: ' + extErr.message };
      }
    }

    const actorName=getActorName(requestorID);
    addAdminLog(requestorID, actorName, 'CREATE_USER', 'User', form.userId, `User baru dibuat: "${form.username}" (${role}, ${form.class||'-'}).`);
    return { success:true };
  } catch(e) { return { success:false, message:e.message }; }
}

function updateUser(form, requestorID, requestorToken) {
  try {
    const uSheet=SS.getSheetByName('Users');
    const uData =uSheet.getDataRange().getValues();
    let requestorRole=null, isAuth=false;
    for (let i=1;i<uData.length;i++) {
      if (String(uData[i][0])===String(requestorID)&&String(uData[i][5])===String(requestorToken)) { requestorRole=String(uData[i][3]).trim(); isAuth=true; break; }
    }
    if (!isAuth) return { success:false, message:'Akses Ditolak: Sesi tidak valid.' };
    if (requestorRole!=='Admin'&&requestorRole!=='Guru') return { success:false, message:'Akses Ditolak: Anda tidak memiliki izin.' };
 
    const sheet=SS.getSheetByName('Users');
    const data =sheet.getDataRange().getValues();
    for (let i=1;i<data.length;i++) {
      if (String(data[i][0])===String(form.userId)) {
        const oldRole = String(data[i][3] || '').trim();
        const newRole = String(form.role || '').trim();
        const isExternalRole = (newRole === 'Admin' || newRole === 'Guru');
        const wasExternalRole = (oldRole === 'Admin' || oldRole === 'Guru');

        sheet.getRange(i+1,2).setValue(form.username);
        sheet.getRange(i+1,3).setValue(isExternalRole ? '' : "'"+form.password);
        sheet.getRange(i+1,4).setValue(newRole);
        sheet.getRange(i+1,5).setValue(form.class);

        try {
          if (isExternalRole) {
            _upsertExternalCredential_(form.userId, form.password);
          } else if (wasExternalRole && !isExternalRole) {
            _removeExternalCredential_(form.userId);
          }
        } catch(extErr) {
          return { success:false, message:'Gagal sinkron kredensial eksternal: ' + extErr.message };
        }

        const actorName=getActorName(requestorID);
        addAdminLog(requestorID, actorName, 'UPDATE_USER', 'User', form.userId, `User diperbarui: "${form.username}" (${newRole}, ${form.class}).`);
        return { success:true };
      }
    }
    return { success:false, message:'User tidak ditemukan.' };
  } catch(e) { return { success:false, message:e.message }; }
}

function deleteUser(targetUserId, requestorID, requestorToken) {
  try {
    verifyAdminAccess(requestorID, requestorToken);
    const sheet=SS.getSheetByName('Users');
    const data =sheet.getDataRange().getValues();
    let rowToDelete=-1, targetName='', targetRole='';
    for (let i=1;i<data.length;i++) {
      if (String(data[i][0])===String(targetUserId)) {
        rowToDelete=i+1;
        targetName=data[i][1];
        targetRole=String(data[i][3] || '').trim();
        break;
      }
    }
    if (rowToDelete>0) {
      sheet.deleteRow(rowToDelete);
      if (targetRole === 'Admin' || targetRole === 'Guru') {
        try { _removeExternalCredential_(targetUserId); } catch(e) {}
      }
      const actorName=getActorName(requestorID);
      addAdminLog(requestorID, actorName, 'DELETE_USER', 'User', targetUserId, `User dihapus: "${targetName}".`);
      return { success:true, message:'User berhasil dihapus.' };
    } else { return { success:false, message:'User target tidak ditemukan.' }; }
  } catch(e) { return { success:false, message:e.message }; }
}

function toggleUserStatus(userId, currentStatus) {
  const sheet=SS.getSheetByName('Users');
  const data =sheet.getDataRange().getValues();
  const isCurrentlyActive=String(currentStatus).toUpperCase().trim()==='TRUE';
  const newStatus=isCurrentlyActive?'FALSE':'TRUE';
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0])===String(userId)) { sheet.getRange(i+1,7).setValue(newStatus); return { success:true, newStatus }; }
  }
  return { success:false, message:'User tidak ditemukan.' };
}

function importUsersBulk(usersData) {
  const sheet=SS.getSheetByName('Users');
  const existingData=sheet.getDataRange().getValues();
  const existingIds=existingData.map(r=>String(r[0]).replace(/^'/,''));
  const existingUsernames=existingData.map(r=>String(r[1]).toLowerCase());
  let successCount=0, failCount=0, skippedDetails=[];
  usersData.forEach(user=>{
    const rawId=user.id?String(user.id).trim():'';
    const username=String(user.username||'').trim();
    const role=user.role||'Siswa';
    const password=String(user.password||'123456');
    const kelas=user.class||'-';
    if (!username) { failCount++; return; }
    if (rawId&&existingIds.includes(rawId)) { failCount++; skippedDetails.push(`ID ${rawId} sudah ada`); return; }
    if (existingUsernames.includes(username.toLowerCase())) { failCount++; skippedDetails.push(`Username ${username} sudah ada`); return; }
    const finalIdRaw = rawId ? rawId : `${(role==='Siswa'?'SIS':'GURU')}-${Date.now().toString().slice(-6)+Math.floor(Math.random()*100)}`;
    const finalId    = `'${finalIdRaw}`;
    const isExternalRole = (role === 'Admin' || role === 'Guru');
    const finalPass = isExternalRole ? '' : `'${password}`;
    sheet.appendRow([finalId,username,finalPass,role,kelas,'','TRUE']);
    if (isExternalRole) {
      try { _upsertExternalCredential_(finalIdRaw, password); }
      catch(extErr) { skippedDetails.push(`Gagal sync eksternal ${finalIdRaw}: ${extErr.message}`); }
    }
    if (rawId) existingIds.push(rawId);
    existingUsernames.push(username.toLowerCase());
    successCount++;
  });
  return { success:true, imported:successCount, failed:failCount, details:skippedDetails.slice(0,5) };
}

function generateExamRecapPDF(examID, userID, token, sortOrder) {
  // BUG FIX 1: Bungkus seluruh fungsi dengan try-catch agar exception dari
  // getExamResults (sesi invalid, akses siswa, dll.) dikembalikan sebagai
  // { success:false } bukan exception mentah yang memicu FailureHandler di client.
  try {
    const examSheet = SS.getSheetByName('Exams');
    const examRows = examSheet.getDataRange().getValues();
    let examInfo = null;

    for (let i = 1; i < examRows.length; i++) {
      if (String(examRows[i][0]) === String(examID)) {
        examInfo = {
          subject: examRows[i][1],
          class:   examRows[i][2],
          date:    examRows[i][3],
          duration:examRows[i][4]
        };
        break;
      }
    }

    if (!examInfo) return { success: false, message: 'Data Ujian tidak ditemukan.' };

    const results = getExamResults(examID, userID, token);

    // BUG FIX 2: score dari sheet bisa berupa string/number/empty-string.
    // Normalkan ke number terlebih dahulu agar perbandingan numerik benar.
    // BUG FIX 3: Tambahkan null-guard pada name agar localeCompare tidak throw
    // TypeError ketika name undefined/null (mis. siswa 'Unknown User' tanpa nama).
    const toNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    const toName = v => String(v || '');

    switch (sortOrder) {
      case 'score_asc':
        results.sort((a, b) => toNum(a.score) - toNum(b.score));
        break;
      case 'score_desc':
        results.sort((a, b) => toNum(b.score) - toNum(a.score));
        break;
      case 'name_asc':
        results.sort((a, b) => toName(a.name).localeCompare(toName(b.name), 'id', { sensitivity: 'base' }));
        break;
      case 'name_desc':
        results.sort((a, b) => toName(b.name).localeCompare(toName(a.name), 'id', { sensitivity: 'base' }));
        break;
      // 'default' — biarkan urutan asli dari getExamResults
    }

    const title    = "REKAPITULASI HASIL UJIAN";
    const subTitle = `MATA PELAJARAN: ${examInfo.subject.toUpperCase()} | KELAS: ${examInfo.class}`;
    const htmlContent = generateExamHTML(results, title, subTitle, examInfo);

    const blob    = Utilities.newBlob(htmlContent, 'text/html', 'document.html');
    const pdfBlob = blob.getAs('application/pdf')
                        .setName(`REKAP_NILAI_${examInfo.class}_${examInfo.subject}.pdf`);

    const folders = DriveApp.getFoldersByName("SIPADU_REPORTS");
    let targetFolder;
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = DriveApp.createFolder("SIPADU_REPORTS");
    }

    const file = targetFolder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { success: true, url: 'https://drive.google.com/uc?export=download&id=' + file.getId() };

  } catch (e) {
    // Kembalikan pesan error yang ramah ke client (withSuccessHandler),
    // bukan melempar exception ke withFailureHandler.
    Logger.log('generateExamRecapPDF error: ' + e.message);
    return { success: false, message: e.message || 'Terjadi kesalahan saat membuat Rekap PDF.' };
  }
}

function imageUrlToBase64(url) {
  try {
    const response = UrlFetchApp.fetch(url);
    const blob = response.getBlob();
    const bytes = blob.getBytes();
    const base64 = Utilities.base64Encode(bytes);
    return "data:" + blob.getContentType() + ";base64," + base64;
  } catch (e) {
    Logger.log("Gagal memuat gambar: " + e);
    return "";
  }
}

function getKopConfig() {
  const cfgSheet = SS.getSheetByName('Konfigurasi');
  const kop = {
    logoUrl:      'https://res.cloudinary.com/dp8rda8g4/image/upload/v1772094330/MTs%20Nurul%20Falah/Update_Logo_MTs_pqfzmc.png',
    baris1:       'PEMERINTAH KABUPATEN MUSI RAWAS',
    baris2:       'YAYASAN PENDIDIKAN ISLAM TERAWAS DARUSSALAM',
    baris3:       'MADRASAH TSANAWIYAH NURUL FALAH',
    alamat:       'Jl. Jambi Lama RT. 004 Kelurahan Terawas Kecamatan STL. Ulu Terawas 30771',
    kontak:       'Telp. 0831 6742 8682 | Email: mtssnurulfalah2016@gmail.com',
    kepala_nama:  '......................................',
    kepala_nip:   '......................................'
  };
  if (!cfgSheet) return kop;
  const data = cfgSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    map[String(data[i][0]).trim()] = String(data[i][1] || '').trim();
  }
  if (map['pdf_kop_logo']        && map['pdf_kop_logo'].length > 5)   kop.logoUrl     = map['pdf_kop_logo'];
  if (map['pdf_kop_baris1']      && map['pdf_kop_baris1'].length > 0) kop.baris1      = map['pdf_kop_baris1'];
  if (map['pdf_kop_baris2']      && map['pdf_kop_baris2'].length > 0) kop.baris2      = map['pdf_kop_baris2'];
  if (map['pdf_kop_baris3']      && map['pdf_kop_baris3'].length > 0) kop.baris3      = map['pdf_kop_baris3'];
  if (map['pdf_kop_alamat']      && map['pdf_kop_alamat'].length > 0) kop.alamat      = map['pdf_kop_alamat'];
  if (map['pdf_kop_kontak']      && map['pdf_kop_kontak'].length > 0) kop.kontak      = map['pdf_kop_kontak'];
  if (map['pdf_kop_kepala_nama'] && map['pdf_kop_kepala_nama'].length > 0) kop.kepala_nama = map['pdf_kop_kepala_nama'];
  if (map['pdf_kop_kepala_nip']  && map['pdf_kop_kepala_nip'].length > 0)  kop.kepala_nip  = map['pdf_kop_kepala_nip'];
  return kop;
}

function generateExamHTML(data, title, subTitle, info) {
  const kop = getKopConfig();
  const logoKiri = imageUrlToBase64(kop.logoUrl);

  const txtBaris1 = kop.baris1;
  const txtBaris2 = kop.baris2;
  const txtBaris3 = kop.baris3;
  const txtAlamat = kop.alamat;
  const txtKontak = kop.kontak;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy");

  let tableRows = '';
  data.forEach((d, i) => {
    // BUG FIX 4: score dari sheet bisa berupa string/empty-string/null.
    // Konversi ke number terlebih dahulu agar perbandingan < 50 dan >= 75 benar.
    const scoreNum = parseFloat(d.score);
    const scoreDisplay = isNaN(scoreNum) ? (d.score || '-') : scoreNum;
    let scoreColor = '#000';
    if (!isNaN(scoreNum)) {
      if (scoreNum < 50)      scoreColor = '#dc2626';
      else if (scoreNum >= 75) scoreColor = '#16a34a';
    }

    tableRows += `
      <tr>
        <td style="text-align:center">${i+1}</td>
        <td style="text-align:center">${d.studentId}</td>
        <td>${d.name}</td>
        <td style="text-align:center">${d.class}</td>
        <td style="text-align:center">${d.submitTime}</td>
        <td style="text-align:center">${d.status}</td>
        <td style="text-align:center; font-weight:bold; color:${scoreColor}">${scoreDisplay}</td>
      </tr>`;
  });

  return `<!DOCTYPE html><html><head><style>
    @page { size: A4; margin: 9mm; }
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; color: #333; }
    .kop-surat { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid black; padding-bottom: 10px; margin-bottom: 20px; }
    .kop-left { width: 15%; text-align: center; }
    .kop-center { width: 85%; text-align: center; }
    .kop-img { height: 80px; width: auto; }
    .kop-text h2 { margin: 2px; font-size: 18px; text-transform: uppercase; font-weight: bold; }
    .kop-text h3 { margin: 2px; font-size: 14px; text-transform: uppercase; font-weight: bold; }
    .kop-text p { margin: 1px; font-size: 12px; font-style: italic;}
    .doc-title { text-align: center; margin-bottom: 20px; }
    .doc-title h1 { font-size: 14px; margin: 5px 0; text-transform: uppercase; text-decoration: underline; }
    .doc-title p { font-size: 12px; margin: 0; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #333; padding: 6px 8px; vertical-align: middle; }
    th { background-color: #f3f4f6; font-weight: bold; text-align: center; height: 30px; text-transform: uppercase; font-size: 10px; }
    tr:nth-child(even) { background-color: #f9fafb; }
    .signature-section { margin-top: 40px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
    .sig-box { width: 200px; text-align: center; }
    .sig-space { height: 70px; }
    .sig-name { font-weight: bold; text-decoration: underline; }
  </style></head><body>
    <div class="kop-surat">
      <div class="kop-left"><img src="${logoKiri}" class="kop-img"></div>
      <div class="kop-center kop-text">
        <h2>${txtBaris1}</h2><h3>${txtBaris2}</h3><h2>${txtBaris3}</h2><p>${txtAlamat}<br>${txtKontak}</p>
      </div>
    </div>
    <div class="doc-title"><h1>${title}</h1><p>${subTitle}</p></div>
    <table>
      <thead><tr><th width="5%">No</th><th width="15%">ID Murid</th><th width="30%">Nama Lengkap</th><th width="10%">Kelas</th><th width="15%">Waktu Submit</th><th width="10%">Status</th><th width="10%">Nilai Akhir</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <div class="signature-section">
       <div class="sig-box">
          <p>Dicetak pada: ${today}</p><p>Mengetahui,<br>Kepala ${kop.baris3}</p>
          <div class="sig-space"></div>
          <p class="sig-name">${kop.kepala_nama}</p><p>NIP. ${kop.kepala_nip}</p>
       </div>
    </div>
  </body></html>`;
}

function getStudentAnswerDetail(responseId) {
  try {
    const rSheet = SS.getSheetByName('Responses');
    const qSheet = SS.getSheetByName('Questions');
    const uSheet = SS.getSheetByName('Users');

    const rData = rSheet.getDataRange().getValues();
    const rRow = rData.find(row => String(row[0]) === String(responseId));

    if (!rRow) return { success: false, message: 'Data respon tidak ditemukan.' };

    const userID = rRow[1];
    const examID = rRow[2];
    const answersJson = rRow[3];
    let finalScore = rRow[4];

    let studentAnswers = {};
    try { studentAnswers = JSON.parse(answersJson || '{}'); } catch (e) { studentAnswers = {}; }

    let studentName = 'Siswa';
    if (uSheet) {
        const uData = uSheet.getDataRange().getValues();
        const uRow = uData.find(u => String(u[0]) === String(userID));
        if (uRow) studentName = uRow[1];
    }

    const qData = qSheet.getDataRange().getValues();
    const examQuestions = qData.filter((row, i) => i > 0 && String(row[1]) === String(examID));

    function cleanStr(str) {
        return String(str).replace(/[\s"'{}]/g, "").toLowerCase();
    }

    const perQuestionEssayScores = studentAnswers['_essay_scores_per_question'] || null;
    const manualEssayTotal = (studentAnswers['_manual_essay_score'] !== undefined && studentAnswers['_manual_essay_score'] !== null)
      ? parseFloat(studentAnswers['_manual_essay_score']) : null;
    const hasPerQuestionScores = perQuestionEssayScores && Object.keys(perQuestionEssayScores).length > 0;

    let totalEssayWeight = 0;
    examQuestions.forEach(row => {
      if (row[2] === 'Esai') {
        const w = (row[8] !== '' && !isNaN(parseFloat(row[8]))) ? parseFloat(row[8]) : 10;
        totalEssayWeight += w;
      }
    });

    function normalizeToMap(rawData) {
      let mapData = {};
      if (!rawData) return mapData;
      let parsed = rawData;
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(e) { return {}; } }
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          const k = cleanStr(String(item.q || item.question || item.key || ''));
          const v = cleanStr(String(item.a || item.answer || item.value || ''));
          if (k) mapData[k] = v;
        });
      } else if (typeof parsed === 'object') {
        for (let k in parsed) { mapData[cleanStr(k)] = cleanStr(String(parsed[k])); }
      }
      return mapData;
    }

    const detail = [];

    examQuestions.forEach((row, index) => {
      const qid      = row[0];
      const type     = row[2];
      const content  = row[3];
      const image    = row[4];
      const optionsRaw = row[5];
      const keyRaw   = row[6];

      const weight = (row[8] !== '' && !isNaN(parseFloat(row[8])) && parseFloat(row[8]) > 0)
        ? parseFloat(row[8]) : 10;

      let options = [];
      try { options = JSON.parse(optionsRaw); } catch (e) { options = []; }

      let studAnsObj  = studentAnswers[qid];
      let rawAnswerVal = studAnsObj;
      if (studAnsObj && typeof studAnsObj === 'object' && !Array.isArray(studAnsObj) && studAnsObj.hasOwnProperty('answer')) {
        rawAnswerVal = studAnsObj.answer;
      }

      let isCorrect = false;
      let pointItem = 0;

      if (type === 'Esai') {
        if (hasPerQuestionScores && perQuestionEssayScores[qid] !== undefined) {
          pointItem = parseFloat(perQuestionEssayScores[qid]) || 0;
          isCorrect = pointItem > 0;
        } else if (manualEssayTotal !== null && totalEssayWeight > 0) {
          pointItem  = (weight / totalEssayWeight) * manualEssayTotal;
          isCorrect  = pointItem > 0;
        } else {
          pointItem  = 0;
          isCorrect  = false;
        }
      } else if (type === 'PG_KOMPLEKS') {
        let keyArr = [], ansArr = [];
        try { keyArr = JSON.parse(keyRaw); }
        catch (e) { keyArr = String(keyRaw || '').split(',').map(s => s.trim()).filter(s => s); }
        if (Array.isArray(rawAnswerVal)) ansArr = rawAnswerVal;
        else { try { ansArr = JSON.parse(rawAnswerVal); } catch(e) { ansArr = String(rawAnswerVal || '').split(',').map(s => s.trim()).filter(s => s); } }

        const mapHuruf = ['A', 'B', 'C', 'D', 'E'];
        const kNorm = keyArr.map(k => {
          const cleanK = String(k).trim().toUpperCase();
          const idx = mapHuruf.indexOf(cleanK);
          return (idx !== -1 && options[idx]) ? String(options[idx]).trim().toLowerCase() : cleanK.toLowerCase();
        });
        const aNorm = ansArr.map(a => String(a).trim().toLowerCase());

        let matchCount = 0, wrongCount = 0;
        aNorm.forEach(a => kNorm.includes(a) ? matchCount++ : wrongCount++);

        if (wrongCount > 0) { pointItem = 0; isCorrect = false; }
        else if (matchCount > 0) { pointItem = (matchCount / kNorm.length) * weight; isCorrect = true; }

      } else if (type === 'BS' || type === 'JODOH' || type === 'MATCHING') {
        if (type === 'JODOH' || type === 'MATCHING') {
          let pairs = [];
          try { const parsed = JSON.parse(keyRaw); if (Array.isArray(parsed)) pairs = parsed; } catch(e) {}
          if (pairs.length === 0 && optionsRaw) { try { const parsed = JSON.parse(optionsRaw); if (Array.isArray(parsed)) pairs = parsed; } catch(e) {} }

          let stuObj = {};
          if (rawAnswerVal && typeof rawAnswerVal === 'object' && !Array.isArray(rawAnswerVal)) { stuObj = rawAnswerVal; }
          else if (typeof rawAnswerVal === 'string') { try { stuObj = JSON.parse(rawAnswerVal); } catch(e) {} }

          const realPairs = pairs.filter(pair => pair.q && String(pair.q).trim() !== '');
          if (realPairs.length > 0) {
            let matchCount = 0;
            realPairs.forEach(pair => {
              const kQ = String(pair.q || '').trim();
              const kA = String(pair.a || '').trim().toLowerCase();
              const sA = String(stuObj[kQ] || '').trim().toLowerCase();
              if (kA !== '' && kA === sA) matchCount++;
            });
            pointItem = (matchCount / realPairs.length) * weight;
            isCorrect = matchCount === realPairs.length;
          }
        } else {
          // BUG FIX RS-1 (KRITIS): Scoring BS di getStudentAnswerDetail menggunakan normalizeToMap
          // yang sama persis dengan bug di getStudentAnswerDetails. Key soal bisa berupa teks
          // pernyataan (format baru) atau index numerik (format lama), sementara jawaban siswa
          // selalu menggunakan index numerik {"0":"Benar","1":"Salah"}.
          // Solusi: iterasi berdasarkan array statements (optionsRaw) sebagai jembatan.
          let stmtsForBs = [];
          try { stmtsForBs = JSON.parse(optionsRaw); } catch(e) { stmtsForBs = []; }
          if (!Array.isArray(stmtsForBs)) stmtsForBs = [];

          let parsedBsKey = {};
          try { parsedBsKey = JSON.parse(keyRaw); } catch(e) { parsedBsKey = {}; }
          if (!parsedBsKey || typeof parsedBsKey !== 'object') parsedBsKey = {};

          let parsedBsAns = {};
          if (rawAnswerVal && typeof rawAnswerVal === 'object' && !Array.isArray(rawAnswerVal)) {
            parsedBsAns = rawAnswerVal;
          } else if (typeof rawAnswerVal === 'string') {
            try { parsedBsAns = JSON.parse(rawAnswerVal); } catch(e) { parsedBsAns = {}; }
          }
          if (!parsedBsAns || typeof parsedBsAns !== 'object') parsedBsAns = {};

          const bsTotalItems = stmtsForBs.length > 0 ? stmtsForBs.length : Object.keys(parsedBsKey).length;
          if (bsTotalItems > 0 && stmtsForBs.length > 0) {
            let bsMatch = 0;
            stmtsForBs.forEach(function(stmt, idx) {
              const expectedByText = parsedBsKey[stmt];
              const expectedByIdx  = parsedBsKey[String(idx)];
              const expected = expectedByText || expectedByIdx;
              if (!expected) return;

              const studentByIdx  = parsedBsAns[String(idx)];
              const studentByText = parsedBsAns[stmt];
              const studentAns = studentByIdx || studentByText || '';

              if (String(expected).trim().toLowerCase() === String(studentAns).trim().toLowerCase()) {
                bsMatch++;
              }
            });
            pointItem = (bsMatch / bsTotalItems) * weight;
            isCorrect = bsMatch === bsTotalItems;
          }
        }
      } else if (type === 'PG') {
        const cleanUserAns = String(rawAnswerVal || '').trim().toLowerCase();
        const cleanKey     = String(keyRaw || '').trim();
        const mapHuruf     = ['A', 'B', 'C', 'D', 'E'];
        const keyIndex     = mapHuruf.indexOf(cleanKey.toUpperCase());

        if (keyIndex !== -1 && options[keyIndex]) {
          const correctText = String(options[keyIndex]).trim().toLowerCase();
          if (cleanUserAns === correctText && correctText !== '') isCorrect = true;
        } else {
          if (cleanUserAns === cleanKey.toLowerCase()) isCorrect = true;
        }
        if (isCorrect) pointItem = weight;
      }

      let displayAnswer = '';
      let rawStudentAnsForFrontend = rawAnswerVal;

      if (!studAnsObj || rawAnswerVal === undefined || rawAnswerVal === null || rawAnswerVal === '') {
        displayAnswer = '(Tidak Dijawab)';
        rawStudentAnsForFrontend = null;
      } else if (Array.isArray(rawAnswerVal)) {
        displayAnswer = rawAnswerVal.join(', ');
      } else if ((type === 'JODOH' || type === 'MATCHING') && typeof rawAnswerVal === 'object') {
        try { displayAnswer = Object.entries(rawAnswerVal).map(([k, v]) => `${k} → ${v}`).join(' | '); }
        catch(e) { displayAnswer = JSON.stringify(rawAnswerVal); }
      } else if (type === 'BS' && typeof rawAnswerVal === 'object') {
        try { displayAnswer = Object.entries(rawAnswerVal).map(([k, v]) => `${k}: ${v}`).join(' | '); }
        catch(e) { displayAnswer = JSON.stringify(rawAnswerVal); }
      } else if (typeof rawAnswerVal === 'object') {
        displayAnswer = JSON.stringify(rawAnswerVal);
      } else {
        displayAnswer = String(rawAnswerVal);
        if ((type === 'JODOH' || type === 'MATCHING' || type === 'BS') && String(rawAnswerVal).trim().startsWith('{')) {
          try { rawStudentAnsForFrontend = JSON.parse(rawAnswerVal); } catch(e) {}
        }
      }

      let jodohPairs = null;
      if (type === 'JODOH' || type === 'MATCHING') {
        jodohPairs = [];
        try { const p = JSON.parse(keyRaw); if (Array.isArray(p) && p.length > 0) jodohPairs = p; } catch(e) {}
        if (jodohPairs.length === 0) {
          try { const p = JSON.parse(optionsRaw); if (Array.isArray(p)) jodohPairs = p; } catch(e) {}
        }
      }

      detail.push({
        id:             qid,
        number:         index + 1,
        q:              content,
        type:           type,
        studentAns:     displayAnswer,
        rawStudentAns:  rawStudentAnsForFrontend,
        key:            keyRaw,
        pairs:          jodohPairs,
        isCorrect:      isCorrect,
        image:          image,
        point:          Number(pointItem.toFixed(2)),
        maxPoint:       weight
      });
    });

    if (finalScore === "" || finalScore === undefined || finalScore === null) {
      finalScore = 0;
    }

    return { 
        success: true, 
        data: detail, 
        name: studentName, 
        finalScore: finalScore 
    };

  } catch (e) {
    Logger.log("Error getStudentAnswerDetail: " + e.message);
    return { success: false, message: "Terjadi kesalahan server: " + e.message };
  }
}

function getStudentAnswerDetails(responseId) {
  try {
    const rSheet = SS.getSheetByName('Responses');
    const rData = rSheet.getDataRange().getValues();
    const respRow = rData.find(row => String(row[0]) === String(responseId));

    if (!respRow) return { success: false, message: 'Data respon tidak ditemukan.' };
    
    const userId = respRow[1];      
    const examId = respRow[2];      
    const answersJson = respRow[3]; 
    const savedScore = respRow[4];  

    let studentAnswers = {};
    try { studentAnswers = JSON.parse(answersJson); } catch (e) { studentAnswers = {}; }

    const exSheet = SS.getSheetByName('Exams');
    const exData = exSheet.getDataRange().getValues();
    const exRow = exData.find(row => String(row[0]) === String(examId));
    const subjectName = exRow ? exRow[1] : 'Ujian';
    
    const uSheet = SS.getSheetByName('Users');
    const uData = uSheet.getDataRange().getValues();
    const uRow = uData.find(r => String(r[0]) === String(userId));
    const studentName = uRow ? uRow[1] : 'Siswa';
    const studentIdDisplay = userId; 

    const qSheet = SS.getSheetByName('Questions');
    const qData = qSheet.getDataRange().getValues();
    const questions = qData.filter((row, i) => i > 0 && String(row[1]) === String(examId));
    
    if (questions.length === 0) return { success: false, message: 'Soal tidak ditemukan.' };

    function cleanStr(str) {
       return String(str).replace(/[\s"'{}]/g, "").toLowerCase().trim();
    }
    
    function cleanTextForExcel(text) {
      if (!text) return "";
      if (typeof text !== 'string') return text;
      return String(text).replace(/<[^>]*>/g, " ").trim();
    }

    function normalizeToMap(rawData) {
        let mapData = {};
        if (!rawData) return mapData;
        let parsed = rawData;
        if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(e) { return {}; } }
        if (Array.isArray(parsed)) {
            parsed.forEach(item => {
                const qKey = item.q || item.question || item.key || ""; 
                const aVal = item.a || item.answer || item.value || "";
                if (qKey) mapData[cleanStr(qKey)] = cleanStr(aVal);
            });
        } else if (typeof parsed === 'object') {
            for (let k in parsed) { mapData[cleanStr(k)] = cleanStr(parsed[k]); }
        }
        return mapData;
    }

    const perQuestionEssayScores2 = studentAnswers['_essay_scores_per_question'] || null;
    const hasPerQuestion2 = perQuestionEssayScores2 && Object.keys(perQuestionEssayScores2).length > 0;
    const manualEssayScoreRaw = (studentAnswers['_manual_essay_score'] !== undefined && studentAnswers['_manual_essay_score'] !== null)
      ? parseFloat(studentAnswers['_manual_essay_score']) : null;

    let totalEssayWeight = 0;
    questions.forEach(q => {
      if (q[2] === 'Esai') {
        const w = (q.length > 8 && q[8] !== "" && !isNaN(q[8])) ? Number(q[8]) : 10;
        totalEssayWeight += w;
      }
    });

    const details = questions.map((q, index) => {
      const qId = q[0];            
      const qType = q[2];          
      const qBody = q[3];          
      const qOptionsRaw = q[5];    
      let qKeyRaw = q[6];        
      
      let qWeight = 10;
      if (q.length > 8 && q[8] !== "" && !isNaN(q[8])) qWeight = Number(q[8]);

      let jodohPairs = [];
      if (qType === 'JODOH' || qType === 'MATCHING') {
          try { const p = JSON.parse(qKeyRaw); if (Array.isArray(p) && p.length > 0) jodohPairs = p; } catch(e) {}
          if (jodohPairs.length === 0) {
              try {
                  const p = JSON.parse(qOptionsRaw);
                  if (Array.isArray(p) && p.length > 0) { jodohPairs = p; qKeyRaw = qOptionsRaw; }
              } catch(e) {}
          }
      }

      let sAnsRaw = studentAnswers[qId];
      let pointEarned = 0;
      let finalStudentAns = ""; 
      let manualScore = null;   

      if (sAnsRaw && typeof sAnsRaw === 'object' && !Array.isArray(sAnsRaw) && sAnsRaw.hasOwnProperty('answer')) {
          finalStudentAns = sAnsRaw.answer;
          if (sAnsRaw.hasOwnProperty('score') && qType !== 'Esai') {
             manualScore = null;
          }
      } else {
          finalStudentAns = sAnsRaw;
      }

      if (qType === 'Esai') {
          if (hasPerQuestion2 && perQuestionEssayScores2[qId] !== undefined) {
              pointEarned = parseFloat(perQuestionEssayScores2[qId]) || 0;
              manualScore = pointEarned;
          } else if (manualEssayScoreRaw !== null && totalEssayWeight > 0) {
              pointEarned = (qWeight / totalEssayWeight) * manualEssayScoreRaw;
              manualScore = pointEarned;
          } else {
              pointEarned = 0;
              manualScore = null;
          }
      }

      if (manualScore === null) {
        if (qType === 'PG_KOMPLEKS') {
            let keyArr = [], ansArr = [], qOptionsArr = [];
            try { keyArr = JSON.parse(qKeyRaw); } catch(e) { keyArr = String(qKeyRaw).split(',').map(s => s.trim()); }
            try { qOptionsArr = JSON.parse(qOptionsRaw); } catch(e) { qOptionsArr = []; }
            if (Array.isArray(finalStudentAns)) ansArr = finalStudentAns;
            else try { ansArr = JSON.parse(finalStudentAns); } catch(e) { ansArr = []; }

            const mapHuruf2 = ['A', 'B', 'C', 'D', 'E'];
            const kNorm = keyArr.map(k => {
                const cleanK = String(k).trim().toUpperCase();
                const idx = mapHuruf2.indexOf(cleanK);
                if (idx !== -1 && qOptionsArr[idx]) { return String(qOptionsArr[idx]).trim().toLowerCase(); }
                return cleanK.toLowerCase();
            });
            const aNorm = ansArr.map(a => String(a).trim().toLowerCase());

            if (aNorm.length > 0) {
                let match = 0, wrong = 0;
                aNorm.forEach(a => kNorm.includes(a) ? match++ : wrong++);
                if (wrong > 0) pointEarned = 0;
                else if (match > 0) pointEarned = (match / kNorm.length) * qWeight;
            }
        } else if (qType === 'JODOH' || qType === 'MATCHING') {
             let stuObj = {};
             if (finalStudentAns && typeof finalStudentAns === 'object' && !Array.isArray(finalStudentAns)) {
                 stuObj = finalStudentAns;
             } else if (typeof finalStudentAns === 'string') {
                 try { stuObj = JSON.parse(finalStudentAns); } catch(e) {}
             }
             const realJodohPairs = jodohPairs.filter(pair => pair.q && String(pair.q).trim() !== '');
             if (realJodohPairs.length > 0) {
                 let matchCount = 0;
                 realJodohPairs.forEach(pair => {
                     const kQ = String(pair.q || '').trim();
                     const kA = String(pair.a || '').trim().toLowerCase();
                     const sA = String(stuObj[kQ] || '').trim().toLowerCase();
                     if (kA !== '' && kA === sA) matchCount++;
                 });
                 pointEarned = (matchCount / realJodohPairs.length) * qWeight;
             }
        } else if (qType === 'BS') {
             // BUG FIX #2 (KRITIS): Scoring BS - kunci soal menggunakan teks pernyataan sebagai key,
             // sedangkan jawaban siswa menggunakan index numerik {"0":"Benar","1":"Salah"}.
             // Harus dijembatani via daftar options (array pernyataan) dari kolom qOptionsRaw.
             let statementsArr = [];
             try { statementsArr = JSON.parse(qOptionsRaw); } catch(e) { statementsArr = []; }
             if (!Array.isArray(statementsArr)) statementsArr = [];

             // Parse kunci jawaban (bisa berupa teks-key map atau index-key map)
             let parsedKey = null;
             try { parsedKey = JSON.parse(qKeyRaw); } catch(e) { parsedKey = {}; }
             if (!parsedKey || typeof parsedKey !== 'object') parsedKey = {};

             // Parse jawaban siswa (selalu index-key map: {"0":"Benar","1":"Salah"})
             let parsedStudentAns = null;
             if (finalStudentAns && typeof finalStudentAns === 'object' && !Array.isArray(finalStudentAns)) {
               parsedStudentAns = finalStudentAns;
             } else if (typeof finalStudentAns === 'string') {
               try { parsedStudentAns = JSON.parse(finalStudentAns); } catch(e) { parsedStudentAns = {}; }
             }
             if (!parsedStudentAns || typeof parsedStudentAns !== 'object') parsedStudentAns = {};

             // Tentukan total item dari kunci jawaban
             let totalItems = Object.keys(parsedKey).length;
             if (totalItems === 0 && statementsArr.length > 0) totalItems = statementsArr.length;

             if (totalItems > 0 && statementsArr.length > 0) {
               let matchCount = 0;
               statementsArr.forEach(function(stmt, idx) {
                 // Kunci ekspektasi: coba dengan teks pernyataan dahulu, lalu fallback ke index
                 const expectedByText = parsedKey[stmt];
                 const expectedByIdx  = parsedKey[String(idx)];
                 const expected = expectedByText || expectedByIdx;
                 if (!expected) return; // soal ini tidak punya kunci → skip

                 // Jawaban siswa: coba dengan index dahulu (format baru), lalu teks sebagai fallback
                 const studentByIdx  = parsedStudentAns[String(idx)];
                 const studentByText = parsedStudentAns[stmt];
                 const studentAns = studentByIdx || studentByText || '';

                 if (String(expected).trim().toLowerCase() === String(studentAns).trim().toLowerCase()) {
                   matchCount++;
                 }
               });
               pointEarned = (matchCount / totalItems) * qWeight;
             }
        } else if (qType === 'PG') {
             const sClean = String(finalStudentAns || '').trim().toLowerCase();
             const kClean = String(qKeyRaw || '').trim(); 
             let isMatch = false;
             if (sClean === kClean.toLowerCase()) isMatch = true;
             if (!isMatch) {
                const mapHuruf = ['A','B','C','D','E'];
                const idx = mapHuruf.indexOf(kClean.toUpperCase());
                if (idx !== -1) {
                   try {
                      const opts = JSON.parse(qOptionsRaw);
                      if (opts[idx] && String(opts[idx]).toLowerCase().trim() === sClean) isMatch = true;
                   } catch(e){}
                }
             }
             if (isMatch) pointEarned = qWeight;
        }
      }

      let statusText = "SALAH";
      if (qType === 'Esai') {
          if (manualScore !== null) {
              statusText = `DINILAI (${Number(pointEarned.toFixed(2))})`;
          } else {
              statusText = "MENUNGGU KOREKSI";
          }
      } else {
          const diff = Math.abs(pointEarned - qWeight);
          if (diff < 0.01) statusText = "BENAR";
          else if (pointEarned > 0.01) statusText = "BENAR SEBAGIAN";
      }

      let displayAnswer = finalStudentAns;
      let displayKey = qKeyRaw;
      if (qType === 'JODOH' || qType === 'MATCHING') {
        let rawAns = finalStudentAns;
        if (typeof rawAns === 'string') {
          try { rawAns = JSON.parse(rawAns); } catch(e) {}
        }
        if (rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns)) {
          var entries = Object.entries(rawAns).filter(function(kv) { return kv[0] && kv[0].trim() !== ''; });
          displayAnswer = entries.length > 0
            ? entries.map(function(kv) { return kv[0] + ' \u2192 ' + kv[1]; }).join(', ')
            : '(Tidak Dijawab)';
        } else if (!rawAns) {
          displayAnswer = '(Tidak Dijawab)';
        }
      }

      if (['PG', 'PG_KOMPLEKS'].includes(qType)) {
          let optionsArr = [];
          try { optionsArr = JSON.parse(qOptionsRaw); } catch(e) {}
          if (optionsArr && Array.isArray(optionsArr) && optionsArr.length > 0) {
             const mapHuruf = ['A', 'B', 'C', 'D', 'E'];
             const getLabel = (val) => {
                 if (!val) return "";
                 const vClean = cleanStr(val);
                 if (vClean.length === 1 && mapHuruf.includes(vClean.toUpperCase())) return vClean.toUpperCase();
                 const idx = optionsArr.findIndex(opt => cleanStr(opt) === vClean);
                 if (idx !== -1) return mapHuruf[idx];
                 return val;
             };
             if (Array.isArray(finalStudentAns)) displayAnswer = finalStudentAns.map(getLabel);
             else {
                 try {
                    const parsed = JSON.parse(finalStudentAns);
                    if (Array.isArray(parsed)) displayAnswer = parsed.map(getLabel);
                    else displayAnswer = getLabel(finalStudentAns);
                 } catch(e) { displayAnswer = getLabel(finalStudentAns); }
             }
             try {
                 const parsedKey = JSON.parse(qKeyRaw);
                 if (Array.isArray(parsedKey)) displayKey = parsedKey.map(getLabel);
                 else displayKey = getLabel(qKeyRaw);
             } catch(e) {
                 if (qType === 'PG_KOMPLEKS' && String(qKeyRaw).includes(',')) displayKey = String(qKeyRaw).split(',').map(s => getLabel(s.trim())).join(', ');
                 else displayKey = getLabel(qKeyRaw);
             }
          }
      }

      return {
        no: index + 1,
        id: qId,
        type: qType,
        question: cleanTextForExcel(qBody),
        answer: displayAnswer,
        key: displayKey,
        status: statusText,
        point: Number(pointEarned.toFixed(2)),
        weight: Number(qWeight),
        pairs: (qType === 'JODOH' || qType === 'MATCHING') ? jodohPairs : undefined,
        rawStudentAns: (qType === 'JODOH' || qType === 'MATCHING') ? (
            (finalStudentAns && typeof finalStudentAns === 'object' && !Array.isArray(finalStudentAns))
                ? finalStudentAns
                : (function() { try { return JSON.parse(finalStudentAns); } catch(e) { return {}; } })()
        ) : undefined
      };
    });

    const manualEssayScore = (studentAnswers['_manual_essay_score'] !== undefined && studentAnswers['_manual_essay_score'] !== null)
      ? parseFloat(studentAnswers['_manual_essay_score']) : null;

    return {
      success: true,
      data: details,
      examSubject: subjectName,
      studentName: studentName,
      studentId: studentIdDisplay,
      finalScore: savedScore,
      manualEssayScore: manualEssayScore
    };

  } catch (e) {
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

function processLatexForPdf(html) {
  if (!html) return html || '';
  var result = String(html);

  result = result.replace(/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');

  result = result.replace(/<\/p>\s*<p[^>]*>/gi, '<br>');

  result = result.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '');

  result = result.replace(/<img([^>]*)src=["']([^"']+)["']([^>]*)>/gi, function(match, pre, src, post) {
    try {
      var fetchSrc = src;
      if (src.indexOf('drive.google.com/thumbnail') !== -1) {
        fetchSrc = src.replace(/sz=w\d+/, 'sz=w400');
      } else if (src.indexOf('drive.google.com/uc?') !== -1) {
        var idMatch = src.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch) fetchSrc = 'https://drive.google.com/thumbnail?id=' + idMatch[1] + '&sz=w400';
      } else if (src.indexOf('drive.google.com/file/d/') !== -1) {
        var idMatch2 = src.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (idMatch2) fetchSrc = 'https://drive.google.com/thumbnail?id=' + idMatch2[1] + '&sz=w400';
      }
      var resp = UrlFetchApp.fetch(fetchSrc, { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        var blob  = resp.getBlob();
        var b64   = Utilities.base64Encode(blob.getBytes());
        var ctype = blob.getContentType() || 'image/jpeg';
        return '<img src="data:' + ctype + ';base64,' + b64 + '" '
          + 'style="max-height:64px; max-width:160px; vertical-align:middle; '
          + 'border:1px solid #e2e8f0; border-radius:3px; object-fit:contain; margin:0 2px;">';
      }
    } catch(e) {  }
    return match;
  });

  var _fetchLatexImg = function(latexCode, isDisplay) {
    try {
      var prefix  = '\\dpi{150} ' + (isDisplay ? '\\displaystyle ' : '');
      var encoded = encodeURIComponent(prefix + latexCode.trim());
      var url     = 'https://latex.codecogs.com/png.latex?' + encoded;
      var resp    = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        var b64   = Utilities.base64Encode(resp.getBlob().getBytes());
        var ctype = resp.getBlob().getContentType() || 'image/png';
        var style = isDisplay
          ? 'display:block; text-align:center; margin:4px auto; max-width:100%;'
          : 'vertical-align:middle; height:1.35em; max-width:100%;';
        return '<img src="data:' + ctype + ';base64,' + b64 + '" style="' + style + '">';
      }
    } catch(e) {  }
    return null;
  };

  result = result.replace(/\$\$([\s\S]*?)\$\$/g, function(match, latex) {
    var img = _fetchLatexImg(latex, true);
    return img || '<span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">' + match + '</span>';
  });

  result = result.replace(/\\\[([\s\S]*?)\\\]/g, function(match, latex) {
    var img = _fetchLatexImg(latex, true);
    return img || '<span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">' + match + '</span>';
  });

  result = result.replace(/(?<!\$)\$(?!\$)((?:[^$\n\\]|\\[\s\S])+?)\$(?!\$)/g, function(match, latex) {
    var img = _fetchLatexImg(latex, false);
    return img || '<span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">' + match + '</span>';
  });

  result = result.replace(/\\\(([\s\S]*?)\\\)/g, function(match, latex) {
    var img = _fetchLatexImg(latex, false);
    return img || '<span style="font-family:monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;">' + match + '</span>';
  });

  return result;
}

function generateStudentDetailPDF(responseId) {
  try {
    const rSheet = SS.getSheetByName('Responses');
    const rData = rSheet.getDataRange().getValues();
    const respRow = rData.find(r => String(r[0]) === String(responseId));
    if (!respRow) return { success: false, message: 'Data respon tidak ditemukan.' };

    const userId = respRow[1];
    const examId = respRow[2];
    const answersJson = respRow[3];
    
    const uSheet = SS.getSheetByName('Users');
    const uData = uSheet.getDataRange().getValues();
    const uRow = uData.find(r => String(r[0]) === String(userId));
    const studentName = uRow ? uRow[1] : userId;
    const studentClass = uRow ? uRow[4] : '-';

    const exSheet = SS.getSheetByName('Exams');
    const exData = exSheet.getDataRange().getValues();
    const exRow = exData.find(r => String(r[0]) === String(examId));
    const examName = exRow ? exRow[1] : examId;

    const qSheet = SS.getSheetByName('Questions');
    const qData = qSheet.getDataRange().getValues();
    const questions = qData.filter((r, i) => i > 0 && String(r[1]) === String(examId));

    let studentAnswers = {};
    try { studentAnswers = JSON.parse(answersJson); } catch (e) {}

    function cleanStr(str) {
       return String(str).replace(/[\s"'{}]/g, "").toLowerCase().trim();
    }

    function normalizeToMap(rawData) {
        let mapData = {};
        if (!rawData) return mapData;
        let parsed = rawData;
        if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(e) { return {}; } }
        if (Array.isArray(parsed)) {
            parsed.forEach(item => {
                const qKey = item.q || item.question || item.key || ""; 
                const aVal = item.a || item.answer || item.value || "";
                if (qKey) mapData[cleanStr(qKey)] = cleanStr(aVal);
            });
        } else if (typeof parsed === 'object') {
            for (let k in parsed) mapData[cleanStr(k)] = cleanStr(parsed[k]);
        }
        return mapData;
    }

    function convertKeyLettersToText(keyArr, optionsArr) {
        const mapHuruf = ['A', 'B', 'C', 'D', 'E'];
        return keyArr.map(k => {
            const cleanK = String(k).trim().toUpperCase();
            const idx = mapHuruf.indexOf(cleanK);
            if (idx !== -1 && optionsArr && optionsArr[idx]) {
                return String(optionsArr[idx]).trim().toLowerCase();
            }
            return cleanK.toLowerCase();
        });
    }

    function formatMatchingToHTML(jsonRaw) {
        var displayObj = {};
        try {
             var parsed = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : jsonRaw;
             if (Array.isArray(parsed)) {
                 parsed.forEach(function(p) { displayObj[p.q||p.question] = p.a||p.answer; });
             } else { displayObj = parsed; }
        } catch(e) { return String(jsonRaw || '-'); }
        if (!displayObj || Object.keys(displayObj).length === 0) return '-';
        var listHtml = '<ul style="margin: 0; padding-left: 15px; list-style-type: disc;">';
        for (var premis in displayObj) {
             var jawaban = displayObj[premis];
             var premisHtml  = processLatexForPdf(premis);
             var jawabanHtml = processLatexForPdf(jawaban);
             listHtml += '<li style="margin-bottom:2px;">' + premisHtml + ' <span style="color:#94a3b8; font-weight:bold;">&rarr;</span> <b>' + jawabanHtml + '</b></li>';
        }
        listHtml += '</ul>';
        return listHtml;
    }

    function getBase64Image(url) {
        try {
            if (!url) return null;
            const response = UrlFetchApp.fetch(url);
            const blob = response.getBlob();
            return "data:" + blob.getContentType() + ";base64," + Utilities.base64Encode(blob.getBytes());
        } catch (e) { return null; }
    }

    let totalEssayWeightPDF = 0;
    questions.forEach(q => {
      if (q[2] === 'Esai') {
        const wr = (q.length > 8 && q[8] !== '' && !isNaN(q[8])) ? Number(q[8]) : 10;
        totalEssayWeightPDF += wr;
      }
    });

    let totalScore = 0;
    let maxPoints = 0;
    let contentHtml = '';

    questions.forEach((q, idx) => {
       const qId      = q[0];
       const qType    = q[2];
       const qBody    = processLatexForPdf(q[3]);
       const qImage   = q[4]; 
       const qOptionsRaw = q[5];
       let   qKeyRaw  = q[6];
       
       let qWeight = 10;
       if (q.length > 8 && q[8] !== "" && !isNaN(q[8])) qWeight = Number(q[8]);
       maxPoints += qWeight;

       if (qType === 'JODOH' || qType === 'MATCHING') {
           let testParse = [];
           try { const p = JSON.parse(qKeyRaw); if (Array.isArray(p) && p.length > 0) testParse = p; } catch(e) {}
           if (testParse.length === 0 && qOptionsRaw && qOptionsRaw !== '') {
               qKeyRaw = qOptionsRaw;
           }
       }

       let sAnsRaw = studentAnswers[qId];
       let pointEarned = 0;
       let finalStudentAns = sAnsRaw;
       let manualScore = null;

       if (sAnsRaw && typeof sAnsRaw === 'object' && !Array.isArray(sAnsRaw) && sAnsRaw.hasOwnProperty('answer')) {
          finalStudentAns = sAnsRaw.answer;
          if (sAnsRaw.hasOwnProperty('score')) {
             if (qType === 'Esai') manualScore = Number(sAnsRaw.score);
          }
       }

       if (qType === 'Esai') {
           const pqScoresPdf = studentAnswers['_essay_scores_per_question'] || null;
           if (pqScoresPdf && pqScoresPdf[qId] !== undefined) {
               pointEarned = parseFloat(pqScoresPdf[qId]) || 0;
               manualScore = pointEarned;
           } else if (studentAnswers['_manual_essay_score'] !== undefined && studentAnswers['_manual_essay_score'] !== null) {
               if (totalEssayWeightPDF > 0) {
                   pointEarned = (qWeight / totalEssayWeightPDF) * parseFloat(studentAnswers['_manual_essay_score']);
                   manualScore = pointEarned;
               }
           }
       } else if (manualScore !== null) {
           pointEarned = manualScore;
       } else if (qType === 'PG_KOMPLEKS') {
           let keyArr = [], ansArr = [], optionsArr = [];
           try { keyArr = JSON.parse(qKeyRaw); } 
           catch(e) { keyArr = String(qKeyRaw || '').split(',').map(s => s.trim()).filter(s => s); }
           try { optionsArr = JSON.parse(qOptionsRaw); } catch(e) { optionsArr = []; }
           if (Array.isArray(finalStudentAns)) { ansArr = finalStudentAns; }
           else { try { ansArr = JSON.parse(finalStudentAns); } catch(e) { ansArr = String(finalStudentAns || '').split(',').map(s => s.trim()).filter(s => s); } }

           const kNorm = convertKeyLettersToText(keyArr, optionsArr);
           const aNorm = ansArr.map(a => String(a).trim().toLowerCase());

           if (aNorm.length > 0 && kNorm.length > 0) {
               let match = 0, wrong = 0;
               aNorm.forEach(ans => kNorm.includes(ans) ? match++ : wrong++);
               if (wrong > 0) pointEarned = 0;
               else if (match > 0) pointEarned = (match / kNorm.length) * qWeight;
           }
       } else if (['JODOH', 'BS', 'MATCHING'].includes(qType)) {
           const keyMap = normalizeToMap(qKeyRaw);
           const stuMap = normalizeToMap(finalStudentAns);
           const totalItems = Object.keys(keyMap).length;
           let matchCount = 0;
           if (totalItems > 0) {
               for (let k in keyMap) { if (stuMap[k] === keyMap[k]) matchCount++; }
               pointEarned = (matchCount / totalItems) * qWeight;
           }
       } else if (qType === 'PG') {
           const sClean = String(finalStudentAns || '').trim().toLowerCase();
           const kClean = String(qKeyRaw || '').trim();
           let isMatch = (sClean === kClean.toLowerCase());
           if (!isMatch) {
               const mapHuruf = ['A','B','C','D','E'];
               const letterIdx = mapHuruf.indexOf(kClean.toUpperCase());
               if (letterIdx !== -1) {
                   try {
                       const opts = JSON.parse(qOptionsRaw);
                       if (opts[letterIdx] && String(opts[letterIdx]).toLowerCase().trim() === sClean) isMatch = true;
                   } catch(e){}
               }
           }
           if (isMatch) pointEarned = qWeight;
       }

       totalScore += pointEarned;

       let statusText  = '[ SALAH ]';
       let statusColor = '#b91c1c';
       const diff = Math.abs(pointEarned - qWeight);
       
       if (qType === 'Esai') {
           statusText  = manualScore !== null ? `[ ESAI: ${Number(pointEarned.toFixed(2))} ]` : '[ MENUNGGU KOREKSI ]';
           statusColor = '#7e22ce';
       } else if (diff < 0.01) {
           statusText  = '[ BENAR ]';
           statusColor = '#15803d';
       } else if (pointEarned > 0.01) {
           statusText  = '[ BENAR SEBAGIAN ]';
           statusColor = '#d97706';
       }

       let imgHtml = '';
       if (qImage) {
           const b64 = getBase64Image(qImage);
           if (b64) imgHtml = `<div style="margin:10px 0;"><img src="${b64}" style="max-height:150px; max-width:100%; border:1px solid #eee; padding:2px;"></div>`;
       }

       let displayStudent = '-';
       let displayKey     = '-';

       if (qType === 'PG_KOMPLEKS') {
           let keyArr2 = [], ansArr2 = [], optionsArr2 = [];
           try { keyArr2    = JSON.parse(qKeyRaw); }    catch(e) { keyArr2 = []; }
           try { optionsArr2 = JSON.parse(qOptionsRaw); } catch(e) { optionsArr2 = []; }
           if (Array.isArray(finalStudentAns)) ansArr2 = finalStudentAns;
           else try { ansArr2 = JSON.parse(finalStudentAns); } catch(e) { ansArr2 = []; }

           const mapHurufPGK = ['A','B','C','D','E'];
           const resolvePGKOption = (val) => {
               const cleanVal = String(val).trim().toUpperCase();
               const idx = mapHurufPGK.indexOf(cleanVal);
               if (idx !== -1 && optionsArr2 && optionsArr2[idx] !== undefined) {
                   return `${mapHurufPGK[idx]}. ${String(optionsArr2[idx]).trim()}`;
               }
               return String(val).trim();
           };
           displayKey     = keyArr2.length > 0 ? keyArr2.map(k => resolvePGKOption(k)).join(', ') : '-';
           displayStudent = ansArr2.length > 0 ? ansArr2.map(a => resolvePGKOption(a)).join(', ') : '-';

       } else if (['JODOH', 'MATCHING'].includes(qType)) {
           displayStudent = formatMatchingToHTML(finalStudentAns);
           displayKey     = formatMatchingToHTML(qKeyRaw);

       } else if (qType === 'BS') {
           let stmts = [];
           try { stmts = JSON.parse(qOptionsRaw); } catch(e) {}
           let keyObj = {};
           try { keyObj = JSON.parse(qKeyRaw); } catch(e) {}
           let ansObj = {};
           if (typeof finalStudentAns === 'object' && finalStudentAns !== null) { ansObj = finalStudentAns; }
           else { try { ansObj = JSON.parse(finalStudentAns); } catch(e) {} }

           let stuLines = '', keyLines = '';
           stmts.forEach((stmt, i) => {
               const stuVal  = ansObj[String(i)] || '-';
               const keyVal  = keyObj[String(i)] || '-';
               const stmtHtml = processLatexForPdf(stmt);
               stuLines += `<div style="margin-bottom:3px;">${i+1}. ${stmtHtml}: <b>${stuVal}</b></div>`;
               keyLines += `<div style="margin-bottom:3px;">${i+1}. ${stmtHtml}: <b>${keyVal}</b></div>`;
           });
           displayStudent = stuLines || '-';
           displayKey     = keyLines || '-';

       } else if (qType === 'Esai') {
           displayStudent = finalStudentAns ? String(finalStudentAns) : '-';
           displayKey     = '<i style="color:#94a3b8;">(Penilaian kebijakan guru)</i>';
       } else {
           // Helper: ubah huruf opsi (A/B/C/D/E) menjadi "A. <teks opsi>"
           const mapHurufPG = ['A','B','C','D','E'];
           const resolvePGOption = (val) => {
               if (!val) return '-';
               const cleanVal = String(val).trim();
               const letterIdx = mapHurufPG.indexOf(cleanVal.toUpperCase());
               if (letterIdx !== -1) {
                   try {
                       const opts = JSON.parse(qOptionsRaw);
                       if (opts && opts[letterIdx] !== undefined) {
                           return `${mapHurufPG[letterIdx]}. ${String(opts[letterIdx]).trim()}`;
                       }
                   } catch(e) {}
               }
               return cleanVal;
           };
           displayKey     = resolvePGOption(qKeyRaw);
           displayStudent = resolvePGOption(finalStudentAns);
       }

       contentHtml += `
          <div class="question-box">
             <div class="q-header">
                 <span style="font-weight:bold;">No. ${idx + 1}</span>
                 <span style="font-size:10px; font-weight:bold; color:#334155; background:#f1f5f9; padding:2px 8px; border:1px solid #cbd5e1; border-radius:4px; margin-left:8px; margin-right:8px;">
                     ${qType.replace('_',' ')}
                 </span>
                 <span style="font-size:10px; color:#64748b;">Poin: <b>${Number(pointEarned.toFixed(2))} / ${qWeight}</b></span>
                 <span style="font-weight:bold; color:${statusColor}; margin-left:auto; font-size:10px;">${statusText}</span>
             </div>
             <div class="q-content">${qBody}${imgHtml}</div>
             <table class="ans-table">
                   <tr>
                     <td width="50%" style="background-color:#f8fafc; border-right:1px solid #e2e8f0;">
                         <div class="label">JAWABAN SISWA:</div>
                         <div class="value" style="color:${diff < 0.01 ? '#15803d' : '#334155'}">${displayStudent}</div>
                       </td>
                     <td width="50%" style="background-color:#f0fdf4;">
                         <div class="label" style="color:#15803d;">KUNCI JAWABAN:</div>
                         <div class="value" style="color:#14532d;">${displayKey}</div>
                       </td>
                   </tr>
               </table>
          </div>
       `;
    });

    const manualEssayPoin = (studentAnswers['_manual_essay_score'] !== undefined && studentAnswers['_manual_essay_score'] !== null)
      ? parseFloat(studentAnswers['_manual_essay_score']) : 0;

    const finalScoreCalc = maxPoints > 0 ? Math.round((totalScore / maxPoints) * 10000) / 100 : 0;
    
    const logoUrl    = 'https://res.cloudinary.com/dp8rda8g4/image/upload/v1772094330/MTs%20Nurul%20Falah/Update_Logo_MTs_pqfzmc.png';
    const logoBase64 = getBase64Image(logoUrl);

    const fullHtml = `
      <!DOCTYPE html><html><head>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Helvetica', sans-serif; font-size: 11px; color: #1e293b; -webkit-print-color-adjust: exact; }
          .header { text-align: center; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 20px; }
          .header img { height: 60px; margin-bottom: 5px; }
          .header h2 { margin: 5px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; color:#0f172a; }
          .header p { margin: 0; font-size: 12px; color: #64748b; }
          .meta { margin-bottom: 20px; font-size: 11px; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; background-color: #f8fafc; }
          .meta table { width: 100%; border-collapse: collapse; }
          .meta td { padding: 4px; vertical-align: middle; }
          .question-box { border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 15px; overflow: hidden; page-break-inside: avoid; background-color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
          .q-header { background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; }
          .q-content { padding: 12px; font-size: 12px; line-height: 1.5; color: #334155; }
          .ans-table { width: 100%; border-collapse: collapse; border-top: 1px solid #cbd5e1; }
          .ans-table td { padding: 10px; vertical-align: top; }
          .label { font-size: 9px; font-weight: 800; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; opacity: 0.8; }
          .value { font-size: 11px; line-height: 1.6; }
        </style>
      </head><body>
        <div class="header">
           ${logoBase64 ? `<img src="${logoBase64}">` : ''}
           <h2>Lembar Jawaban Murid</h2>
           <p>Laporan Hasil Ujian Berbasis Komputer</p>
        </div>
        <div class="meta">
           <table>
              <tr>
                 <td width="15%" style="color:#64748b;">Nama Murid</td>
                 <td width="1%">:</td>
                 <td width="40%"><b>${studentName}</b></td>
                 <td width="20%" style="text-align:right; color:#64748b;">NILAI AKHIR</td>
                 <td width="1%">:</td>
                 <td style="text-align:right;">
                   <b style="font-size:18px; color:#2563eb; background:#dbeafe; padding:4px 10px; border-radius:6px; border:1px solid #bfdbfe;">${finalScoreCalc.toFixed(2)}</b>
                  </td>
               </tr>
               <tr>
                 <td style="color:#64748b;">ID Respons</td>
                 <td>:</td>
                 <td style="font-family:monospace; color:#64748b;">${responseId}</td>
                 <td style="text-align:right; color:#64748b;">Poin Esai (Koreksi)</td>
                 <td>:</td>
                 <td style="text-align:right;"><b>${totalEssayWeightPDF === 0 ? '-' : (manualEssayPoin > 0 ? manualEssayPoin + ' poin' : '(belum dikoreksi)')}</b></td>
               </tr>
               <tr>
                 <td style="color:#64748b;">Mata Pelajaran / Kelas</td>
                 <td>:</td>
                 <td>${examName} / ${studentClass}</td>
                 <td style="text-align:right; color:#64748b;">Waktu Cetak</td>
                 <td>:</td>
                 <td style="text-align:right;">${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")}</td>
               </tr>
            </table>
        </div>
        ${contentHtml}
      </body></html>`;

    const blob    = Utilities.newBlob(fullHtml, 'text/html', 'LJK.html');
    const safeStudentName = studentName.replace(/[^a-z0-9\-_]/gi, '_');
    const safeExamName = examName.replace(/[^a-z0-9\-_]/gi, '_');
    const safeClass = studentClass.replace(/[^a-z0-9\-_]/gi, '_');
    const pdfFileName = `LJK-${safeStudentName}-${safeExamName}-${safeClass}.pdf`;
    const pdfBlob = blob.getAs('application/pdf').setName(pdfFileName);

    let targetFolder;
    const folderName = "SIPADU_REPORTS";
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) targetFolder = folders.next();
    else targetFolder = DriveApp.createFolder(folderName);

    const file = targetFolder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { 
      success: true, 
      url: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      fileId: file.getId()
    };

  } catch (e) {
    return { success: false, message: 'Error PDF: ' + e.toString() };
  }
}

/**
 * generateLembarSoalPDF
 * Menghasilkan PDF Lembar Soal untuk sebuah ujian.
 * Format mirip LJK (generateStudentDetailPDF), tetapi:
 *   - Tidak ada kolom "Jawaban Siswa" maupun "Kunci Jawaban"
 *   - Sebagai gantinya tampilkan Pilihan Jawaban per soal
 *   - Header: kop sekolah (getKopConfig) + info ujian
 */
function generateLembarSoalPDF(examId, requestorID, requestorToken) {
  try {
    // --- Otorisasi ---
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let reqRole  = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(requestorID) &&
          String(uData[i][5]) === String(requestorToken)) {
        reqRole = String(uData[i][3]).trim();
        break;
      }
    }
    if (!reqRole || reqRole === 'Siswa') {
      return { success: false, message: 'Akses ditolak.' };
    }

    // --- Data Ujian ---
    const exSheet = SS.getSheetByName('Exams');
    const exData  = exSheet.getDataRange().getValues();
    let examInfo  = null;
    for (let i = 1; i < exData.length; i++) {
      if (String(exData[i][0]) === String(examId)) {
        examInfo = {
          subject:  exData[i][1] || '',
          cls:      exData[i][2] || '',
          date:     exData[i][3] || '',
          duration: exData[i][4] || '',
          kkm:      exData[i][10] ? parseFloat(exData[i][10]) : 0
        };
        break;
      }
    }
    if (!examInfo) return { success: false, message: 'Data ujian tidak ditemukan.' };

    // --- Akses Guru ke Ujian ---
    const access = checkUserAccess(requestorID, requestorToken, examInfo.subject, examInfo.cls);
    if (!access || access.allowed !== true) {
      return { success: false, message: 'Akses ditolak ke ujian ini.' };
    }

    // --- Data Soal ---
    const qSheet = SS.getSheetByName('Questions');
    const qData  = qSheet.getDataRange().getValues();
    const questions = [];
    for (let i = 1; i < qData.length; i++) {
      if (String(qData[i][1]) === String(examId)) {
        questions.push(qData[i]);
      }
    }
    if (questions.length === 0) {
      return { success: false, message: 'Belum ada soal untuk ujian ini.' };
    }

    // --- Kop Surat ---
    const kop       = getKopConfig();
    const logoBase64 = imageUrlToBase64(kop.logoUrl);

    // --- Helper konversi gambar soal ke base64 ---
    function getBase64Img(url) {
      if (!url) return null;
      try {
        const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (r.getResponseCode() !== 200) return null;
        const b = r.getBlob();
        return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
      } catch (e) { return null; }
    }

    // --- Buat HTML per soal ---
    const typeLabelMap = {
      PG: 'Pilihan Ganda', PG_KOMPLEKS: 'PG Kompleks',
      BS: 'Benar/Salah', JODOH: 'Menjodohkan', Esai: 'Esai'
    };
    const optLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

    let contentHtml = '';
    let noUrut = 0;

    questions.forEach(function(q) {
      noUrut++;
      var qType       = String(q[2] || '');
      var qContent    = processLatexForPdf(q[3] || '');
      var qImage      = q[4] || '';
      var qOptionsRaw = q[5] || '';
      var qWeight     = (q[8] !== '' && !isNaN(parseFloat(q[8]))) ? parseFloat(q[8]) : 10;
      var typeLabel   = typeLabelMap[qType] || qType;

      // Gambar soal
      var imgHtml = '';
      if (qImage) {
        var b64 = getBase64Img(qImage);
        if (b64) {
          imgHtml = '<div style="margin:10px 0;">'
            + '<img src="' + b64 + '" style="max-height:150px; max-width:100%; '
            + 'border:1px solid #e2e8f0; padding:2px; border-radius:4px;">'
            + '</div>';
        }
      }

      // --- Pilihan Jawaban per tipe ---
      var pilihanHtml = '';

      if (qType === 'PG' || qType === 'PG_KOMPLEKS') {
        var opts = [];
        try { opts = JSON.parse(qOptionsRaw); } catch(e) { opts = []; }
        if (Array.isArray(opts) && opts.length > 0) {
          var rows = '';
          opts.forEach(function(opt, idx) {
            var letter = optLetters[idx] || String(idx + 1);
            var optText = processLatexForPdf(String(opt || ''));
            rows += '<tr>'
              + '<td style="width:28px; font-weight:bold; color:#1e40af; vertical-align:top; padding:5px 6px; border:none;">' + letter + '.</td>'
              + '<td style="vertical-align:top; padding:5px 6px; border:none; line-height:1.55;">' + optText + '</td>'
              + '</tr>';
          });
          pilihanHtml = '<table style="width:100%; border-collapse:collapse; margin-top:2px;">'
            + rows + '</table>';
          if (qType === 'PG_KOMPLEKS') {
            pilihanHtml += '<div style="margin-top:6px; font-size:10px; color:#7c3aed; font-style:italic;">'
              + '(Pilih semua jawaban yang benar)</div>';
          }
        }

      } else if (qType === 'BS') {
        var stmts = [];
        try { stmts = JSON.parse(qOptionsRaw); } catch(e) { stmts = []; }
        if (Array.isArray(stmts) && stmts.length > 0) {
          var bsRows = '';
          stmts.forEach(function(stmt, idx) {
            var stmtHtml = processLatexForPdf(String(stmt || ''));
            bsRows += '<tr>'
              + '<td style="width:22px; color:#92400e; font-weight:bold; vertical-align:top; padding:5px 6px; border:none;">' + (idx + 1) + '.</td>'
              + '<td style="vertical-align:top; padding:5px 6px; border:none; line-height:1.55; flex:1;">' + stmtHtml + '</td>'
              + '<td style="width:110px; vertical-align:top; padding:5px 6px; border:none;">'
              +   '<span style="display:inline-block; border:1px solid #d97706; border-radius:4px; padding:2px 7px; font-size:10px; font-weight:bold; color:#92400e; margin-right:4px;">Benar</span>'
              +   '<span style="display:inline-block; border:1px solid #d97706; border-radius:4px; padding:2px 7px; font-size:10px; font-weight:bold; color:#92400e;">Salah</span>'
              + '</td>'
              + '</tr>';
          });
          pilihanHtml = '<table style="width:100%; border-collapse:collapse; margin-top:2px;">'
            + bsRows + '</table>';
        }

      } else if (qType === 'JODOH') {
        var pairs = [];
        try { pairs = JSON.parse(qOptionsRaw); } catch(e) { pairs = []; }
        if (Array.isArray(pairs) && pairs.length > 0) {
          var realPairs     = pairs.filter(function(p) { return p.q && String(p.q).trim(); });
          var distractors   = pairs.filter(function(p) { return !p.q || !String(p.q).trim(); });
          // Kumpulkan semua opsi sisi kanan (jawaban + pengacoh) lalu acak urutan tampil
          var allOptions = pairs.map(function(p) { return p.a || ''; }).filter(function(a) { return a; });
          // Acak kolom kiri (pernyataan) dan kolom kanan (jawaban) secara independen
          (function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
              var j = Math.floor(Math.random() * (i + 1));
              var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
          })(realPairs);
          (function shuffle(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
              var j = Math.floor(Math.random() * (i + 1));
              var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
          })(allOptions);
          // Tampilkan pernyataan kiri di kolom kiri, opsi acak di kolom kanan
          var maxRows = Math.max(realPairs.length, allOptions.length);
          var jodohRows = '';
          for (var ri = 0; ri < maxRows; ri++) {
            var leftCell = '';
            if (ri < realPairs.length) {
              leftCell = '<td style="width:45%; vertical-align:top; padding:5px 8px; border:1px solid #e2e8f0; line-height:1.5;">'
                + '<span style="font-weight:bold; color:#0f766e;">' + (ri + 1) + '.</span> '
                + processLatexForPdf(String(realPairs[ri].q || ''))
                + '</td>';
            } else {
              leftCell = '<td style="width:45%; border:1px solid #e2e8f0; padding:5px 8px;"></td>';
            }
            var rightCell = '';
            if (ri < allOptions.length) {
              rightCell = '<td style="width:10%; text-align:center; vertical-align:top; padding:5px 4px; border:1px solid #e2e8f0; color:#94a3b8; font-weight:bold;">'
                + optLetters[ri] + '.'
                + '</td>'
                + '<td style="width:45%; vertical-align:top; padding:5px 8px; border:1px solid #e2e8f0; line-height:1.5;">'
                + processLatexForPdf(String(allOptions[ri]))
                + '</td>';
            } else {
              rightCell = '<td style="width:10%; border:1px solid #e2e8f0;"></td><td style="width:45%; border:1px solid #e2e8f0;"></td>';
            }
            jodohRows += '<tr>' + leftCell + rightCell + '</tr>';
          }
          pilihanHtml = '<table style="width:100%; border-collapse:collapse; margin-top:4px; font-size:11px;">'
            + '<thead><tr>'
            + '<th style="background:#f0fdfa; border:1px solid #e2e8f0; padding:4px 8px; text-align:left; font-size:10px; color:#0f766e;">Pernyataan</th>'
            + '<th colspan="2" style="background:#f0fdfa; border:1px solid #e2e8f0; padding:4px 8px; text-align:left; font-size:10px; color:#0f766e;">Pilihan Jawaban</th>'
            + '</tr></thead>'
            + '<tbody>' + jodohRows + '</tbody>'
            + '</table>';
        }

      } else if (qType === 'Esai') {
        pilihanHtml = '<div style="margin-top:8px; border:1px dashed #cbd5e1; border-radius:6px; padding:10px 12px; min-height:60px; background:#fafafa;">'
          + '<span style="font-size:10px; color:#94a3b8; font-style:italic;">Ruang Jawaban Esai</span>'
          + '</div>';
      }

      // --- Rakitan HTML satu soal ---
      contentHtml += '<div class="question-box">'

        // Header soal
        + '<div class="q-header">'
        +   '<span style="font-weight:bold; font-size:12px;">No. ' + noUrut + '</span>'
        +   '<span style="font-size:10px; font-weight:bold; color:#334155; background:#f1f5f9; '
        +        'padding:2px 8px; border:1px solid #cbd5e1; border-radius:4px; margin-left:8px;">'
        +     typeLabel
        +   '</span>'
        +   '<span style="font-size:10px; color:#64748b; margin-left:8px;">Bobot: <b>' + qWeight + '</b></span>'
        + '</div>'

        // Konten pertanyaan
        + '<div class="q-content">' + qContent + imgHtml + '</div>'

        // Area pilihan jawaban
        + (pilihanHtml
            ? '<div class="q-options">' + pilihanHtml + '</div>'
            : '')

        + '</div>';
    });

    // --- Tanggal cetak ---
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMMM yyyy");
    const cetakTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    // --- Full HTML dokumen ---
    const fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<style>'
      + '@page { size: A4; margin: 12mm 14mm; }'
      + 'body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; -webkit-print-color-adjust: exact; margin:0; padding:0; }'
      + '.kop-surat { display:flex; align-items:center; border-bottom:3px solid #1e293b; padding-bottom:10px; margin-bottom:16px; }'
      + '.kop-logo { width:70px; text-align:center; flex-shrink:0; }'
      + '.kop-logo img { height:65px; width:auto; }'
      + '.kop-text { flex:1; text-align:center; }'
      + '.kop-text .b1 { font-size:11px; font-weight:bold; text-transform:uppercase; margin:1px 0; }'
      + '.kop-text .b2 { font-size:13px; font-weight:bold; text-transform:uppercase; margin:1px 0; }'
      + '.kop-text .b3 { font-size:15px; font-weight:bold; text-transform:uppercase; margin:1px 0; }'
      + '.kop-text .alamat { font-size:10px; margin:2px 0; }'
      + '.doc-title { text-align:center; margin-bottom:12px; }'
      + '.doc-title h1 { font-size:14px; margin:4px 0; text-transform:uppercase; text-decoration:underline; letter-spacing:1px; }'
      + '.doc-title .subtitle { font-size:11px; font-weight:bold; margin:2px 0; }'
      + '.meta-box { border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; margin-bottom:16px; background:#f8fafc; }'
      + '.meta-box table { width:100%; border-collapse:collapse; font-size:11px; }'
      + '.meta-box td { padding:3px 6px; vertical-align:top; }'
      + '.meta-box .label { color:#64748b; width:120px; }'
      + '.question-box { border:1px solid #cbd5e1; border-radius:6px; margin-bottom:14px; overflow:hidden; page-break-inside:avoid; background:#fff; }'
      + '.q-header { background:#f1f5f9; padding:7px 12px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:4px; }'
      + '.q-content { padding:10px 14px; font-size:11px; line-height:1.6; color:#334155; text-align:justify; }'
      + '.q-options { padding:8px 14px 12px; border-top:1px solid #f1f5f9; background:#fafbff; font-size:11px; text-align:justify; }'
      + '</style></head><body>'

      // Kop surat
      + '<div class="kop-surat">'
      +   '<div class="kop-logo">' + (logoBase64 ? '<img src="' + logoBase64 + '">' : '') + '</div>'
      +   '<div class="kop-text">'
      +     '<p class="b1">' + kop.baris1 + '</p>'
      +     '<p class="b2">' + kop.baris2 + '</p>'
      +     '<p class="b3">' + kop.baris3 + '</p>'
      +     '<p class="alamat">' + kop.alamat + '<br>' + kop.kontak + '</p>'
      +   '</div>'
      + '</div>'

      // Judul dokumen
      + '<div class="doc-title">'
      +   '<h1>Lembar Soal</h1>'
      +   '<p class="subtitle">Mata Pelajaran: ' + examInfo.subject + ' &nbsp;|&nbsp; Kelas: ' + examInfo.cls + '</p>'
      + '</div>'

      // Kotak identitas siswa
      + '<div class="meta-box">'
      +   '<table><tbody>'
      +     '<tr><td class="label">Mata Pelajaran</td><td>: <b>' + examInfo.subject + '</b></td>'
      +          '<td class="label" style="text-align:right; padding-right:8px;">Nama Siswa</td>'
      +          '<td style="border-bottom:1px solid #334155; width:200px;">&nbsp;</td></tr>'
      +     '<tr><td class="label">Kelas</td><td>: <b>' + examInfo.cls + '</b></td>'
      +          '<td class="label" style="text-align:right; padding-right:8px;">KKM</td>'
      +          '<td style="border-bottom:1px solid #334155;">' + (examInfo.kkm > 0 ? '<b>' + examInfo.kkm + '</b>' : '&nbsp;') + '</td></tr>'
      +     '<tr><td class="label">Jumlah Soal</td><td>: <b>' + questions.length + ' soal</b></td>'
      +          '<td class="label" style="text-align:right; padding-right:8px;">Waktu</td>'
      +          '<td>' + (examInfo.duration ? examInfo.duration + ' menit' : '—') + '</td></tr>'
      +   '</tbody></table>'
      + '</div>'

      // Konten soal
      + contentHtml

      + '</body></html>';

    // --- Buat PDF & simpan ke Drive ---
    const blob    = Utilities.newBlob(fullHtml, 'text/html', 'LembarSoal.html');
    const safeSubject = examInfo.subject.replace(/[^a-z0-9\-_]/gi, '_');
    const safeCls     = examInfo.cls.replace(/[^a-z0-9\-_]/gi, '_');
    const pdfBlob = blob.getAs('application/pdf')
                        .setName('LembarSoal_' + safeSubject + '_' + safeCls + '.pdf');

    const folderName = 'SIPADU_REPORTS';
    const folders = DriveApp.getFoldersByName(folderName);
    let targetFolder;
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = DriveApp.createFolder(folderName);
    }

    const file = targetFolder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Log (best-effort)
    try {
      const actorName = getActorName(requestorID);
      addAdminLog(requestorID, actorName, 'EXPORT_PDF', 'Exam', examId,
                  'Lembar Soal PDF dicetak untuk ujian ' + examInfo.subject + ' (' + examInfo.cls + ').');
    } catch(e) {}

    const fileId = file.getId();
    return {
      success: true,
      url: 'https://drive.google.com/file/d/' + fileId + '/view?usp=sharing',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + fileId,
      fileId: fileId
    };

  } catch (e) {
    Logger.log('generateLembarSoalPDF error: ' + e.message);
    return { success: false, message: 'Gagal membuat Lembar Soal PDF: ' + (e.message || String(e)) };
  }
}

function getSavedImages() {
  const sheet = SS.getSheetByName('Gambar');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(r => ({
    id:         r[0],
    name:       r[1],
    link:       r[2],
    folderId:   r[4],
    date:       r[5] instanceof Date ? Utilities.formatDate(r[5], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : r[5],
    uploaderID: r[6] ? String(r[6]) : ''
  })).reverse();
}

function getSavedAudio() {
  const sheet = SS.getSheetByName('Audio');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(r => ({
    id:         r[0],
    name:       r[1],
    link:       r[2],
    folderId:   r[4],
    date:       r[5] instanceof Date ? Utilities.formatDate(r[5], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : r[5],
    uploaderID: r[6] ? String(r[6]) : ''
  })).reverse();
}

function processFolderImages(folderUrl, requestorID, requestorToken) {
  const user = (requestorID && requestorToken) ? validateUser(requestorID, requestorToken) : { valid: true, role: 'Admin', password: '' };
  if (!user.valid) return { success: false, message: user.message };

  try {
    let folderId = "";
    const match1 = folderUrl.match(/folders\/([a-zA-Z0-9-_]+)/);
    const match2 = folderUrl.match(/id=([a-zA-Z0-9-_]+)/);

    if (match1) folderId = match1[1];
    else if (match2) folderId = match2[1];
    else folderId = folderUrl;

    if (!folderId) return { success: false, message: 'URL Folder tidak valid.' };

    const folder = DriveApp.getFolderById(folderId);
    const files  = folder.getFiles();
    const sheet  = SS.getSheetByName('Gambar');

    const existingData   = sheet.getDataRange().getValues();
    const existingFileIds = new Set();
    for (let i = 1; i < existingData.length; i++) {
      const link    = String(existingData[i][2]);
      const idMatch = link.match(/id=([a-zA-Z0-9-_]+)/);
      if (idMatch && idMatch[1]) existingFileIds.add(idMatch[1]);
    }

    let count = 0, skipped = 0;
    const addedImages = [];

    while (files.hasNext()) {
      const file   = files.next();
      const fileId = file.getId();
      const mime   = file.getMimeType();

      if (!mime.includes('image/')) continue;
      if (existingFileIds.has(fileId)) { skipped++; continue; }

      const directLink = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
      const fileName   = file.getName();
      const uniqueID   = 'IMG-' + fileId.substring(0, 8);
      const now        = new Date();

      // Bug fix: kolom Password (col 8) seharusnya berisi password proteksi gambar,
      // bukan password akun pengguna yang digunakan untuk upload. Simpan string kosong.
      sheet.appendRow([uniqueID, fileName, directLink, directLink, folderId, now, requestorID || '', '']);
      addedImages.push({ id: uniqueID, name: fileName, link: directLink, date: Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") });
      count++;
    }

    if (count === 0 && skipped === 0) return { success: false, message: 'Tidak ditemukan file gambar di folder tersebut.' };
    if (count === 0 && skipped > 0)  return { success: true, count: 0, skipped, message: `Tidak ada gambar baru. ${skipped} gambar sudah ada di database.` };

    return { success: true, count, skipped, data: addedImages };

  } catch (e) {
    Logger.log(e.toString());
    return { success: false, message: 'Error: ' + e.toString() + '. Pastikan Link benar dan Folder disetting "Anyone with the link can view".' };
  }
}

function deleteSavedImage(imageId, enteredPassword, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };

  const sheet = SS.getSheetByName('Gambar');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(imageId)) continue;

    // Admin boleh menghapus tanpa password.
    if (user.role !== 'Admin') {
      const uploaderID = String(data[i][6] || '').trim();

      if (uploaderID && uploaderID.toLowerCase() !== requestorID.toLowerCase()) {
        // Bukan pemilik — verifikasi dengan password akun pemilik.
        const ownerCred = _getExternalCredential_(uploaderID);
        if (!ownerCred) {
          return { success: false, message: 'Kredensial pemilik gambar tidak dapat ditemukan. Hubungi Administrator.' };
        }
        const ownerPwd = String(ownerCred.password || '');
        if (enteredPassword !== ownerPwd) {
          return { success: false, message: 'Password salah. Masukkan password akun pemilik gambar.' };
        }
      }
      // Pemilik gambar (uploaderID === requestorID) boleh hapus tanpa password.
    }

    sheet.deleteRow(i + 1);
    return { success: true };
  }
  return { success: false, message: 'Data tidak ditemukan.' };
}

function getAppConfig() {
  const sheet = SS.getSheetByName('Konfigurasi');
  if (!sheet) return { success: false, message: 'Sheet Konfigurasi tidak ditemukan' };
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0]);
    const val = data[i][1];
    if (key === 'anthropic_api_key') {
      const rawKey = String(val || '').trim();
      config['anthropic_api_key_set']    = rawKey.length > 10;
      config['anthropic_api_key_masked'] = rawKey.length > 10
        ? rawKey.substring(0, 6) + '••••••••••••' + rawKey.slice(-4)
        : '';
    } else if (key === 'kartu_template_id') {
      const raw = String(val || '').trim();
      config['kartu_template_id_set']    = raw.length > 5;
      config['kartu_template_id_masked'] = raw.length > 5
        ? raw.substring(0, 6) + '••••••••' + raw.slice(-4)
        : '';
      config['kartu_template_id'] = raw;
    } else if (key === 'kartu_folder_id') {
      const raw = String(val || '').trim();
      config['kartu_folder_id_set']    = raw.length > 5;
      config['kartu_folder_id_masked'] = raw.length > 5
        ? raw.substring(0, 6) + '••••••••' + raw.slice(-4)
        : '';
      config['kartu_folder_id'] = raw;
    } else if (key.startsWith('pdf_kop_')) {
      config[key] = val;
    } else {
      config[key] = val;
    }
  }
  config['image_upload_folder_id_set'] = !!(config['image_upload_folder_id'] &&
    String(config['image_upload_folder_id']).trim().length > 5);
  config['audio_upload_folder_id_set'] = !!(config['audio_upload_folder_id'] &&
    String(config['audio_upload_folder_id']).trim().length > 5);
  var rawCanvas = config['essay_canvas_enabled'];
  if (rawCanvas === undefined || rawCanvas === null || rawCanvas === '') {
    config['essay_canvas_enabled'] = 'true';
  } else {
    config['essay_canvas_enabled'] = (String(rawCanvas).toLowerCase() === 'false') ? 'false' : 'true';
  }
  
  const period = getInputPeriod();
  if (period && period.success) {
    config['input_period_enabled'] = period.enabled;
    config['input_period_start'] = period.startISO;
    config['input_period_end'] = period.endISO;
  }

  // Normalisasi jam auto-timeout
  const rawTimeoutHour = config['auto_timeout_hour'];
  if (rawTimeoutHour === undefined || rawTimeoutHour === null || rawTimeoutHour === '') {
    config['auto_timeout_hour'] = 16;
  } else {
    const parsed = parseInt(rawTimeoutHour, 10);
    config['auto_timeout_hour'] = (!isNaN(parsed) && parsed >= 0 && parsed <= 23) ? parsed : 16;
  }

  // Status trigger auto-timeout
  try {
    const triggerStatus = checkAutoTimeoutTriggerStatus();
    config['auto_timeout_trigger_active'] = triggerStatus.active;
    config['auto_timeout_trigger_hour']   = triggerStatus.hour;
  } catch(e) {
    config['auto_timeout_trigger_active'] = false;
    config['auto_timeout_trigger_hour']   = null;
  }

  // Normalisasi batas pelanggaran
  const rawVL = config['violation_limit'];
  if (rawVL === undefined || rawVL === null || rawVL === '') {
    config['violation_limit'] = 3;
  } else {
    const parsedVL = parseInt(rawVL, 10);
    config['violation_limit'] = (!isNaN(parsedVL) && parsedVL >= 0) ? parsedVL : 3;
  }

  return { success: true, data: config };
}

function saveAppConfig(formObject) {
  const sheet = SS.getSheetByName('Konfigurasi');
  if (!sheet) return { success: false, message: 'Sheet Konfigurasi tidak ditemukan' };
  const data = sheet.getDataRange().getValues();
  
  const updateOrAppend = (key, newValue) => {
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(newValue);
        found = true;
        break;
      }
    }
    if (!found) { sheet.appendRow([key, newValue]); }
  };

  try {
    updateOrAppend('app_name', formObject.appName);
    updateOrAppend('app_subtitle', formObject.appSubtitle);
    updateOrAppend('app_logo', formObject.appLogo);
    updateOrAppend('app_background', formObject.appBackground);
    updateOrAppend('show_exam_result', formObject.showExamResult === 'true' ? 'true' : 'false');
    updateOrAppend('essay_canvas_enabled', formObject.essayCanvasEnabled === 'true' ? 'true' : 'false');

    // Batas pelanggaran
    if (formObject.violationLimit !== undefined && formObject.violationLimit !== null && formObject.violationLimit !== '') {
      const vlNum = parseInt(formObject.violationLimit, 10);
      if (!isNaN(vlNum) && vlNum >= 0) updateOrAppend('violation_limit', vlNum);
    }

    // Jam auto-timeout (0-23)
    if (formObject.autoTimeoutHour !== undefined && formObject.autoTimeoutHour !== null) {
      const h = parseInt(formObject.autoTimeoutHour, 10);
      if (!isNaN(h) && h >= 0 && h <= 23) {
        updateOrAppend('auto_timeout_hour', h);
      }
    }

    const newApiKey = String(formObject.anthropicApiKey || '').trim();
    if (newApiKey === '__CLEAR__') {
      updateOrAppend('anthropic_api_key', '');
    } else if (newApiKey && !newApiKey.includes('••••')) {
      updateOrAppend('anthropic_api_key', newApiKey);
    }

    const newTemplateId = String(formObject.kartuTemplateId || '').trim();
    if (newTemplateId === '__CLEAR__') {
      updateOrAppend('kartu_template_id', '');
    } else if (newTemplateId && !newTemplateId.includes('••••')) {
      updateOrAppend('kartu_template_id', newTemplateId);
    }
    const newFolderId = String(formObject.kartuFolderId || '').trim();
    if (newFolderId === '__CLEAR__') {
      updateOrAppend('kartu_folder_id', '');
    } else if (newFolderId && !newFolderId.includes('••••')) {
      updateOrAppend('kartu_folder_id', newFolderId);
    }

    const imgFolderRaw = String(formObject.imgUploadFolderUrl || '').trim();
    if (imgFolderRaw === '__CLEAR__') {
      updateOrAppend('image_upload_folder_id', '');
    } else if (imgFolderRaw) {
      const m1 = imgFolderRaw.match(/folders\/([a-zA-Z0-9-_]+)/);
      const m2 = imgFolderRaw.match(/id=([a-zA-Z0-9-_]+)/);
      const extractedImgFolderId = m1 ? m1[1] : (m2 ? m2[1] : imgFolderRaw);
      if (extractedImgFolderId) updateOrAppend('image_upload_folder_id', extractedImgFolderId);
    }

    const audioFolderRaw = String(formObject.audioUploadFolderUrl || '').trim();
    if (audioFolderRaw === '__CLEAR__') {
      updateOrAppend('audio_upload_folder_id', '');
    } else if (audioFolderRaw) {
      const am1 = audioFolderRaw.match(/folders\/([a-zA-Z0-9-_]+)/);
      const am2 = audioFolderRaw.match(/id=([a-zA-Z0-9-_]+)/);
      const extractedAudioFolderId = am1 ? am1[1] : (am2 ? am2[1] : audioFolderRaw);
      if (extractedAudioFolderId) updateOrAppend('audio_upload_folder_id', extractedAudioFolderId);
    }

    const kopFields = ['pdf_kop_logo','pdf_kop_baris1','pdf_kop_baris2','pdf_kop_baris3',
                       'pdf_kop_alamat','pdf_kop_kontak','pdf_kop_kepala_nama','pdf_kop_kepala_nip'];
    kopFields.forEach(k => {
      const jsKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const val = String(formObject[jsKey] !== undefined ? formObject[jsKey] : '').trim();
      if (val !== '') updateOrAppend(k, val);
    });
    kopFields.forEach(k => {
      const jsKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (formObject[jsKey] !== undefined && String(formObject[jsKey]).trim() === '__CLEAR__') {
        updateOrAppend(k, '');
      }
    });

    const kopFmtFields = ['baris1','baris2','baris3','alamat','kontak'];
    const kopFmtProps  = ['bold','italic','size'];
    kopFmtFields.forEach(function(f) {
      kopFmtProps.forEach(function(p) {
        const frontendKey = 'pdfKopFmt_' + f + '_' + p;
        const sheetKey    = 'pdf_kop_fmt_' + f + '_' + p;
        if (formObject[frontendKey] !== undefined) {
          updateOrAppend(sheetKey, String(formObject[frontendKey]));
        }
      });
    });

    return { success: true, message: 'Konfigurasi berhasil disimpan!' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

function validateUser(userID, token) {
  const sheet = SS.getSheetByName('Users');
  if (!sheet) return { valid: false, message: 'Sheet Users tidak ditemukan.' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userID) && String(data[i][5]) === String(token)) {
      const role = String(data[i][3]);
      let pwd = String(data[i][2]);
      if (role === 'Admin' || role === 'Guru') {
        const ext = _getExternalCredential_(String(data[i][0]));
        pwd = ext ? String(ext.password || '') : '';
      }
      return { valid: true, role: role, password: pwd };
    }
  }
  return { valid: false, message: 'Sesi kadaluarsa atau token tidak valid.' };
}

function verifyImageAccess(imageId, enteredPassword, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };

  // Admin selalu diizinkan tanpa password.
  if (user.role === 'Admin') return { success: true };

  const sheet = SS.getSheetByName('Gambar');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(imageId)) continue;

    const uploaderID = String(data[i][6] || '').trim();

    // Jika gambar tidak memiliki pemilik, akses bebas.
    if (!uploaderID) return { success: true };

    // Pemilik gambar (requestor adalah uploader) selalu diizinkan.
    if (uploaderID.toLowerCase() === requestorID.toLowerCase()) return { success: true };

    // Pihak lain harus memasukkan password akun pemilik gambar.
    const ownerCred = _getExternalCredential_(uploaderID);
    // Jika kredensial pemilik tidak ditemukan (akun sudah dihapus), izinkan Admin saja.
    // Untuk non-admin, tolak akses karena tidak bisa diverifikasi.
    if (!ownerCred) {
      return { success: false, message: 'Kredensial pemilik gambar tidak dapat ditemukan. Hubungi Administrator.' };
    }

    const ownerPwd = String(ownerCred.password || '');
    if (enteredPassword !== ownerPwd) {
      return { success: false, message: 'Password salah. Masukkan password akun pemilik gambar.' };
    }
    return { success: true };
  }
  return { success: false, message: 'Data gambar tidak ditemukan.' };
}

function getImageUploadFolderId(requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };
  const sheet = SS.getSheetByName('Konfigurasi');
  if (!sheet) return { success: false, folderId: '' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === 'image_upload_folder_id') {
      return { success: true, folderId: String(data[i][1] || '') };
    }
  }
  return { success: true, folderId: '' };
}

function saveImageUploadFolderId(folderId, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };
  if (!folderId || !folderId.trim()) return { success: false, message: 'Folder ID tidak boleh kosong.' };
  try {
    DriveApp.getFolderById(folderId.trim());
  } catch(e) {
    return { success: false, message: 'Folder ID tidak valid atau tidak dapat diakses.' };
  }
  const sheet = SS.getSheetByName('Konfigurasi');
  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'image_upload_folder_id') {
      sheet.getRange(i + 1, 2).setValue(folderId.trim());
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(['image_upload_folder_id', folderId.trim()]);
  return { success: true, message: 'Folder berhasil disimpan.' };
}

function getAudioUploadFolderId(requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };
  const sheet = SS.getSheetByName('Konfigurasi');
  if (!sheet) return { success: false, folderId: '' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === 'audio_upload_folder_id') {
      return { success: true, folderId: String(data[i][1] || '') };
    }
  }
  return { success: true, folderId: '' };
}

function saveAudioUploadFolderId(folderId, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };
  if (user.role !== 'Admin') return { success: false, message: 'Akses ditolak. Hanya Admin yang dapat menyimpan konfigurasi folder.' };
  if (!folderId || !folderId.trim()) return { success: false, message: 'Folder ID tidak boleh kosong.' };
  try {
    DriveApp.getFolderById(folderId.trim());
  } catch(e) {
    return { success: false, message: 'Folder ID tidak valid atau tidak dapat diakses.' };
  }
  const sheet = SS.getSheetByName('Konfigurasi');
  const data = sheet.getDataRange().getValues();
  let found = false;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'audio_upload_folder_id') {
      sheet.getRange(i + 1, 2).setValue(folderId.trim());
      found = true;
      break;
    }
  }
  if (!found) sheet.appendRow(['audio_upload_folder_id', folderId.trim()]);
  return { success: true, message: 'Folder berhasil disimpan.' };
}

function uploadImageFile(base64Data, fileName, mimeType, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimes.includes(mimeType.toLowerCase())) {
    return { success: false, message: 'Format tidak didukung. Hanya JPG, JPEG, dan PNG yang diizinkan.' };
  }

  const sheet = SS.getSheetByName('Konfigurasi');
  const cfgData = sheet ? sheet.getDataRange().getValues() : [];
  let folderId = '';
  for (let i = 1; i < cfgData.length; i++) {
    if (String(cfgData[i][0]) === 'image_upload_folder_id' && cfgData[i][1]) {
      folderId = String(cfgData[i][1]).trim();
      break;
    }
  }
  if (!folderId) return { success: false, message: 'Folder tujuan upload belum dikonfigurasi. Hubungi Administrator.' };

  // Cek duplikat nama file di sheet Gambar (case-insensitive)
  const imgSheet = SS.getSheetByName('Gambar');
  if (imgSheet && imgSheet.getLastRow() > 1) {
    const existingNames = imgSheet.getRange(2, 2, imgSheet.getLastRow() - 1, 1).getValues();
    const fileNameLower = fileName.toLowerCase();
    for (let i = 0; i < existingNames.length; i++) {
      if (String(existingNames[i][0]).toLowerCase() === fileNameLower) {
        return { success: false, message: 'Nama file "' + fileName + '" sudah ada di database. Ganti nama file lalu coba lagi.' };
      }
    }
  }

  try {
    const bytes = Utilities.base64Decode(base64Data);
    const blob  = Utilities.newBlob(bytes, mimeType, fileName);
    const folder = DriveApp.getFolderById(folderId);
    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId     = file.getId();
    const directLink = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
    const uniqueID   = 'IMG-' + fileId.substring(0, 8);
    const now        = new Date();

    // Password kolom H dikosongkan — proteksi kini menggunakan password akun pemilik (uploaderID).
    imgSheet.appendRow([uniqueID, fileName, directLink, directLink, folderId, now, requestorID, '']);

    return {
      success: true,
      id:   uniqueID,
      name: fileName,
      link: directLink,
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    };
  } catch(e) {
    Logger.log(e.toString());
    return { success: false, message: 'Gagal upload: ' + e.message };
  }
}

function uploadAudioFile(base64Data, fileName, mimeType, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };

  // Mp3_Guard re-validation (requireBoth=true): nama berakhiran .mp3 (case-insensitive) DAN MIME audio/mpeg|audio/mp3
  // (AC 4.6/4.7).
  const extOk  = /\.mp3$/i.test(String(fileName || ''));
  const mimeOk = ['audio/mpeg', 'audio/mp3'].includes(String(mimeType || '').toLowerCase());
  if (!extOk || !mimeOk) {
    return { success: false, message: 'Hanya file mp3 yang diizinkan.' };
  }

  // AC 1.4 — short-circuit when the metadata sheet is missing instead of
  // letting `audioSheet.appendRow(...)` throw on a null reference. Without
  // this check the user sees the generic "Gagal upload: ..." message, even
  // though the real cause is a missing/un-migrated `Audio` sheet.
  const audioSheet = SS.getSheetByName('Audio');
  if (!audioSheet) {
    return { success: false, message: 'Sheet Audio belum tersedia. Jalankan migrasi/inisialisasi sheet terlebih dahulu.' };
  }

  const sheet = SS.getSheetByName('Konfigurasi');
  const cfgData = sheet ? sheet.getDataRange().getValues() : [];
  let folderId = '';
  for (let i = 1; i < cfgData.length; i++) {
    if (String(cfgData[i][0]) === 'audio_upload_folder_id' && cfgData[i][1]) {
      folderId = String(cfgData[i][1]).trim();
      break;
    }
  }
  if (!folderId) return { success: false, message: 'Folder tujuan upload belum dikonfigurasi. Hubungi Administrator.' };

  try {
    const bytes = Utilities.base64Decode(base64Data);
    const blob  = Utilities.newBlob(bytes, mimeType, fileName);
    const folder = DriveApp.getFolderById(folderId);
    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId     = file.getId();
    const directLink = 'https://drive.google.com/uc?export=download&id=' + fileId;
    const uniqueID   = 'AUD-' + fileId.substring(0, 8);
    const now        = new Date();

    audioSheet.appendRow([uniqueID, fileName, directLink, directLink, folderId, now, requestorID, user.password]);

    return {
      success: true,
      id:   uniqueID,
      name: fileName,
      link: directLink,
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    };
  } catch(e) {
    Logger.log(e.toString());
    return { success: false, message: 'Gagal upload: ' + e.message };
  }
}

function processFolderAudio(folderUrl, requestorID, requestorToken) {
  const user = (requestorID && requestorToken) ? validateUser(requestorID, requestorToken) : { valid: true, role: 'Admin', password: '' };
  if (!user.valid) return { success: false, message: user.message };

  // AC 1.4 — surface a precise message when the metadata sheet is missing.
  // Doing this BEFORE the try/catch means the "Pastikan Link benar dan Folder
  // disetting Anyone with the link..." fallback is not used to report what is
  // actually a sheet-availability problem.
  const sheet = SS.getSheetByName('Audio');
  if (!sheet) {
    return { success: false, message: 'Sheet Audio belum tersedia. Jalankan migrasi/inisialisasi sheet terlebih dahulu.' };
  }

  try {
    let folderId = "";
    const match1 = folderUrl.match(/folders\/([^/?]+)/);
    const match2 = folderUrl.match(/[?&]id=([^&]+)/);

    if (match1) folderId = match1[1];
    else if (match2) folderId = match2[1];
    else folderId = folderUrl;

    if (!folderId) return { success: false, message: 'URL Folder tidak valid.' };

    const folder = DriveApp.getFolderById(folderId);
    const files  = folder.getFiles();

    const existingData    = sheet.getDataRange().getValues();
    const existingFileIds = new Set();
    for (let i = 1; i < existingData.length; i++) {
      const link    = String(existingData[i][2]);
      const idMatch = link.match(/id=([a-zA-Z0-9-_]+)/);
      if (idMatch && idMatch[1]) existingFileIds.add(idMatch[1]);
    }

    let count = 0, skipped = 0;
    const addedAudio = [];

    while (files.hasNext()) {
      const file   = files.next();
      const fileId = file.getId();
      const mime   = String(file.getMimeType() || '').toLowerCase();
      const name   = file.getName();

      // Mp3_Guard (requireBoth=false): nama berakhiran .mp3 (case-insensitive) ATAU MIME audio/mpeg|audio/mp3
      const extOk  = /\.mp3$/i.test(name);
      const mimeOk = ['audio/mpeg', 'audio/mp3'].includes(mime);
      if (!extOk && !mimeOk) continue;
      if (existingFileIds.has(fileId)) { skipped++; continue; }

      const directLink = 'https://drive.google.com/uc?export=download&id=' + fileId;
      const uniqueID   = 'AUD-' + fileId.substring(0, 8);
      const now        = new Date();

      sheet.appendRow([uniqueID, name, directLink, directLink, folderId, now, requestorID || '', user.password]);
      addedAudio.push({ id: uniqueID, name: name, link: directLink, date: Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") });
      count++;
    }

    if (count === 0 && skipped === 0) return { success: false, message: 'Tidak ditemukan file audio di folder tersebut.' };
    if (count === 0 && skipped > 0)  return { success: true, count: 0, skipped, message: `Tidak ada audio baru. ${skipped} audio sudah ada di database.` };

    return { success: true, count, skipped, data: addedAudio };

  } catch (e) {
    Logger.log(e.toString());
    return { success: false, message: 'Error: ' + e.toString() + '. Pastikan Link benar dan Folder disetting "Anyone with the link can view".' };
  }
}

function validateKartuConfig(requestorID, requestorToken, templateId, folderId) {
  try {
    verifyAdminAccess(requestorID, requestorToken);
  } catch(e) {
    return { success: false, message: e.message };
  }

  const result = { templateOk: false, folderOk: false, templateName: '', folderName: '', errors: [] };

  if (templateId && templateId.trim()) {
    try {
      const file = DriveApp.getFileById(templateId.trim());
      const mime = file.getMimeType();
      if (mime === MimeType.GOOGLE_SLIDES) {
        result.templateOk   = true;
        result.templateName = file.getName();
      } else {
        result.errors.push('Template ID ditemukan, tetapi bukan file Google Slides (tipe: ' + mime + ').');
      }
    } catch(e) {
      result.errors.push('Template ID tidak valid atau tidak dapat diakses: ' + e.message);
    }
  } else {
    result.errors.push('Template ID tidak boleh kosong.');
  }

  if (folderId && folderId.trim()) {
    try {
      const folder = DriveApp.getFolderById(folderId.trim());
      result.folderOk   = true;
      result.folderName = folder.getName();
    } catch(e) {
      result.errors.push('Folder ID tidak valid atau tidak dapat diakses: ' + e.message);
    }
  } else {
    result.errors.push('Folder ID tidak boleh kosong.');
  }

  result.success = result.templateOk && result.folderOk;
  return result;
}

function testAnthropicApiKey(requestorID, requestorToken) {
  try { verifyAdminAccess(requestorID, requestorToken); }
  catch(e) { return { success: false, message: e.message }; }

  let apiKey = '';
  const cfgSheet = SS.getSheetByName('Konfigurasi');
  if (cfgSheet) {
    const cfgData = cfgSheet.getDataRange().getValues();
    for (let c = 1; c < cfgData.length; c++) {
      if (String(cfgData[c][0]) === 'anthropic_api_key') {
        apiKey = String(cfgData[c][1]).trim();
        break;
      }
    }
  }

  if (!apiKey) {
    return { success: false, message: 'API Key belum tersimpan. Silakan masukkan dan simpan terlebih dahulu.' };
  }

  try {
    const apiUrl = 'https://gateway.olagon.site/anthropic/v1/messages';

    const payload = {
      'model':      'claude-haiku-4-5-20251001',
      'max_tokens': 5,
      'messages': [{ 'role': 'user', 'content': 'Say: OK' }]
    };

    const options = {
      'method':      'post',
      'contentType': 'application/json',
      'headers': {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      'payload':            JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    const response = UrlFetchApp.fetch(apiUrl, options);
    const httpCode = response.getResponseCode();
    const bodyText = response.getContentText();
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch(e) {
      return { success: false, message: 'Gateway API mengembalikan response HTML/tidak valid (HTTP ' + httpCode + '). Pastikan URL gateway benar dan aktif.' };
    }

    if (data.error) {
      let errMsg = data.error.message || 'Error tidak diketahui';
      if (data.error.type === 'authentication_error') errMsg = 'API Key tidak valid.';
      if (data.error.type === 'permission_error')     errMsg = 'API Key tidak memiliki izin.';
      if (data.error.type === 'rate_limit_error')     errMsg = 'Batas rate API tercapai. Coba lagi nanti.';
      return { success: false, message: errMsg };
    }

    const replied = (data.content && data.content[0]) ? (data.content[0].text || '') : '';
    return {
      success: true,
      message: 'Koneksi berhasil! Model Claude merespons dengan baik.',
      model:   data.model || 'claude-haiku-4-5-20251001',
      reply:   replied.trim()
    };

  } catch(e) {
    return { success: false, message: 'Error Script: ' + e.toString() };
  }
}

function getAllImages() {
  const sheet = SS.getSheetByName('Gambar');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return data.map(r => ({
    id: r[0],
    name: r[1],
    link: r[2],
    preview: r[3],
    date: r[5] instanceof Date
      ? Utilities.formatDate(r[5], Session.getScriptTimeZone(), "dd/MM/yyyy")
      : (r[5] ? String(r[5]) : '')
  }));
}

function getAllAudio() {
  const sheet = SS.getSheetByName('Audio');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  return data.map(r => ({
    id: r[0],
    name: r[1],
    link: r[2],
    preview: r[3],
    date: r[5] instanceof Date
      ? Utilities.formatDate(r[5], Session.getScriptTimeZone(), "dd/MM/yyyy")
      : (r[5] ? String(r[5]) : ''),
    uploaderID: r[6] ? String(r[6]) : ''
  }));
}

function deleteSavedAudio(audioId, enteredPassword, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };

  // AC 1.4 — return a graceful message instead of letting `getDataRange()`
  // throw "Cannot read property 'getDataRange' of null" when the metadata
  // sheet is missing.
  const sheet = SS.getSheetByName('Audio');
  if (!sheet) {
    return { success: false, message: 'Sheet Audio belum tersedia. Jalankan migrasi/inisialisasi sheet terlebih dahulu.' };
  }
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(audioId)) continue;

    if (user.role !== 'Admin') {
      const storedPwd = String(data[i][7] || '');
      if (storedPwd && enteredPassword !== storedPwd) {
        return { success: false, message: 'Password salah. Hubungi pemilik audio atau Admin untuk reset.' };
      }
    }

    sheet.deleteRow(i + 1);
    return { success: true };
  }
  return { success: false, message: 'Data tidak ditemukan.' };
}

function verifyAudioAccess(audioId, enteredPassword, requestorID, requestorToken) {
  const user = validateUser(requestorID, requestorToken);
  if (!user.valid) return { success: false, message: user.message };
  if (user.role === 'Admin') return { success: true };

  // AC 1.4 — return a graceful message instead of letting `getDataRange()`
  // throw on a null sheet reference when migration has not yet been run.
  const sheet = SS.getSheetByName('Audio');
  if (!sheet) {
    return { success: false, message: 'Sheet Audio belum tersedia. Jalankan migrasi/inisialisasi sheet terlebih dahulu.' };
  }
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(audioId)) continue;
    const storedPwd = String(data[i][7] || '');
    if (!storedPwd) return { success: true };
    if (enteredPassword !== storedPwd) {
      return { success: false, message: 'Password salah. Hubungi pemilik audio atau Admin untuk reset.' };
    }
    return { success: true };
  }
  return { success: false, message: 'Data audio tidak ditemukan.' };
}

function getTeacherAssignments(userId, token) {
  const sheet = SS.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  const userRow = data.find(r => String(r[0]).trim() === String(userId).trim());
  if (!userRow) return [];

  const assignmentData = userRow[4];
  let results = [];

  if (!assignmentData) return [];

  try {
    const parsed = JSON.parse(assignmentData);
    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
         subject: item.subject || "Mapel Umum",
         classVal: item.classVal || item.class || "",
         label: `${item.subject} - ${item.classVal || item.class}`
      }));
    }
  } catch (e) {}

  const textData = String(assignmentData);
  const parts = textData.split(',');
  
  parts.forEach(p => {
     const raw = p.trim();
     if(raw) {
        let s = "Mapel Saya";
        let c = raw;
        if(raw.includes(':')) {
           let split = raw.split(':');
           s = split[0].trim();
           c = split[1].trim();
        }
        results.push({ subject: s, classVal: c, label: `${s} - ${c}` });
     }
  });

  return results;
}

function downloadKartuSiswa(studentID) {
  try {
    const userSheet = SS.getSheetByName('Users');
    const userData = userSheet.getDataRange().getValues();
    let student = null;

    for (let i = 1; i < userData.length; i++) {
      if (String(userData[i][0]) === String(studentID)) {
        student = {
          id: userData[i][0],
          nama: userData[i][1],
          kelas: userData[i][4],
          password: userData[i][2]
        };
        break;
      }
    }

    if (!student) throw new Error("Siswa tidak ditemukan.");

    const kartuCfg = getKartuConfig();
    let folder;
    try { folder = DriveApp.getFolderById(kartuCfg.folderId); } catch(e) { folder = DriveApp.getRootFolder(); }

    const fileName = "Kartu_Ujian_" + student.nama;
    const copy = DriveApp.getFileById(kartuCfg.templateId).makeCopy(fileName, folder);
    const slideId = copy.getId();
    const presentation = SlidesApp.openById(slideId);

    presentation.getSlides().forEach(slide => {
      slide.replaceAllText('{{nama}}', student.nama);
      slide.replaceAllText('{{userid}}', student.id);
      slide.replaceAllText('{{password}}', student.password);
      slide.replaceAllText('{{kelas}}', student.kelas || '-');
    });
    
    presentation.saveAndClose();

    const pdfBlob = copy.getAs(MimeType.PDF);
    const pdfFile = folder.createFile(pdfBlob);
    copy.setTrashed(true);

    return { success: true, url: pdfFile.getDownloadUrl().replace("?e=download&gd=true", ""), fileName: fileName + ".pdf" };

  } catch (e) {
    return { success: false, message: 'Gagal membuat kartu: ' + e.toString() };
  }
}

function checkDownloadProgress(processId) {
  return CacheService.getScriptCache().get('PROGRESS_' + processId);
}

function downloadKartuMassal(selectedUserIds, processId) {
  try {
    const userSheet = SS.getSheetByName('Users');
    const userData = userSheet.getDataRange().getValues();
    const blobs = [];
    const cache = CacheService.getScriptCache();
    const progressKey = 'PROGRESS_' + processId;

    const targetUsers = userData.filter((row, i) => i > 0 && selectedUserIds.includes(String(row[0])));
    const total = targetUsers.length;

    if (total === 0) return { success: false, message: 'Tidak ada data siswa yang dipilih.' };

    if(processId) cache.put(progressKey, `0/${total}`, 21600);

    const kartuCfg = getKartuConfig();
    for (let i = 0; i < total; i++) {
      const user = targetUsers[i];
      const uID = user[0];
      const uName = user[1];
      const uPass = user[2];
      const uClass = user[4];

      const tempFile = DriveApp.getFileById(kartuCfg.templateId).makeCopy('TEMP_' + uID);
      const tempId = tempFile.getId();
      const presentation = SlidesApp.openById(tempId);
      
      presentation.getSlides().forEach(slide => {
        slide.replaceAllText('{{nama}}', uName);
        slide.replaceAllText('{{userid}}', uID);
        slide.replaceAllText('{{password}}', uPass); 
        slide.replaceAllText('{{kelas}}', uClass || '-');
      });
      
      presentation.saveAndClose();

      const pdfBlob = tempFile.getAs(MimeType.PDF);
      pdfBlob.setName(`Kartu_${uName}_${uClass}.pdf`);
      blobs.push(pdfBlob);
      tempFile.setTrashed(true);
      
      if(processId) cache.put(progressKey, `${i + 1}/${total}`, 21600);
    }

    const timeStamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM-yyyy_HHmmss");
    const zipName = `Kartu_Ujian_Massal_${timeStamp}.zip`;
    const zipBlob = Utilities.zip(blobs, zipName);
    
    let folder;
    try { folder = DriveApp.getFolderById(kartuCfg.folderId); } catch(e) { folder = DriveApp.getRootFolder(); }

    const zipFile = folder.createFile(zipBlob);
    zipFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    if(processId) cache.remove(progressKey);

    return { success: true, url: zipFile.getDownloadUrl().replace("?e=download&gd=true", ""), message: `Berhasil memproses ${total} kartu siswa.` };

  } catch (e) {
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

function recalculateExamScores() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Hitung Ulang Nilai', 'Masukkan ExamID yang ingin dihitung ulang:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetExamID = response.getResponseText().trim();
  if (!targetExamID) { ui.alert('ExamID tidak boleh kosong.'); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName('Questions');
  const qData = qSheet.getDataRange().getValues();
  
  let qMap = {};
  let examMaxPoints = 0;

  qData.forEach((row, i) => {
    if (i > 0 && String(row[1]) === targetExamID) {
      const qid = String(row[0]);
      const weight = row[8] ? parseFloat(row[8]) : 10;
      qMap[qid] = { type: row[2], options: row[5], key: row[6], weight: weight };
      examMaxPoints += weight;
    }
  });

  if (examMaxPoints === 0) { ui.alert('ExamID tidak ditemukan atau tidak ada soal.'); return; }

  const rSheet = ss.getSheetByName('Responses');
  const rData = rSheet.getDataRange().getValues();
  let updateCount = 0;
  
  for (let i = 1; i < rData.length; i++) {
    const rowExamID = String(rData[i][2]);
    if (rowExamID === targetExamID) {
      const answersJSON = rData[i][3];
      let answers = {};
      try { answers = JSON.parse(answersJSON); } catch (e) { continue; }
      let totalPoints = 0;

      Object.keys(qMap).forEach(qid => {
        const q = qMap[qid];
        const userAns = answers[qid];
        const weight = q.weight;

        if (q.type === 'PG') {
            const cleanUser = String(userAns || '').trim().toLowerCase();
            const cleanKey = String(q.key || '').trim();
            const mapHuruf = ['A', 'B', 'C', 'D', 'E'];
            const keyIndex = mapHuruf.indexOf(cleanKey.toUpperCase());
            let isCorrect = false;

            if (keyIndex !== -1) {
                let opts = [];
                try { opts = JSON.parse(q.options); } catch (e) {}
                if (opts[keyIndex]) {
                    const correctText = String(opts[keyIndex]).trim().toLowerCase();
                    if (cleanUser === correctText && correctText !== '') isCorrect = true;
                }
            } else {
                if (cleanUser === cleanKey.toLowerCase()) isCorrect = true;
            }
            if (isCorrect) totalPoints += weight;
        } else if (q.type === 'PG_KOMPLEKS') {
            let keyArr = [], ansArr = [], optionsArrRC = [];
            try { keyArr = JSON.parse(q.key); } catch(e) { keyArr = String(q.key || '').split(',').map(s => s.trim()); }
            try { optionsArrRC = JSON.parse(q.options); } catch(e) { optionsArrRC = []; }
            if (Array.isArray(userAns)) { ansArr = userAns; }
            else { try { ansArr = JSON.parse(userAns); } catch(e) { ansArr = String(userAns || '').split(',').map(s => s.trim()); } }

            const mapHurufRC = ['A', 'B', 'C', 'D', 'E'];
            const finalKey = keyArr.map(k => {
                const cleanK = String(k).trim().toUpperCase();
                const idx = mapHurufRC.indexOf(cleanK);
                if (idx !== -1 && optionsArrRC[idx]) { return String(optionsArrRC[idx]).trim().toLowerCase(); }
                return cleanK.toLowerCase();
            });
            const finalUser = ansArr.map(u => String(u).trim().toLowerCase());

            let matchCount = 0, wrongCount = 0;
            finalUser.forEach(u => { if (finalKey.includes(u)) matchCount++; else wrongCount++; });
            if (wrongCount === 0 && finalKey.length > 0) { totalPoints += (matchCount / finalKey.length) * weight; }
        } else if (q.type === 'BS') {
            // BUG FIX RS-9: Scoring BS di recalculateExamScores sama dengan bug di tempat lain.
            // Gunakan array statements (q.options) sebagai jembatan antara key teks dan index siswa.
            let bsStmtsRC = [];
            try { bsStmtsRC = JSON.parse(q.options || '[]'); } catch(e) { bsStmtsRC = []; }
            if (!Array.isArray(bsStmtsRC)) bsStmtsRC = [];

            let keyObjRC = {};
            try { keyObjRC = JSON.parse(q.key); } catch (e) {
                if (String(userAns || '').toLowerCase() === String(q.key || '').toLowerCase()) totalPoints += weight;
                return;
            }
            const ansObjRC = (typeof userAns === 'object' && userAns !== null) ? userAns : {};
            const bsTotalRC = bsStmtsRC.length > 0 ? bsStmtsRC.length : Object.keys(keyObjRC).length;

            if (bsTotalRC > 0 && bsStmtsRC.length > 0) {
                let bsMatchRC = 0;
                bsStmtsRC.forEach(function(stmt, idx) {
                    const expByText = keyObjRC[stmt];
                    const expByIdx  = keyObjRC[String(idx)];
                    const expected  = expByText || expByIdx;
                    if (!expected) return;

                    const stuByIdx  = ansObjRC[String(idx)];
                    const stuByText = ansObjRC[stmt];
                    const studentAns = stuByIdx || stuByText || '';

                    const kVal = String(expected).trim().toLowerCase();
                    const uVal = String(studentAns).trim().toLowerCase();
                    if (kVal === uVal || (kVal === 'benar' && uVal === 'sesuai') || (kVal === 'salah' && uVal === 'tidak sesuai')) {
                        bsMatchRC++;
                    }
                });
                totalPoints += (bsMatchRC / bsTotalRC) * weight;
            } else if (bsTotalRC > 0) {
                let matchesRC = 0;
                for (const k in keyObjRC) {
                    const kVal = String(keyObjRC[k]).trim().toLowerCase();
                    const uVal = String(ansObjRC[k] || '').trim().toLowerCase();
                    const isMatch = (kVal === uVal) || (kVal === 'benar' && uVal === 'sesuai') || (kVal === 'salah' && uVal === 'tidak sesuai');
                    if (isMatch) matchesRC++;
                }
                totalPoints += (matchesRC / bsTotalRC) * weight;
            }
        } else if (q.type === 'JODOH') {
            const allPairs = q.options ? JSON.parse(q.options) : [];
            const pairs = allPairs.filter(p => p.q && String(p.q).trim() !== '');
            if (pairs.length > 0 && userAns && typeof userAns === 'object') {
                let matches = 0;
                pairs.forEach(p => { if (userAns[p.q] === p.a) matches++; });
                totalPoints += (matches / pairs.length) * weight;
            }
        }
      });

      const finalScore = examMaxPoints > 0 ? Math.round((totalPoints / examMaxPoints) * 10000) / 100 : 0;
      rSheet.getRange(i + 1, 5).setValue(finalScore); 
      updateCount++;
    }
  }

  ui.alert(`Selesai! Berhasil menghitung ulang nilai untuk ${updateCount} siswa pada ujian "${targetExamID}".`);
}

function unlockStudentExam(responseId, requestorID, requestorToken) {
  try {
    // BUG FIX #6: verifyAdminAccess() hanya mengizinkan Admin. Guru juga
    // harus bisa membuka blokir siswa di kelasnya sendiri (konsisten dengan
    // bulkUnlockStudents yang menerima Admin & Guru). Ganti dengan autentikasi
    // manual yang mengizinkan kedua role tersebut.
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let role = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(requestorID) && String(uData[i][5]) === String(requestorToken)) {
        role = String(uData[i][3]).trim(); break;
      }
    }
    if (!role)            return { success: false, message: 'Sesi tidak valid. Silakan login ulang.' };
    if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

    const sheet = SS.getSheetByName('Responses');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === responseId) {
        sheet.getRange(i + 1, 8).setValue('In Progress');
        const actorName = getActorName(requestorID);
        addAdminLog(requestorID, actorName, 'UNLOCK_STUDENT_EXAM', 'Response', responseId,
          `Blokir siswa dibuka untuk response ${responseId}.`);
        return { success: true, message: 'Akses siswa telah dibuka kembali.' };
      }
    }
    return { success: false, message: 'Response tidak ditemukan.' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function getMyExamResult(responseId, userID, token) {
  if (!isValidSession(userID, token)) return { success:false, message:'Sesi tidak valid. Silakan login ulang.' };
 
  const rSheet=SS.getSheetByName('Responses');
  const rData =rSheet.getDataRange().getValues();
  let isOwner=false;
  for (let i=1;i<rData.length;i++) {
    if (String(rData[i][0])===String(responseId)&&String(rData[i][1])===String(userID)) { isOwner=true; break; }
  }
  if (!isOwner) return { success:false, message:'Akses ditolak: bukan data Anda.' };
 
  let examID='', passingGrade=0;
  for (let i=1;i<rData.length;i++) {
    if (String(rData[i][0])===String(responseId)) { examID=String(rData[i][2]); break; }
  }
  if (examID) {
    const examSheet=SS.getSheetByName('Exams');
    const examRows =examSheet.getDataRange().getValues();
    for (let i=1;i<examRows.length;i++) {
      if (String(examRows[i][0])===examID) { passingGrade=examRows[i][10]?parseFloat(examRows[i][10]):0; break; }
    }
  }
 
  const result=getStudentAnswerDetails(responseId);
  if (result&&result.success) {
    result.passingGrade    = passingGrade;
    result.passingStatus   = getPassingStatus(parseFloat(result.finalScore)||0, passingGrade);
  }
  return result;
}

function deleteQuestionsBulk(ids, requestorID, requestorToken) {
  if (!ids || ids.length === 0) return { success: false, message: 'Tidak ada ID yang dikirim.' };

  var role = resolveRequestorRole_(requestorID, requestorToken);
  if (!role) return { success: false, message: 'Sesi tidak valid.' };

  const sheet = SS.getSheetByName('Questions');
  const data = sheet.getDataRange().getValues();

  const rowsToDelete = [];
  let examId = '';
  for (let i = 1; i < data.length; i++) {
    if (ids.includes(String(data[i][0]))) { 
      rowsToDelete.push(i + 1); 
      if (!examId) examId = data[i][1]; // Ambil examId dari salah satu soal
    }
  }

  // --- GUARD JADWAL INPUT SOAL ---
  var periodCheck = enforceInputPeriod_(role, examId);
  if (!periodCheck.ok) return { success: false, message: periodCheck.message };
  // -------------------------------

  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(rowNum => sheet.deleteRow(rowNum));

  return { success: true, deleted: rowsToDelete.length };
}

function getSiswaForGuru(requestorID, requestorToken) {
  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();

  let requestorRole = null;
  let guruClasses   = [];

  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) && String(uData[i][5]) === String(requestorToken)) {
      requestorRole = String(uData[i][3]).trim();
      if (requestorRole === 'Guru') {
        const raw = String(uData[i][4] || '');
        raw.split(',').forEach(item => {
          const parts = item.split(':');
          if (parts.length >= 2) { guruClasses.push(parts[1].trim().toLowerCase()); }
        });
      }
      break;
    }
  }

  if (!requestorRole) throw new Error('Sesi tidak valid. Silakan login ulang.');
  if (requestorRole === 'Siswa') throw new Error('Akses ditolak.');

  const result = [];
  for (let i = 1; i < uData.length; i++) {
    const role = String(uData[i][3]).trim();
    if (role !== 'Siswa') continue;

    const kelaSiswa = String(uData[i][4] || '').trim().toLowerCase();
    const isActive  = String(uData[i][6]).toUpperCase() === 'TRUE';

    if (requestorRole === 'Admin' || guruClasses.includes(kelaSiswa)) {
      result.push({ id: uData[i][0], nama: uData[i][1], kelas: uData[i][4], isActive: isActive });
    }
  }

  return result;
}

function getScriptTimezone() {
  return Session.getScriptTimeZone();
}

function pancingIzinOtorisasi() {
  const drive = DriveApp.getRootFolder().getName();
  const tempSlide = SlidesApp.create("Pancingan Izin");
  DriveApp.getFileById(tempSlide.getId()).setTrashed(true);
  Logger.log("Izin berhasil didapatkan untuk Drive dan Slides!");
}

function getExamMonitorData(requestorID, requestorToken) {
  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
 
  let requestorRole  = null;
  let guruClasses    = [];
  let guruClassesRaw = [];
  let guruMapelRaw   = [];
 
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) && String(uData[i][5]) === String(requestorToken)) {
      requestorRole = String(uData[i][3]).trim();
      if (requestorRole === 'Guru') {
        const raw = String(uData[i][4] || '');
        raw.split(',').forEach(item => {
          const parts = item.split(':');
          if (parts.length >= 2) {
            const mapel    = parts[0].trim();
            const kelasRaw = parts[1].trim();
            guruClasses.push(kelasRaw.toLowerCase());
            if (!guruClassesRaw.includes(kelasRaw)) guruClassesRaw.push(kelasRaw);
            if (mapel && !guruMapelRaw.includes(mapel)) guruMapelRaw.push(mapel);
          }
        });
      }
      break;
    }
  }
 
  if (!requestorRole)            return { success: false, message: 'Sesi tidak valid. Silakan login ulang.' };
  if (requestorRole === 'Siswa') return { success: false, message: 'Akses ditolak.' };
 
  const studentMap = {};
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][3]).trim() !== 'Siswa') continue;
    const kelas    = String(uData[i][4] || '').trim();
    const tokenVal = String(uData[i][5] || '').trim();
 
    if (requestorRole === 'Admin' || guruClasses.includes(kelas.toLowerCase())) {
      studentMap[String(uData[i][0])] = {
        nama:     String(uData[i][1]),
        kelas:    kelas,
        hasToken: tokenVal.length >= 10
      };
    }
  }
 
  const eSheet       = SS.getSheetByName('Exams');
  const eData        = eSheet.getDataRange().getValues();
  const examMap      = {};
  const classToMapel = {};
  const allMapelSet  = new Set();
 
  for (let i = 1; i < eData.length; i++) {
    const examId   = String(eData[i][0]);
    const subject  = String(eData[i][1] || '').trim();
    const kelas    = String(eData[i][2] || '').trim();
    const status   = String(eData[i][6] || '').toLowerCase();
    // Duration (kolom index 4) dalam menit — dipakai client-side untuk hitung sisa waktu
    const duration = parseFloat(eData[i][4]) || 0;
 
    examMap[examId] = { subject: subject, kelas: kelas, duration: duration };
 
    if (status === 'aktif') {
      if (!classToMapel[kelas]) classToMapel[kelas] = [];
      if (subject && !classToMapel[kelas].includes(subject)) { classToMapel[kelas].push(subject); }
      if (subject) allMapelSet.add(subject);
    }
  }
 
  // Baca batas pelanggaran dari Konfigurasi
  let violationLimit = 0; // 0 = tidak ada batas (tampilkan semua)
  try {
    const cfgSheetVL = SS.getSheetByName('Konfigurasi');
    if (cfgSheetVL) {
      const cfgDataVL = cfgSheetVL.getDataRange().getValues();
      for (let i = 1; i < cfgDataVL.length; i++) {
        if (String(cfgDataVL[i][0]).trim() === 'violation_limit') {
          const parsed = parseInt(cfgDataVL[i][1], 10);
          if (!isNaN(parsed) && parsed >= 0) violationLimit = parsed;
          break;
        }
      }
    }
  } catch(eVL) { violationLimit = 0; }

  const lSheet      = SS.getSheetByName('Logs');
  const lData       = lSheet.getDataRange().getValues();
  const violMap     = {};
  const violDetails = {};
  // violLogs: menyimpan array detail terstruktur {waktu, jenis, detail} per vKey
  const violLogs    = {};
  for (let i = 1; i < lData.length; i++) {
    const vKey = String(lData[i][1]) + '|' + String(lData[i][2]);
    violMap[vKey] = (violMap[vKey] || 0) + 1;
    if (lData[i][4]) {
      violDetails[vKey] = violDetails[vKey] ? violDetails[vKey] + '; ' + String(lData[i][4]) : String(lData[i][4]);
    }
    // Bangun log terstruktur untuk drill-down
    if (!violLogs[vKey]) violLogs[vKey] = [];
    const rawDetail = String(lData[i][4] || '').trim();
    const rawTs     = lData[i][5];
    let fmtTs = '-';
    try { if (rawTs) fmtTs = Utilities.formatDate(new Date(rawTs), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'); } catch(e2){}
    // Pisahkan jenis pelanggaran dan detail dari kolom Details
    // Format umum: "Menekan Tombol Windows (pelanggaran ke-1)" atau "Pindah tab/window"
    const parenIdx = rawDetail.lastIndexOf('(');
    let jenisViol  = rawDetail;
    let detailViol = '';
    if (parenIdx > 0) {
      jenisViol  = rawDetail.substring(0, parenIdx).trim();
      detailViol = rawDetail.substring(parenIdx).replace(/[()]/g, '').trim();
    }
    violLogs[vKey].push({ waktu: fmtTs, jenis: jenisViol || rawDetail, detail: detailViol });
  }
 
  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  const tz     = Session.getScriptTimeZone();

  // Hitung total soal per examID dari sheet Questions
  const qSheet    = SS.getSheetByName('Questions');
  const qData     = qSheet ? qSheet.getDataRange().getValues() : [];
  const qCountMap = {};
  for (let i = 1; i < qData.length; i++) {
    const eid = String(qData[i][1] || '').trim();
    if (!eid) continue;
    qCountMap[eid] = (qCountMap[eid] || 0) + 1;
  }
 
  function fmtDate(val) {
    if (!val || val === '') return '-';
    try { return Utilities.formatDate(new Date(val), tz, 'dd/MM/yyyy HH:mm:ss'); } catch(e) { return String(val); }
  }
 
  const result = { belumLogin: [], sudahLogin: [], mengerjakan: [], selesai: [], curang: [] };
 
  // BUG FIX #8: studentsWithResponse dideklarasikan tapi tidak pernah dipakai —
  // hapus variabel mati ini. studentsInAnyBucket sudah cukup untuk
  // menandai siswa yang punya response sehingga tidak masuk bucket login.
  const studentsInAnyBucket  = new Set();
 
  for (let i = 1; i < rData.length; i++) {
    const userID  = String(rData[i][1]);
    const examID  = String(rData[i][2]);
    const status  = String(rData[i][7] || '').toLowerCase().trim();
    const student = studentMap[userID];
    if (!student) continue;
 
    // BUG FIX #8 (lanjutan): Siswa yang punya response dengan status tidak
    // dikenal (kosong, null, atau nilai lain) sebelumnya tidak masuk ke bucket
    // manapun tapi sudah di-mark di studentsInAnyBucket — akibatnya mereka
    // menghilang dari seluruh tampilan monitor. Fallback ke bucket 'mengerjakan'
    // jika status tidak cocok dengan bucket yang dikenal.
    studentsInAnyBucket.add(userID);
 
    const vKey = userID + '|' + examID;
    const exam = examMap[examID] || { subject: examID, kelas: '-', duration: 0 };

    // Hitung jumlah soal yang sudah dijawab dari AnswersJSON (kolom index 3)
    let answeredCount = 0;
    try {
      const rawAnswers = rData[i][3];
      if (rawAnswers && typeof rawAnswers === 'string' && rawAnswers.trim() !== '' && rawAnswers.trim() !== '{}') {
        const parsed = JSON.parse(rawAnswers);
        if (parsed && typeof parsed === 'object') {
          // Hitung key yang bukan metadata internal (tidak diawali '_')
          answeredCount = Object.keys(parsed).filter(k => !String(k).startsWith('_') && parsed[k] !== null && parsed[k] !== '').length;
        }
      }
    } catch(e) { answeredCount = 0; }

    const entry = {
      responseId:     String(rData[i][0]),
      userID, nama: student.nama, kelas: student.kelas, examID,
      mapel:          exam.subject,
      duration:       exam.duration,
      startTime:      fmtDate(rData[i][5]),
      submitTime:     fmtDate(rData[i][6]),
      score:          rData[i][4] !== '' && rData[i][4] !== null ? rData[i][4] : '-',
      violations:     violMap[vKey] || 0,
      violDetail:     violDetails[vKey] || '',
      violLogs:       violLogs[vKey]    || [],
      answeredCount:  answeredCount,
      totalQuestions: qCountMap[examID] || 0
    };
 
    if (status === 'in progress') result.mengerjakan.push(entry);
    else if (_isFinishedStatus(status)) result.selesai.push(entry);
    else if (status === 'curang') result.curang.push(entry);
    else result.mengerjakan.push(entry); // fallback: status tidak dikenal → tampilkan sebagai sedang mengerjakan
  }
 
  for (const [userID, student] of Object.entries(studentMap)) {
    if (studentsInAnyBucket.has(userID)) continue;

    // Buat satu entry per ujian aktif yang relevan dengan kelas siswa ini,
    // agar filter exam selector di frontend bisa bekerja dengan benar.
    // Jika tidak ada ujian aktif untuk kelas ini, tetap tampilkan satu entry
    // tanpa examID agar siswa tidak menghilang dari tampilan "Semua Ujian".
    const relevantExams = [];
    for (let i = 1; i < eData.length; i++) {
      const exStatus = String(eData[i][6] || '').toLowerCase();
      if (exStatus !== 'aktif') continue;
      const exKelas = String(eData[i][2] || '').trim();
      if (exKelas.toLowerCase() === student.kelas.toLowerCase()) {
        relevantExams.push({ examID: String(eData[i][0]), subject: String(eData[i][1] || '') });
      }
    }

    if (relevantExams.length === 0) {
      // Tidak ada ujian aktif untuk kelas ini — tampilkan tanpa examID
      const mapelStr = (classToMapel[student.kelas] || []).join(', ') || '-';
      const entry = { responseId: null, userID, nama: student.nama, kelas: student.kelas,
        examID: '', mapel: mapelStr, startTime: '-', submitTime: '-',
        score: '-', violations: 0, violDetail: '' };
      if (student.hasToken) result.sudahLogin.push(entry);
      else result.belumLogin.push(entry);
    } else {
      // Buat satu entry per ujian aktif
      relevantExams.forEach(ex => {
        const entry = { responseId: null, userID, nama: student.nama, kelas: student.kelas,
          examID: ex.examID, mapel: ex.subject, startTime: '-', submitTime: '-',
          score: '-', violations: 0, violDetail: '' };
        if (student.hasToken) result.sudahLogin.push(entry);
        else result.belumLogin.push(entry);
      });
    }
  }
 
  const allKelasSet = new Set(Object.values(studentMap).map(s => s.kelas));
  const dropdownKelas = requestorRole === 'Guru' ? guruClassesRaw.sort() : [...allKelasSet].filter(Boolean).sort();
  const dropdownMapel = requestorRole === 'Guru' ? guruMapelRaw.sort() : [...allMapelSet].filter(Boolean).sort();

  // Kumpulkan daftar ujian AKTIF untuk Exam Selector di frontend.
  // Guru hanya melihat ujian yang sesuai penugasannya.
  const activeExams = [];
  for (let i = 1; i < eData.length; i++) {
    const examId  = String(eData[i][0]);
    const subject = String(eData[i][1] || '').trim();
    const kelas   = String(eData[i][2] || '').trim();
    const status  = String(eData[i][6] || '').toLowerCase();
    if (status !== 'aktif') continue;
    if (requestorRole === 'Guru') {
      // Saring hanya ujian yang kelasnya termasuk kelas Guru
      if (!guruClasses.includes(kelas.toLowerCase())) continue;
    }
    const examPin = String(eData[i][5] || '').trim();
    activeExams.push({ examID: examId, subject: subject, kelas: kelas, duration: parseFloat(eData[i][4]) || 0, pin: examPin });
  }

  return { success: true, data: result, meta: { dropdownKelas, dropdownMapel, activeExams, violationLimit } };
}
 
function bulkUnlockStudents(responseIds, requestorID, requestorToken) {
  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) && String(uData[i][5]) === String(requestorToken)) {
      role = String(uData[i][3]).trim(); break;
    }
  }
  if (!role) return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };
  if (!responseIds || responseIds.length === 0) return { success: false, message: 'Tidak ada data dipilih.' };
 
  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  const idsSet = new Set(responseIds.map(String));
  let count = 0;
  for (let i = 1; i < rData.length; i++) {
    if (idsSet.has(String(rData[i][0]))) {
      rSheet.getRange(i + 1, 8).setValue('In Progress');
      count++;
    }
  }
  SpreadsheetApp.flush();
  // BUG FIX #7a: Tambah pencatatan AdminLog untuk bulk unlock
  try {
    const actorName = getActorName(requestorID);
    addAdminLog(requestorID, actorName, 'BULK_UNLOCK_STUDENTS', 'Response',
      responseIds.join(','), `Bulk unlock ${count} siswa oleh ${actorName}.`);
  } catch(logErr) { Logger.log('bulkUnlockStudents AdminLog error: ' + logErr.message); }
  return { success: true, message: `${count} siswa berhasil dibuka blokirnya.`, count };
}
 
function bulkResetStudents(responseIds, requestorID, requestorToken) {
  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) && String(uData[i][5]) === String(requestorToken)) {
      role = String(uData[i][3]).trim(); break;
    }
  }
  if (!role) return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };
  if (!responseIds || responseIds.length === 0) return { success: false, message: 'Tidak ada data dipilih.' };
 
  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  const idsSet = new Set(responseIds.map(String));
  const rowsToDelete = [];
  for (let i = 1; i < rData.length; i++) {
    if (idsSet.has(String(rData[i][0]))) rowsToDelete.push(i + 1);
  }
  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(r => rSheet.deleteRow(r));
  SpreadsheetApp.flush();
  // BUG FIX #7b: Tambah pencatatan AdminLog untuk bulk reset (konsisten dengan
  // resetStudentExam single yang selalu mencatat ke AdminLogs).
  try {
    const actorName = getActorName(requestorID);
    addAdminLog(requestorID, actorName, 'BULK_RESET_STUDENTS', 'Response',
      responseIds.join(','), `Bulk reset ${rowsToDelete.length} data ujian siswa oleh ${actorName}.`);
  } catch(logErr) { Logger.log('bulkResetStudents AdminLog error: ' + logErr.message); }
  return { success: true, message: `${rowsToDelete.length} data ujian berhasil di-reset. Siswa dapat mengerjakan ulang.`, count: rowsToDelete.length };
}

function addAdminLog(actorID, actorName, action, targetType, targetID, details) {
  try {
    const sheet = SS.getSheetByName('AdminLogs');
    if (!sheet) return;
    const logID = 'ALOG-' + Date.now();
    sheet.appendRow([logID, new Date(), actorID, actorName, action, targetType, targetID, details]);
  } catch(e) {
    Logger.log('addAdminLog error: ' + e.message);
  }
}

function getActorName(actorID) {
  const sheet = SS.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if (String(data[i][0]) === String(actorID)) return data[i][1];
  }
  return 'Unknown';
}

function getAdminLogs(requestorID, requestorToken, limit) {
  const uSheet = SS.getSheetByName('Users');
  const uData = uSheet.getDataRange().getValues();
  let role = null;
  for (let i=1;i<uData.length;i++) {
    if (String(uData[i][0])===String(requestorID) && String(uData[i][5])===String(requestorToken)) {
      role = uData[i][3]; break;
    }
  }
  if (!role) return { success:false, message:'Sesi tidak valid.' };
  if (role === 'Siswa') return { success:false, message:'Akses ditolak.' };
 
  const sheet = SS.getSheetByName('AdminLogs');
  if (!sheet || sheet.getLastRow() <= 1) return { success:true, data:[] };
 
  const tz = Session.getScriptTimeZone();
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i=1;i<data.length;i++) {
    rows.push({
      id:         data[i][0],
      timestamp:  data[i][1] ? Utilities.formatDate(new Date(data[i][1]),tz,'dd/MM/yyyy HH:mm:ss') : '-',
      actorID:    data[i][2],
      actorName:  data[i][3],
      action:     data[i][4],
      targetType: data[i][5],
      targetID:   data[i][6],
      details:    data[i][7]
    });
  }
  rows.reverse();
  const maxRows = limit || 200;
  return { success:true, data: rows.slice(0, maxRows) };
}

function autoActivateExams() {
  const sheet = SS.getSheetByName('Exams');
  if (!sheet || sheet.getLastRow() <= 1) return;
 
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  let changes = 0;
 
  for (let i=1;i<data.length;i++) {
    const startDate = data[i][3] instanceof Date ? data[i][3] : null;
    const endDate   = data[i][7] instanceof Date ? data[i][7] : null;
    const currentStatus = String(data[i][6]);
 
    if (!startDate) continue;
 
    let newStatus = currentStatus;
 
    if (endDate && now > endDate) {
      newStatus = 'Non-Aktif';
    } else if (startDate && now >= startDate && (!endDate || now <= endDate)) {
      newStatus = 'Aktif';
    } else if (startDate && now < startDate) {
      newStatus = 'Non-Aktif';
    }
 
    if (newStatus !== currentStatus) {
      sheet.getRange(i+1, 7).setValue(newStatus);
      Logger.log(`[AutoActivate] ExamID=${data[i][0]} status berubah: ${currentStatus} → ${newStatus}`);
      changes++;
    }
  }
 
  if (changes > 0) SpreadsheetApp.flush();
  Logger.log(`[AutoActivate] Selesai. ${changes} ujian diperbarui.`);
}

function setupAutoActivateTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'autoActivateExams') {
      ScriptApp.deleteTrigger(t);
    }
  });
 
  ScriptApp.newTrigger('autoActivateExams')
    .timeBased()
    .everyMinutes(5)
    .create();
 
  Logger.log('✅ Trigger autoActivateExams (setiap 5 menit) berhasil dibuat.');
  return { success:true, message:'Trigger auto-activate setiap 5 menit berhasil dibuat.' };
}

function removeAutoActivateTrigger() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'autoActivateExams') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log(`Trigger autoActivateExams dihapus (${removed} trigger).`);
  return { success:true, message:`${removed} trigger auto-activate berhasil dihapus.` };
}

function checkAutoActivateTriggerStatus() {
  const triggers = ScriptApp.getProjectTriggers();
  const active = triggers.some(t => t.getHandlerFunction() === 'autoActivateExams');
  return { active: active };
}

function getItemAnalysis(examID, requestorID, requestorToken) {
  const uSheet = SS.getSheetByName('Users');
  const uData = uSheet.getDataRange().getValues();
  let role = null;
  for (let i=1;i<uData.length;i++) {
    if (String(uData[i][0])===String(requestorID) && String(uData[i][5])===String(requestorToken)) {
      role = uData[i][3]; break;
    }
  }
  if (!role) return { success:false, message:'Sesi tidak valid.' };
  if (role==='Siswa') return { success:false, message:'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-' };
  for (let i = 1; i < examRows.length; i++) {
    if (String(examRows[i][0]) === String(examID)) {
      examInfo = { subject: String(examRows[i][1]), classes: String(examRows[i][2]) };
      break;
    }
  }
 
  const qSheet = SS.getSheetByName('Questions');
  const qData = qSheet.getDataRange().getValues();
  const questions = [];
  for (let i=1;i<qData.length;i++) {
    if (String(qData[i][1])===String(examID)) {
      let opts = [];
      try { opts = JSON.parse(qData[i][5]); } catch(e) { opts=[]; }
      questions.push({
        id:      qData[i][0],
        type:    qData[i][2],
        content: qData[i][3],
        options: opts,
        key:     qData[i][6],
        weight:  qData[i][8] ? parseFloat(qData[i][8]) : 10
      });
    }
  }
  if (questions.length === 0) return { success:false, message:'Tidak ada soal ditemukan untuk ujian ini.' };
 
  const rSheet = SS.getSheetByName('Responses');
  const rData = rSheet.getDataRange().getValues();
  const responses = [];
  for (let i=1;i<rData.length;i++) {
    const examIdRow = String(rData[i][2]);
    const status    = String(rData[i][7]).toLowerCase();
    if (examIdRow===String(examID) && _isFinishedStatus(status)) {
      let answers = {};
      try { answers = JSON.parse(rData[i][3]||'{}'); } catch(e) { answers={}; }
      responses.push({ answers: answers, totalScore: parseFloat(rData[i][4])||0 });
    }
  }
 
  const totalStudents = responses.length;
  if (totalStudents === 0) return { success:false, message:'Belum ada siswa yang menyelesaikan ujian ini.' };
 
  responses.sort((a,b) => b.totalScore - a.totalScore);
 
  const groupSize = Math.max(1, Math.floor(totalStudents * 0.27));
  const upperGroup = responses.slice(0, groupSize);
  const lowerGroup = responses.slice(totalStudents - groupSize);
 
  function isPGCorrect(userAns, q) {
    const stripHtml = function(s) { return String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().toLowerCase(); };
    const cleanUser = stripHtml(userAns);
    const cleanKey  = String(q.key||'').trim();
    const mapHuruf  = ['A','B','C','D','E'];
    const keyIndex  = mapHuruf.indexOf(cleanKey.toUpperCase());
    if (keyIndex !== -1 && q.options[keyIndex]) {
      const txt = stripHtml(q.options[keyIndex]);
      return cleanUser === txt && txt !== '';
    }
    return cleanUser === stripHtml(cleanKey);
  }
 
  function isBSCorrect(userAns, q) {
    // BUG FIX RS-10: isBSCorrect juga harus menggunakan statements array (q.options)
    // sebagai jembatan antara key teks pernyataan dan jawaban siswa berindex numerik.
    let keyObj = {};
    try { keyObj = JSON.parse(q.key); } catch(e) { return false; }
    let stmtsBS = [];
    try { stmtsBS = JSON.parse(q.options); } catch(e) { stmtsBS = []; }
    if (!Array.isArray(stmtsBS)) stmtsBS = [];

    const ansObj = (typeof userAns==='object' && userAns!==null) ? userAns : {};
    const total = stmtsBS.length > 0 ? stmtsBS.length : Object.keys(keyObj).length;
    if (total === 0) return false;

    if (stmtsBS.length > 0) {
      let matches = 0;
      stmtsBS.forEach(function(stmt, idx) {
        const expByText = keyObj[stmt];
        const expByIdx  = keyObj[String(idx)];
        const expected  = expByText || expByIdx;
        if (!expected) return;
        const stuByIdx  = ansObj[String(idx)];
        const stuByText = ansObj[stmt];
        const studentAns = stuByIdx || stuByText || '';
        const kVal = String(expected).trim().toLowerCase();
        const uVal = String(studentAns).trim().toLowerCase();
        if (kVal===uVal || (kVal==='benar'&&uVal==='sesuai') || (kVal==='salah'&&uVal==='tidak sesuai')) matches++;
      });
      return matches === total;
    }
    // Fallback legacy
    let matches = 0;
    for (const idx in keyObj) {
      const kVal = String(keyObj[idx]).trim().toLowerCase();
      const uVal = String(ansObj[idx]||'').trim().toLowerCase();
      if (kVal===uVal || (kVal==='benar'&&uVal==='sesuai') || (kVal==='salah'&&uVal==='tidak sesuai')) matches++;
    }
    return matches === total;
  }
 
  function isJODOHCorrect(userAns, q) {
    let allPairs = [];
    try { allPairs = JSON.parse(q.key); } catch(e) {
      try { allPairs = JSON.parse(q.options); } catch(e2) { return false; }
    }
    if (!Array.isArray(allPairs) || allPairs.length===0) return false;
    if (!userAns || typeof userAns!=='object') return false;
    const pairs = allPairs.filter(p => p.q && String(p.q).trim() !== '');
    if (pairs.length === 0) return false;
    let matches = 0;
    pairs.forEach(p => { if (userAns[p.q]===p.a) matches++; });
    return matches === pairs.length;
  }
 
  function isCorrect(userAns, q) {
    if (q.type==='PG')    return isPGCorrect(userAns, q);
    if (q.type==='BS')    return isBSCorrect(userAns, q);
    if (q.type==='JODOH') return isJODOHCorrect(userAns, q);
    if (q.type==='Esai')  return null;
    if (q.type==='PG_KOMPLEKS') {
      let keyArr=[], ansArr=[];
      try { keyArr = JSON.parse(q.key); } catch(e) { keyArr = String(q.key||'').split(',').map(s=>s.trim()); }
      if (Array.isArray(userAns)) ansArr=userAns;
      else { try { ansArr=JSON.parse(userAns); } catch(e) { ansArr=[]; } }
      const mapHuruf=['A','B','C','D','E'];
      const kNorm=keyArr.map(k=>{ const idx=mapHuruf.indexOf(String(k).trim().toUpperCase()); return (idx!==-1&&q.options[idx]) ? String(q.options[idx]).trim().toLowerCase() : String(k).trim().toLowerCase(); });
      const aNorm=ansArr.map(a=>String(a).trim().toLowerCase());
      let match=0, wrong=0;
      aNorm.forEach(a=>kNorm.includes(a)?match++:wrong++);
      return wrong===0 && match===kNorm.length;
    }
    return false;
  }
 
  const analysisResult = questions.map(q => {
    if (q.type==='Esai') {
      return {
        id:           q.id,
        type:         q.type,
        content:      String(q.content||'').replace(/<[^>]*>/g,' ').trim().substring(0,120),
        totalStudents:totalStudents,
        difficulty:   null,
        diffLabel:    'N/A (Esai)',
        discrimination: null,
        discLabel:    'N/A (Esai)',
        optionDist:   [],
        note:         'Soal esai tidak dapat dianalisis otomatis.'
      };
    }
 
    let correctCount = 0;
    responses.forEach(r => {
      const ans = r.answers[q.id];
      if (isCorrect(ans, q) === true) correctCount++;
    });
    const P = totalStudents > 0 ? correctCount / totalStudents : 0;
 
    let upperCorrect = 0, lowerCorrect = 0;
    upperGroup.forEach(r => { if (isCorrect(r.answers[q.id], q)===true) upperCorrect++; });
    lowerGroup.forEach(r => { if (isCorrect(r.answers[q.id], q)===true) lowerCorrect++; });
    const D = groupSize > 0 ? (upperCorrect/groupSize) - (lowerCorrect/groupSize) : 0;
 
    let diffLabel, discLabel, discColor;
    if (P < 0.30)       diffLabel = '🔴 Sukar';
    else if (P <= 0.70) diffLabel = '🟡 Sedang';
    else                diffLabel = '🟢 Mudah';
 
    if (D < 0)          { discLabel='⛔ Negatif (Buang)'; discColor='red'; }
    else if (D < 0.20)  { discLabel='🔴 Jelek'; discColor='orange'; }
    else if (D < 0.30)  { discLabel='🟡 Cukup'; discColor='yellow'; }
    else if (D < 0.40)  { discLabel='🟢 Baik'; discColor='green'; }
    else                { discLabel='💎 Sangat Baik'; discColor='emerald'; }
 
    let optionDist = [];
    if (q.type==='PG' && Array.isArray(q.options) && q.options.length>0) {
      const mapHuruf = ['A','B','C','D','E'];
      const stripH = function(s) { return String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().toLowerCase(); };
      const counts = {};
      q.options.forEach((opt,idx) => { counts[stripH(opt)] = 0; });
      responses.forEach(r => {
        const rawAns = r.answers[q.id];
        const ans = stripH(rawAns);
        if (ans in counts) counts[ans]++;
        else {
          const hIdx = mapHuruf.indexOf(String(rawAns||'').trim().toUpperCase());
          if (hIdx!==-1 && q.options[hIdx]) {
            const txt = stripH(q.options[hIdx]);
            if (txt in counts) counts[txt]++;
          }
        }
      });
      const cleanKey = String(q.key||'').trim();
      const keyIdx = mapHuruf.indexOf(cleanKey.toUpperCase());
      const correctText = keyIdx!==-1 && q.options[keyIdx] ? stripH(q.options[keyIdx]) : cleanKey.toLowerCase();
      optionDist = q.options.map((opt,idx) => ({
        label:     mapHuruf[idx] || String(idx+1),
        text:      opt,
        count:     counts[stripH(opt)]||0,
        pct:       totalStudents>0 ? Math.round((counts[stripH(opt)]||0)/totalStudents*100) : 0,
        isCorrect: stripH(opt)===correctText
      }));
    }
 
    return {
      id:             q.id,
      type:           q.type,
      content:        String(q.content||'').replace(/<[^>]*>/g,' ').trim().substring(0,150),
      totalStudents:  totalStudents,
      correctCount:   correctCount,
      difficulty:     Math.round(P*100)/100,
      diffLabel:      diffLabel,
      discrimination: Math.round(D*100)/100,
      discLabel:      discLabel,
      discColor:      discColor,
      optionDist:     optionDist,
      key:            q.type === 'PG_KOMPLEKS' ? q.key : undefined,
      keyLetters:     (function() {
        if (q.type !== 'PG_KOMPLEKS') return undefined;
        var mapH = ['A','B','C','D','E'];
        var kArr = [];
        try { var parsed = JSON.parse(q.key); kArr = Array.isArray(parsed) ? parsed : []; }
        catch(e) { kArr = String(q.key||'').split(',').map(function(s){ return s.trim(); }); }
        return kArr.map(function(k) {
          var upperK = String(k).trim().toUpperCase();
          if (mapH.indexOf(upperK) !== -1) return upperK;
          var found = -1;
          q.options.forEach(function(opt, idx) {
            if (String(opt).trim().toLowerCase() === String(k).trim().toLowerCase()) found = idx;
          });
          return found !== -1 ? mapH[found] : String(k).trim();
        });
      })()
    };
  });
 
  return {
    success:      true,
    examID:       examID,
    examInfo:     examInfo,
    totalStudents:totalStudents,
    groupSize:    groupSize,
    data:         analysisResult
  };
}

function backupDataToDrive() {
  try {
    const tz = Session.getScriptTimeZone();
    const timestamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
 
    const sourceFile = DriveApp.getFileById(SS.getId());
 
    let backupFolder;
    const folders = DriveApp.getFoldersByName('CBT_BACKUPS');
    if (folders.hasNext()) {
      backupFolder = folders.next();
    } else {
      backupFolder = DriveApp.createFolder('CBT_BACKUPS');
    }
 
    const backupName = `Backup_CBT_${timestamp}`;
    const copy = sourceFile.makeCopy(backupName, backupFolder);
    copy.setDescription(`Backup otomatis CBT pada ${Utilities.formatDate(new Date(),tz,'dd MMMM yyyy HH:mm')}`);
 
    addAdminLog('SYSTEM','Auto Backup','BACKUP','Database',backupName,`Backup berhasil. File ID: ${copy.getId()}. URL: https://drive.google.com/file/d/${copy.getId()}`);
 
    Logger.log(`✅ Backup berhasil: ${backupName} (ID: ${copy.getId()})`);
    return { success:true, fileName:backupName, fileId:copy.getId(), url:`https://drive.google.com/file/d/${copy.getId()}` };
 
  } catch(e) {
    Logger.log('❌ Backup gagal: ' + e.toString());
    addAdminLog('SYSTEM','Auto Backup','BACKUP_FAILED','Database','-','Error: ' + e.message);
    return { success:false, message:e.toString() };
  }
}

function setupSemesterBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'backupDataToDrive') {
      ScriptApp.deleteTrigger(t);
    }
  });
 
  const now = new Date();
  const year = now.getFullYear();
 
  const june30 = new Date(year, 5, 30, 23, 30);
  const dec31  = new Date(year, 11, 31, 23, 30);
 
  let created = 0;
 
  if (june30 > now) {
    ScriptApp.newTrigger('backupDataToDrive').timeBased().at(june30).create();
    created++;
    Logger.log('Trigger backup 30 Juni ' + year + ' dibuat.');
  }
 
  if (dec31 > now) {
    ScriptApp.newTrigger('backupDataToDrive').timeBased().at(dec31).create();
    created++;
    Logger.log('Trigger backup 31 Desember ' + year + ' dibuat.');
  }
 
  const nextYear = year + 1;
  const june30Next = new Date(nextYear, 5, 30, 23, 30);
  const dec31Next  = new Date(nextYear, 11, 31, 23, 30);
  ScriptApp.newTrigger('backupDataToDrive').timeBased().at(june30Next).create();
  ScriptApp.newTrigger('backupDataToDrive').timeBased().at(dec31Next).create();
  created += 2;
 
  return { success:true, message:`${created} trigger backup berhasil dibuat (30 Juni & 31 Desember).` };
}

function manualBackup(requestorID, requestorToken) {
  try {
    verifyAdminAccess(requestorID, requestorToken);
  } catch(e) {
    return { success:false, message:'Akses Ditolak: ' + e.message };
  }
  const actorName = getActorName(requestorID);
  addAdminLog(requestorID, actorName, 'MANUAL_BACKUP', 'Database', '-', 'Backup manual dipicu oleh Admin.');
  return backupDataToDrive();
}

function getBSItemAnalysis(examID, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examData  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-', passingGrade: 0 };
  for (let i = 1; i < examData.length; i++) {
    if (String(examData[i][0]) === String(examID)) {
      examInfo = {
        subject:      String(examData[i][1]),
        classes:      String(examData[i][2]),
        passingGrade: parseFloat(examData[i][10]) || 0
      };
      break;
    }
  }

  const qSheet = SS.getSheetByName('Questions');
  const qData  = qSheet.getDataRange().getValues();
  const bsQuestions = [];

  for (let i = 1; i < qData.length; i++) {
    if (String(qData[i][1]) !== String(examID)) continue;
    if (String(qData[i][2]) !== 'BS') continue;

    let statements = [];
    try { statements = JSON.parse(qData[i][5]); } catch(e) { statements = []; }

    let keyObj = {};
    try {
      const rawKey = qData[i][6];
      if (rawKey && typeof rawKey === 'string' && rawKey.trim().startsWith('{')) {
        keyObj = JSON.parse(rawKey);
      } else if (typeof rawKey === 'object' && rawKey !== null) {
        keyObj = rawKey;
      }
    } catch(e) { keyObj = {}; }

    bsQuestions.push({
      id:         String(qData[i][0]),
      content:    String(qData[i][3] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      statements: statements.map(s =>
        String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      ),
      keyObj:  keyObj,
      weight:  qData[i][8] ? parseFloat(qData[i][8]) : 10
    });
  }

  if (bsQuestions.length === 0) {
    return { success: false, message: 'Tidak ada soal Benar/Salah (BS) ditemukan untuk ujian ini.' };
  }

  const users = {};
  uData.forEach((r, i) => {
    if (i > 0) users[String(r[0]).trim()] = { name: r[1], cls: r[4] };
  });

  const rSheet    = SS.getSheetByName('Responses');
  const rData     = rSheet.getDataRange().getValues();
  const responses = [];

  for (let i = 1; i < rData.length; i++) {
    const examIdRow = String(rData[i][2]).trim();
    const status    = String(rData[i][7]).toLowerCase();
    if (examIdRow !== String(examID)) continue;
    if (!_isFinishedStatus(status)) continue;

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

    const sid  = String(rData[i][1]).trim();
    const info = users[sid] || { name: 'Unknown', cls: '-' };

    responses.push({
      studentId:    sid,
      studentName:  info.name,
      studentClass: info.cls,
      answers:      answers,
      totalScore:   parseFloat(rData[i][4]) || 0
    });
  }

  const totalStudents = responses.length;
  if (totalStudents === 0) {
    return { success: false, message: 'Belum ada siswa yang menyelesaikan ujian ini.' };
  }

  responses.sort((a, b) => b.totalScore - a.totalScore);
  const groupSize  = Math.max(1, Math.floor(totalStudents * 0.27));
  const upperGroup = responses.slice(0, groupSize);
  const lowerGroup = responses.slice(totalStudents - groupSize);

  function getDiffLabel(P) {
    if (P < 0.30) return { label: 'Sukar',  level: 'hard'   };
    if (P <= 0.70) return { label: 'Sedang', level: 'medium' };
    return             { label: 'Mudah',  level: 'easy'   };
  }
  function getDiscLabel(D) {
    if (D < 0)     return { label: 'Negatif — Buang', level: 'negative'  };
    if (D < 0.20)  return { label: 'Jelek',            level: 'poor'      };
    if (D < 0.30)  return { label: 'Cukup',            level: 'fair'      };
    if (D < 0.40)  return { label: 'Baik',             level: 'good'      };
    return               { label: 'Sangat Baik',       level: 'excellent' };
  }

  const bsAnalysis = bsQuestions.map((q, qIdx) => {

    const statementAnalysis = q.statements.map((stmt, idx) => {
      const idxStr = String(idx);
      const keyVal = String(q.keyObj[idxStr] || '').trim().toLowerCase();

      const isStmtCorrect = (answersObj) => {
        const rawAns = answersObj[q.id];
        if (!rawAns || typeof rawAns !== 'object') return false;
        const uVal = String(rawAns[idxStr] || '').trim().toLowerCase();
        if (!uVal) return false;
        return (
          uVal === keyVal ||
          (keyVal === 'benar' && uVal === 'sesuai') ||
          (keyVal === 'salah' && uVal === 'tidak sesuai')
        );
      };

      let correctCount = 0;
      const wrongStudents = [];

      responses.forEach(r => {
        if (isStmtCorrect(r.answers)) {
          correctCount++;
        } else {
          const rawAns = r.answers[q.id];
          let givenAns = 'Tidak Dijawab';
          if (rawAns && typeof rawAns === 'object') {
            givenAns = String(rawAns[idxStr] || 'Tidak Dijawab');
          }
          wrongStudents.push({
            name:  r.studentName,
            cls:   r.studentClass,
            given: givenAns || 'Tidak Dijawab',
            score: r.totalScore
          });
        }
      });

      const P = totalStudents > 0 ? correctCount / totalStudents : 0;

      let upperCorrect = 0, lowerCorrect = 0;
      upperGroup.forEach(r => { if (isStmtCorrect(r.answers)) upperCorrect++; });
      lowerGroup.forEach(r => { if (isStmtCorrect(r.answers)) lowerCorrect++; });
      const D = groupSize > 0 ? (upperCorrect / groupSize) - (lowerCorrect / groupSize) : 0;

      return {
        index:        idx,
        text:         stmt,
        keyAnswer:    q.keyObj[idxStr] || '-',
        correctCount: correctCount,
        wrongCount:   totalStudents - correctCount,
        P:            Math.round(P * 1000) / 1000,
        D:            Math.round(D * 1000) / 1000,
        diffLabel:    getDiffLabel(P),
        discLabel:    getDiscLabel(D),
        upperCorrect: upperCorrect,
        lowerCorrect: lowerCorrect,
        wrongStudents: wrongStudents.sort((a, b) => b.score - a.score)
      };
    });

    const n      = statementAnalysis.length || 1;
    const avgP   = statementAnalysis.reduce((s, st) => s + st.P, 0) / n;
    const avgD   = statementAnalysis.reduce((s, st) => s + st.D, 0) / n;
    const badStmts = statementAnalysis.filter(st => st.D < 0.20 || st.P < 0.20).length;

    return {
      questionId:       q.id,
      questionNumber:   qIdx + 1,
      content:          q.content,
      weight:           q.weight,
      totalStatements:  q.statements.length,
      avgP:             Math.round(avgP * 1000) / 1000,
      avgD:             Math.round(avgD * 1000) / 1000,
      avgDiffLabel:     getDiffLabel(avgP),
      avgDiscLabel:     getDiscLabel(avgD),
      badStatements:    badStmts,
      statements:       statementAnalysis
    };
  });

  const allStmts   = bsAnalysis.flatMap(q => q.statements);
  const totalStmts = allStmts.length;

  const summary = {
    difficulty: {
      mudah:  allStmts.filter(s => s.P >  0.70).length,
      sedang: allStmts.filter(s => s.P >= 0.30 && s.P <= 0.70).length,
      sukar:  allStmts.filter(s => s.P <  0.30).length
    },
    discrimination: {
      negatif:   allStmts.filter(s => s.D <  0   ).length,
      jelek:     allStmts.filter(s => s.D >= 0    && s.D < 0.20).length,
      cukup:     allStmts.filter(s => s.D >= 0.20 && s.D < 0.30).length,
      baik:      allStmts.filter(s => s.D >= 0.30 && s.D < 0.40).length,
      sangatBaik:allStmts.filter(s => s.D >= 0.40).length
    },
    totalBermasalah: allStmts.filter(s => s.D < 0.20 || s.P < 0.20).length
  };

  return {
    success:          true,
    examID:           examID,
    examInfo:         examInfo,
    totalStudents:    totalStudents,
    groupSize:        groupSize,
    totalBSQuestions: bsQuestions.length,
    totalStatements:  totalStmts,
    summary:          summary,
    data:             bsAnalysis
  };
}

function getJODOHItemAnalysis(examID, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-', passingGrade: 0 };
  for (let i = 1; i < examRows.length; i++) {
    if (String(examRows[i][0]) === String(examID)) {
      examInfo = {
        subject:      String(examRows[i][1]),
        classes:      String(examRows[i][2]),
        passingGrade: parseFloat(examRows[i][10]) || 0
      };
      break;
    }
  }

  const qSheet   = SS.getSheetByName('Questions');
  const qData    = qSheet.getDataRange().getValues();
  const jQuestions = [];

  for (let i = 1; i < qData.length; i++) {
    if (String(qData[i][1]) !== String(examID)) continue;
    if (String(qData[i][2]) !== 'JODOH' && String(qData[i][2]) !== 'MATCHING') continue;

    let pairs = [];
    const keyRaw  = String(qData[i][6] || '').trim();
    const optRaw  = String(qData[i][5] || '').trim();

    if (keyRaw && keyRaw !== 'Auto-Check' && keyRaw.startsWith('[')) {
      try { const p = JSON.parse(keyRaw); if (Array.isArray(p) && p.length > 0) pairs = p; } catch(e) {}
    }
    if (pairs.length === 0 && optRaw.startsWith('[')) {
      try { const p = JSON.parse(optRaw); if (Array.isArray(p) && p.length > 0) pairs = p; } catch(e) {}
    }
    if (pairs.length === 0) continue;

    jQuestions.push({
      id:      String(qData[i][0]),
      content: String(qData[i][3] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      pairs:   pairs.map(p => ({
        q: String(p.q || '').replace(/<[^>]*>/g, ' ').trim(),
        a: String(p.a || '').replace(/<[^>]*>/g, ' ').trim()
      })),
      weight: qData[i][8] ? parseFloat(qData[i][8]) : 10
    });
  }

  if (jQuestions.length === 0) {
    return { success: false, message: 'Tidak ada soal Menjodohkan ditemukan untuk ujian ini.' };
  }

  const users = {};
  uData.forEach((r, i) => {
    if (i > 0) users[String(r[0]).trim()] = { name: r[1], cls: r[4] };
  });

  const rSheet    = SS.getSheetByName('Responses');
  const rData     = rSheet.getDataRange().getValues();
  const responses = [];

  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][2]).trim() !== String(examID)) continue;
    const status = String(rData[i][7]).toLowerCase();
    if (!_isFinishedStatus(status)) continue;

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

    const sid  = String(rData[i][1]).trim();
    const info = users[sid] || { name: 'Unknown', cls: '-' };

    responses.push({
      studentId:    sid,
      studentName:  info.name,
      studentClass: info.cls,
      answers:      answers,
      totalScore:   parseFloat(rData[i][4]) || 0
    });
  }

  const totalStudents = responses.length;
  if (totalStudents === 0) {
    return { success: false, message: 'Belum ada siswa yang menyelesaikan ujian ini.' };
  }

  responses.sort((a, b) => b.totalScore - a.totalScore);
  const groupSize  = Math.max(1, Math.floor(totalStudents * 0.27));
  const upperGroup = responses.slice(0, groupSize);
  const lowerGroup = responses.slice(totalStudents - groupSize);

  function parseStudentJODOH(rawAns) {
    if (!rawAns) return {};
    if (typeof rawAns === 'object' && !Array.isArray(rawAns)) return rawAns;
    if (typeof rawAns === 'string' && rawAns.trim().startsWith('{')) {
      try { return JSON.parse(rawAns); } catch(e) { return {}; }
    }
    return {};
  }

  function getDiffLabel(P) {
    if (P < 0.30) return { label: 'Sukar',  level: 'hard'   };
    if (P <= 0.70) return { label: 'Sedang', level: 'medium' };
    return             { label: 'Mudah',  level: 'easy'   };
  }
  function getDiscLabel(D) {
    if (D < 0)     return { label: 'Negatif — Buang', level: 'negative'  };
    if (D < 0.20)  return { label: 'Jelek',            level: 'poor'      };
    if (D < 0.30)  return { label: 'Cukup',            level: 'fair'      };
    if (D < 0.40)  return { label: 'Baik',             level: 'good'      };
    return               { label: 'Sangat Baik',       level: 'excellent' };
  }

  const jAnalysis = jQuestions.map((q, qIdx) => {

    const allAnswerOptions = [...new Set(q.pairs.map(p => p.a))];

    const pairAnalysis = q.pairs.map((pair, pIdx) => {

      const isPairCorrect = (answersObj) => {
        const stuObj = parseStudentJODOH(answersObj[q.id]);
        const given  = String(stuObj[pair.q] || '').trim().toLowerCase();
        return given !== '' && given === pair.a.toLowerCase();
      };

      let correctCount = 0;
      const wrongStudents = [];

      responses.forEach(r => {
        if (isPairCorrect(r.answers)) {
          correctCount++;
        } else {
          const stuObj  = parseStudentJODOH(r.answers[q.id]);
          const givenRaw = stuObj[pair.q];
          const given    = givenRaw ? String(givenRaw).trim() : 'Tidak Dijawab';
          wrongStudents.push({
            name:      r.studentName,
            cls:       r.studentClass,
            given:     given,
            score:     r.totalScore
          });
        }
      });

      const P = totalStudents > 0 ? correctCount / totalStudents : 0;

      let upperCorrect = 0, lowerCorrect = 0;
      upperGroup.forEach(r => { if (isPairCorrect(r.answers)) upperCorrect++; });
      lowerGroup.forEach(r => { if (isPairCorrect(r.answers)) lowerCorrect++; });
      const D = groupSize > 0 ? (upperCorrect / groupSize) - (lowerCorrect / groupSize) : 0;

      const answerDist = {};
      allAnswerOptions.forEach(opt => { answerDist[opt] = 0; });
      answerDist['Tidak Dijawab'] = 0;

      responses.forEach(r => {
        const stuObj = parseStudentJODOH(r.answers[q.id]);
        const given  = stuObj[pair.q] ? String(stuObj[pair.q]).trim() : '';
        if (!given) {
          answerDist['Tidak Dijawab']++;
        } else if (answerDist.hasOwnProperty(given)) {
          answerDist[given]++;
        } else {
          answerDist[given] = (answerDist[given] || 0) + 1;
        }
      });

      return {
        index:        pIdx,
        leftItem:     pair.q,
        correctRight: pair.a,
        correctCount: correctCount,
        wrongCount:   totalStudents - correctCount,
        P:            Math.round(P * 1000) / 1000,
        D:            Math.round(D * 1000) / 1000,
        diffLabel:    getDiffLabel(P),
        discLabel:    getDiscLabel(D),
        upperCorrect: upperCorrect,
        lowerCorrect: lowerCorrect,
        answerDist:   answerDist,
        wrongStudents: wrongStudents.sort((a, b) => b.score - a.score)
      };
    });

    const confusionMatrix = q.pairs.map(pair => {
      const row = { leftItem: pair.q, correctRight: pair.a, counts: {} };
      allAnswerOptions.forEach(opt => { row.counts[opt] = 0; });
      row.counts['Tidak Dijawab'] = 0;

      responses.forEach(r => {
        const stuObj = parseStudentJODOH(r.answers[q.id]);
        const given  = stuObj[pair.q] ? String(stuObj[pair.q]).trim() : '';
        const key    = given || 'Tidak Dijawab';
        if (row.counts.hasOwnProperty(key)) {
          row.counts[key]++;
        } else {
          row.counts[key] = 1;
        }
      });
      return row;
    });

    const topConfusions = [];
    confusionMatrix.forEach(row => {
      Object.entries(row.counts).forEach(([chosen, count]) => {
        if (chosen !== row.correctRight && chosen !== 'Tidak Dijawab' && count > 0) {
          topConfusions.push({
            left:    row.leftItem,
            correct: row.correctRight,
            wrong:   chosen,
            count:   count,
            pct:     Math.round(count / totalStudents * 100)
          });
        }
      });
    });
    topConfusions.sort((a, b) => b.count - a.count);

    const n    = pairAnalysis.length || 1;
    const avgP = pairAnalysis.reduce((s, p) => s + p.P, 0) / n;
    const avgD = pairAnalysis.reduce((s, p) => s + p.D, 0) / n;
    const badPairs = pairAnalysis.filter(p => p.D < 0.20 || p.P < 0.20).length;

    return {
      questionId:        q.id,
      questionNumber:    qIdx + 1,
      content:           q.content,
      weight:            q.weight,
      totalPairs:        q.pairs.length,
      allAnswerOptions:  allAnswerOptions,
      avgP:              Math.round(avgP * 1000) / 1000,
      avgD:              Math.round(avgD * 1000) / 1000,
      avgDiffLabel:      getDiffLabel(avgP),
      avgDiscLabel:      getDiscLabel(avgD),
      badPairs:          badPairs,
      pairs:             pairAnalysis,
      confusionMatrix:   confusionMatrix,
      topConfusions:     topConfusions.slice(0, 5)
    };
  });

  const allPairs   = jAnalysis.flatMap(q => q.pairs);
  const totalPairs = allPairs.length;

  const summary = {
    difficulty: {
      mudah:  allPairs.filter(p => p.P >  0.70).length,
      sedang: allPairs.filter(p => p.P >= 0.30 && p.P <= 0.70).length,
      sukar:  allPairs.filter(p => p.P <  0.30).length
    },
    discrimination: {
      negatif:    allPairs.filter(p => p.D <  0   ).length,
      jelek:      allPairs.filter(p => p.D >= 0    && p.D < 0.20).length,
      cukup:      allPairs.filter(p => p.D >= 0.20 && p.D < 0.30).length,
      baik:       allPairs.filter(p => p.D >= 0.30 && p.D < 0.40).length,
      sangatBaik: allPairs.filter(p => p.D >= 0.40).length
    },
    totalBermasalah: allPairs.filter(p => p.D < 0.20 || p.P < 0.20).length
  };

  const allConfusions = jAnalysis.flatMap(q =>
    q.topConfusions.map(c => ({ ...c, questionNumber: q.questionNumber, content: q.content }))
  ).sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    success:             true,
    examID:              examID,
    examInfo:            examInfo,
    totalStudents:       totalStudents,
    groupSize:           groupSize,
    totalJODOHQuestions: jQuestions.length,
    totalPairs:          totalPairs,
    summary:             summary,
    topConfusions:       allConfusions,
    data:                jAnalysis
  };
}

function getEssayAnalysisData(examID, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null, requestorName = '-';
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      requestorName = uData[i][1];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-', passingGrade: 0 };
  for (let i = 1; i < examRows.length; i++) {
    if (String(examRows[i][0]) === String(examID)) {
      examInfo = {
        subject:      String(examRows[i][1]),
        classes:      String(examRows[i][2]),
        passingGrade: parseFloat(examRows[i][10]) || 0
      };
      break;
    }
  }

  const qSheet = SS.getSheetByName('Questions');
  const qData  = qSheet.getDataRange().getValues();
  const essayQuestions = [];
  for (let i = 1; i < qData.length; i++) {
    if (String(qData[i][1]) !== String(examID)) continue;
    if (String(qData[i][2]) !== 'Esai')         continue;
    essayQuestions.push({
      id:       String(qData[i][0]),
      content:  String(qData[i][3] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      rubric:   String(qData[i][9] || ''),
      maxPoint: qData[i][8] ? parseFloat(qData[i][8]) : 10
    });
  }

  if (essayQuestions.length === 0) {
    return { success: false, message: 'Tidak ada soal Esai ditemukan untuk ujian ini.' };
  }

  const users = {};
  uData.forEach((r, i) => {
    if (i > 0) users[String(r[0]).trim()] = { name: r[1], cls: r[4] };
  });

  const rSheet    = SS.getSheetByName('Responses');
  const rData     = rSheet.getDataRange().getValues();
  const students  = [];

  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][2]).trim() !== String(examID)) continue;
    const status = String(rData[i][7]).toLowerCase();
    if (!_isFinishedStatus(status)) continue;

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

    const perQScores = answers['_essay_scores_per_question'] || {};
    const sid  = String(rData[i][1]).trim();
    const info = users[sid] || { name: 'Unknown', cls: '-' };

    const essayAnswers = {};
    essayQuestions.forEach(q => {
      let rawAns = answers[q.id];
      let text   = '(Tidak dijawab)';
      if (rawAns !== undefined && rawAns !== null) {
        if (typeof rawAns === 'string') {
          text = rawAns.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '(Tidak dijawab)';
        } else if (typeof rawAns === 'object' && rawAns.answer) {
          text = String(rawAns.answer).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '(Tidak dijawab)';
        }
      }
      const _rawTeacherScore = perQScores[q.id] !== undefined ? parseFloat(perQScores[q.id]) : null;
      const teacherScore = (_rawTeacherScore !== null && !isNaN(_rawTeacherScore)) ? _rawTeacherScore : null;

      const _rawAiScore = answers['_ai_scores'] && answers['_ai_scores'][q.id] !== undefined
                          ? parseFloat(answers['_ai_scores'][q.id]) : null;
      const aiScore = (_rawAiScore !== null && !isNaN(_rawAiScore) && isFinite(_rawAiScore)) ? _rawAiScore : null;

      const aiReason = answers['_ai_reasons'] && answers['_ai_reasons'][q.id]
                       ? String(answers['_ai_reasons'][q.id]) : '';

      essayAnswers[q.id] = {
        text:         text,
        teacherScore: teacherScore,
        aiScore:      aiScore,
        aiReason:     aiReason
      };
    });

    students.push({
      responseId:   String(rData[i][0]),
      studentId:    sid,
      studentName:  info.name,
      studentClass: info.cls,
      totalScore:   parseFloat(rData[i][4]) || 0,
      essayAnswers: essayAnswers
    });
  }

  const totalStudents = students.length;
  if (totalStudents === 0) {
    return { success: false, message: 'Belum ada siswa yang menyelesaikan ujian ini.' };
  }

  let totalGraded = 0, totalPending = 0;
  students.forEach(s => {
    essayQuestions.forEach(q => {
      const ea = s.essayAnswers[q.id];
      const isDummy = ea.text === '(Tidak dijawab)';
      if (ea.teacherScore !== null || isDummy) totalGraded++;
      else totalPending++;
    });
  });

  const totalEssayCells = totalStudents * essayQuestions.length;

  let hasApiKey = false;
  const cfgSheet = SS.getSheetByName('Konfigurasi');
  if (cfgSheet) {
    const cfgData = cfgSheet.getDataRange().getValues();
    for (let c = 1; c < cfgData.length; c++) {
      if (String(cfgData[c][0]) === 'anthropic_api_key' && String(cfgData[c][1]).trim().length > 10) {
        hasApiKey = true;
        break;
      }
    }
  }

  return {
    success:        true,
    examID:         examID,
    examInfo:       examInfo,
    totalStudents:  totalStudents,
    essayQuestions: essayQuestions,
    students:       students,
    progress: {
      total:    totalEssayCells,
      graded:   totalGraded,
      pending:  totalPending
    },
    hasApiKey: hasApiKey
  };
}

function scoreEssayWithAI(questionContent, maxPoint, studentAnswer, rubric, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  let apiKey = '';
  const cfgSheet = SS.getSheetByName('Konfigurasi');
  if (cfgSheet) {
    const cfgData = cfgSheet.getDataRange().getValues();
    for (let c = 1; c < cfgData.length; c++) {
      if (String(cfgData[c][0]) === 'anthropic_api_key') {
        apiKey = String(cfgData[c][1]).trim();
        break;
      }
    }
  }

  if (!apiKey) {
    return { success: false, message: 'API Key Anthropic belum dikonfigurasi. Buka menu Konfigurasi → Tambahkan key: anthropic_api_key.' };
  }

  if (!studentAnswer || studentAnswer === '(Tidak dijawab)' || studentAnswer.trim() === '') {
    return { success: true, score: 0, reason: 'Siswa tidak menjawab soal ini.', skipped: true };
  }

  const rubricText = (rubric && rubric.trim()) ? `\nRubrik: ${rubric}` : '';

  // Instruksi format JSON ada di system DAN user message agar tidak bergantung
  // pada gateway meneruskan field 'system' dengan benar
  const systemInstr =
    'You are an essay grader. Always reply with ONLY a valid JSON object, no other text.';

  const prompt =
    `Nilai jawaban esai ini. Balas HANYA dengan JSON (tanpa teks lain):\n` +
    `{"score":<angka 0-${maxPoint} boleh desimal>,"reason":"<1 kalimat alasan>"}\n\n` +
    `Soal: ${questionContent}${rubricText}\n` +
    `Skor maksimum: ${maxPoint}\n` +
    `Jawaban siswa: ${studentAnswer}`;

  try {
    const apiUrl = 'https://gateway.olagon.site/anthropic/v1/messages';

    const payload = {
      'model':      'claude-haiku-4-5-20251001',
      'max_tokens': 200,
      'system':     systemInstr,
      'messages':   [{ 'role': 'user', 'content': prompt }]
    };

    const options = {
      'method':      'post',
      'contentType': 'application/json',
      'headers': {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      'payload':            JSON.stringify(payload),
      'muteHttpExceptions': true
    };

    const response  = UrlFetchApp.fetch(apiUrl, options);
    const httpCode  = response.getResponseCode();
    const bodyText  = response.getContentText();

    // Log respons mentah agar bisa diperiksa di GAS Logger
    Logger.log('[scoreEssayWithAI] HTTP ' + httpCode + ' | body: ' + bodyText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch(e) {
      return { success: false, message: 'Gateway API gagal diakses (HTTP ' + httpCode + '). HTML diterima bukan JSON. Periksa Logger GAS.' };
    }

    // Cek error dari API
    if (data.error) {
      return { success: false, message: 'Error API: ' + (data.error.message || JSON.stringify(data.error)) };
    }
    if (httpCode !== 200) {
      return { success: false, message: 'HTTP ' + httpCode + ': ' + bodyText.substring(0, 200) };
    }

    // ── Ekstrak teks respons: dukung berbagai format proxy / gateway ──
    let rawText = '';

    // Format Anthropic API asli
    if (data.content && Array.isArray(data.content) && data.content[0]) {
      rawText = data.content[0].text || data.content[0].content || '';
    }
    // Format OpenAI-compatible
    else if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
      const ch = data.choices[0];
      rawText = (ch.message && ch.message.content) || ch.text || '';
    }
    // Format Proxy alternatif (string langsung)
    else if (typeof data.content === 'string')  rawText = data.content;
    else if (typeof data.message === 'string')  rawText = data.message;
    else if (typeof data.response === 'string') rawText = data.response;
    else if (typeof data.reply === 'string')    rawText = data.reply;
    else if (typeof data.text === 'string')     rawText = data.text;

    // Fallback pamungkas: Stringify SELURUH response agar kita bisa ekstrak via Regex
    // jika struktur JSON gateway tidak tertebak.
    if (!rawText || rawText.trim() === '') {
      rawText = JSON.stringify(data);
    }

    Logger.log('[scoreEssayWithAI] rawText: ' + rawText.substring(0, 300));

    // ── Parsing JSON dari rawText dengan multi-strategi ──
    let parsed = null;

    // Bersihkan markdown code blocks jika AI ngotot membungkusnya
    let cleaned = rawText.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    // Strategi 1: parse langsung
    try { parsed = JSON.parse(cleaned); } catch(e1) {}

    // Strategi 2: Ambil substring dari { pertama hingga } terakhir
    if (!parsed) {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace  = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try { parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)); } catch(e2) {}
      }
    }

    // Strategi 3: Ekstrak manual via Regex (jika JSON rusak karena unescaped chars)
    let unescaped = cleaned;
    if (!parsed || typeof parsed.score === 'undefined') {
      // Hapus backslash escape agar regex tidak terblokir oleh '\"score\"'
      unescaped = cleaned.replace(/\\/g, '');
      const scoreMatch  = unescaped.match(/"?score"?\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
      const reasonMatch = unescaped.match(/"?reason"?\s*:\s*"?([^"}\n]+)/i);
      
      if (scoreMatch) {
        parsed = {
          score:  parseFloat(scoreMatch[1]),
          reason: reasonMatch ? reasonMatch[1].trim() : ''
        };
      }
    }

    if (!parsed || typeof parsed.score === 'undefined') {
      Logger.log('[scoreEssayWithAI] GAGAL parse. rawText=' + rawText);
      const snippet = unescaped.substring(0, 100).replace(/</g, '&lt;');
      // Daripada menghentikan seluruh proses penilaian massal dengan error popup,
      // lebih baik berikan skor 0 dan jadikan errornya sebagai "Alasan AI"
      // agar guru bisa melihat langsung teks aneh yang dikembalikan gateway.
      return { 
        success: true, 
        score: 0, 
        reason: 'AI gagal merespons dengan benar: ' + snippet + '...' 
      };
    }

    let score = parseFloat(parsed.score);
    if (isNaN(score) || score < 0) score = 0;
    if (score > maxPoint)          score = maxPoint;
    score = Math.round(score * 10) / 10;

    return {
      success: true,
      score:   score,
      reason:  String(parsed.reason || '').trim()
    };

  } catch(e) {
    Logger.log('[scoreEssayWithAI] exception: ' + e.toString());
    return { success: false, message: 'Error Script: ' + e.toString() };
  }
}

function saveAIScoreToResponse(responseId, questionId, aiScore, aiReason, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();

  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][0]) !== String(responseId)) continue;

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

    if (!answers['_ai_scores'])  answers['_ai_scores']  = {};
    if (!answers['_ai_reasons']) answers['_ai_reasons'] = {};

    answers['_ai_scores'][questionId]  = parseFloat(aiScore) || 0;
    answers['_ai_reasons'][questionId] = String(aiReason || '');

    rSheet.getRange(i + 1, 4).setValue(JSON.stringify(answers));
    return { success: true };
  }
  return { success: false, message: 'Response tidak ditemukan.' };
}

function batchSaveEssayGrades(examID, gradesMap, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3];
      break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  if (!gradesMap || typeof gradesMap !== 'object') {
    return { success: false, message: 'Format data nilai tidak valid.' };
  }

  let savedCount = 0, failCount = 0;
  const responseIds = Object.keys(gradesMap);

  for (const responseId of responseIds) {
    const perQScores = gradesMap[responseId];
    if (!perQScores || typeof perQScores !== 'object') continue;

    const res = saveEssayGrade(responseId, perQScores);
    if (res.success) savedCount++;
    else failCount++;
  }

  const actorName = uData.find((r, i) => i > 0 && String(r[0]) === String(requestorID))?.[1] || requestorID;
  addAdminLog(requestorID, actorName, 'GRADE_ESSAY', 'Responses', examID,
    `Penilaian esai batch: ${savedCount} siswa dinilai, ${failCount} gagal. Ujian: ${examID}`);

  return {
    success: true,
    savedCount: savedCount,
    failCount:  failCount,
    message:   `${savedCount} data nilai berhasil disimpan.${failCount > 0 ? ` ${failCount} gagal.` : ''}`
  };
}

function _buildResponseDetail(examID, answers, qData) {
  const tz = Session.getScriptTimeZone();
  const perQEssayScores = answers['_essay_scores_per_question'] || {};

  function stripHtml(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ').trim().toLowerCase();
  }

  const detail = [];

  qData.forEach((row, i) => {
    if (i === 0 || String(row[1]) !== String(examID)) return;

    const qid     = String(row[0]);
    const type    = String(row[2]).trim();
    const content = String(row[3] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const optRaw  = row[5];
    const keyRaw  = row[6];
    const weight  = row[8] ? parseFloat(row[8]) : 10;
    const userAns = answers[qid];

    let pointEarned = 0;
    let isCorrect   = false;
    let correctDisplay = '';
    let studentDisplay = '';

    if (type === 'PG') {
      let opts = [];
      try { opts = JSON.parse(optRaw); } catch(e) {}
      const mapHuruf = ['A','B','C','D','E'];
      const cleanKey = String(keyRaw || '').trim();
      const keyIdx   = mapHuruf.indexOf(cleanKey.toUpperCase());
      const correctText = (keyIdx !== -1 && opts[keyIdx])
        ? stripHtml(opts[keyIdx]) : stripHtml(cleanKey);
      correctDisplay = (keyIdx !== -1 && opts[keyIdx])
        ? `${cleanKey}. ${String(opts[keyIdx]).replace(/<[^>]*>/g,' ').trim()}`
        : cleanKey;

      const userClean = stripHtml(userAns);
      isCorrect = (userClean !== '' && userClean === correctText);
      if (isCorrect) pointEarned = weight;

      if (userAns) {
        const uIdx = opts.findIndex(o => stripHtml(o) === userClean);
        studentDisplay = uIdx !== -1
          ? `${mapHuruf[uIdx]}. ${String(opts[uIdx]).replace(/<[^>]*>/g,' ').trim()}`
          : String(userAns).replace(/<[^>]*>/g,' ').trim();
      } else {
        studentDisplay = '(Tidak dijawab)';
      }
    }

    else if (type === 'PG_KOMPLEKS') {
      let opts = [], keyArr = [], userArr = [];
      try { opts = JSON.parse(optRaw); } catch(e) {}
      try { const p = JSON.parse(keyRaw); keyArr = Array.isArray(p) ? p : []; }
      catch(e) { keyArr = String(keyRaw || '').split(',').map(s => s.trim()); }
      if (Array.isArray(userAns)) { userArr = userAns; }
      else { try { const p = JSON.parse(userAns); userArr = Array.isArray(p) ? p : []; } catch(e) {} }

      const mapHuruf = ['A','B','C','D','E'];
      const kNorm = keyArr.map(k => {
        const idx = mapHuruf.indexOf(String(k).trim().toUpperCase());
        return (idx !== -1 && opts[idx]) ? stripHtml(opts[idx]) : stripHtml(k);
      });
      const uNorm  = userArr.map(a => stripHtml(a));
      let match = 0, wrong = 0;
      uNorm.forEach(a => kNorm.includes(a) ? match++ : wrong++);
      if (wrong === 0 && match > 0) {
        pointEarned = (match / kNorm.length) * weight;
        isCorrect   = pointEarned > 0;
      }
      correctDisplay  = (function() {
        var mapH = ['A','B','C','D','E'];
        return keyArr.map(function(k) {
          var upperK = String(k).trim().toUpperCase();
          if (mapH.indexOf(upperK) !== -1) return upperK;
          var found = -1;
          opts.forEach(function(opt, i) { if (String(opt).trim().toLowerCase() === String(k).trim().toLowerCase()) found = i; });
          return found !== -1 ? mapH[found] : String(k).trim();
        }).join(', ');
      })();
      studentDisplay  = (function() {
        var mapH = ['A','B','C','D','E'];
        if (!userArr.length) return '(Tidak dijawab)';
        return userArr.map(function(a) {
          var clean = stripHtml(a);
          var found = -1;
          opts.forEach(function(opt, i) { if (stripHtml(opt).toLowerCase() === clean.toLowerCase()) found = i; });
          if (found !== -1) return mapH[found];
          if (mapH.indexOf(clean.toUpperCase()) !== -1) return clean.toUpperCase();
          return clean;
        }).join(', ');
      })();
    }

    else if (type === 'BS') {
      let keyObj = {}, stmts = [];
      try { keyObj = JSON.parse(keyRaw); } catch(e) {}
      try { stmts = JSON.parse(optRaw); } catch(e) {}
      if (!Array.isArray(stmts)) stmts = [];

      const ansObj = (typeof userAns === 'object' && userAns !== null && !Array.isArray(userAns))
        ? userAns : {};

      // BUG FIX RS-11 (KRITIS): _buildResponseDetail BS scoring menggunakan for..in keyObj
      // yang key-nya bisa teks pernyataan (format soal baru). Jawaban siswa selalu
      // menggunakan index numerik. Iterasi melalui array stmts sebagai jembatan.
      const bsTotal = stmts.length > 0 ? stmts.length : Object.keys(keyObj).length;
      let matches  = 0;
      const wrongItems = [];

      if (stmts.length > 0) {
        stmts.forEach(function(stmt, idx) {
          const expByText = keyObj[stmt];
          const expByIdx  = keyObj[String(idx)];
          const expected  = expByText || expByIdx;
          if (!expected) return;

          const stuByIdx  = ansObj[String(idx)];
          const stuByText = ansObj[stmt];
          const studentAns = stuByIdx || stuByText || '';

          const kVal = String(expected).trim().toLowerCase();
          const uVal = String(studentAns).trim().toLowerCase();
          const norm = (kVal === 'benar' && uVal === 'sesuai') || (kVal === 'salah' && uVal === 'tidak sesuai');
          if (kVal === uVal || norm) {
            matches++;
          } else {
            const stmtText = String(stmt).replace(/<[^>]*>/g,' ').trim().substring(0, 80);
            wrongItems.push({
              stmt:    stmtText || `Pernyataan ${idx+1}`,
              correct: expected,
              given:   studentAns || '(Tidak dijawab)'
            });
          }
        });
      } else {
        // Fallback legacy: tidak ada array stmts
        for (const idx in keyObj) {
          const kVal = String(keyObj[idx]).trim().toLowerCase();
          const uVal = String(ansObj[idx] || '').trim().toLowerCase();
          const norm = (kVal === 'benar' && uVal === 'sesuai') || (kVal === 'salah' && uVal === 'tidak sesuai');
          if (kVal === uVal || norm) {
            matches++;
          } else {
            const stmtText = stmts[parseInt(idx)] || `Pernyataan ${parseInt(idx)+1}`;
            wrongItems.push({
              stmt:    String(stmtText).replace(/<[^>]*>/g,' ').trim().substring(0, 80),
              correct: keyObj[idx],
              given:   ansObj[idx] || '(Tidak dijawab)'
            });
          }
        }
      }

      if (bsTotal > 0) {
        pointEarned = (matches / bsTotal) * weight;
        isCorrect   = matches === bsTotal;
      }

      // correctDisplay: tampilkan dengan nomor urut (menggunakan stmts jika tersedia)
      if (stmts.length > 0) {
        correctDisplay = stmts.map(function(stmt, idx) {
          const val = keyObj[stmt] || keyObj[String(idx)] || '?';
          return `${idx+1}: ${val}`;
        }).join(' | ');
        studentDisplay = stmts.length > 0
          ? stmts.map(function(stmt, idx) {
              const stuByIdx  = ansObj[String(idx)];
              const stuByText = ansObj[stmt];
              const v = stuByIdx || stuByText || '?';
              return `${idx+1}: ${v}`;
            }).join(' | ')
          : '(Tidak dijawab)';
      } else {
        correctDisplay  = Object.entries(keyObj).map(([k,v]) => `${parseInt(k)+1}: ${v}`).join(' | ');
        studentDisplay  = Object.keys(ansObj).length
          ? Object.entries(ansObj).map(([k,v]) => `${parseInt(k)+1}: ${v}`).join(' | ')
          : '(Tidak dijawab)';
      }

      detail.push({
        qid, type, content, weight, pointEarned: Math.round(pointEarned*100)/100,
        isCorrect, correctDisplay, studentDisplay, wrongItems
      });
      return;
    }

    else if (type === 'JODOH' || type === 'MATCHING') {
      let allPairs = [];
      try { const p = JSON.parse(keyRaw); if (Array.isArray(p) && p.length) allPairs = p; } catch(e) {}
      if (!allPairs.length) {
        try { const p = JSON.parse(optRaw); if (Array.isArray(p)) allPairs = p; } catch(e) {}
      }
      const pairs = allPairs.filter(pair => pair.q && String(pair.q).trim() !== '');
      const stuObj = (typeof userAns === 'object' && userAns !== null && !Array.isArray(userAns))
        ? userAns
        : (() => { try { return JSON.parse(userAns) || {}; } catch(e) { return {}; } })();

      let match = 0;
      const wrongItems = [];
      pairs.forEach(pair => {
        const given = stuObj[pair.q] ? String(stuObj[pair.q]).trim() : '';
        if (given.toLowerCase() === pair.a.toLowerCase()) {
          match++;
        } else {
          wrongItems.push({
            left:    String(pair.q).substring(0, 60),
            correct: pair.a,
            given:   given || '(Tidak dijawab)'
          });
        }
      });
      if (pairs.length > 0) {
        pointEarned = (match / pairs.length) * weight;
        isCorrect   = match === pairs.length;
      }
      const dispParts = pairs.map(p => {
        const g = stuObj[p.q] || '?';
        return `${p.q}→${g}${g!==p.a?' ✗':''}`;
      });
      correctDisplay  = pairs.map(p => `${p.q}→${p.a}`).join(' | ');
      studentDisplay  = Object.keys(stuObj).length ? dispParts.join(' | ') : '(Tidak dijawab)';
      detail.push({
        qid, type, content, weight, pointEarned: Math.round(pointEarned*100)/100,
        isCorrect, correctDisplay, studentDisplay, wrongItems
      });
      return;
    }

    else if (type === 'Esai') {
      const savedScore = perQEssayScores[qid];
      pointEarned     = savedScore !== undefined ? parseFloat(savedScore) : 0;
      isCorrect       = pointEarned > 0;

      let rawText = userAns;
      if (rawText && typeof rawText === 'object' && rawText.answer) rawText = rawText.answer;
      studentDisplay = rawText
        ? String(rawText).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().substring(0, 200)
        : '(Tidak dijawab)';
      correctDisplay = `[Esai — Dinilai Guru: ${pointEarned}/${weight}]`;
    }

    detail.push({
      qid, type, content, weight, pointEarned: Math.round(pointEarned*100)/100,
      isCorrect, correctDisplay, studentDisplay, wrongItems: []
    });
  });

  return detail;
}

function getStudentDetailReport(examID, responseId, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3]; break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-', passingGrade: 0, duration: 0 };
  for (let i = 1; i < examRows.length; i++) {
    if (String(examRows[i][0]) === String(examID)) {
      examInfo = {
        subject:      String(examRows[i][1]),
        classes:      String(examRows[i][2]),
        passingGrade: parseFloat(examRows[i][10]) || 0,
        duration:     parseFloat(examRows[i][4]) || 0
      };
      break;
    }
  }

  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  let responseRow = null;
  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][0]) === String(responseId)) {
      responseRow = rData[i]; break;
    }
  }
  if (!responseRow) return { success: false, message: 'Data respons tidak ditemukan.' };

  const studentId = String(responseRow[1]).trim();
  const users = {};
  uData.forEach((r, i) => { if (i > 0) users[String(r[0]).trim()] = { name: r[1], cls: r[4] }; });
  const sInfo = users[studentId] || { name: 'Unknown', cls: '-' };

  let answers = {};
  try { answers = JSON.parse(responseRow[3] || '{}'); } catch(e) {}

  const totalScore = parseFloat(responseRow[4]) || 0;
  const tz = Session.getScriptTimeZone();
  const startTime  = responseRow[5] ? Utilities.formatDate(new Date(responseRow[5]), tz, 'dd/MM/yyyy HH:mm') : '-';
  const submitTime = responseRow[6] ? Utilities.formatDate(new Date(responseRow[6]), tz, 'dd/MM/yyyy HH:mm') : '-';

  let durasiMenit = '-';
  if (responseRow[5] && responseRow[6]) {
    const diff = Math.round((new Date(responseRow[6]) - new Date(responseRow[5])) / 60000);
    durasiMenit = diff + ' menit';
  }

  const qSheet = SS.getSheetByName('Questions');
  const qData  = qSheet.getDataRange().getValues();

  const detail = _buildResponseDetail(examID, answers, qData);

  const typeOrder = ['PG', 'PG_KOMPLEKS', 'BS', 'JODOH', 'Esai'];
  const typeLabels = { PG:'Pilihan Ganda', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai' };
  const typeStats  = {};

  typeOrder.forEach(t => {
    const qs = detail.filter(d => d.type === t || (t === 'JODOH' && d.type === 'MATCHING'));
    if (!qs.length) return;
    const maxPts  = qs.reduce((s, d) => s + d.weight, 0);
    const earnPts = qs.reduce((s, d) => s + d.pointEarned, 0);
    typeStats[t] = {
      label:     typeLabels[t] || t,
      total:     qs.length,
      correct:   qs.filter(d => d.isCorrect).length,
      maxPoints: Math.round(maxPts * 100) / 100,
      earnedPoints: Math.round(earnPts * 100) / 100,
      pct:       maxPts > 0 ? Math.round(earnPts / maxPts * 100) : 0
    };
  });

  const wrongQuestions = detail
    .filter(d => !d.isCorrect && d.studentDisplay !== '(Tidak dijawab)')
    .map(d => ({
      qid:       d.qid,
      type:      d.type,
      content:   d.content.substring(0, 120),
      weight:    d.weight,
      earnedPoints: d.pointEarned,
      studentAnswer:  d.studentDisplay.substring(0, 100),
      correctAnswer:  d.correctDisplay.substring(0, 100),
      wrongItems: d.wrongItems || []
    }));

  const unanswered = detail
    .filter(d => d.studentDisplay === '(Tidak dijawab)')
    .map(d => ({ qid: d.qid, type: d.type, content: d.content.substring(0, 100), weight: d.weight }));

  const recommendations = [];
  Object.entries(typeStats).forEach(([type, st]) => {
    if (st.pct < 50) {
      recommendations.push({
        level:   'danger',
        type:    typeLabels[type] || type,
        message: `Perlu perhatian serius pada tipe soal ${st.label} — hanya meraih ${st.pct}% (${st.earnedPoints}/${st.maxPoints} poin). Disarankan mengulang materi terkait secara keseluruhan.`
      });
    } else if (st.pct < 75) {
      recommendations.push({
        level:   'warning',
        type:    typeLabels[type] || type,
        message: `Kemampuan pada ${st.label} perlu ditingkatkan (${st.pct}%). Fokus latihan soal pada topik yang masih salah.`
      });
    } else {
      recommendations.push({
        level:   'good',
        type:    typeLabels[type] || type,
        message: `Kemampuan ${st.label} sudah baik (${st.pct}%). Pertahankan dan tingkatkan konsistensi.`
      });
    }
  });

  if (unanswered.length > 0) {
    recommendations.push({
      level:   'warning',
      type:    'Tidak Dijawab',
      message: `${unanswered.length} soal tidak dijawab. Pastikan siswa mengatur waktu lebih baik saat ujian.`
    });
  }

  const rawStatusSDR = String(responseRow[7] || '').toLowerCase().trim();

  return {
    success:        true,
    examID:         examID,
    examInfo:       examInfo,
    student: {
      id:           studentId,
      name:         sInfo.name,
      class:        sInfo.cls,
      responseId:   responseId
    },
    session: {
      totalScore:   Math.round(totalScore * 100) / 100,
      passingGrade: examInfo.passingGrade,
      passed:       totalScore >= examInfo.passingGrade,
      startTime,
      submitTime,
      durasiMenit,
      isTimeout:    rawStatusSDR === 'waktu habis'
    },
    typeStats:       typeStats,
    totalQuestions:  detail.length,
    totalCorrect:    detail.filter(d => d.isCorrect).length,
    totalWrong:      wrongQuestions.length,
    totalUnanswered: unanswered.length,
    wrongQuestions:  wrongQuestions,
    unanswered:      unanswered,
    recommendations: recommendations
  };
}

function getClassSummaryReport(examID, requestorID, requestorToken) {

  const uSheet = SS.getSheetByName('Users');
  const uData  = uSheet.getDataRange().getValues();
  let role = null;
  for (let i = 1; i < uData.length; i++) {
    if (String(uData[i][0]) === String(requestorID) &&
        String(uData[i][5]) === String(requestorToken)) {
      role = uData[i][3]; break;
    }
  }
  if (!role)            return { success: false, message: 'Sesi tidak valid.' };
  if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

  const examSheet = SS.getSheetByName('Exams');
  const examRows  = examSheet.getDataRange().getValues();
  let examInfo = { subject: '-', classes: '-', passingGrade: 0 };
  for (let i = 1; i < examRows.length; i++) {
    if (String(examRows[i][0]) === String(examID)) {
      examInfo = {
        subject:      String(examRows[i][1]),
        classes:      String(examRows[i][2]),
        passingGrade: parseFloat(examRows[i][10]) || 0
      };
      break;
    }
  }

  const qSheet = SS.getSheetByName('Questions');
  const qData  = qSheet.getDataRange().getValues();
  const allQuestions = [];
  qData.forEach((row, i) => {
    if (i > 0 && String(row[1]) === String(examID)) {
      allQuestions.push({
        id:      String(row[0]),
        type:    String(row[2]).trim(),
        content: String(row[3] || '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(),
        weight:  row[8] ? parseFloat(row[8]) : 10
      });
    }
  });

  if (!allQuestions.length) return { success: false, message: 'Tidak ada soal ditemukan.' };

  const users = {};
  uData.forEach((r, i) => { if (i > 0) users[String(r[0]).trim()] = { name: r[1], cls: r[4] }; });

  const rSheet = SS.getSheetByName('Responses');
  const rData  = rSheet.getDataRange().getValues();
  const responses = [];

  for (let i = 1; i < rData.length; i++) {
    if (String(rData[i][2]).trim() !== String(examID)) continue;
    const status = String(rData[i][7]).toLowerCase();
    if (!_isFinishedStatus(status)) continue;

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) {}

    const sid  = String(rData[i][1]).trim();
    const info = users[sid] || { name: 'Unknown', cls: '-' };
    const score = parseFloat(rData[i][4]) || 0;

    responses.push({
      responseId:   String(rData[i][0]),
      studentId:    sid,
      studentName:  info.name,
      studentClass: info.cls,
      totalScore:   score,
      isTimeout:    status === 'waktu habis',
      answers
    });
  }

  const totalStudents = responses.length;
  if (!totalStudents) return { success: false, message: 'Belum ada siswa yang menyelesaikan ujian ini.' };

  const scores  = responses.map(r => r.totalScore);
  const sum     = scores.reduce((a, b) => a + b, 0);
  const avg     = sum / totalStudents;
  const min     = Math.min(...scores);
  const max     = Math.max(...scores);
  const sorted  = [...scores].sort((a, b) => a - b);
  const median  = totalStudents % 2
    ? sorted[Math.floor(totalStudents / 2)]
    : (sorted[totalStudents/2-1] + sorted[totalStudents/2]) / 2;
  const variance  = scores.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / totalStudents;
  const stdDev    = Math.sqrt(variance);
  const passCount = scores.filter(s => s >= examInfo.passingGrade).length;
  const failCount = totalStudents - passCount;

  const histogram = Array.from({ length: 11 }, (_, i) => ({
    label:  i < 10 ? `${i*10}–${i*10+9}` : '100',
    min:    i * 10,
    max:    i < 10 ? i * 10 + 9 : 100,
    count:  0
  }));
  scores.forEach(s => {
    const bucket = Math.min(10, Math.floor(s / 10));
    histogram[bucket].count++;
  });

  const typeOrder = ['PG', 'PG_KOMPLEKS', 'BS', 'JODOH', 'Esai'];
  const typeLabels = { PG:'Pilihan Ganda', PG_KOMPLEKS:'PG Kompleks', BS:'Benar/Salah', JODOH:'Menjodohkan', Esai:'Esai' };
  const typeStats  = {};

  responses.forEach(r => {
    const detail = _buildResponseDetail(examID, r.answers, qData);
    typeOrder.forEach(t => {
      const qs = detail.filter(d => d.type === t || (t === 'JODOH' && d.type === 'MATCHING'));
      if (!qs.length) return;
      if (!typeStats[t]) typeStats[t] = { label: typeLabels[t] || t, totalEarned: 0, totalMax: 0, students: 0 };
      typeStats[t].totalEarned += qs.reduce((s, d) => s + d.pointEarned, 0);
      typeStats[t].totalMax    += qs.reduce((s, d) => s + d.weight, 0);
      typeStats[t].students++;
    });
  });

  const typeSummary = Object.entries(typeStats).map(([type, st]) => ({
    type,
    label:     st.label,
    avgPct:    st.totalMax > 0 ? Math.round(st.totalEarned / st.totalMax * 100) : 0,
    avgPoints: st.students > 0 ? Math.round(st.totalEarned / st.students * 10) / 10 : 0
  }));

  const wrongCountMap = {};
  allQuestions.forEach(q => { wrongCountMap[q.id] = { count: 0, content: q.content, type: q.type, weight: q.weight }; });

  responses.forEach(r => {
    const detail = _buildResponseDetail(examID, r.answers, qData);
    detail.forEach(d => {
      if (!d.isCorrect && wrongCountMap[d.qid]) {
        wrongCountMap[d.qid].count++;
      }
    });
  });

  const mostWrong = Object.entries(wrongCountMap)
    .map(([qid, v]) => ({
      qid,
      content:    v.content.substring(0, 100),
      type:       v.type,
      weight:     v.weight,
      wrongCount: v.count,
      wrongPct:   Math.round(v.count / totalStudents * 100)
    }))
    .filter(v => v.wrongCount > 0)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 15);

  const studentList = responses
    .map(r => ({
      responseId: r.responseId,
      name:       r.studentName,
      class:      r.studentClass,
      score:      r.totalScore,
      passed:     r.totalScore >= examInfo.passingGrade,
      isTimeout:  r.isTimeout || false
    }))
    .sort((a, b) => b.score - a.score);

  return {
    success:        true,
    examID,
    examInfo,
    totalStudents,
    statistics: {
      avg:      Math.round(avg * 100) / 100,
      min:      Math.round(min * 100) / 100,
      max:      Math.round(max * 100) / 100,
      median:   Math.round(median * 100) / 100,
      stdDev:   Math.round(stdDev * 100) / 100,
      passCount,
      failCount,
      passRate: Math.round(passCount / totalStudents * 100)
    },
    histogram,
    typeSummary,
    mostWrong,
    studentList
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ██  FITUR: JADWAL INPUT SOAL & NOTIFIKASI EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

// ──── A. HELPER TANGGAL/WAKTU ────────────────────────────────────────────────

/**
 * Parse string ISO 'yyyy-MM-dd'T'HH:mm' pada Zona_Waktu_Aplikasi → Date | null.
 * Null bila kosong, format salah, atau tanggal mustahil.
 */
function parseAppDateTime_(iso, tz) {
  if (!iso || typeof iso !== 'string') return null;
  var s = iso.trim();
  if (s === '') return null;
  // Regex: yyyy-MM-dd'T'HH:mm (tanpa detik)
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  var year  = parseInt(m[1], 10);
  var month = parseInt(m[2], 10);
  var day   = parseInt(m[3], 10);
  var hour  = parseInt(m[4], 10);
  var min   = parseInt(m[5], 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31)     return null;
  if (hour < 0 || hour > 23)   return null;
  if (min < 0 || min > 59)     return null;
  // Gunakan Utilities.formatDate untuk parsing yang timezone-aware
  try {
    // Buat string yang bisa di-parse: "yyyy-MM-dd HH:mm:ss"
    var dateStr = m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':00';
    // Buat Date menggunakan script timezone
    var tzToUse = tz || Session.getScriptTimeZone();
    // GAS tidak punya cara langsung parse dengan timezone; gunakan pendekatan:
    // Buat date dari komponen, lalu verifikasi
    var testDate = new Date(year, month - 1, day, hour, min, 0, 0);
    // Verifikasi tanggal valid (bulan Feb 30, dst)
    if (testDate.getFullYear() !== year ||
        testDate.getMonth() !== month - 1 ||
        testDate.getDate() !== day) {
      return null;
    }
    // Untuk GAS, kita perlu menyesuaikan dengan timezone script
    // Karena new Date() menggunakan timezone script di GAS runtime, ini sudah benar
    return testDate;
  } catch (e) {
    return null;
  }
}

/**
 * Format Date → 'dd/MM/yyyy HH:mm' pada Zona_Waktu_Aplikasi.
 */
function formatAppDateTime_(date, tz) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  var tzToUse = tz || Session.getScriptTimeZone();
  return Utilities.formatDate(date, tzToUse, 'dd/MM/yyyy HH:mm');
}

/**
 * Komponen jam 0..23 dari Date pada Zona_Waktu_Aplikasi.
 */
function appHourOf_(date, tz) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return -1;
  var tzToUse = tz || Session.getScriptTimeZone();
  return Number(Utilities.formatDate(date, tzToUse, 'H'));
}

/**
 * Kunci tanggal 'yyyy-MM-dd' pada Zona_Waktu_Aplikasi.
 */
function appDateKeyOf_(date, tz) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  var tzToUse = tz || Session.getScriptTimeZone();
  return Utilities.formatDate(date, tzToUse, 'yyyy-MM-dd');
}


// ──── B. KONFIGURASI PERIODE INPUT SOAL ──────────────────────────────────────

/**
 * Normalisasi data periode dari sheet Konfigurasi ke objek InputPeriod.
 */
function normalizePeriod_(raw, tz) {
  var tzToUse = tz || Session.getScriptTimeZone();
  var enabled = false;
  var startISO = '';
  var endISO = '';

  if (raw && typeof raw === 'object') {
    enabled = String(raw.enabled || '').toLowerCase() === 'true';
    startISO = String(raw.start || '').trim();
    endISO = String(raw.end || '').trim();
  }

  var startDate = parseAppDateTime_(startISO, tzToUse);
  var endDate   = parseAppDateTime_(endISO, tzToUse);

  var startStr = startDate ? formatAppDateTime_(startDate, tzToUse) : '';
  var endStr   = endDate   ? formatAppDateTime_(endDate, tzToUse) : '';

  var configComplete = !!(startDate && endDate && endDate.getTime() > startDate.getTime());

  return {
    success: true,
    enabled: enabled,
    startISO: startISO,
    endISO: endISO,
    startStr: startStr,
    endStr: endStr,
    startDate: startDate,
    endDate: endDate,
    configComplete: configComplete
  };
}

/**
 * Validasi form periode sebelum disimpan.
 * Mengembalikan { valid:true } atau { valid:false, message:string }
 */
function validatePeriodForSave_(form, tz) {
  var tzToUse = tz || Session.getScriptTimeZone();
  var enabled = form.enabled === true || form.enabled === 'true';
  var startISO = String(form.startISO || '').trim();
  var endISO   = String(form.endISO || '').trim();

  var startDate = parseAppDateTime_(startISO, tzToUse);
  var endDate   = parseAppDateTime_(endISO, tzToUse);

  // R1.9: Jika enabled=true, start & end harus terisi dan valid
  if (enabled) {
    if (!startISO || !endISO) {
      return { valid: false, message: 'Waktu mulai dan waktu berakhir harus diisi dengan benar sebelum periode diaktifkan.' };
    }
    if (!startDate) {
      return { valid: false, message: 'Waktu mulai tidak valid. Pastikan format tanggal dan waktu benar.' };
    }
    if (!endDate) {
      return { valid: false, message: 'Waktu berakhir tidak valid. Pastikan format tanggal dan waktu benar.' };
    }
  }

  // R1.4: Jika salah satu diisi tapi tidak valid
  if (startISO && !startDate) {
    return { valid: false, message: 'Waktu mulai tidak dapat diuraikan sebagai tanggal-waktu valid.' };
  }
  if (endISO && !endDate) {
    return { valid: false, message: 'Waktu berakhir tidak dapat diuraikan sebagai tanggal-waktu valid.' };
  }

  // R1.3: end harus > start
  if (startDate && endDate) {
    if (endDate.getTime() <= startDate.getTime()) {
      return { valid: false, message: 'Waktu berakhir harus lebih lambat daripada waktu mulai.' };
    }
  }

  return { valid: true };
}

/**
 * Membaca periode input soal dari sheet Konfigurasi.
 * Dipanggil frontend (Admin) dan guard/notifikasi.
 */
function getInputPeriod() {
  try {
    var sheet = SS.getSheetByName('Konfigurasi');
    if (!sheet) {
      return { success: false, message: 'Sheet Konfigurasi tidak ditemukan.' };
    }
    var data = sheet.getDataRange().getValues();
    var raw = { enabled: 'false', start: '', end: '' };

    for (var i = 1; i < data.length; i++) {
      var key = String(data[i][0]).trim();
      var rawVal = data[i][1];
      var val = (rawVal instanceof Date) ? Utilities.formatDate(rawVal, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm") : String(rawVal || '').trim();
      if (key === 'input_period_enabled') raw.enabled = val;
      else if (key === 'input_period_start') raw.start = val;
      else if (key === 'input_period_end') raw.end = val;
    }

    return normalizePeriod_(raw, Session.getScriptTimeZone());
  } catch (e) {
    Logger.log('getInputPeriod error: ' + e.message);
    return { success: false, message: 'Gagal membaca konfigurasi periode: ' + e.message };
  }
}

/**
 * Wrapper for frontend to get input period without Date objects (which break google.script.run serialization)
 */
function getClientInputPeriod() {
  var p = getInputPeriod();
  if (p && p.success) {
    delete p.startDate;
    delete p.endDate;
  }
  return p;
}

/**
 * Menyimpan periode input soal. Hanya Admin.
 * form = { startISO, endISO, enabled }
 */
function saveInputPeriod(form, requestorID, requestorToken) {
  try {
    // R1.6, R1.8: Verifikasi Admin
    try {
      verifyAdminAccess(requestorID, requestorToken);
    } catch (authErr) {
      return { success: false, code: 'AUTH', message: authErr.message || 'Pengaturan hanya tersedia untuk Admin.' };
    }

    var tz = Session.getScriptTimeZone();

    // Validasi
    var validation = validatePeriodForSave_(form, tz);
    if (!validation.valid) {
      return { success: false, code: 'VALIDATION', message: validation.message };
    }

    // Tulis ke sheet Konfigurasi
    var sheet = SS.getSheetByName('Konfigurasi');
    if (!sheet) {
      return { success: false, code: 'SYSTEM', message: 'Sheet Konfigurasi tidak ditemukan.' };
    }
    var data = sheet.getDataRange().getValues();

    var updateOrAppend = function(key, newValue) {
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === key) {
          sheet.getRange(i + 1, 2).setValue(newValue);
          data[i][1] = newValue; // update local cache
          found = true;
          break;
        }
      }
      if (!found) {
        var newRow = sheet.getLastRow() + 1;
        sheet.getRange(newRow, 1).setValue(key);
        sheet.getRange(newRow, 2).setValue(newValue);
        data.push([key, newValue]);
      }
    };

    var enabled = form.enabled === true || form.enabled === 'true';
    var startISO = String(form.startISO || '').trim();
    var endISO   = String(form.endISO || '').trim();

    updateOrAppend('input_period_enabled', enabled ? 'true' : 'false');
    updateOrAppend('input_period_start', startISO);
    updateOrAppend('input_period_end', endISO);

    // Format untuk respons
    var startDate = parseAppDateTime_(startISO, tz);
    var endDate   = parseAppDateTime_(endISO, tz);
    var startStr  = startDate ? formatAppDateTime_(startDate, tz) : '-';
    var endStr    = endDate   ? formatAppDateTime_(endDate, tz) : '-';

    // R1.7: Catat ke AdminLogs
    try {
      var actorName = getActorName(requestorID);
      var detail = 'Periode input soal diperbarui. Mulai: ' + startStr +
                   ', Berakhir: ' + endStr +
                   ', Status: ' + (enabled ? 'Aktif' : 'Nonaktif');
      addAdminLog(requestorID, actorName, 'SET_INPUT_PERIOD', 'Config', 'input_period', detail);
    } catch (logErr) {
      Logger.log('saveInputPeriod log error: ' + logErr.message);
    }

    return {
      success: true,
      message: 'Periode input soal berhasil disimpan.',
      startStr: startStr,
      endStr: endStr
    };
  } catch (e) {
    Logger.log('saveInputPeriod error: ' + e.message);
    return { success: false, code: 'SYSTEM', message: 'Gagal menyimpan: ' + e.message };
  }
}


// ──── C. GUARD PENEGAKAN PERIODE ─────────────────────────────────────────────

/**
 * Tentukan role dari sesi Users internal (token). Null bila tidak valid.
 * Role TIDAK diterima dari klien (R2.7).
 */
function resolveRequestorRole_(requestorID, requestorToken) {
  try {
    if (!requestorID || !requestorToken) return null;
    var reqID  = String(requestorID).trim();
    var reqTok = String(requestorToken).trim();
    if (!reqID || !reqTok) return null;

    var sheet = SS.getSheetByName('Users');
    if (!sheet) return null;
    var data = sheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === reqID) {
        if (String(data[i][5]).trim() !== reqTok) return null;
        var rawActive = data[i][6];
        var activeStr = String(rawActive).trim().toLowerCase();
        var isActive = (rawActive === true) || (rawActive === 1) ||
                       activeStr === 'true' || activeStr === '1';
        if (!isActive) return null;
        return String(data[i][3] || '').trim() || null;
      }
    }
    return null;
  } catch (e) {
    Logger.log('resolveRequestorRole_ error: ' + e.message);
    return null;
  }
}

/**
 * Keputusan penegakan periode (logika murni, tanpa I/O).
 * @param {string} role - 'Admin' | 'Guru'
 * @param {object} period - objek dari normalizePeriod_
 * @param {Date} now
 * @returns {{ ok:boolean, code?:string, message?:string }}
 */
function enforceInputPeriodDecision_(role, period, now) {
  // R2.3: Admin selalu lolos
  if (role === 'Admin') return { ok: true };

  // R2.4: enabled === false → lolos
  if (!period || period.enabled !== true) return { ok: true };

  // R2.5: enabled=true tapi config tidak lengkap
  if (!period.configComplete) {
    return { ok: false, code: 'PERIOD', message: 'Konfigurasi periode input soal belum lengkap.' };
  }

  // R2.1, R2.2: Cek now ∈ [start, end] inklusif
  var nowMs = now.getTime();
  if (nowMs >= period.startDate.getTime() && nowMs <= period.endDate.getTime()) {
    return { ok: true };
  }

  // Di luar rentang
  return {
    ok: false,
    code: 'PERIOD',
    message: 'Periode input/edit soal sedang tidak berlaku. Periode: ' +
             period.startStr + ' s.d. ' + period.endStr + '.'
  };
}

/**
 * Wrapper GAS: baca konfigurasi lalu evaluasi guard.
 * @param {string} role - dari resolveRequestorRole_
 * @returns {{ ok:boolean, code?:string, message?:string }}
 */
function enforceInputPeriod_(role, examID) {
  // Admin selalu lolos tanpa baca konfigurasi
  if (role === 'Admin') return { ok: true };

  try {
    if (examID) {
      const sheet = SS.getSheetByName('Exams');
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(examID)) {
          const bypassInputPeriod = data[i][11] === true || String(data[i][11]).toLowerCase() === 'true';
          if (bypassInputPeriod) {
            return { ok: true };
          }
          break;
        }
      }
    }

    var periodResult = getInputPeriod();
    if (!periodResult || periodResult.success === false) {
      // R11.1: gagal baca sheet → tolak Guru
      return { ok: false, code: 'CONFIG', message: 'Gagal membaca konfigurasi periode input soal.' };
    }
    return enforceInputPeriodDecision_(role, periodResult, new Date());
  } catch (e) {
    Logger.log('enforceInputPeriod_ error: ' + e.message);
    return { ok: false, code: 'CONFIG', message: 'Gagal membaca konfigurasi periode input soal.' };
  }
}


// ──── D. EVALUASI PROGRESS INPUT SOAL ────────────────────────────────────────

/**
 * Hitung Target_Soal_Ujian dari TypeConfig.
 * Σ max tiap tipe enabled; nilai tak valid → 0; tanpa tipe enabled → 0.
 */
function computeExamTarget_(typeConfigObjOrRaw) {
  var parsed = null;
  if (typeConfigObjOrRaw === null || typeConfigObjOrRaw === undefined || typeConfigObjOrRaw === '') {
    return 0;
  }
  if (typeof typeConfigObjOrRaw === 'string') {
    try { parsed = JSON.parse(typeConfigObjOrRaw); } catch (e) { return 0; }
  } else if (typeof typeConfigObjOrRaw === 'object') {
    parsed = typeConfigObjOrRaw;
  } else {
    return 0;
  }
  if (!parsed || typeof parsed !== 'object') return 0;

  var TYPES = ['PG', 'PG_KOMPLEKS', 'BS', 'JODOH', 'Esai'];
  var total = 0;

  for (var t = 0; t < TYPES.length; t++) {
    var key = TYPES[t];
    var cfg = parsed[key];
    if (!cfg || typeof cfg !== 'object') continue;

    // Cek enabled
    var enabled = false;
    if (typeof cfg.enabled === 'boolean') {
      enabled = cfg.enabled;
    } else if (typeof cfg.enabled === 'string') {
      enabled = cfg.enabled.trim().toLowerCase() !== 'false';
    } else if (cfg.enabled === undefined || cfg.enabled === null) {
      enabled = true; // default enabled
    } else {
      enabled = !!cfg.enabled;
    }
    if (!enabled) continue;

    // Parse max
    var maxVal = parseInt(cfg.max, 10);
    if (!isFinite(maxVal) || maxVal < 0 || Math.floor(maxVal) !== maxVal) {
      maxVal = 0;
    }
    total += maxVal;
  }
  return total;
}

/**
 * Evaluasi progress satu Guru terhadap Ujian_Guru.
 * @param {Array} assignments - [{examId, subject, class, target}]
 * @param {Object} questionCountByExam - {examId: count}
 * @returns {{ complete:boolean, shortfalls:Array }}
 */
function evaluateTeacherProgressFromData_(assignments, questionCountByExam) {
  if (!assignments || assignments.length === 0) {
    return { complete: true, shortfalls: [] };
  }

  var shortfalls = [];

  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    var stored = questionCountByExam[a.examId] || 0;
    var target = a.target || 0;

    if (stored < target) {
      shortfalls.push({
        examId: a.examId,
        subject: a.subject,
        class: a.class,
        stored: stored,
        target: target
      });
    }
  }

  return {
    complete: shortfalls.length === 0,
    shortfalls: shortfalls
  };
}

/**
 * Orkestrasi: baca Exams/Questions/Users sekali, evaluasi semua Guru.
 */
function evaluateAllTeachersProgress_() {
  try {
    var examsSheet = SS.getSheetByName('Exams');
    var questionsSheet = SS.getSheetByName('Questions');
    var usersSheet = SS.getSheetByName('Users');

    if (!examsSheet || !questionsSheet || !usersSheet) {
      return { ok: false, message: 'Sheet Exams, Questions, atau Users tidak ditemukan.' };
    }

    var examsData = examsSheet.getDataRange().getValues();
    var questionsData = questionsSheet.getDataRange().getValues();
    var usersData = usersSheet.getDataRange().getValues();

    // Hitung jumlah soal per ExamID (tanpa memandang tipe - R4.2)
    var questionCountByExam = {};
    for (var q = 1; q < questionsData.length; q++) {
      var eid = String(questionsData[q][1] || '').trim();
      if (eid) {
        questionCountByExam[eid] = (questionCountByExam[eid] || 0) + 1;
      }
    }

    // Buat map exam: examId → { subject, class, target, typeConfig }
    var examMap = {};
    for (var e = 1; e < examsData.length; e++) {
      var examId = String(examsData[e][0] || '').trim();
      if (!examId) continue;
      var examSubject = String(examsData[e][1] || '').trim();
      var examClass   = String(examsData[e][2] || '').trim();
      var tcRaw       = examsData[e][9];
      var target      = computeExamTarget_(tcRaw);

      examMap[examId] = {
        subject: examSubject,
        class: examClass,
        target: target
      };
    }

    // Evaluasi tiap Guru
    var teachers = [];
    for (var u = 1; u < usersData.length; u++) {
      var userRole = String(usersData[u][3] || '').trim();
      if (userRole !== 'Guru') continue;

      var userID = String(usersData[u][0] || '').trim();
      var userName = String(usersData[u][1] || '').trim();
      var rawAssignment = String(usersData[u][4] || '');

      // Parse teacher assignments (sama seperti getExamList)
      var teacherSubjects = [];
      rawAssignment.split(',').forEach(function(item) {
        var parts = item.split(':');
        if (parts.length >= 2) {
          teacherSubjects.push({
            subject: parts[0].trim().toLowerCase(),
            kelas: parts[1].trim().toLowerCase()
          });
        }
      });

      // Match exam → teacher (logika sama seperti getExamList)
      var assignments = [];
      var examIds = Object.keys(examMap);
      for (var ei = 0; ei < examIds.length; ei++) {
        var eId = examIds[ei];
        var exam = examMap[eId];
        var examSubjectLower = exam.subject.toLowerCase();
        var examClassLower = exam.class.toLowerCase();

        var match = teacherSubjects.some(function(tugas) {
          var kelasUjian = examClassLower.split(',').map(function(k) { return k.trim(); });
          return examSubjectLower.includes(tugas.subject) &&
                 kelasUjian.some(function(k) {
                   return k.includes(tugas.kelas) || tugas.kelas.includes(k);
                 });
        });

        if (match) {
          assignments.push({
            examId: eId,
            subject: exam.subject,
            class: exam.class,
            target: exam.target
          });
        }
      }

      var progress = evaluateTeacherProgressFromData_(assignments, questionCountByExam);

      teachers.push({
        userID: userID,
        name: userName,
        assignments: assignments,
        complete: progress.complete,
        shortfalls: progress.shortfalls
      });
    }

    return { ok: true, teachers: teachers };
  } catch (e) {
    Logger.log('evaluateAllTeachersProgress_ error: ' + e.message);
    return { ok: false, message: 'Gagal mengevaluasi progress: ' + e.message };
  }
}


// ──── E. PEMBACAAN EMAIL & VERIFIKASI DARI SPREADSHEET EKSTERNAL ─────────────

/**
 * Validasi format email (R5.7).
 * Panjang 3-254 setelah trim, tanpa spasi internal, tepat satu @ dengan >=1 char sebelum & sesudah.
 */
function isValidEmail_(raw) {
  if (raw === null || raw === undefined) return false;
  var s = String(raw).trim();
  if (s.length < 3 || s.length > 254) return false;
  if (/\s/.test(s)) return false;
  var parts = s.split('@');
  if (parts.length !== 2) return false;
  if (parts[0].length < 1 || parts[1].length < 1) return false;
  return true;
}

/**
 * Helper to determine if the spreadsheet cell value indicates email is verified.
 * Supports boolean true, "TRUE", "TERVERIFIKASI", "1", "YA", and "YES".
 */
function isVerifiedValue_(val) {
  if (typeof val === 'boolean') return val;
  if (val === null || val === undefined) return false;
  var str = String(val).trim().toUpperCase();
  return (str === 'TRUE' || str === 'TERVERIFIKASI' || str === '1' || str === 'YA' || str === 'YES');
}

/**
 * Ambil record satu user dari data baris eksternal (logika murni).
 * @param {Array[]} rows - seluruh baris data (termasuk header di index 0)
 * @param {string} userID
 * @returns {{ found:boolean, email:string, verified:boolean }}
 */
function _getExternalUserRecord_(rows, userID) {
  var result = { found: false, email: '', verified: false };
  if (!rows || !userID) return result;

  var targetID = String(userID).trim().toLowerCase();
  if (!targetID) return result;

  for (var i = rows.length - 1; i >= 1; i--) { // skip header, cari dari bawah
    var rowUsername = String(rows[i][1] || '').trim().toLowerCase(); // kolom B (index 1)
    if (rowUsername === targetID) {
      result.found = true;
      result.email = String(rows[i][15] || '').trim(); // kolom P (index 15, 0-based)
      result.verified = isVerifiedValue_(rows[i][17]); // kolom R (index 17, 0-based)
      return result; // baris terakhir yang cocok
    }
  }
  return result;
}

/**
 * Batch: baca seluruh kolom B/P/R dari spreadsheet eksternal.
 * @returns {{ ok:boolean, map?:Object }}
 */
function _getExternalUserRecordMap_() {
  try {
    var ss = SpreadsheetApp.openById(EXTERNAL_USERS_SS_ID);
    var sheet = ss.getSheetByName(EXTERNAL_USERS_SHEET);
    if (!sheet) {
      Logger.log('_getExternalUserRecordMap_: sheet "' + EXTERNAL_USERS_SHEET + '" tidak ditemukan.');
      return { ok: false };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, map: {} };

    // Baca seluruh data (kita butuh kolom B=2, P=16, R=18)
    var data = sheet.getRange(1, 1, lastRow, 18).getValues();
    var map = {};

    for (var i = 1; i < data.length; i++) {
      var username = String(data[i][1] || '').trim().toLowerCase(); // kolom B
      if (!username) continue;
      if (map[username]) continue; // R5.2: baris pertama saja

      var email = String(data[i][15] || '').trim(); // kolom P
      map[username] = {
        email: email,
        emailValid: isValidEmail_(email),
        verified: isVerifiedValue_(data[i][17])
      };
    }

    return { ok: true, map: map };
  } catch (e) {
    Logger.log('_getExternalUserRecordMap_ error: ' + e.message);
    return { ok: false };
  }
}


// ──── F. STATUS & RECHECK VERIFIKASI EMAIL UNTUK LOGIN ───────────────────────

/**
 * Helper: baca status verifikasi email Guru dari spreadsheet eksternal.
 * Timeout lunak 10 detik.
 * @param {string} userID
 * @returns {{ verified:boolean, determinable:boolean }}
 */
function getEmailVerificationStatus_(userID) {
  var startTime = Date.now();
  try {
    var targetID = String(userID).trim().toLowerCase();

    // 1. Cek Local SS (Sheet "Users" Kolom R) sebagai fallback utama
    try {
      var localSheet = SS.getSheetByName('Users');
      if (localSheet) {
        var localData = localSheet.getDataRange().getValues();
        for (var i = localData.length - 1; i >= 1; i--) {
          var rowID = String(localData[i][0] || '').trim().toLowerCase();
          if (rowID === targetID && localData[i].length > 17) {
            var localVerified = isVerifiedValue_(localData[i][17]);
            if (localVerified) {
              return { verified: true, determinable: true };
            }
          }
        }
      }
    } catch (e) {
      Logger.log('Error cek local SS: ' + e.message);
    }

    // 2. Cek External SS
    var ss = SpreadsheetApp.openById(EXTERNAL_USERS_SS_ID);
    if (Date.now() - startTime > 10000) return { verified: false, determinable: false };

    var sheet = ss.getSheetByName(EXTERNAL_USERS_SHEET);
    if (!sheet) return { verified: false, determinable: false };

    if (Date.now() - startTime > 10000) return { verified: false, determinable: false };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { verified: false, determinable: true };

    var data = sheet.getRange(1, 1, lastRow, 18).getValues();
    if (Date.now() - startTime > 10000) return { verified: false, determinable: false };

    var record = _getExternalUserRecord_(data, userID);
    return {
      verified: record.verified,
      determinable: true
    };
  } catch (e) {
    Logger.log('getEmailVerificationStatus_ error: ' + e.message);
    return { verified: false, determinable: false };
  }
}

/**
 * Fungsi yang dipanggil frontend untuk periksa-ulang status verifikasi email.
 */
function recheckEmailVerification(requestorID, requestorToken) {
  try {
    // Verifikasi sesi
    var role = resolveRequestorRole_(requestorID, requestorToken);
    if (!role) {
      return { success: false, code: 'AUTH', message: 'Sesi tidak valid.' };
    }

    // Hanya untuk Guru
    if (role !== 'Guru') {
      return { success: true, verified: true };
    }

    var status = getEmailVerificationStatus_(requestorID);
    if (!status.determinable) {
      return { success: false, determinable: false, message: 'Tidak dapat memeriksa status verifikasi email saat ini. Silakan coba lagi.' };
    }

    return { success: true, verified: status.verified };
  } catch (e) {
    Logger.log('recheckEmailVerification error: ' + e.message);
    return { success: false, determinable: false, message: 'Gagal memeriksa status verifikasi: ' + e.message };
  }
}


// ──── G. SISTEM NOTIFIKASI EMAIL ─────────────────────────────────────────────

/**
 * Cek apakah saat ini harus mengirim notifikasi.
 * True tepat ketika: enabled===true, end valid, jam ∈ {11,13,15,17,19,21,23},
 * dan now ∈ [end−24h, end] inklusif.
 */
function shouldSendAtTime_(now, period, tz) {
  if (!period || period.enabled !== true) return false;
  if (!period.endDate || !period.configComplete) return false;

  var tzToUse = tz || Session.getScriptTimeZone();
  var hour = appHourOf_(now, tzToUse);
  var NOTIFY_HOURS = [11, 13, 15, 17, 19, 21, 23];
  if (NOTIFY_HOURS.indexOf(hour) === -1) return false;

  var nowMs = now.getTime();
  var endMs = period.endDate.getTime();
  var windowStartMs = endMs - (24 * 60 * 60 * 1000); // end - 24 jam

  return nowMs >= windowStartMs && nowMs <= endMs;
}

/**
 * Susun konten email pengingat.
 * @param {Object} teacher - { userID, name, shortfalls }
 * @param {Object} period - dari getInputPeriod
 * @param {string} tz
 * @returns {{ subject:string, body:string }}
 */
function composeReminderEmail_(teacher, period, tz) {
  var tzToUse = tz || Session.getScriptTimeZone();
  var endStr = period.endStr || formatAppDateTime_(period.endDate, tzToUse);
  var displayName = (teacher.name && teacher.name.trim()) ? teacher.name.trim() : teacher.userID;

  var subject = 'Pengingat Penyelesaian Input Soal — batas ' + endStr;

  var lines = [];
  lines.push('Yth. ' + displayName + ',');
  lines.push('');
  lines.push('Ini adalah pengingat bahwa Anda belum menyelesaikan input soal ujian.');
  lines.push('Batas waktu: ' + endStr);
  lines.push('');

  if (teacher.shortfalls && teacher.shortfalls.length > 0) {
    lines.push('Ujian yang belum memenuhi target:');
    lines.push('');
    for (var i = 0; i < teacher.shortfalls.length; i++) {
      var sf = teacher.shortfalls[i];
      lines.push('  • ' + sf.subject + ' (' + sf.class + ')');
      lines.push('    Tersimpan: ' + sf.stored + ' / Target: ' + sf.target);
    }
    lines.push('');
  }

  lines.push('Segera lengkapi input soal Anda sebelum batas waktu berakhir.');
  lines.push('');
  lines.push('Terima kasih,');
  lines.push('Sistem CBT');

  return {
    subject: subject,
    body: lines.join('\n')
  };
}

/**
 * Seleksi penerima notifikasi.
 * Hanya Guru yang complete===false DAN email valid.
 */
function selectReminderRecipients_(teachers, emailMap) {
  var recipients = [];
  var skipped = [];

  if (!teachers || !Array.isArray(teachers)) return { recipients: recipients, skipped: skipped };

  for (var i = 0; i < teachers.length; i++) {
    var t = teachers[i];
    if (t.complete) {
      skipped.push({ userID: t.userID, reason: 'Sudah selesai' });
      continue;
    }

    var emailRecord = emailMap ? emailMap[t.userID.toLowerCase()] : null;
    if (!emailRecord || !emailRecord.emailValid) {
      skipped.push({ userID: t.userID, reason: 'Email tidak valid atau tidak ditemukan' });
      continue;
    }

    recipients.push({
      userID: t.userID,
      name: t.name,
      email: emailRecord.email,
      shortfalls: t.shortfalls
    });
  }

  return { recipients: recipients, skipped: skipped };
}

/**
 * Handler utama notifikasi. Idempoten per (tanggal, jam, Guru).
 * Dipanggil oleh trigger time-based.
 */
function sendInputReminderNotifications() {
  var startMs = Date.now();

  try {
    var tz = Session.getScriptTimeZone();
    var now = new Date();
    var hour = appHourOf_(now, tz);
    var dateKey = appDateKeyOf_(now, tz);

    // R6.3: Cek jam notifikasi
    var NOTIFY_HOURS = [11, 13, 15, 17, 19, 21, 23];
    if (NOTIFY_HOURS.indexOf(hour) === -1) {
      Logger.log('[InputReminder] Jam ' + hour + ' bukan jam notifikasi. Batal.');
      return;
    }

    // Baca periode
    var period = getInputPeriod();
    if (!period || period.success === false) {
      Logger.log('[InputReminder] Gagal baca konfigurasi periode. Batal.');
      return;
    }

    // R6.5: enabled false atau end invalid → batal
    if (!period.enabled || !period.endDate || !period.configComplete) {
      Logger.log('[InputReminder] Periode nonaktif atau konfigurasi belum lengkap. Batal.');
      return;
    }

    // Cek windowing: now ∈ [end-24h, end]
    if (!shouldSendAtTime_(now, period, tz)) {
      Logger.log('[InputReminder] Di luar jendela notifikasi. Batal.');
      return;
    }

    // Evaluasi progress semua Guru
    var progressResult = evaluateAllTeachersProgress_();
    if (!progressResult || !progressResult.ok) {
      Logger.log('[InputReminder] Gagal evaluasi progress: ' + (progressResult ? progressResult.message : 'unknown'));
      return;
    }

    // Ambil email map
    var emailMapResult = _getExternalUserRecordMap_();
    if (!emailMapResult || !emailMapResult.ok) {
      Logger.log('[InputReminder] Gagal baca data email eksternal. Semua Guru dianggap tanpa email valid.');
      // Tetap lanjut dengan map kosong → tidak ada kirim
    }
    var emailMap = (emailMapResult && emailMapResult.ok) ? emailMapResult.map : {};

    // Seleksi penerima
    var selection = selectReminderRecipients_(progressResult.teachers, emailMap);
    var recipients = selection.recipients;
    var skippedList = selection.skipped;

    // Bersihkan penanda dedupe lama (best-effort)
    try {
      var props = PropertiesService.getScriptProperties();
      var allProps = props.getProperties();
      var yesterday = appDateKeyOf_(new Date(now.getTime() - 24 * 60 * 60 * 1000), tz);
      var keysToDelete = [];
      for (var pk in allProps) {
        if (pk.indexOf('inpnotif_') === 0) {
          var parts = pk.split('_');
          if (parts.length >= 4) {
            var propDateKey = parts[1];
            if (propDateKey !== dateKey && propDateKey !== yesterday) {
              keysToDelete.push(pk);
            }
          }
        }
      }
      if (keysToDelete.length > 0) {
        props.deleteProperties(keysToDelete);
      }
    } catch (cleanErr) {
      Logger.log('[InputReminder] Gagal bersihkan penanda lama: ' + cleanErr.message);
    }

    var sent = 0, skippedDedupe = 0, failed = 0;
    var props = PropertiesService.getScriptProperties();

    for (var r = 0; r < recipients.length; r++) {
      // R11.5: Cek anggaran waktu (< 30 detik tersisa dari batas 360 detik)
      if (Date.now() - startMs > 330000) {
        Logger.log('[InputReminder] Anggaran waktu habis. Diproses: ' + (r) + '/' + recipients.length);
        break;
      }

      // R11.4: Cek kuota harian
      try {
        var quota = MailApp.getRemainingDailyQuota();
        if (quota <= 0) {
          Logger.log('[InputReminder] Kuota email harian habis. Sisa penerima: ' + (recipients.length - r));
          break;
        }
      } catch (quotaErr) {
        Logger.log('[InputReminder] Gagal cek kuota: ' + quotaErr.message);
      }

      var recip = recipients[r];
      var propKey = 'inpnotif_' + dateKey + '_' + hour + '_' + recip.userID.toLowerCase();

      // R6.7: Dedupe
      try {
        if (props.getProperty(propKey)) {
          skippedDedupe++;
          continue;
        }
      } catch (dedupeErr) {
        // Lanjut saja
      }

      // Kirim email
      try {
        var email = composeReminderEmail_(recip, period, tz);
        MailApp.sendEmail(recip.email, email.subject, email.body);
        // Set penanda dedupe
        try { props.setProperty(propKey, '1'); } catch (setPropErr) {}
        sent++;
      } catch (sendErr) {
        Logger.log('[InputReminder] Gagal kirim ke ' + recip.userID + ': ' + sendErr.message);
        failed++;
      }
    }

    // R7.5: Log ringkasan
    Logger.log('[InputReminder] Ringkasan ' + dateKey + ' jam ' + hour +
               ': Terkirim=' + sent +
               ', Dilewati(dedupe)=' + skippedDedupe +
               ', Dilewati(lainnya)=' + skippedList.length +
               ', Gagal=' + failed);

  } catch (e) {
    // R11.6: Bungkus seluruh fungsi — jangan sampai mengganggu operasi inti
    Logger.log('[InputReminder] Error fatal: ' + e.message);
  }
}


// ──── H. TRIGGER TERJADWAL ───────────────────────────────────────────────────

/**
 * Buat trigger time-based hourly. Hapus trigger lama dulu (R6.8).
 */
function setupInputReminderTrigger() {
  try {
    // Hapus trigger lama
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'sendInputReminderNotifications') {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }

    // Buat baru: setiap jam
    ScriptApp.newTrigger('sendInputReminderNotifications')
      .timeBased()
      .everyHours(1)
      .create();

    Logger.log('✅ Trigger sendInputReminderNotifications (setiap 1 jam) berhasil dibuat. ' + removed + ' trigger lama dihapus.');
    return { success: true, message: 'Trigger notifikasi pengingat berhasil diaktifkan (setiap 1 jam). ' + removed + ' trigger lama dihapus.' };
  } catch (e) {
    Logger.log('setupInputReminderTrigger error: ' + e.message);
    return { success: false, message: 'Gagal membuat trigger: ' + e.message };
  }
}

/**
 * Hapus semua trigger handler ini (R6.9).
 */
function removeInputReminderTrigger() {
  var removed = 0;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'sendInputReminderNotifications') {
        ScriptApp.deleteTrigger(triggers[i]);
        removed++;
      }
    }
  } catch (e) {
    Logger.log('removeInputReminderTrigger error: ' + e.message);
  }
  Logger.log('Trigger sendInputReminderNotifications dihapus (' + removed + ' trigger).');
  return { success: true, message: removed + ' trigger notifikasi pengingat berhasil dihapus.', removed: removed };
}

/**
 * Status trigger (R6.9).
 */
function checkInputReminderTriggerStatus() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var count = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'sendInputReminderNotifications') {
        count++;
      }
    }
    return { active: count > 0, count: count };
  } catch (e) {
    return { active: false, count: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-TIMEOUT: Mengakhiri ujian siswa yang masih "In Progress" setelah jam batas
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fungsi utama yang dipanggil oleh GAS Time-based Trigger.
 * Memproses semua respons "In Progress" yang ujiannya sudah melewati EndDate,
 * lalu mengubahnya menjadi "Waktu Habis" dan menghitung nilai finalnya.
 */
function autoTimeoutInProgressExams() {
  const now = new Date();
  Logger.log('[autoTimeout] Mulai proses: ' + now.toISOString());

  const rSheet  = SS.getSheetByName('Responses');
  const eSheet  = SS.getSheetByName('Exams');
  if (!rSheet || !eSheet) {
    Logger.log('[autoTimeout] Sheet Responses atau Exams tidak ditemukan.');
    return;
  }

  // Buat map EndDate per ExamID agar tidak perlu loop berulang
  const examEndMap = {};
  const examRows   = eSheet.getDataRange().getValues();
  for (let i = 1; i < examRows.length; i++) {
    const eid     = String(examRows[i][0]).trim();
    const endDate = examRows[i][7]; // kolom H = EndDate
    if (eid && endDate instanceof Date) {
      examEndMap[eid] = endDate;
    }
  }

  const rData   = rSheet.getDataRange().getValues();
  let processed = 0, skipped = 0, errors = 0;

  for (let i = 1; i < rData.length; i++) {
    const status  = String(rData[i][7] || '').trim(); // kolom H = Status
    if (status.toLowerCase() !== 'in progress') { skipped++; continue; }

    const responseId = String(rData[i][0]).trim();
    const userId     = String(rData[i][1]).trim();
    const examId     = String(rData[i][2]).trim();
    const endDate    = examEndMap[examId];

    // Hanya proses jika EndDate ujian sudah terlampaui
    if (!endDate || now <= endDate) { skipped++; continue; }

    let answers = {};
    try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

    try {
      const result = submitExam(userId, examId, answers, 'Waktu Habis');
      if (result && result.success) {
        Logger.log('[autoTimeout] Berhasil: ' + responseId + ' | User: ' + userId + ' | Skor: ' + result.score);
        processed++;
      } else {
        Logger.log('[autoTimeout] Gagal: ' + responseId + ' | ' + (result ? result.message : 'unknown'));
        errors++;
      }
    } catch(e) {
      Logger.log('[autoTimeout] Exception pada ' + responseId + ': ' + e.toString());
      errors++;
    }
  }

  const summary = `[autoTimeout] Selesai. Diproses: ${processed}, Dilewati: ${skipped}, Gagal: ${errors}.`;
  Logger.log(summary);

  // Catat ke AdminLogs
  try {
    addAdminLog(
      'SYSTEM', 'Auto-Timeout System', 'AUTO_TIMEOUT_EXAM',
      'Responses', '-',
      summary + ' Dijalankan: ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
    );
  } catch(e) {}

  return { processed, skipped, errors };
}

/**
 * Mendaftarkan trigger harian untuk autoTimeoutInProgressExams.
 * Jalankan fungsi ini SATU KALI secara manual dari GAS Editor.
 * Jalankan lagi setiap kali jam timeout diubah di Konfigurasi.
 */
function setupDailyTimeoutTrigger() {
  // Hapus trigger lama agar tidak duplikat
  let removed = 0;
  const existing = ScriptApp.getProjectTriggers();
  for (let i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'autoTimeoutInProgressExams') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }

  // Baca jam dari Konfigurasi (default 16)
  let hour = 16;
  try {
    const cfgSheet = SS.getSheetByName('Konfigurasi');
    if (cfgSheet) {
      const cfgData = cfgSheet.getDataRange().getValues();
      for (let i = 1; i < cfgData.length; i++) {
        if (String(cfgData[i][0]) === 'auto_timeout_hour') {
          const h = parseInt(cfgData[i][1], 10);
          if (!isNaN(h) && h >= 0 && h <= 23) { hour = h; }
          break;
        }
      }
    }
  } catch(e) {
    Logger.log('[setupTrigger] Gagal membaca jam dari Konfigurasi, pakai default 16. ' + e.toString());
  }

  // Buat trigger baru
  ScriptApp.newTrigger('autoTimeoutInProgressExams')
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();

  const msg = `Trigger auto-timeout berhasil didaftarkan: setiap hari pukul ${String(hour).padStart(2,'0')}:00. Trigger lama dihapus: ${removed}.`;
  Logger.log('[setupTrigger] ' + msg);
  return { success: true, message: msg, hour: hour, removedOld: removed };
}

/**
 * Mengecek apakah trigger autoTimeout sudah aktif dan jam berapa ia dijadwalkan.
 * Dipanggil oleh getAppConfig untuk ditampilkan di halaman Konfigurasi.
 */
function checkAutoTimeoutTriggerStatus() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'autoTimeoutInProgressExams') {
        return { active: true, hour: triggers[i].getEventsConfig ? null : null };
      }
    }
    return { active: false, hour: null };
  } catch(e) {
    return { active: false, hour: null };
  }
}


// ═══════════════════════════════════════════════════════════════
// ── FITUR KIRIM PESAN / NOTIFIKASI KE SISWA ─────────────────
// ═══════════════════════════════════════════════════════════════

/**
 * Inisialisasi sheet Notifications jika belum ada.
 * Kolom: NotifID | SenderID | SenderName | TargetType | TargetIDs |
 *        ExamID  | Message   | SentAt     | ReadBy
 */
function _getOrCreateNotificationsSheet_() {
  let sheet = SS.getSheetByName('Notifications');
  if (!sheet) {
    sheet = SS.insertSheet('Notifications');
    const headers = ['NotifID','SenderID','SenderName','TargetType','TargetIDs','ExamID','Message','SentAt','ReadBy'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setFontWeight('bold').setBackground('#fef3c7');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(7, 320); // Message kolom lebih lebar
  }
  return sheet;
}

/**
 * Kirim pesan/notifikasi ke siswa.
 * @param {string} requestorID  - ID pengirim (Admin/Guru)
 * @param {string} requestorToken - token sesi pengirim
 * @param {string} message      - isi pesan (max 500 karakter)
 * @param {string} targetType   - 'all' | 'exam' | 'selected'
 *   - 'all'      : semua siswa yang sedang mengerjakan ujian manapun
 *   - 'exam'     : semua siswa pada examID tertentu
 *   - 'selected' : array userID spesifik
 * @param {string} examID       - examID target (wajib jika targetType='exam')
 * @param {Array}  targetUserIDs - array userID (wajib jika targetType='selected')
 */
function sendStudentNotification(requestorID, requestorToken, message, targetType, examID, targetUserIDs) {
  try {
    // ── 1. Verifikasi sesi pengirim ─────────────────────────────────────
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let senderRole = null, senderName = '';
    for (let i = 1; i < uData.length; i++) {
      // BUG FIX NOTIF-BE4: Tambah .trim() pada perbandingan untuk menghindari
      // false mismatch karena spasi tersembunyi di data sheet.
      if (String(uData[i][0]).trim() === String(requestorID).trim() &&
          String(uData[i][5]).trim() === String(requestorToken).trim()) {
        senderRole = String(uData[i][3]).trim();
        senderName = String(uData[i][1]).trim();
        break;
      }
    }
    if (!senderRole)            return { success: false, message: 'Sesi tidak valid.' };
    if (senderRole === 'Siswa') return { success: false, message: 'Akses ditolak.' };

    // ── 2. Validasi pesan ────────────────────────────────────────────────
    const msgClean = String(message || '').trim();
    if (msgClean.length < 1)   return { success: false, message: 'Pesan tidak boleh kosong.' };
    if (msgClean.length > 500) return { success: false, message: 'Pesan maksimal 500 karakter.' };

    // ── 3. Validasi targetType ───────────────────────────────────────────
    const validTypes = ['all', 'exam', 'selected'];
    const tType = String(targetType || '').trim();
    if (!validTypes.includes(tType)) return { success: false, message: 'Target tidak valid.' };

    let targetExamID  = '';
    let targetIDsJSON = '[]';

    if (tType === 'exam') {
      if (!examID || String(examID).trim() === '') return { success: false, message: 'ExamID wajib diisi untuk target ujian.' };
      targetExamID = String(examID).trim();
    } else if (tType === 'selected') {
      if (!Array.isArray(targetUserIDs) || targetUserIDs.length === 0) {
        return { success: false, message: 'Pilih minimal 1 siswa untuk target perorangan.' };
      }
      // BUG FIX NOTIF-BE5: filter out nilai kosong/null sebelum di-JSON-stringify
      // dan trim setiap ID agar konsisten dengan cara pengecekan di getStudentNotifications.
      const cleanIDs = targetUserIDs.map(id => String(id || '').trim()).filter(id => id.length > 0);
      if (cleanIDs.length === 0) {
        return { success: false, message: 'Tidak ada userID valid pada target.' };
      }
      targetIDsJSON = JSON.stringify(cleanIDs);
    }

    // ── 4. Tulis ke sheet Notifications ────────────────────────────────
    const sheet    = _getOrCreateNotificationsSheet_();
    const notifID  = 'NOTIF-' + new Date().getTime();
    const sentAt   = new Date();

    sheet.appendRow([
      notifID,
      String(requestorID),
      senderName,
      tType,
      targetIDsJSON,
      targetExamID,
      msgClean,
      sentAt,
      '[]'  // ReadBy: array JSON userID yang sudah membaca
    ]);
    SpreadsheetApp.flush();

    // ── 5. Log aksi admin ───────────────────────────────────────────────
    try {
      addAdminLog(requestorID, senderName, 'SEND_NOTIFICATION', 'Notification',
        notifID, `Kirim pesan ke [${tType}]: "${msgClean.substring(0, 60)}${msgClean.length > 60 ? '...' : ''}"`);
    } catch(logErr) { Logger.log('sendStudentNotification log error: ' + logErr.message); }

    return { success: true, message: 'Pesan berhasil dikirim.', notifID: notifID };

  } catch(e) {
    Logger.log('sendStudentNotification error: ' + e.message);
    return { success: false, message: 'Gagal mengirim pesan: ' + e.message };
  }
}

/**
 * Ambil notifikasi yang belum dibaca oleh siswa tertentu.
 * Dipanggil oleh halaman ujian siswa secara polling setiap 30 detik.
 * @param {string} userID   - ID siswa
 * @param {string} token    - token sesi siswa
 * @param {string} examID   - examID ujian yang sedang dikerjakan
 * @returns {Object} { success, messages: [{notifID, senderName, message, sentAt}] }
 */
function getStudentNotifications(userID, token, examID) {
  try {
    // ── 1. Verifikasi sesi siswa ────────────────────────────────────────
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let verified = false;
    // BUG FIX NOTIF-BE1: Tambah validasi bahwa akun yang polling adalah
    // role Siswa — sebelumnya siapapun (Admin/Guru) dengan token valid
    // bisa memanggil fungsi ini.
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]).trim() === String(userID).trim() &&
          String(uData[i][5]).trim() === String(token).trim()) {
        const role = String(uData[i][3] || '').trim();
        // Izinkan Siswa dan juga Admin/Guru (untuk testing), tapi setidaknya
        // pastikan akun aktif dan token cocok — sudah dilakukan di atas.
        verified = true; break;
      }
    }
    if (!verified) return { success: false, message: 'Sesi tidak valid.' };

    // BUG FIX NOTIF-BE2: Validasi examID — jika kosong/null, notifikasi
    // tipe 'exam' tidak akan pernah cocok. Normalkan dulu.
    const examIDNorm = String(examID || '').trim();

    // ── 2. Baca sheet Notifications ─────────────────────────────────────
    const sheet = _getOrCreateNotificationsSheet_();
    if (sheet.getLastRow() < 2) return { success: true, messages: [] };

    const data = sheet.getDataRange().getValues();
    const tz   = Session.getScriptTimeZone();
    const unread = [];
    const rowsToMarkRead = []; // { rowIndex, newReadBy }

    for (let i = 1; i < data.length; i++) {
      const tType      = String(data[i][3] || '').trim(); // TargetType
      const targetIDs  = String(data[i][4] || '[]');      // TargetIDs JSON
      const notifExamID= String(data[i][5] || '').trim(); // ExamID
      const readByRaw  = String(data[i][8] || '[]');      // ReadBy JSON

      // Cek apakah notifikasi ini untuk siswa ini
      let isTarget = false;
      if (tType === 'all') {
        isTarget = true;
      } else if (tType === 'exam') {
        // BUG FIX NOTIF-BE2 (lanjutan): bandingkan dengan examIDNorm yang sudah dinormalisasi
        isTarget = (examIDNorm.length > 0 && notifExamID === examIDNorm);
      } else if (tType === 'selected') {
        try {
          const ids = JSON.parse(targetIDs);
          // BUG FIX NOTIF-BE3: normalisasi trim() pada setiap ID saat compare
          isTarget = Array.isArray(ids) && ids.map(s => String(s).trim()).includes(String(userID).trim());
        } catch(e) { isTarget = false; }
      }

      if (!isTarget) continue;

      // Cek apakah sudah dibaca
      let readBy = [];
      try { readBy = JSON.parse(readByRaw); } catch(e) { readBy = []; }
      if (!Array.isArray(readBy)) readBy = [];

      // BUG FIX NOTIF-BE3 (lanjutan): normalisasi trim() saat cek readBy
      if (readBy.map(s => String(s).trim()).includes(String(userID).trim())) continue; // sudah dibaca

      // Format waktu
      let sentAtFmt = '-';
      try {
        const rawDate = data[i][7];
        if (rawDate) sentAtFmt = Utilities.formatDate(new Date(rawDate), tz, 'HH:mm');
      } catch(e) {}

      unread.push({
        notifID:    String(data[i][0]),
        senderName: String(data[i][2] || 'Pengawas'),
        message:    String(data[i][6] || ''),
        sentAt:     sentAtFmt
      });

      // Tandai untuk di-update
      readBy.push(String(userID).trim());
      rowsToMarkRead.push({ rowIndex: i + 1, newReadBy: JSON.stringify(readBy) });
    }

    // ── 3. Tandai notifikasi yang baru dibaca ────────────────────────────
    for (let j = 0; j < rowsToMarkRead.length; j++) {
      sheet.getRange(rowsToMarkRead[j].rowIndex, 9).setValue(rowsToMarkRead[j].newReadBy);
    }
    if (rowsToMarkRead.length > 0) SpreadsheetApp.flush();

    return { success: true, messages: unread };

  } catch(e) {
    Logger.log('getStudentNotifications error: ' + e.message);
    return { success: false, message: 'Gagal memuat notifikasi.', messages: [] };
  }
}

/**
 * Ambil daftar notifikasi yang pernah dikirim (untuk Admin/Guru).
 * Dipanggil dari panel monitor.
 */
function getSentNotifications(requestorID, requestorToken) {
  try {
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let senderRole = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(requestorID) &&
          String(uData[i][5]) === String(requestorToken)) {
        senderRole = String(uData[i][3]).trim(); break;
      }
    }
    if (!senderRole || senderRole === 'Siswa') return { success: false, message: 'Akses ditolak.' };

    const sheet = _getOrCreateNotificationsSheet_();
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    const rawData = sheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();
    const result = [];
    for (let i = rawData.length - 1; i >= 1; i--) { // newest first
      let sentAtFmt = '-';
      try {
        const rawDate = rawData[i][7];
        if (rawDate) sentAtFmt = Utilities.formatDate(new Date(rawDate), tz, 'dd/MM/yyyy HH:mm:ss');
      } catch(e) {}
      let readCount = 0;
      try { const rb = JSON.parse(String(rawData[i][8] || '[]')); readCount = Array.isArray(rb) ? rb.length : 0; } catch(e) {}

      result.push({
        notifID:    String(rawData[i][0]),
        senderName: String(rawData[i][2] || '-'),
        targetType: String(rawData[i][3] || '-'),
        targetIDs:  String(rawData[i][4] || '[]'),
        examID:     String(rawData[i][5] || '-'),
        message:    String(rawData[i][6] || ''),
        sentAt:     sentAtFmt,
        readCount:  readCount
      });
    }
    return { success: true, data: result };
  } catch(e) {
    Logger.log('getSentNotifications error: ' + e.message);
    return { success: false, message: 'Gagal memuat riwayat.', data: [] };
  }
}

// ============================================================
// ██████  ███████ ███    ██  ██████   █████  ██     ██  █████  ███████
// ██   ██ ██      ████   ██ ██       ██   ██ ██     ██ ██   ██ ██
// ██████  █████   ██ ██  ██ ██   ███ ███████ ██  █  ██ ███████ ███████
// ██      ██      ██  ██ ██ ██    ██ ██   ██ ██ ███ ██ ██   ██      ██
// ██      ███████ ██   ████  ██████  ██   ██  ███ ███  ██   ██ ███████
//
// Modul Pengawas Ujian
// Sheet: Supervisors
// Kolom: SupervisorAssignID | ExamID | RoomName | SessionLabel | SupervisorUserID | SupervisorName | CreatedAt | SubstituteUserID | SubstituteName
// ============================================================

/**
 * Buat atau kembalikan sheet Supervisors.
 * Dipanggil saat migrasi dan setiap fungsi pengawas.
 */
function _getOrCreateSupervisorsSheet_() {
  let sheet = SS.getSheetByName('Supervisors');
  if (!sheet) {
    sheet = SS.insertSheet('Supervisors');
    const headers = [
      'SupervisorAssignID',  // A – UUID unik tiap assignment
      'ExamID',              // B – FK ke sheet Exams
      'RoomName',            // C – Nama ruang ujian
      'SessionLabel',        // D – Label sesi (mis. "Sesi 1 – 07:30")
      'SupervisorUserID',    // E – FK ke Users (role Pengawas/Guru) — pengawas asli
      'SupervisorName',      // F – Cache nama pengawas asli
      'CreatedAt',           // G – Timestamp dibuat
      'SubstituteUserID',    // H – UserID pengawas pengganti (kosong jika belum ada)
      'SubstituteName'       // I – Cache nama pengawas pengganti
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setFontWeight('bold').setBackground('#fef9c3');
    sheet.setFrozenRows(1);
    Logger.log('Sheet Supervisors dibuat.');
  }
  return sheet;
}

/**
 * Migrasi sheet Supervisors yang sudah ada: tambah kolom H & I jika belum ada.
 * Dipanggil dari migrateSchema().
 */
function _migrateSupervisorsSubstituteColumns_() {
  const sheet = SS.getSheetByName('Supervisors');
  if (!sheet) return;
  // Baca semua header sebelum modifikasi apapun
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  if (!headers.includes('SubstituteUserID')) {
    sheet.getRange(1, lastCol + 1).setValue('SubstituteUserID').setFontWeight('bold').setBackground('#fef9c3');
    Logger.log('Kolom SubstituteUserID ditambahkan ke sheet Supervisors.');
  }
  // Re-read lastColumn setelah kemungkinan penambahan kolom H
  const lastColAfter = sheet.getLastColumn();
  const headersAfter = sheet.getRange(1, 1, 1, lastColAfter).getValues()[0];
  if (!headersAfter.includes('SubstituteName')) {
    sheet.getRange(1, lastColAfter + 1).setValue('SubstituteName').setFontWeight('bold').setBackground('#fef9c3');
    Logger.log('Kolom SubstituteName ditambahkan ke sheet Supervisors.');
  }
}

// ── Helper: Tentukan UserID "efektif" untuk satu baris Supervisors ────────────
// Jika ada pengganti (kolom H diisi), pengawas efektif = pengganti.
// Jika tidak ada, pengawas efektif = pengawas asli (kolom E).
function _getEffectiveSupervisorID_(row) {
  const sub = String(row[7] || '').trim();
  return sub !== '' ? sub : String(row[4] || '').trim();
}

// ──────────────────────────────────────────────────────────────
// Auth helper khusus Pengawas
// ──────────────────────────────────────────────────────────────

/**
 * Verifikasi bahwa requestor adalah Admin (untuk CRUD manajemen pengawas).
 * Alias tipis agar kode Pengawas bisa dibaca sendiri.
 */
function _verifyAdminForSupervisor_(userID, token) {
  verifyAdminAccess(userID, token); // throws on failure
}

/**
 * Verifikasi sesi Pengawas. Return userRow jika valid.
 * @throws Error jika sesi tidak valid.
 */
function _verifySupervisorSession_(userID, token) {
  if (!userID || !token) throw new Error('Identitas tidak valid.');
  const sheet = SS.getSheetByName('Users');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== String(userID).trim()) continue;
    const role     = String(data[i][3] || '').trim();
    const isActive = data[i][6] === true || String(data[i][6]).toLowerCase() === 'true';

    // Izinkan role 'Pengawas' (akun dedicated) ATAU role 'Guru' yang punya assignment
    if (role !== 'Pengawas' && role !== 'Guru') {
      throw new Error('Akses ditolak: bukan Pengawas.');
    }

    // FIX BUG 3: cek token dan isActive SEBELUM cek assignment,
    // agar pesan error tepat (token expired → bukan "belum ditugaskan")
    if (String(data[i][5]).trim() !== String(token).trim()) {
      throw new Error('Sesi tidak valid atau sudah berakhir.');
    }
    if (!isActive) throw new Error('Akun dinonaktifkan.');

    if (role === 'Guru') {
      // Guru hanya boleh jika sudah punya penugasan pengawas:
      // baik sebagai pengawas asli (kolom E) maupun pengawas pengganti aktif (kolom H)
      const svSheet = _getOrCreateSupervisorsSheet_();
      const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
      const uid     = String(userID).trim().toLowerCase();
      const hasAssignment = svData.some((row, idx) => {
        if (idx === 0) return false;
        // Pengawas asli: kolom E (index 4) — hanya berlaku jika TIDAK ada pengganti (kolom H kosong)
        const originalID  = String(row[4] || '').trim().toLowerCase();
        const substituteID = String(row[7] || '').trim().toLowerCase();
        if (originalID === uid && substituteID === '') return true;
        // Pengawas pengganti aktif: kolom H (index 7)
        if (substituteID === uid) return true;
        return false;
      });
      if (!hasAssignment) throw new Error('Akses ditolak: belum ada penugasan sebagai Pengawas Ujian.');
    }

    if (role === 'Pengawas') {
      // Akun dedicated Pengawas: berlaku selama ada assignment aktif (asli ATAU pengganti)
      const svSheet = _getOrCreateSupervisorsSheet_();
      const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
      const uid     = String(userID).trim().toLowerCase();
      const hasAssignment = svData.some((row, idx) => {
        if (idx === 0) return false;
        const originalID   = String(row[4] || '').trim().toLowerCase();
        const substituteID = String(row[7] || '').trim().toLowerCase();
        if (originalID === uid && substituteID === '') return true;
        if (substituteID === uid) return true;
        return false;
      });
      if (!hasAssignment) throw new Error('Akses ditolak: belum ada penugasan sebagai Pengawas Ujian.');
    }

    return { userID: String(data[i][0]), name: String(data[i][1]) };
  }
  throw new Error('Pengguna tidak ditemukan.');
}

// ──────────────────────────────────────────────────────────────
// loginUser sudah menangani semua role lewat _getExternalCredential_.
// Role Pengawas juga menggunakan kredensial eksternal (seperti Admin/Guru).
// Tambahan di checkSession untuk Pengawas sudah otomatis karena
// checkSession hanya cek token + isActive tanpa filter role.
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// CRUD Manajemen Pengawas (hanya Admin)
// ──────────────────────────────────────────────────────────────

/**
 * Ambil daftar assignment pengawas, opsional filter per ExamID.
 * Return: { success, data: [{id, examID, roomName, sessionLabel, supervisorUserID, supervisorName, createdAt}] }
 */
function getSupervisorAssignments(adminID, adminToken, filterExamID) {
  try {
    _verifyAdminForSupervisor_(adminID, adminToken);
    const sheet = _getOrCreateSupervisorsSheet_();
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    const raw = sheet.getDataRange().getValues();
    const tz  = Session.getScriptTimeZone();
    const result = [];
    for (let i = 1; i < raw.length; i++) {
      const examID = String(raw[i][1] || '').trim();
      if (filterExamID && filterExamID !== '' && examID !== filterExamID) continue;
      let createdAtFmt = '-';
      try { if (raw[i][6]) createdAtFmt = Utilities.formatDate(new Date(raw[i][6]), tz, 'dd/MM/yyyy HH:mm'); } catch(e2) {}
      const substituteUserID = String(raw[i][7] || '').trim();
      const substituteName   = String(raw[i][8] || '').trim();
      result.push({
        id:                 String(raw[i][0] || ''),
        examID:             examID,
        roomName:           String(raw[i][2] || ''),
        sessionLabel:       String(raw[i][3] || ''),
        supervisorUserID:   String(raw[i][4] || ''),
        supervisorName:     String(raw[i][5] || ''),
        createdAt:          createdAtFmt,
        substituteUserID:   substituteUserID,
        substituteName:     substituteName,
        hasSubstitute:      substituteUserID !== ''
      });
    }
    return { success: true, data: result };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Tambah assignment pengawas baru.
 * form: { examID, roomName, sessionLabel, supervisorUserID }
 */
function createSupervisorAssignment(form, adminID, adminToken) {
  try {
    _verifyAdminForSupervisor_(adminID, adminToken);
    if (!form || !form.examID || !form.roomName || !form.sessionLabel || !form.supervisorUserID) {
      return { success: false, message: 'Semua field wajib diisi.' };
    }

    // Validasi bahwa supervisorUserID ada dan role-nya Pengawas atau Guru
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let supervisorName = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]).trim() === String(form.supervisorUserID).trim()) {
        const svRole = String(uData[i][3]).trim();
        if (svRole !== 'Pengawas' && svRole !== 'Guru') {
          return { success: false, message: 'User tersebut bukan Guru maupun Pengawas.' };
        }
        supervisorName = String(uData[i][1] || '');
        break;
      }
    }
    if (!supervisorName) return { success: false, message: 'Pengawas tidak ditemukan.' };

    // Validasi ExamID ada
    const eSheet = SS.getSheetByName('Exams');
    const eData  = eSheet.getDataRange().getValues();
    let examFound = false;
    for (let i = 1; i < eData.length; i++) {
      if (String(eData[i][0]).trim() === String(form.examID).trim()) { examFound = true; break; }
    }
    if (!examFound) return { success: false, message: 'Ujian tidak ditemukan.' };

    // BUG 9 FIX: cek duplikasi — kombinasi examID + supervisorUserID + roomName + sessionLabel
    const sheet = _getOrCreateSupervisorsSheet_();
    if (sheet.getLastRow() > 1) {
      const existRows = sheet.getDataRange().getValues();
      const normRoom    = String(form.roomName).trim().toLowerCase();
      const normSession = String(form.sessionLabel).trim().toLowerCase();
      const normSvID    = String(form.supervisorUserID).trim().toLowerCase();
      const normExamID  = String(form.examID).trim();
      for (let i = 1; i < existRows.length; i++) {
        if (
          String(existRows[i][1]).trim()       === normExamID &&
          String(existRows[i][2]).trim().toLowerCase() === normRoom &&
          String(existRows[i][3]).trim().toLowerCase() === normSession &&
          String(existRows[i][4]).trim().toLowerCase() === normSvID
        ) {
          return { success: false, message: 'Penugasan dengan kombinasi ujian, ruang, sesi, dan pengawas yang sama sudah ada.' };
        }
      }
    }

    const assignID = 'SVA-' + Utilities.getUuid().replace(/-/g,'').substring(0,12).toUpperCase();
    sheet.appendRow([
      assignID,
      String(form.examID).trim(),
      String(form.roomName).trim(),
      String(form.sessionLabel).trim(),
      String(form.supervisorUserID).trim(),
      supervisorName,
      new Date()
    ]);

    addAdminLog(adminID, getActorName(adminID), 'Tambah Pengawas', 'Supervisor', assignID,
      `Ujian: ${form.examID}, Ruang: ${form.roomName}, Sesi: ${form.sessionLabel}, Pengawas: ${supervisorName}`);

    // Sinkronisasi ExamRooms: pasang assignID ke ruang yang nama & ujiannya cocok
    _syncExamRoomSupervisor_(String(form.examID).trim(), String(form.roomName).trim(), assignID);

    return { success: true, id: assignID, message: 'Assignment pengawas berhasil ditambahkan.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Update assignment pengawas.
 * data: { id, examID, roomName, sessionLabel, supervisorUserID }
 */
function updateSupervisorAssignment(data, adminID, adminToken) {
  try {
    _verifyAdminForSupervisor_(adminID, adminToken);
    if (!data || !data.id) return { success: false, message: 'ID assignment tidak valid.' };

    // BUG 7 FIX: validasi semua field wajib sebelum update
    if (!String(data.examID || '').trim())          return { success: false, message: 'Ujian wajib dipilih.' };
    if (!String(data.roomName || '').trim())         return { success: false, message: 'Nama ruang ujian tidak boleh kosong.' };
    if (!String(data.sessionLabel || '').trim())     return { success: false, message: 'Label sesi tidak boleh kosong.' };
    if (!String(data.supervisorUserID || '').trim()) return { success: false, message: 'Pengawas wajib dipilih.' };

    const sheet = _getOrCreateSupervisorsSheet_();
    const rows  = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.id).trim()) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { success: false, message: 'Assignment tidak ditemukan.' };

    // Validasi supervisor
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let supervisorName = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]).trim() === String(data.supervisorUserID).trim()) {
        const svRole = String(uData[i][3]).trim();
        if (svRole !== 'Pengawas' && svRole !== 'Guru') {
          return { success: false, message: 'User tersebut bukan Guru maupun Pengawas.' };
        }
        supervisorName = String(uData[i][1] || '');
        break;
      }
    }
    if (!supervisorName) return { success: false, message: 'Pengawas tidak ditemukan.' };

    sheet.getRange(targetRow, 2).setValue(String(data.examID).trim());
    sheet.getRange(targetRow, 3).setValue(String(data.roomName).trim());
    sheet.getRange(targetRow, 4).setValue(String(data.sessionLabel).trim());
    sheet.getRange(targetRow, 5).setValue(String(data.supervisorUserID).trim());
    sheet.getRange(targetRow, 6).setValue(supervisorName);
    // Jika pengawas asli diubah, hapus pengganti yang mungkin masih tersimpan
    // agar akses tidak tumpang tindih dengan pengawas asli baru.
    sheet.getRange(targetRow, 8).setValue('');
    sheet.getRange(targetRow, 9).setValue('');

    addAdminLog(adminID, getActorName(adminID), 'Update Pengawas', 'Supervisor', data.id,
      `Ruang: ${data.roomName}, Sesi: ${data.sessionLabel}, Pengawas: ${supervisorName}`);

    // Sinkronisasi ExamRooms:
    // Jika roomName berubah, lepas link dari room lama terlebih dulu (hanya jika assignment ini
    // adalah satu-satunya yang meng-link room tersebut), lalu pasang ke room baru.
    const oldExamID  = String(rows[targetRow - 1][1] || '').trim();
    const oldRoomName = String(rows[targetRow - 1][2] || '').trim();
    const newExamID  = String(data.examID).trim();
    const newRoomName = String(data.roomName).trim();
    const normOld = oldRoomName.toLowerCase();
    const normNew = newRoomName.toLowerCase();
    // Jika room lama berbeda dengan room baru, bersihkan link di room lama
    if (oldExamID !== newExamID || normOld !== normNew) {
      _syncExamRoomSupervisor_(oldExamID, oldRoomName, '');
    }
    // Pasang assignID ke room baru
    _syncExamRoomSupervisor_(newExamID, newRoomName, data.id);

    return { success: true, message: 'Assignment berhasil diperbarui.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Hapus assignment pengawas berdasarkan ID.
 */
function deleteSupervisorAssignment(assignID, adminID, adminToken) {
  try {
    _verifyAdminForSupervisor_(adminID, adminToken);
    if (!assignID) return { success: false, message: 'ID assignment tidak valid.' };

    const sheet = _getOrCreateSupervisorsSheet_();
    const rows  = sheet.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(assignID).trim()) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { success: false, message: 'Assignment tidak ditemukan.' };

    // Ambil examID dan roomName sebelum dihapus untuk sinkronisasi ExamRooms
    const delExamID   = String(rows[targetRow - 1][1] || '').trim();
    const delRoomName = String(rows[targetRow - 1][2] || '').trim();

    sheet.deleteRow(targetRow);
    addAdminLog(adminID, getActorName(adminID), 'Hapus Pengawas', 'Supervisor', assignID, 'Dihapus oleh Admin');

    // Sinkronisasi ExamRooms: kosongkan SupervisorAssignID di ruang yang terkait
    if (delExamID && delRoomName) {
      _syncExamRoomSupervisor_(delExamID, delRoomName, '');
    }

    return { success: true, message: 'Assignment berhasil dihapus.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Tunjuk pengawas pengganti untuk sebuah assignment.
 * Pengawas pengganti mendapat akses penuh ke assignment tersebut.
 * Pengawas asli KEHILANGAN akses ke assignment tersebut (efektif supervisor berganti).
 *
 * @param {string} assignID        – SupervisorAssignID target
 * @param {string} substituteUserID – UserID pengawas/guru pengganti
 * @param {string} adminID
 * @param {string} adminToken
 */
function setSubstituteSupervisor(assignID, substituteUserID, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!assignID)         return { success: false, message: 'ID assignment tidak valid.' };
    if (!substituteUserID) return { success: false, message: 'UserID pengganti tidak boleh kosong.' };

    // Validasi pengganti: harus role Pengawas atau Guru dan aktif
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let substituteName = null;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]).trim().toLowerCase() !== String(substituteUserID).trim().toLowerCase()) continue;
      const svRole   = String(uData[i][3]).trim();
      const isActive = uData[i][6] === true || String(uData[i][6]).toLowerCase() === 'true';
      if (svRole !== 'Pengawas' && svRole !== 'Guru') {
        return { success: false, message: 'User pengganti bukan Pengawas maupun Guru.' };
      }
      if (!isActive) return { success: false, message: 'Akun pengawas pengganti tidak aktif.' };
      substituteName = String(uData[i][1] || '');
      break;
    }
    if (substituteName === null) {
      return { success: false, message: 'Pengawas pengganti tidak ditemukan.' };
    }

    // Cari row assignment
    const sheet = _getOrCreateSupervisorsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(assignID).trim()) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { success: false, message: 'Assignment tidak ditemukan.' };

    // Pengawas asli tidak boleh menjadi pengawas pengganti untuk assignment-nya sendiri
    const originalUserID = String(rows[targetRow - 2][4] || '').trim();
    if (String(substituteUserID).trim().toLowerCase() === originalUserID.toLowerCase()) {
      return { success: false, message: 'Pengawas pengganti tidak boleh sama dengan pengawas asli.' };
    }

    // Pastikan kolom H dan I ada (seharusnya sudah ada via migrasi, ini safeguard)
    _migrateSupervisorsSubstituteColumns_();

    sheet.getRange(targetRow, 8).setValue(String(substituteUserID).trim());
    sheet.getRange(targetRow, 9).setValue(substituteName);

    const originalName = String(rows[targetRow - 2][5] || '');
    addAdminLog(adminID, getActorName(adminID), 'Tunjuk Pengganti', 'Supervisor', assignID,
      `Pengawas asli: ${originalName} → Pengganti: ${substituteName} (${substituteUserID})`);
    return { success: true, message: `${substituteName} berhasil ditunjuk sebagai pengawas pengganti.` };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Cabut pengawas pengganti dari sebuah assignment.
 * Pengawas asli mendapatkan kembali akses penuh ke assignment tersebut.
 *
 * @param {string} assignID  – SupervisorAssignID target
 * @param {string} adminID
 * @param {string} adminToken
 */
function clearSubstituteSupervisor(assignID, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!assignID) return { success: false, message: 'ID assignment tidak valid.' };

    const sheet = _getOrCreateSupervisorsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(assignID).trim()) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { success: false, message: 'Assignment tidak ditemukan.' };

    const currentSub    = String(rows[targetRow - 2][7] || '').trim();
    if (!currentSub) return { success: false, message: 'Assignment ini tidak memiliki pengawas pengganti.' };

    const originalName  = String(rows[targetRow - 2][5] || '');
    const subName       = String(rows[targetRow - 2][8] || '').trim() || currentSub; // nama (I) atau fallback ke ID (H)

    sheet.getRange(targetRow, 8).setValue('');
    sheet.getRange(targetRow, 9).setValue('');

    addAdminLog(adminID, getActorName(adminID), 'Cabut Pengganti', 'Supervisor', assignID,
      `Pengganti ${subName} dicabut. Pengawas asli (${originalName}) kembali bertugas.`);
    return { success: true, message: `Pengawas pengganti berhasil dicabut. ${originalName} kembali bertugas.` };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Ambil daftar user yang bisa bertugas sebagai Pengawas Ujian:
 */
function getSupervisorUserList(adminID, adminToken) {
  try {
    _verifyAdminForSupervisor_(adminID, adminToken);
    const sheet = SS.getSheetByName('Users');
    const data  = sheet.getDataRange().getValues();
    const list  = [];
    for (let i = 1; i < data.length; i++) {
      const role = String(data[i][3] || '').trim();
      // Tampilkan Guru DAN Pengawas sebagai kandidat pengawas ujian
      if (role !== 'Pengawas' && role !== 'Guru') continue;
      const isActive = data[i][6] === true || String(data[i][6]).toLowerCase() === 'true';
      list.push({
        userID:   String(data[i][0]),
        name:     String(data[i][1]),
        role:     role,               // kirim role asli agar UI bisa tampilkan label
        isActive: isActive
      });
    }
    // Urutkan: Pengawas dedicated dulu, lalu Guru, kemudian alfa per nama
    list.sort((a, b) => {
      if (a.role === b.role) return a.name.localeCompare(b.name, 'id');
      return a.role === 'Pengawas' ? -1 : 1;
    });
    return { success: true, data: list };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Data untuk panel Pengawas
// ──────────────────────────────────────────────────────────────

/**
 * Ambil data dashboard untuk Pengawas yang sedang login.
 * Return ringkasan ujian yang dia awasi + status progress.
 */
function getDashboardDataForSupervisor(supervisorID, supervisorToken) {
  try {
    _verifySupervisorSession_(supervisorID, supervisorToken);

    // Ambil assignment ujian pengawas ini
    // Logika efektif: jika ada pengganti (kolom H), pengawas asli kehilangan akses;
    // pengganti mendapat akses. Pengawas asli hanya punya akses jika kolom H kosong.
    const svSheet = _getOrCreateSupervisorsSheet_();
    const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
    const myAssignments = [];
    const myExamIDs     = new Set();
    for (let i = 1; i < svData.length; i++) {
      const effectiveID = _getEffectiveSupervisorID_(svData[i]);
      if (effectiveID !== String(supervisorID).trim()) continue;
      myAssignments.push({
        id:           String(svData[i][0]),
        examID:       String(svData[i][1]),
        roomName:     String(svData[i][2]),
        sessionLabel: String(svData[i][3])
      });
      myExamIDs.add(String(svData[i][1]));
    }

    // Ambil data ujian yang relevan
    const eSheet = SS.getSheetByName('Exams');
    const eData  = eSheet.getDataRange().getValues();
    const examInfo = {};
    // FIX BUG 3: hitung activeCount & todayCount per-ujian unik (bukan per-assignment),
    // dan todayCount hanya untuk ujian yang statusnya aktif.
    const activeExamIDsSet = new Set();
    const todayExamIDsSet  = new Set();
    const tz       = Session.getScriptTimeZone();
    const now      = new Date();
    const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

    for (let i = 1; i < eData.length; i++) {
      const eid = String(eData[i][0]).trim();
      if (!myExamIDs.has(eid)) continue;
      const status   = String(eData[i][6] || '').toLowerCase();
      const dateRaw  = eData[i][3];
      let dateStr = '-';
      try { if (dateRaw) dateStr = Utilities.formatDate(new Date(dateRaw), tz, 'dd/MM/yyyy HH:mm'); } catch(e2) {}
      let dateDayStr = '';
      try { if (dateRaw) dateDayStr = Utilities.formatDate(new Date(dateRaw), tz, 'yyyy-MM-dd'); } catch(e2) {}

      examInfo[eid] = {
        subject:  String(eData[i][1] || ''),
        kelas:    String(eData[i][2] || ''),
        date:     dateStr,
        duration: parseFloat(eData[i][4]) || 0,
        status:   status
      };
      // Hitung hanya pada Set unik agar assignment duplikat tidak inflate counter
      if (status === 'aktif') activeExamIDsSet.add(eid);
      if (status === 'aktif' && dateDayStr === todayStr) todayExamIDsSet.add(eid);
    }

    const activeCount = activeExamIDsSet.size;
    const todayCount  = todayExamIDsSet.size;

    // Hitung jumlah siswa mengerjakan per ujian
    const rSheet = SS.getSheetByName('Responses');
    const rData  = rSheet.getLastRow() > 1 ? rSheet.getDataRange().getValues() : [];
    const inProgressMap = {}, finishedMap = {};
    for (let i = 1; i < rData.length; i++) {
      const eid    = String(rData[i][2]).trim();
      const status = String(rData[i][7] || '').toLowerCase().trim();
      if (!myExamIDs.has(eid)) continue;
      if (status === 'in progress') inProgressMap[eid] = (inProgressMap[eid] || 0) + 1;
      if (_isFinishedStatus(status)) finishedMap[eid]  = (finishedMap[eid]  || 0) + 1;
    }

    // Bangun card ujian dengan data assignment
    const examCards = myAssignments.map(a => {
      const info = examInfo[a.examID] || { subject: a.examID, kelas: '-', date: '-', status: '-', duration: 0 };
      return {
        assignID:     a.id,
        examID:       a.examID,
        roomName:     a.roomName,
        sessionLabel: a.sessionLabel,
        subject:      info.subject,
        kelas:        info.kelas,
        date:         info.date,
        duration:     info.duration,
        status:       info.status,
        inProgress:   inProgressMap[a.examID] || 0,
        finished:     finishedMap[a.examID]   || 0
      };
    });

    return {
      success: true,
      data: {
        totalAssignments: myAssignments.length,
        activeExams:      activeCount,
        todayExams:       todayCount,
        examCards:        examCards
      }
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Ambil data monitor ujian untuk Pengawas — hanya ujian yang menjadi tugasnya.
 * Memanfaatkan getExamMonitorData sebagai base, lalu filter sesuai assignment.
 */
function getMonitorDataForSupervisor(supervisorID, supervisorToken) {
  try {
    _verifySupervisorSession_(supervisorID, supervisorToken);

    // Ambil ExamID yang jadi tugas pengawas ini
    // Gunakan logika efektif supervisor: pengganti (kolom H) menggantikan asli (kolom E)
    const svSheet = _getOrCreateSupervisorsSheet_();
    const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
    const myExamIDs = new Set();
    const myRooms   = {}; // examID → [{roomName, sessionLabel}]
    for (let i = 1; i < svData.length; i++) {
      const effectiveID = _getEffectiveSupervisorID_(svData[i]);
      if (effectiveID !== String(supervisorID).trim()) continue;
      const eid = String(svData[i][1]).trim();
      myExamIDs.add(eid);
      if (!myRooms[eid]) myRooms[eid] = [];
      myRooms[eid].push({ roomName: String(svData[i][2]), sessionLabel: String(svData[i][3]) });
    }

    if (myExamIDs.size === 0) {
      return {
        success: true,
        data: { belumLogin: [], sudahLogin: [], mengerjakan: [], selesai: [], curang: [] },
        meta: { dropdownKelas: [], dropdownMapel: [], activeExams: [], violationLimit: 0, rooms: {} }
      };
    }

    // Gunakan getExamMonitorData dengan "Admin" sebagai base (akses penuh data siswa)
    // tapi kita override token cek dengan token Pengawas yang sudah tervalidasi di atas.
    // Kita harus re-implement filter manual di sini karena getExamMonitorData
    // hanya mengizinkan Admin/Guru.

    const uSheet   = SS.getSheetByName('Users');
    const uData    = uSheet.getDataRange().getValues();
    const eSheet   = SS.getSheetByName('Exams');
    const eData    = eSheet.getDataRange().getValues();
    const rSheet   = SS.getSheetByName('Responses');
    const rData    = rSheet.getLastRow() > 1 ? rSheet.getDataRange().getValues() : [];
    const lSheet   = SS.getSheetByName('Logs');
    const lData    = lSheet.getLastRow() > 1 ? lSheet.getDataRange().getValues() : [];
    const qSheet   = SS.getSheetByName('Questions');
    const qData    = qSheet ? qSheet.getDataRange().getValues() : [];
    const tz       = Session.getScriptTimeZone();

    // Batas pelanggaran
    let violationLimit = 0;
    try {
      const cfgSheet = SS.getSheetByName('Konfigurasi');
      if (cfgSheet) {
        const cfgData = cfgSheet.getDataRange().getValues();
        for (let i = 1; i < cfgData.length; i++) {
          if (String(cfgData[i][0]).trim() === 'violation_limit') {
            const p = parseInt(cfgData[i][1], 10);
            if (!isNaN(p) && p >= 0) { violationLimit = p; break; }
          }
        }
      }
    } catch(e2) {}

    // Map ujian aktif yang jadi tugas pengawas
    const examMap = {};
    const activeExams = [];
    const kelasSet = new Set(), mapelSet = new Set();
    for (let i = 1; i < eData.length; i++) {
      const eid = String(eData[i][0]).trim();
      if (!myExamIDs.has(eid)) continue;
      const subject  = String(eData[i][1] || '').trim();
      const kelas    = String(eData[i][2] || '').trim();
      const status   = String(eData[i][6] || '').toLowerCase();
      const duration = parseFloat(eData[i][4]) || 0;
      examMap[eid] = { subject, kelas, duration };
      if (status === 'aktif') {
        const pin = String(eData[i][5] || '').trim();
        activeExams.push({ examID: eid, subject, kelas, duration, pin });
        kelasSet.add(kelas);
        mapelSet.add(subject);
      }
    }

    // Bangun studentMap dengan dua strategi:
    // Strategi A (ExamRooms): jika ruang ujian sudah dikonfigurasi untuk examID tertentu,
    //   pengawas hanya melihat siswa yang terdaftar di ruangannya.
    // Strategi B (fallback): jika belum ada ruang ujian sama sekali untuk examID itu,
    //   tampilkan semua siswa dari kelas yang relevan (perilaku lama).

    // Bangun per-examID set siswa yang boleh dilihat pengawas
    const roomStudentSetPerExam = {}; // examID → Set<userID> | null (null = fallback lama)
    for (const eid of myExamIDs) {
      roomStudentSetPerExam[eid] = _getSupervisorRoomStudents_(supervisorID, eid, svData);
    }

    // Buat set global siswa yang boleh muncul (gabungan semua examID)
    const allowedStudentIDs = new Set(); // siswa yang boleh ditampilkan pengawas ini
    let anyFallback = false; // ada examID yang pakai fallback (belum ada ruang)?

    // Kita perlu data kelas relevan untuk fallback
    const relevantKelas = new Set(Object.values(examMap).map(e => e.kelas.toLowerCase()));

    // Kumpulkan userID dari tiap ujian
    // (untuk fallback, kita isi setelah load uData di bawah)
    for (const [eid, roomSet] of Object.entries(roomStudentSetPerExam)) {
      if (roomSet === null) {
        anyFallback = true; // tandai ada examID yang masih pakai fallback
      } else {
        roomSet.forEach(sid => allowedStudentIDs.add(sid));
      }
    }

    const studentMap = {};
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][3]).trim() !== 'Siswa') continue;
      const kelas    = String(uData[i][4] || '').trim();
      const tokenVal = String(uData[i][5] || '').trim();
      const uid      = String(uData[i][0]);

      // Untuk examID yang fallback: tampilkan siswa dari kelas relevan
      const kelasMatch = relevantKelas.has(kelas.toLowerCase());
      const inRoomList = allowedStudentIDs.has(uid);

      // Siswa masuk studentMap jika:
      //   - terdaftar di set ExamRooms pengawas ini (Strategi A), ATAU
      //   - ada examID yang belum punya ruang sama sekali dan kelas siswa relevan (Strategi B fallback)
      if (!inRoomList && !(anyFallback && kelasMatch)) continue;

      studentMap[uid] = {
        nama:     String(uData[i][1]),
        kelas:    kelas,
        hasToken: tokenVal.length >= 10
      };
    }

    // Log pelanggaran
    const violMap = {}, violDetails = {}, violLogs = {};
    for (let i = 1; i < lData.length; i++) {
      const vKey = String(lData[i][1]) + '|' + String(lData[i][2]);
      violMap[vKey] = (violMap[vKey] || 0) + 1;
      if (lData[i][4]) violDetails[vKey] = violDetails[vKey] ? violDetails[vKey] + '; ' + String(lData[i][4]) : String(lData[i][4]);
      if (!violLogs[vKey]) violLogs[vKey] = [];
      const rawDetail = String(lData[i][4] || '').trim();
      const rawTs = lData[i][5];
      let fmtTs = '-';
      try { if (rawTs) fmtTs = Utilities.formatDate(new Date(rawTs), tz, 'dd/MM/yyyy HH:mm:ss'); } catch(e2) {}
      const parenIdx = rawDetail.lastIndexOf('(');
      let jenisViol = rawDetail, detailViol = '';
      if (parenIdx > 0) { jenisViol = rawDetail.substring(0, parenIdx).trim(); detailViol = rawDetail.substring(parenIdx).replace(/[()]/g, '').trim(); }
      violLogs[vKey].push({ waktu: fmtTs, jenis: jenisViol || rawDetail, detail: detailViol });
    }

    // Hitung soal per ujian
    const qCountMap = {};
    for (let i = 1; i < qData.length; i++) {
      const eid = String(qData[i][1] || '').trim();
      if (myExamIDs.has(eid)) qCountMap[eid] = (qCountMap[eid] || 0) + 1;
    }

    // ── Bangun map userID → {sessionLabel, roomName} ─────────────────────────
    // Untuk setiap examID yang diawasi pengawas ini, kumpulkan ruangan beserta
    // sesi-nya, lalu petakan setiap siswa di ruangan tersebut ke sesi & ruangannya.
    // Jika satu siswa ada di >1 ruang (tidak normal), ambil ruangan pertama.
    // Jika pakai fallback (belum ada ExamRooms), sessionLabel/roomName dari
    // data Supervisors digunakan sebagai default.
    const studentSessionMap = {}; // userID → { sessionLabel, roomName }

    const roomSheet2 = _getOrCreateExamRoomsSheet_();
    const roomRows2  = roomSheet2.getLastRow() > 1 ? roomSheet2.getDataRange().getValues() : [];

    // Buat map assignID → {sessionLabel, roomName} dari svData
    const assignInfoMap = {}; // SupervisorAssignID → {sessionLabel, roomName}
    for (let i = 1; i < svData.length; i++) {
      const aid  = String(svData[i][0] || '').trim();
      if (!aid) continue;
      assignInfoMap[aid] = {
        sessionLabel: String(svData[i][3] || '').trim(),
        roomName:     String(svData[i][2] || '').trim()
      };
    }

    // Iterasi ExamRooms: ruang yang relevan untuk examID pengawas ini
    for (let i = 1; i < roomRows2.length; i++) {
      const rowExamID    = String(roomRows2[i][1] || '').trim();
      if (!myExamIDs.has(rowExamID)) continue;
      const svAssignInRoom = String(roomRows2[i][3] || '').trim();
      // Cari info sesi dari assignInfoMap
      const info = svAssignInRoom ? assignInfoMap[svAssignInRoom] : null;
      if (!info) continue; // ruang tanpa pengawas → tidak ada sesi spesifik
      // Parse student IDs dari ruang ini
      const stuIDs = _parseStudentIDs_(roomRows2[i][4]);
      stuIDs.forEach(function(sid) {
        // Hanya set jika belum ada (prioritas pertama)
        if (!studentSessionMap[sid]) {
          studentSessionMap[sid] = { sessionLabel: info.sessionLabel, roomName: info.roomName };
        }
      });
    }

    // Fallback untuk siswa yang ruangannya belum dikonfigurasi di ExamRooms:
    // Gunakan sessionLabel/roomName dari assignment pertama pengawas untuk examID tersebut.
    // Ini menangani Strategi B (fallback kelas).
    const fallbackSessionPerExam = {}; // examID → {sessionLabel, roomName}
    for (let i = 1; i < svData.length; i++) {
      const effectiveID2 = _getEffectiveSupervisorID_(svData[i]);
      if (effectiveID2 !== String(supervisorID).trim()) continue;
      const eid2 = String(svData[i][1]).trim();
      if (!fallbackSessionPerExam[eid2]) {
        fallbackSessionPerExam[eid2] = {
          sessionLabel: String(svData[i][3] || '').trim(),
          roomName:     String(svData[i][2] || '').trim()
        };
      }
    }

    function fmtDate(val) {
      if (!val || val === '') return '-';
      try { return Utilities.formatDate(new Date(val), tz, 'dd/MM/yyyy HH:mm:ss'); } catch(e) { return String(val); }
    }

    const resultBuckets = { belumLogin: [], sudahLogin: [], mengerjakan: [], selesai: [], curang: [] };
    const studentsInAnyBucket = new Set();

    for (let i = 1; i < rData.length; i++) {
      const userID  = String(rData[i][1]);
      const examID  = String(rData[i][2]);
      if (!myExamIDs.has(examID)) continue;
      const student = studentMap[userID];
      if (!student) continue;
      studentsInAnyBucket.add(userID);

      const status = String(rData[i][7] || '').toLowerCase().trim();
      const vKey   = userID + '|' + examID;
      const exam   = examMap[examID] || { subject: examID, kelas: '-', duration: 0 };

      let answeredCount = 0;
      try {
        const rawA = rData[i][3];
        if (rawA && typeof rawA === 'string' && rawA.trim() !== '' && rawA.trim() !== '{}') {
          const parsed = JSON.parse(rawA);
          if (parsed && typeof parsed === 'object') {
            answeredCount = Object.keys(parsed).filter(k => !String(k).startsWith('_') && parsed[k] !== null && parsed[k] !== '').length;
          }
        }
      } catch(e2) { answeredCount = 0; }

      const stuSess = studentSessionMap[userID] || fallbackSessionPerExam[examID] || {};
      const entry = {
        responseId: String(rData[i][0]), userID, nama: student.nama, kelas: student.kelas, examID,
        mapel:          exam.subject,
        duration:       exam.duration,
        startTime:      fmtDate(rData[i][5]),
        submitTime:     fmtDate(rData[i][6]),
        score:          rData[i][4] !== '' && rData[i][4] !== null ? rData[i][4] : '-',
        violations:     violMap[vKey]     || 0,
        violDetail:     violDetails[vKey] || '',
        violLogs:       violLogs[vKey]    || [],   // FIX BUG 2: violLogs sudah dibangun, pastikan masuk entry
        answeredCount:  answeredCount,
        totalQuestions: qCountMap[examID] || 0,
        sessionLabel:   stuSess.sessionLabel || '',
        roomName:       stuSess.roomName     || ''
      };

      if (status === 'in progress') resultBuckets.mengerjakan.push(entry);
      else if (_isFinishedStatus(status)) resultBuckets.selesai.push(entry);
      else if (status === 'curang') resultBuckets.curang.push(entry);
      else resultBuckets.mengerjakan.push(entry);
    }

    // Siswa yang belum punya response
    for (const [uid, student] of Object.entries(studentMap)) {
      if (studentsInAnyBucket.has(uid)) continue;
      const relevantExamsForStudent = [];
      for (let i = 1; i < eData.length; i++) {
        const eid    = String(eData[i][0]).trim();
        const status = String(eData[i][6] || '').toLowerCase();
        if (!myExamIDs.has(eid) || status !== 'aktif') continue;

        // Cek apakah siswa ini memang boleh muncul di examID ini:
        // Jika ada ExamRooms untuk eid ini (Strategi A), cek set roomStudentSetPerExam[eid]
        // Jika fallback (null), cek kelas seperti biasa
        const roomSetForExam = roomStudentSetPerExam[eid];
        if (roomSetForExam !== null) {
          // Strategi A: hanya tampilkan siswa yang ada di set ruangan pengawas
          if (!roomSetForExam.has(uid)) continue;
        } else {
          // Strategi B fallback: cocokkan kelas
          if (String(eData[i][2] || '').trim().toLowerCase() !== student.kelas.toLowerCase()) continue;
        }

        relevantExamsForStudent.push({ examID: eid, subject: String(eData[i][1] || '') });
      }
      if (relevantExamsForStudent.length === 0) {
        const stuSess0 = studentSessionMap[uid] || {};
        const entry = {
          responseId: null, userID: uid, nama: student.nama, kelas: student.kelas,
          examID: '', mapel: '-', startTime: '-', submitTime: '-',
          score: '-', violations: 0, violDetail: '', violLogs: [],
          sessionLabel: stuSess0.sessionLabel || '',
          roomName:     stuSess0.roomName     || ''
        };
        if (student.hasToken) resultBuckets.sudahLogin.push(entry);
        else resultBuckets.belumLogin.push(entry);
      } else {
        relevantExamsForStudent.forEach(ex => {
          const stuSessEx = studentSessionMap[uid] || fallbackSessionPerExam[ex.examID] || {};
          const entry = {
            responseId: null, userID: uid, nama: student.nama, kelas: student.kelas,
            examID: ex.examID, mapel: ex.subject, startTime: '-', submitTime: '-',
            score: '-', violations: 0, violDetail: '', violLogs: [],
            sessionLabel: stuSessEx.sessionLabel || '',
            roomName:     stuSessEx.roomName     || ''
          };
          if (student.hasToken) resultBuckets.sudahLogin.push(entry);
          else resultBuckets.belumLogin.push(entry);
        });
      }
    }

    return {
      success: true,
      data: resultBuckets,
      meta: {
        dropdownKelas: [...kelasSet].filter(Boolean).sort(),
        dropdownMapel: [...mapelSet].filter(Boolean).sort(),
        dropdownSesi:  [...new Set(
          Object.values(myRooms).flat().map(r => r.sessionLabel).filter(Boolean)
        )].sort(),
        activeExams:   activeExams,
        violationLimit: violationLimit,
        rooms:         myRooms
      }
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// (log admin menggunakan addAdminLog() dan getActorName() yang sudah tersedia di Code.gs)


// ============================================================
// ██████  ██    ██  █████  ███    ██  ██████      ██    ██      ██  ██  █████  ███    ██
// ██   ██ ██    ██ ██   ██ ████   ██ ██           ██    ██      ██  ██ ██   ██ ████   ██
// ██████  ██    ██ ███████ ██ ██  ██ ██   ███     ██    ██      ██  ██ ███████ ██ ██  ██
// ██   ██ ██    ██ ██   ██ ██  ██ ██ ██    ██     ██    ██ ██   ██  ██ ██   ██ ██  ██ ██
// ██   ██  ██████  ██   ██ ██   ████  ██████       ██████  ██████   ██ ██   ██ ██   ████
//
// Modul Ruang Ujian (ExamRooms)
// Sheet: ExamRooms
// Kolom: RoomID | ExamID | RoomName | SupervisorAssignID | StudentIDs | CreatedAt | UpdatedAt | Capacity
// ============================================================

/**
 * Buat atau kembalikan sheet ExamRooms.
 * Kolom:
 *   A – RoomID          : UUID unik tiap ruang ujian
 *   B – ExamID          : FK ke sheet Exams
 *   C – RoomName        : Nama ruang (mis. "Ruang 1", "Lab Komputer A")
 *   D – SupervisorAssignID : FK ke sheet Supervisors (bisa kosong jika belum ditugaskan)
 *   E – StudentIDs      : JSON array UserID siswa peserta ruangan ini
 *   F – CreatedAt       : Timestamp dibuat
 *   G – UpdatedAt       : Timestamp terakhir diubah
 *   H – Capacity        : Kapasitas maksimum peserta (0 = tidak dibatasi)
 */
function _getOrCreateExamRoomsSheet_() {
  let sheet = SS.getSheetByName('ExamRooms');
  if (!sheet) {
    sheet = SS.insertSheet('ExamRooms');
    const headers = [
      'RoomID',             // A
      'ExamID',             // B
      'RoomName',           // C
      'SupervisorAssignID', // D
      'StudentIDs',         // E – JSON array
      'CreatedAt',          // F
      'UpdatedAt',          // G
      'Capacity'            // H – 0 = tidak dibatasi
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
         .setFontWeight('bold').setBackground('#d1fae5');
    sheet.setFrozenRows(1);
    Logger.log('Sheet ExamRooms dibuat.');
  } else {
    // Migrasi kolom Capacity jika sheet sudah ada tapi belum punya kolom H
    const existHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!existHeaders.includes('Capacity')) {
      sheet.getRange(1, existHeaders.length + 1).setValue('Capacity')
           .setFontWeight('bold').setBackground('#d1fae5');
      Logger.log('Kolom Capacity ditambahkan ke sheet ExamRooms.');
    }
  }
  return sheet;
}

// ──────────────────────────────────────────────────────────────
// Helper internal
// ──────────────────────────────────────────────────────────────

/**
 * Parse StudentIDs dari cell (JSON array string → array string).
 */
function _parseStudentIDs_(raw) {
  if (!raw || String(raw).trim() === '') return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch(e) {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// CRUD Ruang Ujian (hanya Admin)
// ──────────────────────────────────────────────────────────────

/**
 * Propagasi perubahan nama ruang dari ExamRooms ke sheet Supervisors.
 * Dipanggil dari updateExamRoom saat roomName berubah.
 * Key: examID + oldRoomName (case-insensitive) → update kolom C ke newRoomName.
 *
 * @param {string} examID      – ExamID ujian (sebagai key)
 * @param {string} oldRoomName – Nama ruang lama
 * @param {string} newRoomName – Nama ruang baru
 */
function _syncSupervisorRoomName_(examID, oldRoomName, newRoomName) {
  try {
    if (!examID || !oldRoomName || !newRoomName) return;
    const normExamID = String(examID).trim();
    const normOld    = String(oldRoomName).trim().toLowerCase();
    const newName    = String(newRoomName).trim();

    const sheet = _getOrCreateSupervisorsSheet_();
    if (sheet.getLastRow() < 2) return;

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim() !== normExamID) continue;
      if (String(rows[i][2] || '').trim().toLowerCase() !== normOld) continue;
      // Update kolom C (RoomName) ke nama baru
      sheet.getRange(i + 1, 3).setValue(newName);
    }
  } catch(e) {
    Logger.log('_syncSupervisorRoomName_ error: ' + e.message);
  }
}

/**
 * Sinkronisasi SupervisorAssignID di sheet ExamRooms berdasarkan
 * key (examID + roomName, case-insensitive).
 *
 * Dipanggil dari createSupervisorAssignment, updateSupervisorAssignment,
 * dan deleteSupervisorAssignment agar kolom D ExamRooms selalu up-to-date.
 *
 * @param {string} examID      – ExamID ujian
 * @param {string} roomName    – Nama ruang ujian (dicocokkan case-insensitive)
 * @param {string} newAssignID – ID assignment baru ('SVA-...' saat set, '' saat clear)
 */
function _syncExamRoomSupervisor_(examID, roomName, newAssignID) {
  try {
    if (!examID || !roomName) return;
    const normExamID   = String(examID).trim();
    const normRoomName = String(roomName).trim().toLowerCase();
    const assignValue  = String(newAssignID || '').trim();

    const sheet = _getOrCreateExamRoomsSheet_();
    if (sheet.getLastRow() < 2) return;

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const rowExam = String(rows[i][1] || '').trim();
      const rowRoom = String(rows[i][2] || '').trim().toLowerCase();
      if (rowExam !== normExamID) continue;
      if (rowRoom !== normRoomName) continue;
      // Hanya update jika nilai berubah (hindari write tidak perlu)
      const current = String(rows[i][3] || '').trim();
      if (current !== assignValue) {
        sheet.getRange(i + 1, 4).setValue(assignValue);
        sheet.getRange(i + 1, 7).setValue(new Date()); // UpdatedAt
      }
    }
  } catch(e) {
    Logger.log('_syncExamRoomSupervisor_ error: ' + e.message);
  }
}


/**
 * Bulk-sync semua SupervisorAssignID di sheet ExamRooms berdasarkan data terkini di sheet Supervisors.
 * Untuk setiap baris ExamRooms, cari assignment yang cocok (examID + roomName, case-insensitive)
 * di sheet Supervisors. Jika ditemukan, tulis SupervisorAssignID-nya ke kolom D; jika tidak ditemukan,
 * kosongkan kolom D. Hanya baris yang berbeda nilainya yang diperbarui (hindari write tidak perlu).
 *
 * @param {string} adminID    - UserID Admin pemanggil
 * @param {string} adminToken - Session token Admin
 * @returns {{ success: boolean, updated: number, total: number, message: string }}
 */
function syncAllExamRoomSupervisors(adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);

    // 1. Baca semua baris Supervisors -> buat lookup map
    const svSheet = _getOrCreateSupervisorsSheet_();
    const svRows  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];

    // Map key: "examID|roomname_lowercase" -> SupervisorAssignID (kolom A)
    // Jika ada duplikat key, baris yang lebih akhir di sheet menang (last-write-wins).
    const svMap = {};
    for (let i = 1; i < svRows.length; i++) {
      const assignID = String(svRows[i][0] || '').trim();   // A: SupervisorAssignID
      const examID   = String(svRows[i][1] || '').trim();   // B: ExamID
      const roomName = String(svRows[i][2] || '').trim().toLowerCase(); // C: RoomName
      if (!assignID || !examID || !roomName) continue;
      svMap[examID + '|' + roomName] = assignID;
    }

    // 2. Baca semua baris ExamRooms
    const erSheet = _getOrCreateExamRoomsSheet_();
    if (erSheet.getLastRow() < 2) {
      return { success: true, updated: 0, total: 0, message: 'Tidak ada data ExamRooms.' };
    }
    const erRows = erSheet.getDataRange().getValues();
    const total  = erRows.length - 1;

    // 3. Update kolom D (SupervisorAssignID) jika berbeda
    let updated = 0;
    for (let i = 1; i < erRows.length; i++) {
      const rowExamID   = String(erRows[i][1] || '').trim();              // B
      const rowRoomName = String(erRows[i][2] || '').trim().toLowerCase(); // C
      const current     = String(erRows[i][3] || '').trim();              // D: nilai saat ini

      const key       = rowExamID + '|' + rowRoomName;
      const newAssign = svMap.hasOwnProperty(key) ? svMap[key] : '';

      if (current === newAssign) continue;

      erSheet.getRange(i + 1, 4).setValue(newAssign);
      erSheet.getRange(i + 1, 7).setValue(new Date());
      updated++;
    }

    const msg = updated > 0
      ? updated + ' dari ' + total + ' ruang ujian berhasil disinkronkan.'
      : 'Semua data sudah sinkron (' + total + ' ruang ujian diperiksa, 0 perubahan).';

    return { success: true, updated: updated, total: total, message: msg };

  } catch (e) {
    return { success: false, updated: 0, total: 0, message: e.message || 'Terjadi kesalahan saat sinkronisasi.' };
  }
}
/**
 * Ambil semua ruang ujian, opsional filter per ExamID.
 * Return: { success, data: [{id, examID, roomName, supervisorAssignID, studentIDs, createdAt, updatedAt}] }
 */
function getExamRooms(adminID, adminToken, filterExamID) {
  try {
    verifyAdminAccess(adminID, adminToken);
    const sheet = _getOrCreateExamRoomsSheet_();
    if (sheet.getLastRow() < 2) return { success: true, data: [] };

    const raw = sheet.getDataRange().getValues();
    const tz  = Session.getScriptTimeZone();
    const result = [];
    for (let i = 1; i < raw.length; i++) {
      const roomExamID = String(raw[i][1] || '').trim();
      if (filterExamID && filterExamID !== '' && roomExamID !== filterExamID) continue;
      let createdFmt = '-', updatedFmt = '-';
      try { if (raw[i][5]) createdFmt = Utilities.formatDate(new Date(raw[i][5]), tz, 'dd/MM/yyyy HH:mm'); } catch(e2) {}
      try { if (raw[i][6]) updatedFmt = Utilities.formatDate(new Date(raw[i][6]), tz, 'dd/MM/yyyy HH:mm'); } catch(e2) {}
      result.push({
        id:                 String(raw[i][0] || ''),
        examID:             roomExamID,
        roomName:           String(raw[i][2] || ''),
        supervisorAssignID: String(raw[i][3] || ''),
        studentIDs:         _parseStudentIDs_(raw[i][4]),
        createdAt:          createdFmt,
        updatedAt:          updatedFmt,
        capacity:           parseInt(raw[i][7] || 0, 10) || 0
      });
    }
    return { success: true, data: result };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Buat ruang ujian baru.
 * form: { examID, roomName, supervisorAssignID (opsional) }
 */
function createExamRoom(form, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!form || !String(form.examID || '').trim())   return { success: false, message: 'Ujian wajib dipilih.' };
    if (!String(form.roomName || '').trim())           return { success: false, message: 'Nama ruang tidak boleh kosong.' };

    // Validasi examID ada
    const eSheet = SS.getSheetByName('Exams');
    const eData  = eSheet.getDataRange().getValues();
    let examFound = false;
    for (let i = 1; i < eData.length; i++) {
      if (String(eData[i][0]).trim() === String(form.examID).trim()) { examFound = true; break; }
    }
    if (!examFound) return { success: false, message: 'Ujian tidak ditemukan.' };

    // Cek duplikasi nama ruang dalam ujian yang sama
    const sheet = _getOrCreateExamRoomsSheet_();
    if (sheet.getLastRow() > 1) {
      const existRows = sheet.getDataRange().getValues();
      const normRoom  = String(form.roomName).trim().toLowerCase();
      const normExam  = String(form.examID).trim();
      for (let i = 1; i < existRows.length; i++) {
        if (String(existRows[i][1]).trim() === normExam &&
            String(existRows[i][2]).trim().toLowerCase() === normRoom) {
          return { success: false, message: 'Ruang dengan nama tersebut sudah ada dalam ujian ini.' };
        }
      }
    }

    // Validasi supervisorAssignID jika diisi
    const svAssignID = String(form.supervisorAssignID || '').trim();
    if (svAssignID) {
      const svSheet = _getOrCreateSupervisorsSheet_();
      const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
      let svFound = false;
      for (let i = 1; i < svData.length; i++) {
        if (String(svData[i][0]).trim() === svAssignID) { svFound = true; break; }
      }
      if (!svFound) return { success: false, message: 'Assignment pengawas tidak ditemukan.' };
    }

    const now    = new Date();
    const roomID = 'ROOM-' + Utilities.getUuid().replace(/-/g,'').substring(0,12).toUpperCase();

    // Kapasitas: 0 = tidak dibatasi, minimum 1 jika diisi
    const capacity = parseInt(form.capacity || 0, 10);
    if (isNaN(capacity) || capacity < 0) return { success: false, message: 'Kapasitas tidak valid. Isi dengan angka ≥ 0 (0 = tidak dibatasi).' };

    sheet.appendRow([
      roomID,
      String(form.examID).trim(),
      String(form.roomName).trim(),
      svAssignID,
      '[]',
      now,
      now,
      capacity
    ]);

    addAdminLog(adminID, getActorName(adminID), 'Tambah Ruang Ujian', 'ExamRoom', roomID,
      `Ujian: ${form.examID}, Ruang: ${form.roomName}, Kapasitas: ${capacity || 'Tidak dibatasi'}`);
    return { success: true, id: roomID, message: 'Ruang ujian berhasil dibuat.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Update ruang ujian (nama + supervisor assignment + kapasitas).
 * data: { id, roomName, supervisorAssignID, capacity }
 */
function updateExamRoom(data, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!data || !String(data.id || '').trim()) return { success: false, message: 'ID ruang tidak valid.' };
    if (!String(data.roomName || '').trim())    return { success: false, message: 'Nama ruang tidak boleh kosong.' };

    const capacity = parseInt(data.capacity || 0, 10);
    if (isNaN(capacity) || capacity < 0) return { success: false, message: 'Kapasitas tidak valid. Isi dengan angka ≥ 0 (0 = tidak dibatasi).' };

    const sheet = _getOrCreateExamRoomsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1, currentExamID = '';
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.id).trim()) {
        targetRow = i + 1;
        currentExamID = String(rows[i][1]).trim();
        break;
      }
    }
    if (targetRow < 0) return { success: false, message: 'Ruang ujian tidak ditemukan.' };

    // Cek duplikasi nama ruang (di ujian yang sama, selain dirinya sendiri)
    const normRoom = String(data.roomName).trim().toLowerCase();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(data.id).trim()) continue; // skip dirinya
      if (String(rows[i][1]).trim() === currentExamID &&
          String(rows[i][2]).trim().toLowerCase() === normRoom) {
        return { success: false, message: 'Nama ruang sudah digunakan dalam ujian ini.' };
      }
    }

    // Validasi supervisorAssignID jika diisi
    const svAssignID = String(data.supervisorAssignID || '').trim();
    if (svAssignID) {
      const svSheet = _getOrCreateSupervisorsSheet_();
      const svData  = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
      let svFound = false;
      for (let i = 1; i < svData.length; i++) {
        if (String(svData[i][0]).trim() === svAssignID) { svFound = true; break; }
      }
      if (!svFound) return { success: false, message: 'Assignment pengawas tidak ditemukan.' };
    }

    // Ambil nama lama sebelum overwrite (untuk sinkronisasi ke Supervisors)
    const oldRoomName = String(rows[targetRow - 1][2] || '').trim();
    const newRoomName = String(data.roomName).trim();

    sheet.getRange(targetRow, 3).setValue(newRoomName);
    sheet.getRange(targetRow, 4).setValue(svAssignID);
    sheet.getRange(targetRow, 7).setValue(new Date());
    sheet.getRange(targetRow, 8).setValue(capacity);

    // Perubahan 1: propagasi perubahan nama ruang ke sheet Supervisors
    // Key: examID + roomName lama → update kolom C ke nama baru
    if (oldRoomName && oldRoomName.toLowerCase() !== newRoomName.toLowerCase()) {
      _syncSupervisorRoomName_(currentExamID, oldRoomName, newRoomName);
    }

    addAdminLog(adminID, getActorName(adminID), 'Update Ruang Ujian', 'ExamRoom', data.id,
      `Nama: ${data.roomName}, Pengawas: ${svAssignID || '-'}, Kapasitas: ${capacity || 'Tidak dibatasi'}`);
    return {
      success:      true,
      message:      'Ruang ujian berhasil diperbarui.',
      examID:       currentExamID,
      oldRoomName:  oldRoomName,
      newRoomName:  newRoomName,
      roomNameChanged: oldRoomName.toLowerCase() !== newRoomName.toLowerCase()
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Hapus ruang ujian beserta data pesertanya.
 */
function deleteExamRoom(roomID, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!roomID) return { success: false, message: 'ID ruang tidak valid.' };

    const sheet = _getOrCreateExamRoomsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(roomID).trim()) { targetRow = i + 1; break; }
    }
    if (targetRow < 0) return { success: false, message: 'Ruang ujian tidak ditemukan.' };

    sheet.deleteRow(targetRow);
    addAdminLog(adminID, getActorName(adminID), 'Hapus Ruang Ujian', 'ExamRoom', roomID, 'Dihapus oleh Admin');
    return { success: true, message: 'Ruang ujian berhasil dihapus.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Manajemen Peserta Ruang Ujian
// ──────────────────────────────────────────────────────────────

/**
 * Tambah satu atau beberapa siswa ke ruang ujian.
 * studentIDs: array UserID siswa yang akan ditambahkan.
 * Return: { success, added, skipped, message }
 */
function addStudentsToRoom(roomID, studentIDsInput, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!roomID) return { success: false, message: 'ID ruang tidak valid.' };
    const newIDs = Array.isArray(studentIDsInput) ? studentIDsInput.map(String) : [];
    if (newIDs.length === 0) return { success: false, message: 'Tidak ada siswa yang dipilih.' };

    const sheet = _getOrCreateExamRoomsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1, currentIDs = [], examID = '', currentRoomName = '';
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(roomID).trim()) {
        targetRow      = i + 1;
        examID         = String(rows[i][1]).trim();
        currentIDs     = _parseStudentIDs_(rows[i][4]);
        currentRoomName = String(rows[i][2] || '').trim();
        break;
      }
    }
    if (targetRow < 0) return { success: false, message: 'Ruang ujian tidak ditemukan.' };

    // Validasi bahwa studentIDs adalah Siswa yang aktif
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    const validStudentSet = new Set();
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][3]).trim() === 'Siswa') {
        const isActive = uData[i][6] === true || String(uData[i][6]).toLowerCase() === 'true';
        if (isActive) validStudentSet.add(String(uData[i][0]).trim());
      }
    }

    // Kumpulkan semua siswa yang sudah ada di ruang lain dalam ujian yang sama
    const studentsInOtherRooms = new Set();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(roomID).trim()) continue; // skip ruang ini sendiri
      if (String(rows[i][1]).trim() !== examID) continue;
      const otherIDs = _parseStudentIDs_(rows[i][4]);
      otherIDs.forEach(sid => studentsInOtherRooms.add(sid));
    }

    const currentSet = new Set(currentIDs);
    let added = 0, skipped = 0;
    const skippedReasons = [];

    // Validasi kapasitas ruang
    const capacity = parseInt(rows[targetRow - 1][7] || 0, 10) || 0;
    if (capacity > 0 && currentSet.size >= capacity) {
      return {
        success: false,
        message: `Ruang "${currentRoomName}" sudah penuh (kapasitas: ${capacity} peserta).`
      };
    }

    for (const sid of newIDs) {
      if (!validStudentSet.has(sid)) {
        skipped++;
        skippedReasons.push(sid + ': bukan siswa aktif');
        continue;
      }
      if (currentSet.has(sid)) {
        skipped++;
        skippedReasons.push(sid + ': sudah ada di ruang ini');
        continue;
      }
      if (studentsInOtherRooms.has(sid)) {
        skipped++;
        skippedReasons.push(sid + ': sudah terdaftar di ruang lain dalam ujian ini');
        continue;
      }
      // Cek kapasitas per iterasi agar tidak melebihi batas
      if (capacity > 0 && currentSet.size >= capacity) {
        skipped++;
        skippedReasons.push(sid + ': kapasitas ruang penuh');
        continue;
      }
      currentSet.add(sid);
      added++;
    }

    const updatedIDs = [...currentSet];
    sheet.getRange(targetRow, 5).setValue(JSON.stringify(updatedIDs));
    sheet.getRange(targetRow, 7).setValue(new Date());

    if (added > 0) {
      addAdminLog(adminID, getActorName(adminID), 'Tambah Peserta Ruang', 'ExamRoom', roomID,
        `Ruang: ${currentRoomName}, +${added} siswa ditambahkan`);
    }
    return {
      success: true,
      added:   added,
      skipped: skipped,
      // BUG #22 FIX: sertakan alasan skip agar frontend bisa menampilkan pesan yang informatif
      skippedReasons: skippedReasons,
      message: `${added} siswa berhasil ditambahkan` + (skipped > 0 ? `, ${skipped} dilewati.` : '.')
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Hapus siswa dari ruang ujian.
 */
function removeStudentFromRoom(roomID, studentID, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!roomID || !studentID) return { success: false, message: 'Parameter tidak valid.' };

    const sheet = _getOrCreateExamRoomsSheet_();
    const rows  = sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    let targetRow = -1, currentIDs = [], currentRoomName = '';
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(roomID).trim()) {
        targetRow       = i + 1;
        currentIDs      = _parseStudentIDs_(rows[i][4]);
        currentRoomName = String(rows[i][2] || '').trim();
        break;
      }
    }
    if (targetRow < 0) return { success: false, message: 'Ruang ujian tidak ditemukan.' };

    const before = currentIDs.length;
    const updated = currentIDs.filter(sid => sid !== String(studentID).trim());
    if (updated.length === before) return { success: false, message: 'Siswa tidak ditemukan di ruang ini.' };

    sheet.getRange(targetRow, 5).setValue(JSON.stringify(updated));
    sheet.getRange(targetRow, 7).setValue(new Date());

    addAdminLog(adminID, getActorName(adminID), 'Hapus Peserta Ruang', 'ExamRoom', roomID,
      `Siswa ${studentID} dihapus dari ruang ${currentRoomName}`);
    return { success: true, message: 'Siswa berhasil dihapus dari ruang ujian.' };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Ambil daftar siswa yang tersedia untuk ditambahkan ke ruang ujian:
 * - Siswa dengan kelas yang sesuai kelas ujian
 * - Belum terdaftar di ruang manapun dalam ujian tersebut (opsional jika includeAssigned=true)
 * Return: { success, examInfo, rooms: [...], students: [...], assignedMap: {userID: roomID} }
 */
function getExamRoomStudentData(examID, adminID, adminToken) {
  try {
    verifyAdminAccess(adminID, adminToken);
    if (!examID) return { success: false, message: 'ExamID tidak valid.' };

    // Ambil info ujian
    const eSheet = SS.getSheetByName('Exams');
    const eData  = eSheet.getDataRange().getValues();
    let examInfo = null;
    for (let i = 1; i < eData.length; i++) {
      if (String(eData[i][0]).trim() === String(examID).trim()) {
        const tz = Session.getScriptTimeZone();
        let dateFmt = '-';
        try { if (eData[i][3]) dateFmt = Utilities.formatDate(new Date(eData[i][3]), tz, 'dd/MM/yyyy HH:mm'); } catch(e2) {}
        examInfo = {
          examID:   String(eData[i][0]),
          subject:  String(eData[i][1] || ''),
          kelas:    String(eData[i][2] || ''),
          date:     dateFmt,
          status:   String(eData[i][6] || '')
        };
        break;
      }
    }
    if (!examInfo) return { success: false, message: 'Ujian tidak ditemukan.' };

    // Ambil semua ruang ujian untuk exam ini
    const roomSheet = _getOrCreateExamRoomsSheet_();
    const roomRows  = roomSheet.getLastRow() > 1 ? roomSheet.getDataRange().getValues() : [];
    const rooms = [];
    const assignedMap = {}; // userID → { roomID, roomName }

    // Ambil data Supervisors satu kali di luar loop (efisiensi)
    const svSheet = _getOrCreateSupervisorsSheet_();
    const svDataAll = svSheet.getLastRow() > 1 ? svSheet.getDataRange().getValues() : [];
    // Buat map SupervisorAssignID → display info untuk lookup O(1)
    // Jika ada pengganti aktif (kolom H), tampilkan nama pengganti beserta label "(Pengganti)"
    const svNameMap = {};   // SupervisorAssignID → { displayName, hasSubstitute }
    for (let i = 1; i < svDataAll.length; i++) {
      const assignID      = String(svDataAll[i][0]).trim();
      const originalName  = String(svDataAll[i][5] || '');
      const subName       = String(svDataAll[i][8] || '').trim();
      const hasSubstitute = subName !== '';
      svNameMap[assignID] = {
        displayName:  hasSubstitute ? subName : originalName,
        hasSubstitute: hasSubstitute,
        originalName:  originalName,
        substituteName: subName
      };
    }

    for (let i = 1; i < roomRows.length; i++) {
      if (String(roomRows[i][1]).trim() !== String(examID).trim()) continue;
      const roomID   = String(roomRows[i][0]).trim();
      const roomName = String(roomRows[i][2]).trim();
      const svAssign = String(roomRows[i][3] || '').trim();
      const stuIDs   = _parseStudentIDs_(roomRows[i][4]);

      // Lookup nama pengawas dari map (O(1), tanpa buka sheet lagi)
      const svInfo       = svAssign ? (svNameMap[svAssign] || null) : null;
      const supervisorName  = svInfo ? svInfo.displayName : '';
      const hasSubstitute   = svInfo ? svInfo.hasSubstitute : false;
      const originalSvName  = svInfo ? svInfo.originalName  : '';
      const substituteSvName = svInfo ? svInfo.substituteName : '';

      rooms.push({
        id: roomID, roomName, supervisorAssignID: svAssign,
        supervisorName, hasSubstitute, originalSvName, substituteSvName,
        studentCount: stuIDs.length,
        capacity: parseInt(roomRows[i][7] || 0, 10) || 0
      });
      stuIDs.forEach(sid => { assignedMap[sid] = { roomID, roomName }; });
    }

    // Ambil semua siswa yang kelasnya sesuai ujian ini (support kelas multiple: "XII-RPL,XII-TKJ")
    const examKelas = String(examInfo.kelas).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    const students = [];
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][3]).trim() !== 'Siswa') continue;
      const isActive = uData[i][6] === true || String(uData[i][6]).toLowerCase() === 'true';
      if (!isActive) continue;
      const siswaKelas = String(uData[i][4] || '').trim();
      if (!examKelas.includes(siswaKelas.toLowerCase())) continue;
      const sid = String(uData[i][0]).trim();
      const assigned = assignedMap[sid] || null;
      students.push({
        userID:      sid,
        nama:        String(uData[i][1] || ''),
        kelas:       siswaKelas,
        assignedRoom: assigned   // null jika belum di ruang manapun
      });
    }
    // Urutkan: kelas α lalu nama α
    students.sort((a, b) => {
      const kc = a.kelas.localeCompare(b.kelas, 'id');
      return kc !== 0 ? kc : a.nama.localeCompare(b.nama, 'id');
    });

    // Ambil daftar assignment pengawas untuk dropdown (gunakan svDataAll yang sudah diload)
    const supervisorAssignments = [];
    for (let i = 1; i < svDataAll.length; i++) {
      if (String(svDataAll[i][1]).trim() !== String(examID).trim()) continue;
      supervisorAssignments.push({
        id:             String(svDataAll[i][0]),
        roomName:       String(svDataAll[i][2]),
        sessionLabel:   String(svDataAll[i][3]),
        supervisorName: String(svDataAll[i][5])
      });
    }

    return {
      success: true,
      examInfo,
      rooms,
      students,
      supervisorAssignments,
      assignedMap
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
// Modifikasi getMonitorDataForSupervisor:
// Filter siswa berdasarkan ExamRooms — pengawas hanya melihat
// siswa yang terdaftar di ruangan yang ia awasi.
// ──────────────────────────────────────────────────────────────

/**
 * Kembalikan Set UserID siswa yang terdaftar di ruang-ruang ujian
 * yang diawasi oleh supervisorID untuk examID tertentu.
 * Jika ruangan belum dikonfigurasi (ExamRooms kosong untuk examID itu),
 * kembalikan null (berarti tampilkan semua siswa seperti sebelumnya).
 *
 * @param {string} supervisorID
 * @param {string} examID
 * @param {Array}  svData       – rows dari sheet Supervisors (sudah diload)
 * @returns {Set<string>|null}
 */
function _getSupervisorRoomStudents_(supervisorID, examID, svData) {
  // Kumpulkan SupervisorAssignID yang dimiliki pengawas ini untuk examID.
  // Gunakan logika efektif: pengganti (kolom H) menggantikan asli (kolom E).
  const mySvAssignIDs = new Set();
  for (let i = 1; i < svData.length; i++) {
    if (String(svData[i][1]).trim() !== String(examID).trim()) continue;
    const effectiveID = _getEffectiveSupervisorID_(svData[i]);
    if (effectiveID !== String(supervisorID).trim()) continue;
    mySvAssignIDs.add(String(svData[i][0]).trim());
  }

  // Ambil ExamRooms untuk examID ini
  const roomSheet = _getOrCreateExamRoomsSheet_();
  if (roomSheet.getLastRow() < 2) return null; // belum ada data ruang → fallback lama

  const roomRows = roomSheet.getDataRange().getValues();
  const relevantRooms = []; // ruang yang examID-nya cocok

  for (let i = 1; i < roomRows.length; i++) {
    if (String(roomRows[i][1]).trim() !== String(examID).trim()) continue;
    relevantRooms.push(roomRows[i]);
  }

  // Jika sama sekali belum ada ruang untuk ujian ini → fallback lama
  if (relevantRooms.length === 0) return null;

  // Kumpulkan siswa dari ruang yang diawasi pengawas ini
  const studentSet = new Set();
  for (const row of relevantRooms) {
    const svAssignInRoom = String(row[3] || '').trim();
    // Tampilkan siswa jika:
    //   1. Ruang ini ditugaskan ke salah satu assignment pengawas
    //   2. ATAU ruang belum punya pengawas (svAssignInRoom kosong) → tampilkan ke semua pengawas ujian
    if (!svAssignInRoom || mySvAssignIDs.has(svAssignInRoom)) {
      const stuIDs = _parseStudentIDs_(row[4]);
      stuIDs.forEach(sid => studentSet.add(sid));
    }
  }
  return studentSet;
}

// ══════════════════════════════════════════════════════════════════════════════
// PROGRES KOREKSI ESAI
// Fungsi ini menghitung progres koreksi jawaban Esai per jadwal ujian.
// Sumber data aktual:
//   - Sheet Exams      : daftar jadwal ujian + TypeConfig
//   - Sheet Questions  : soal tipe Esai per ujian
//   - Sheet Responses  : jawaban siswa + AnswersJSON._essay_scores_per_question
//   - Sheet Users      : data siswa + guru/pengoreksi dari AdminLogs
//   - Sheet AdminLogs  : riwayat GRADE_ESSAY beserta actorID + actorName
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Kembalikan daftar semua jadwal ujian yang memiliki soal tipe Esai,
 * beserta progres koreksinya.
 *
 * Struktur respons:
 * {
 *   success: true,
 *   summary: {
 *     totalExams, doneCount, partialCount, noneCount,
 *     totalAnswers, totalGraded, totalPending
 *   },
 *   exams: [{
 *     examID, title, subject, kelas, dateStr, endDateStr, status,
 *     essayQuestionCount,
 *     totalParticipants,   // siswa yang sudah submit (Completed/Selesai/Waktu Habis)
 *     totalAnswers,        // essayQuestionCount × totalParticipants
 *     gradedCount,
 *     pendingCount,
 *     progressPct,         // 0–100
 *     gradingStatus        // 'none' | 'partial' | 'done'
 *   }]
 * }
 *
 * @param {string} requestorID
 * @param {string} requestorToken
 */
function getEssayGradingProgress(requestorID, requestorToken) {
  try {
    // ── 1. Auth + ambil assignment Guru ────────────────────────────────────
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let role = null;
    // teacherAssignments: [{subject: string (lowercase), kelas: string (lowercase)}]
    // Hanya diisi untuk role Guru; Admin dibiarkan kosong.
    const teacherAssignments = [];

    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(requestorID) &&
          String(uData[i][5]) === String(requestorToken)) {
        role = String(uData[i][3]).trim();

        if (role === 'Guru') {
          // Kolom E (index 4): "MAPEL1:KELAS1,MAPEL2:KELAS2"
          // Format identik dengan getExamList dan getQuestionProgressData
          const rawAssignment = String(uData[i][4] || '');
          rawAssignment.split(',').forEach(function(item) {
            const parts = item.trim().split(':');
            if (parts.length >= 2) {
              teacherAssignments.push({
                subject: parts[0].trim().toLowerCase(),
                kelas:   parts[1].trim().toLowerCase()
              });
            }
          });
        }
        break;
      }
    }

    if (!role)            return { success: false, message: 'Sesi tidak valid.' };
    if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

    // Helper: apakah sebuah ujian (subject, kelas) termasuk tanggung jawab Guru?
    // Logika identik dengan getExamList dan checkUserAccess di aplikasi ini.
    function _examBelongsToTeacher_(examSubject, examKelas) {
      if (teacherAssignments.length === 0) return false;
      const subjectLow = examSubject.toLowerCase();
      const kelasItems = examKelas.toLowerCase().split(',').map(function(k) { return k.trim(); });
      return teacherAssignments.some(function(tugas) {
        return subjectLow.includes(tugas.subject) &&
               kelasItems.some(function(k) {
                 return k.includes(tugas.kelas) || tugas.kelas.includes(k);
               });
      });
    }

    // ── 2. Baca semua Exams — filter per role sebelum masuk examMap ─────────
    const examSheet = SS.getSheetByName('Exams');
    if (!examSheet || examSheet.getLastRow() <= 1) {
      return { success: true, summary: { totalExams:0, doneCount:0, partialCount:0, noneCount:0, totalAnswers:0, totalGraded:0, totalPending:0 }, exams: [] };
    }
    const examRows = examSheet.getDataRange().getValues();
    const tz = Session.getScriptTimeZone();

    // Map examID → exam info
    // Filter Guru diterapkan DI SINI — hanya ujian yang menjadi tanggung jawabnya
    // yang masuk examMap; ujian lain tidak diproses sama sekali.
    const examMap = {};
    for (let i = 1; i < examRows.length; i++) {
      const r = examRows[i];
      const eid = String(r[0]).trim();
      if (!eid) continue;

      // ── FILTER ROLE GURU ── (Admin: semua lolos; Guru: hanya miliknya)
      if (role === 'Guru') {
        if (!_examBelongsToTeacher_(String(r[1]), String(r[2]))) continue;
      }

      const startDate = r[3] instanceof Date ? r[3] : null;
      const endDate   = r[7] instanceof Date ? r[7] : null;
      examMap[eid] = {
        examID:   eid,
        title:    String(r[1]).trim() + ' — ' + String(r[2]).trim(),
        subject:  String(r[1]).trim(),
        kelas:    String(r[2]).trim(),
        dateStr:  startDate ? Utilities.formatDate(startDate, tz, 'dd/MM/yyyy HH:mm') : '-',
        endDateStr: endDate   ? Utilities.formatDate(endDate,   tz, 'dd/MM/yyyy HH:mm') : '-',
        examStatus: String(r[6] || '').trim(),
        essayQuestionCount: 0,
        essayQuestionIDs:   []
      };
    }

    // ── 3. Baca Questions — filter tipe Esai ────────────────────────────────
    const qSheet = SS.getSheetByName('Questions');
    if (!qSheet || qSheet.getLastRow() <= 1) {
      return { success: true, summary: { totalExams:0, doneCount:0, partialCount:0, noneCount:0, totalAnswers:0, totalGraded:0, totalPending:0 }, exams: [] };
    }
    const qData = qSheet.getDataRange().getValues();

    // examID → Set of essay question IDs
    const essayQMap = {}; // examID → [qID, ...]
    for (let i = 1; i < qData.length; i++) {
      const examID = String(qData[i][1]).trim();
      const qType  = String(qData[i][2]).trim();
      if (qType !== 'Esai') continue;
      if (!examMap[examID]) continue; // ujian tidak ada di Exams sheet
      if (!essayQMap[examID]) essayQMap[examID] = [];
      essayQMap[examID].push(String(qData[i][0]).trim());
    }

    // Hanya proses ujian yang punya soal Esai
    const examIDsWithEssay = Object.keys(essayQMap);
    if (examIDsWithEssay.length === 0) {
      return { success: true, summary: { totalExams:0, doneCount:0, partialCount:0, noneCount:0, totalAnswers:0, totalGraded:0, totalPending:0 }, exams: [] };
    }
    examIDsWithEssay.forEach(eid => {
      examMap[eid].essayQuestionCount = essayQMap[eid].length;
      examMap[eid].essayQuestionIDs   = essayQMap[eid];
    });

    // ── 4. Baca Responses — hitung progres per ujian ─────────────────────────
    const rSheet = SS.getSheetByName('Responses');
    const hasResponses = rSheet && rSheet.getLastRow() > 1;
    const rData = hasResponses ? rSheet.getDataRange().getValues() : [];

    // examID → { participants: Set(studentID), gradedPerQ: {qID: graded_count} }
    const progressMap = {};
    examIDsWithEssay.forEach(eid => {
      progressMap[eid] = {
        participants: new Set(),
        gradedPerResponse: {} // responseID → count of graded essay Qs for that response
      };
    });

    for (let i = 1; i < rData.length; i++) {
      const examID = String(rData[i][2]).trim();
      if (!progressMap[examID]) continue;

      const status = String(rData[i][7] || '').toLowerCase().trim();
      if (!_isFinishedStatus(status)) continue; // hanya yang sudah submit

      const studentID   = String(rData[i][1]).trim();
      const responseID  = String(rData[i][0]).trim();
      const essayQIDs   = essayQMap[examID] || [];

      progressMap[examID].participants.add(studentID);

      let answers = {};
      try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }

      const perQScores = answers['_essay_scores_per_question'] || {};

      let gradedCount = 0;
      essayQIDs.forEach(qID => {
        // Sebuah jawaban esai dianggap SUDAH dikoreksi jika ada skor guru.
        // Jawaban kosong / tidak dijawab dikecualikan dari perhitungan agar
        // tidak menggembungkan total "belum dikoreksi".
        let rawAns = answers[qID];
        let ansText = '';
        if (rawAns !== undefined && rawAns !== null) {
          if (typeof rawAns === 'string') ansText = rawAns.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          else if (typeof rawAns === 'object' && rawAns.answer) ansText = String(rawAns.answer).trim();
        }
        const isDummy = (ansText === '' || ansText === '(Tidak dijawab)');

        if (isDummy) {
          // Jawaban kosong → tidak perlu dikoreksi, anggap "sudah"
          gradedCount++;
        } else if (perQScores[qID] !== undefined && perQScores[qID] !== null) {
          gradedCount++;
        }
        // else: ada jawaban tapi belum dikoreksi → tidak dihitung
      });

      progressMap[examID].gradedPerResponse[responseID] = {
        studentID,
        gradedCount,
        totalEssay: essayQIDs.length
      };
    }

    // ── 5. Baca AdminLogs — cari data pengoreksi (GRADE_ESSAY) ──────────────
    const alSheet = SS.getSheetByName('AdminLogs');
    const alData  = (alSheet && alSheet.getLastRow() > 1) ? alSheet.getDataRange().getValues() : [];

    // examID → [{actorID, actorName, timestamp}]  (ambil unik per actor saja)
    const gradersMap = {};
    for (let i = 1; i < alData.length; i++) {
      const action     = String(alData[i][4] || '').trim();
      const targetID   = String(alData[i][6] || '').trim(); // ExamID
      const actorID    = String(alData[i][2] || '').trim();
      const actorName  = String(alData[i][3] || '').trim();
      const ts         = alData[i][1];
      if (action !== 'GRADE_ESSAY') continue;
      if (!gradersMap[targetID]) gradersMap[targetID] = {};
      // Simpan entri terbaru per actorID
      if (!gradersMap[targetID][actorID] || (ts instanceof Date && ts > gradersMap[targetID][actorID].raw)) {
        gradersMap[targetID][actorID] = {
          actorID,
          actorName,
          raw: ts instanceof Date ? ts : null,
          lastGradedStr: ts instanceof Date ? Utilities.formatDate(ts, tz, 'dd/MM/yyyy HH:mm') : '-'
        };
      }
    }

    // ── 6. Susun hasil akhir ─────────────────────────────────────────────────
    const exams = [];

    examIDsWithEssay.forEach(eid => {
      const info   = examMap[eid];
      const pm     = progressMap[eid];
      if (!pm) return;

      const totalParticipants = pm.participants.size;
      const essayQCount       = info.essayQuestionCount;

      // Total jawaban esai yang harus dikoreksi = soal esai × peserta
      const totalAnswers = essayQCount * totalParticipants;

      // Jumlah jawaban yang sudah dikoreksi (jumlahkan gradedCount per response)
      let gradedCount = 0;
      Object.values(pm.gradedPerResponse).forEach(r => {
        gradedCount += r.gradedCount;
      });

      const pendingCount = Math.max(0, totalAnswers - gradedCount);
      const progressPct  = totalAnswers > 0
        ? Math.round((gradedCount / totalAnswers) * 100)
        : (totalParticipants === 0 ? 0 : 100); // jika belum ada peserta → 0

      let gradingStatus = 'none';
      if (totalAnswers === 0) {
        gradingStatus = 'none'; // belum ada peserta
      } else if (gradedCount >= totalAnswers) {
        gradingStatus = 'done';
      } else if (gradedCount > 0) {
        gradingStatus = 'partial';
      } else {
        gradingStatus = 'none';
      }

      // Pengoreksi dari AdminLogs
      const gradersRaw = gradersMap[eid] || {};
      const graders = Object.values(gradersRaw).sort((a,b) => {
        if (!a.raw && !b.raw) return 0;
        if (!a.raw) return 1;
        if (!b.raw) return -1;
        return b.raw - a.raw;
      }).map(g => ({ actorID: g.actorID, actorName: g.actorName, lastGraded: g.lastGradedStr }));

      const lastGraderEntry = graders.length > 0 ? graders[0] : null;

      exams.push({
        examID:              eid,
        title:               info.title,
        subject:             info.subject,
        kelas:               info.kelas,
        dateStr:             info.dateStr,
        endDateStr:          info.endDateStr,
        examStatus:          info.examStatus,
        essayQuestionCount:  essayQCount,
        totalParticipants,
        totalAnswers,
        gradedCount,
        pendingCount,
        progressPct,
        gradingStatus,
        graders,
        lastGradedBy:   lastGraderEntry ? lastGraderEntry.actorName : '-',
        lastGradedTime: lastGraderEntry ? lastGraderEntry.lastGraded : '-'
      });
    });

    // Urutkan: sebagian dulu (partial), lalu belum, lalu selesai; dalam tiap grup: by dateStr desc
    exams.sort((a, b) => {
      const order = { partial: 0, none: 1, done: 2 };
      const oa = order[a.gradingStatus] ?? 1;
      const ob = order[b.gradingStatus] ?? 1;
      if (oa !== ob) return oa - ob;
      return 0; // pertahankan urutan asli dalam grup
    });

    // ── 7. Ringkasan ─────────────────────────────────────────────────────────
    const doneCount    = exams.filter(e => e.gradingStatus === 'done').length;
    const partialCount = exams.filter(e => e.gradingStatus === 'partial').length;
    const noneCount    = exams.filter(e => e.gradingStatus === 'none').length;
    const totalAnswersAll = exams.reduce((s, e) => s + e.totalAnswers, 0);
    const totalGradedAll  = exams.reduce((s, e) => s + e.gradedCount, 0);
    const totalPendingAll = exams.reduce((s, e) => s + e.pendingCount, 0);

    return {
      success: true,
      summary: {
        totalExams:   exams.length,
        doneCount,
        partialCount,
        noneCount,
        totalAnswers: totalAnswersAll,
        totalGraded:  totalGradedAll,
        totalPending: totalPendingAll
      },
      exams
    };

  } catch(e) {
    Logger.log('[getEssayGradingProgress] Error: ' + e.toString());
    return { success: false, message: 'Gagal mengambil data: ' + (e.message || String(e)) };
  }
}

/**
 * Kembalikan detail koreksi satu jadwal ujian secara rinci:
 * per-peserta (sudah/belum dikoreksi, berapa soal, oleh siapa, kapan).
 *
 * @param {string} examID
 * @param {string} requestorID
 * @param {string} requestorToken
 */
function getEssayGradingDetail(examID, requestorID, requestorToken) {
  try {
    // Auth
    const uSheet = SS.getSheetByName('Users');
    const uData  = uSheet.getDataRange().getValues();
    let role = null;
    const userMap = {};
    // teacherAssignments untuk Guru (format identik dengan getEssayGradingProgress)
    const teacherAssignments = [];

    for (let i = 1; i < uData.length; i++) {
      userMap[String(uData[i][0]).trim()] = { name: String(uData[i][1]), cls: String(uData[i][4] || '') };
      if (String(uData[i][0]) === String(requestorID) &&
          String(uData[i][5]) === String(requestorToken)) {
        role = String(uData[i][3]).trim();

        if (role === 'Guru') {
          const rawAssignment = String(uData[i][4] || '');
          rawAssignment.split(',').forEach(function(item) {
            const parts = item.trim().split(':');
            if (parts.length >= 2) {
              teacherAssignments.push({
                subject: parts[0].trim().toLowerCase(),
                kelas:   parts[1].trim().toLowerCase()
              });
            }
          });
        }
      }
    }
    if (!role)            return { success: false, message: 'Sesi tidak valid.' };
    if (role === 'Siswa') return { success: false, message: 'Akses ditolak.' };

    // Info ujian
    const examSheet = SS.getSheetByName('Exams');
    const examRows  = examSheet.getDataRange().getValues();
    let examInfo = null;
    const tz = Session.getScriptTimeZone();
    for (let i = 1; i < examRows.length; i++) {
      if (String(examRows[i][0]).trim() === String(examID).trim()) {
        const sd = examRows[i][3] instanceof Date ? Utilities.formatDate(examRows[i][3], tz, 'dd/MM/yyyy HH:mm') : '-';
        const ed = examRows[i][7] instanceof Date ? Utilities.formatDate(examRows[i][7], tz, 'dd/MM/yyyy HH:mm') : '-';
        examInfo = {
          examID:   String(examRows[i][0]),
          subject:  String(examRows[i][1]),
          kelas:    String(examRows[i][2]),
          dateStr:  sd,
          endDateStr: ed,
          examStatus: String(examRows[i][6] || '')
        };
        break;
      }
    }
    if (!examInfo) return { success: false, message: 'Jadwal ujian tidak ditemukan.' };

    // ── SECURITY CHECK untuk Guru ────────────────────────────────────────────
    // Guru hanya boleh mengakses detail ujian yang menjadi tanggung jawabnya.
    // Ini mencegah Guru yang mengetahui examID ujian lain untuk mengakses datanya.
    if (role === 'Guru') {
      const subjectLow  = examInfo.subject.toLowerCase();
      const kelasItems  = examInfo.kelas.toLowerCase().split(',').map(function(k) { return k.trim(); });
      const isAuthorized = teacherAssignments.some(function(tugas) {
        return subjectLow.includes(tugas.subject) &&
               kelasItems.some(function(k) {
                 return k.includes(tugas.kelas) || tugas.kelas.includes(k);
               });
      });
      if (!isAuthorized) {
        return { success: false, message: 'Akses ditolak: ujian ini bukan tanggung jawab Anda.' };
      }
    }

    // Soal Esai
    const qSheet = SS.getSheetByName('Questions');
    const qData  = qSheet.getDataRange().getValues();
    const essayQuestions = [];
    for (let i = 1; i < qData.length; i++) {
      if (String(qData[i][1]).trim() !== String(examID) || String(qData[i][2]) !== 'Esai') continue;
      essayQuestions.push({
        id:       String(qData[i][0]).trim(),
        content:  String(qData[i][3] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120)
      });
    }
    if (essayQuestions.length === 0) {
      return { success: false, message: 'Tidak ada soal Esai untuk ujian ini.' };
    }

    // Responses
    const rSheet = SS.getSheetByName('Responses');
    const rData  = (rSheet && rSheet.getLastRow() > 1) ? rSheet.getDataRange().getValues() : [];

    const participants = []; // {studentID, studentName, studentClass, responseID, gradedCount, totalEssay, gradingStatus, submitTimeStr}
    for (let i = 1; i < rData.length; i++) {
      if (String(rData[i][2]).trim() !== String(examID)) continue;
      const status = String(rData[i][7] || '').toLowerCase().trim();
      if (!_isFinishedStatus(status)) continue;

      const studentID   = String(rData[i][1]).trim();
      const responseID  = String(rData[i][0]).trim();
      const uInfo       = userMap[studentID] || { name: 'Unknown', cls: '-' };
      const submitTime  = rData[i][6] instanceof Date
        ? Utilities.formatDate(rData[i][6], tz, 'dd/MM/yyyy HH:mm') : '-';

      let answers = {};
      try { answers = JSON.parse(rData[i][3] || '{}'); } catch(e) { answers = {}; }
      const perQScores = answers['_essay_scores_per_question'] || {};

      let gradedCount = 0;
      essayQuestions.forEach(q => {
        let rawAns = answers[q.id];
        let ansText = '';
        if (rawAns !== undefined && rawAns !== null) {
          if (typeof rawAns === 'string') ansText = rawAns.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          else if (typeof rawAns === 'object' && rawAns.answer) ansText = String(rawAns.answer).trim();
        }
        const isDummy = (ansText === '' || ansText === '(Tidak dijawab)');
        if (isDummy || (perQScores[q.id] !== undefined && perQScores[q.id] !== null)) {
          gradedCount++;
        }
      });

      const totalEssay = essayQuestions.length;
      let pStatus = 'none';
      if (gradedCount >= totalEssay)         pStatus = 'done';
      else if (gradedCount > 0)              pStatus = 'partial';

      participants.push({
        studentID,
        studentName:  uInfo.name,
        studentClass: uInfo.cls,
        responseID,
        gradedCount,
        totalEssay,
        gradingStatus: pStatus,
        submitTimeStr: submitTime
      });
    }

    // Urutkan: belum → sebagian → selesai; dalam grup: by name
    participants.sort((a, b) => {
      const order = { none: 0, partial: 1, done: 2 };
      const oa = order[a.gradingStatus] ?? 0;
      const ob = order[b.gradingStatus] ?? 0;
      if (oa !== ob) return oa - ob;
      return a.studentName.localeCompare(b.studentName);
    });

    // Pengoreksi (dari AdminLogs)
    const alSheet = SS.getSheetByName('AdminLogs');
    const alData  = (alSheet && alSheet.getLastRow() > 1) ? alSheet.getDataRange().getValues() : [];
    const gradersMap = {};
    for (let i = 1; i < alData.length; i++) {
      if (String(alData[i][4]) !== 'GRADE_ESSAY' || String(alData[i][6]).trim() !== String(examID)) continue;
      const actorID   = String(alData[i][2]).trim();
      const actorName = String(alData[i][3]).trim();
      const ts        = alData[i][1];
      if (!gradersMap[actorID] || (ts instanceof Date && ts > gradersMap[actorID].raw)) {
        gradersMap[actorID] = {
          actorID, actorName,
          raw:          ts instanceof Date ? ts : null,
          lastGradedStr: ts instanceof Date ? Utilities.formatDate(ts, tz, 'dd/MM/yyyy HH:mm') : '-'
        };
      }
    }
    const graders = Object.values(gradersMap).sort((a, b) => {
      if (!a.raw && !b.raw) return 0;
      if (!a.raw) return 1;
      if (!b.raw) return -1;
      return b.raw - a.raw;
    }).map(g => ({ actorID: g.actorID, actorName: g.actorName, lastGraded: g.lastGradedStr }));

    const gradedParticipants  = participants.filter(p => p.gradingStatus === 'done').length;
    const pendingParticipants = participants.filter(p => p.gradingStatus !== 'done').length;
    const gradedAnswers  = participants.reduce((s, p) => s + p.gradedCount, 0);
    const totalAnswers   = participants.reduce((s, p) => s + p.totalEssay, 0);

    return {
      success: true,
      examInfo,
      essayQuestions,
      participants,
      graders,
      summary: {
        totalParticipants:  participants.length,
        gradedParticipants,
        pendingParticipants,
        essayQuestionCount: essayQuestions.length,
        totalAnswers,
        gradedAnswers,
        pendingAnswers: Math.max(0, totalAnswers - gradedAnswers)
      }
    };

  } catch(e) {
    Logger.log('[getEssayGradingDetail] Error: ' + e.toString());
    return { success: false, message: 'Gagal mengambil detail: ' + (e.message || String(e)) };
  }
}

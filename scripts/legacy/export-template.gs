// Run in the authorized legacy spreadsheet's bound Apps Script editor. No production source is modified.
function exportEdutaraForMigration() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book)
    throw new Error("Buka Apps Script yang terikat spreadsheet sumber.");
  var names = [
    "Users",
    "Exams",
    "Questions",
    "Responses",
    "Logs",
    "AdminLogs",
    "ExamRooms",
    "Supervisors",
    "Notifications",
    "Gambar",
    "Audio",
    "Konfigurasi",
    "Master_Data",
  ];
  var result = {
    format: "edutara-legacy-export-v1",
    exported_at: new Date().toISOString(),
    sheets: {},
  };
  names.forEach(function (name) {
    var sheet = book.getSheetByName(name);
    if (!sheet) return;
    var rows = sheet.getDataRange().getValues();
    var head = rows.shift();
    result.sheets[name] = rows
      .filter(function (r) {
        return r.some(function (v) {
          return v !== "";
        });
      })
      .map(function (row) {
        var out = {};
        head.forEach(function (k, i) {
          if (
            !/(password|session.?token|access.?token|refresh.?token|secret|api.?key|^pin$)/i.test(
              String(k),
            )
          )
            out[k] = row[i] instanceof Date ? row[i].toISOString() : row[i];
        });
        if (
          out.Key &&
          /(password|token|secret|api.?key|^pin$)/i.test(String(out.Key))
        )
          out.Value = "[excluded secret]";
        return out;
      });
  });
  var file = DriveApp.createFile(
    "EDUTARA_Legacy_Export.json",
    JSON.stringify(result),
    MimeType.PLAIN_TEXT,
  );
  Logger.log("Ekspor dibuat privat pada Drive pemilik. ID: " + file.getId());
}

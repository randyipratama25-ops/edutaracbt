import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import path from "node:path";
const ids = {
  Users: "UserID",
  Exams: "ExamID",
  Questions: "QuestionID",
  Responses: "ResponseID",
  Logs: "LogID",
  AdminLogs: "LogID",
  ExamRooms: "RoomID",
  Supervisors: "AssignmentID",
  Notifications: "NotificationID",
  Gambar: "ID",
  Audio: "ID",
  Konfigurasi: "Key",
  Master_Data: "Key",
};
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((k) => value[k] !== undefined)
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
export const digest = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" ? value : JSON.stringify(canonical(value)),
    )
    .digest("hex");
export function stableId(entity, id) {
  const hash = createHash("sha1")
    .update("EDUTARA:legacy:v1:" + entity + ":" + id)
    .digest();
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function redact(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "Key" in value &&
    /(password|token|secret|api.?key|^pin$)/i.test(String(value.Key))
  )
    return { Key: value.Key, Value: "[excluded secret]" };
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      for (const k of [...u.searchParams.keys()])
        if (
          /token|key|secret|password|signature|auth|credential|^sig$/i.test(k)
        )
          u.searchParams.delete(k);
      return u.href;
    } catch {
      return "[invalid source URL]";
    }
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/(password|session.?token|access.?token|refresh.?token|secret|api.?key|^pin$)/i.test(
              k,
            ),
        )
        .map(([k, v]) => [k, redact(v)]),
    );
  return value;
}
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
export function splitAnswers(input) {
  const data = parse(input || "{}");
  if (!data || Array.isArray(data) || typeof data !== "object")
    throw Error("AnswersJSON harus object");
  const {
    _essay_scores_per_question: essay_scores,
    _manual_essay_score: manual_total,
    _ai_scores: ai_scores,
    _ai_reasons: ai_reasons,
    __pausedElapsedSec__: elapsed,
    ...answers
  } = data;
  return {
    answers,
    essay_scores: essay_scores ?? null,
    manual_total: manual_total ?? null,
    ai_scores: ai_scores ?? null,
    ai_reasons: ai_reasons ?? null,
    elapsed_seconds: elapsed ?? null,
  };
}
export function transformLegacy(source, root = ".") {
  if (
    source.format !== "edutara-legacy-export-v1" ||
    !source.sheets ||
    typeof source.sheets !== "object"
  )
    throw Error("Format ekspor legacy tidak valid");
  const records = [],
    quarantine = [],
    media = [];
  const refs = {};
  for (const [entity, rows] of Object.entries(source.sheets)) {
    if (!Array.isArray(rows)) throw Error("Sheet harus array: " + entity);
    refs[entity] = new Set(rows.map((r) => String(r[ids[entity]] ?? "")));
  }
  for (const [entity, rows] of Object.entries(source.sheets)) {
    const key = ids[entity];
    const counts = new Map();
    for (const row of rows) {
      const id = String(row[key] ?? "");
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    rows.forEach((raw, index) => {
      const id = String(raw[key] ?? ""),
        safe = redact(raw);
      let normalized = { source: safe };
      try {
        if (!key) throw Error("Sheet belum memiliki adapter; tinjau mapping");
        if (!id) throw Error("Legacy ID kosong");
        if (counts.get(id) > 1)
          throw Error("Legacy ID duplikat; tidak digabung otomatis");
        if (entity === "Users") {
          const username = String(raw.Username || raw.UserID)
            .trim()
            .toLowerCase();
          if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username))
            throw Error("Username tidak valid");
          const roles = {
            admin: "admin",
            guru: "teacher",
            teacher: "teacher",
            pengawas: "supervisor",
            supervisor: "supervisor",
            siswa: "student",
            student: "student",
          };
          const role = roles[String(raw.Role).toLowerCase()];
          if (!role) throw Error("Role tidak dikenal");
          normalized = {
            ...normalized,
            username,
            role,
            activation_required: true,
            source_active: raw.IsActive ?? null,
          };
        }
        if (
          ["Questions", "Responses", "ExamRooms", "Supervisors"].includes(
            entity,
          ) &&
          !refs.Exams?.has(String(raw.ExamID))
        )
          throw Error("Referensi ExamID yatim");
        if (entity === "Responses") {
          if (!refs.Users?.has(String(raw.UserID)))
            throw Error("Referensi UserID yatim");
          const a = splitAnswers(raw.AnswersJSON);
          const score =
            raw.Score === null || raw.Score === "" || raw.Score === undefined
              ? null
              : Number(raw.Score);
          if (
            score !== null &&
            (!Number.isFinite(score) || score < 0 || score > 100)
          )
            throw Error("Nilai historis tidak valid");
          for (const qid of Object.keys(a.answers)) {
            if (!refs.Questions?.has(qid))
              throw Error("Referensi jawaban soal yatim: " + qid);
          }
          normalized = {
            ...normalized,
            ...a,
            original_score: score,
            original_status: raw.Status ?? null,
            snapshot_verified: !!raw.Snapshot,
          };
        }
        if (entity === "Questions") {
          for (const k of ["Options", "CorrectAnswer"])
            if (typeof raw[k] === "string" && /^[\[{]/.test(raw[k].trim()))
              parse(raw[k]);
          if (!["PG", "PG_KOMPLEKS", "BS", "JODOH", "Esai"].includes(raw.Type))
            throw Error("Tipe soal perlu mapping eksplisit");
          normalized = {
            ...normalized,
            type: raw.Type,
            exam_target: stableId("Exams", raw.ExamID),
          };
        }
        if (entity === "Exams") {
          for (const k of ["Date", "EndDate"])
            if (
              raw[k] &&
              (!/(Z|[+-]\d{2}:\d{2})$/.test(String(raw[k])) ||
                !Number.isFinite(Date.parse(raw[k])))
            )
              throw Error("Waktu harus ISO dengan zona eksplisit");
          normalized = {
            ...normalized,
            original_status: raw.Status ?? null,
            source_pin_discarded: true,
          };
        }
        if (["Gambar", "Audio"].includes(entity)) {
          const file = raw.LocalPath;
          if (!file)
            throw Error("Bytes media belum tersedia; URL saja bukan migrasi");
          const base = realpathSync(root),
            full = path.resolve(base, file);
          if (
            !full.startsWith(base + path.sep) ||
            !existsSync(full) ||
            !realpathSync(full).startsWith(base + path.sep)
          )
            throw Error("Path media keluar paket/tidak tersedia");
          const bytes = readFileSync(full);
          if (!bytes.length || bytes.length > 5242880)
            throw Error("Media kosong/melebihi batas target 5 MiB");
          const actual = createHash("sha256").update(bytes).digest("hex");
          if (raw.SHA256 && raw.SHA256 !== actual)
            throw Error("Checksum media berbeda");
          media.push({
            entity,
            legacy_id: id,
            relative_path: file,
            bytes: bytes.length,
            sha256: actual,
          });
          normalized = {
            ...normalized,
            sha256: actual,
            byte_size: bytes.length,
          };
        }
        const payload = redact(normalized);
        records.push({
          entity,
          legacy_id: id,
          target_id: stableId(entity, id),
          source_hash: digest(payload),
          payload,
          status: "staged",
          source_row: index + 1,
        });
      } catch (e) {
        quarantine.push({
          entity,
          legacy_id: id || "row-" + (index + 1),
          source_hash: digest(safe),
          payload: safe,
          status: "quarantined",
          reason: e.message,
          source_row: index + 1,
        });
      }
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    const valid = {};
    for (const r of records) (valid[r.entity] ??= new Set()).add(r.legacy_id);
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i],
        raw = r.payload.source;
      let invalid = false;
      if (
        ["Questions", "Responses", "ExamRooms", "Supervisors"].includes(
          r.entity,
        ) &&
        !valid.Exams?.has(String(raw.ExamID))
      )
        invalid = true;
      if (
        r.entity === "Responses" &&
        (!valid.Users?.has(String(raw.UserID)) ||
          Object.keys(r.payload.answers).some(
            (id) => !valid.Questions?.has(id),
          ))
      )
        invalid = true;
      if (invalid) {
        records.splice(i, 1);
        quarantine.push({
          ...r,
          status: "quarantined",
          reason: "Dependent source entity is quarantined or missing",
        });
        changed = true;
      }
    }
  }
  return {
    format: "edutara-migration-plan-v1",
    source_checksum: digest(redact(source)),
    records,
    quarantine,
    media,
    counts: {
      source: Object.values(source.sheets).reduce((n, r) => n + r.length, 0),
      staged: records.length,
      quarantined: quarantine.length,
    },
    promotion_blocked: true,
    promotion_requirements: [
      "Source owner reconciliation",
      "Historical question snapshot verification",
      "Secure Auth activation mapping",
      "Staging native-domain parity and UAT approval",
    ],
  };
}
if (process.argv[1]?.endsWith("transform.mjs")) {
  const file = process.argv[2];
  if (!file)
    throw Error(
      "Usage: node scripts/legacy/transform.mjs export.json plan.json",
    );
  const plan = transformLegacy(
    JSON.parse(readFileSync(file, "utf8")),
    path.dirname(file),
  );
  writeFileSync(
    process.argv[3] || "/tmp/edutara-migration-plan.json",
    JSON.stringify(plan, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ counts: plan.counts, promotion_blocked: true }));
}

// Isolated PGlite only. This module has no database URL or production write path.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
export const byteHash = (b) => createHash("sha256").update(b).digest("hex");
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
export async function restoreRows(db, rows) {
  const byTable = new Map();
  for (const r of rows)
    (byTable.get(r.table) || byTable.set(r.table, []).get(r.table)).push(
      r.record,
    );
  const auth = byTable.get("auth.identities_safe") || [];
  byTable.delete("auth.identities_safe");
  await db.exec("begin");
  try {
    await db.exec("truncate public.organizations cascade");
    for (const u of auth)
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3) on conflict(id) do update set email=excluded.email",
        [u.id, u.email, u.email_confirmed ? "2026-01-01T00:00:00Z" : null],
      );
    const fks = (
      await db.query(
        "select n1.nspname||'.'||c1.relname child,n2.nspname||'.'||c2.relname parent from pg_constraint co join pg_class c1 on c1.oid=co.conrelid join pg_namespace n1 on n1.oid=c1.relnamespace join pg_class c2 on c2.oid=co.confrelid join pg_namespace n2 on n2.oid=c2.relnamespace where co.contype='f'",
      )
    ).rows;
    const pending = new Set(byTable.keys()),
      done = new Set();
    while (pending.size) {
      let advanced = false;
      for (const table of [...pending]) {
        if (
          fks.some(
            (f) =>
              f.child === table && pending.has(f.parent) && f.parent !== table,
          )
        )
          continue;
        if (!/^(public|private)\.[a-z_][a-z0-9_]*$/.test(table))
          throw Error("Untrusted table identifier");
        const sqlName = table.split(".").map(ident).join(".");
        await db.exec(`alter table ${sqlName} disable trigger user`);
        for (const record of byTable.get(table))
          await db.query(
            `insert into ${sqlName} overriding system value select (jsonb_populate_record(null::${sqlName},$1::jsonb)).*`,
            [JSON.stringify(record)],
          );
        await db.exec(`alter table ${sqlName} enable trigger user`);
        pending.delete(table);
        done.add(table);
        advanced = true;
      }
      if (!advanced)
        throw Error("FK dependency cycle; require reviewed restore order");
    }
    await db.exec("commit");
    return {
      tables: done.size,
      records: rows.length,
      auth_reactivation_required: auth.length,
    };
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
export async function verifyArtifact(root, manifest) {
  const rows = [],
    objects = [];
  const base = realpathSync(root);
  for (const p of manifest.parts) {
    const relative = p.path.slice(
      (manifest.organization_id + "/" + manifest.job_id + "/").length,
    );
    if (
      p.path !==
        manifest.organization_id + "/" + manifest.job_id + "/" + relative ||
      relative.split("/").some((s) => s === "..") ||
      path.isAbsolute(relative)
    )
      throw Error("Path escapes backup");
    const full = path.resolve(base, relative);
    if (
      !full.startsWith(base + path.sep) ||
      !realpathSync(full).startsWith(base + path.sep)
    )
      throw Error("Path escapes backup");
    const bytes = readFileSync(full);
    if (bytes.length !== p.bytes || byteHash(bytes) !== p.sha256)
      throw Error("Backup checksum mismatch");
    if (p.kind === "data") rows.push(...JSON.parse(bytes));
    if (p.kind === "object")
      objects.push({
        path: p.metadata.source_path,
        bucket: p.metadata.bucket,
        sha256: byteHash(bytes),
        bytes,
      });
  }
  if (rows.length !== manifest.rows || objects.length !== manifest.objects)
    throw Error("Backup counts mismatch");
  return { rows, objects };
}

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
export async function loadStaging(
  db,
  plan,
  organization = "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
) {
  if (plan.format !== "edutara-migration-plan-v1")
    throw Error("Plan tidak valid");
  await db.exec(
    "create table if not exists migration_staging(organization_id uuid,entity text,legacy_id text,target_id uuid,source_hash text,payload jsonb,status text,reason text,primary key(organization_id,entity,legacy_id))",
  );
  await db.exec("begin");
  try {
    for (const r of [...plan.records, ...plan.quarantine])
      await db.query(
        "insert into migration_staging values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(organization_id,entity,legacy_id) do update set target_id=excluded.target_id,source_hash=excluded.source_hash,payload=excluded.payload,status=excluded.status,reason=excluded.reason",
        [
          organization,
          r.entity,
          r.status === "quarantined"
            ? r.legacy_id + "#quarantine-row-" + r.source_row
            : r.legacy_id,
          r.target_id || null,
          r.source_hash,
          JSON.stringify(r.payload),
          r.status,
          r.reason || null,
        ],
      );
    await db.exec("commit");
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
  return (
    await db.query(
      "select entity,status,count(*)::int count from migration_staging group by entity,status order by entity,status",
    )
  ).rows;
}
if (process.argv[1]?.endsWith("load-staging.mjs")) {
  const plan = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const db = new PGlite(process.argv[3] || "/tmp/edutara-legacy-staging");
  try {
    console.log(JSON.stringify(await loadStaging(db, plan)));
  } finally {
    await db.close();
  }
}

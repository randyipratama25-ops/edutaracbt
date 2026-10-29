import { digest as hash } from "../legacy/transform.mjs";
export async function parity(db, plan) {
  const rows = (
    await db.query(
      "select entity,legacy_id,target_id,source_hash,payload,status from migration_staging order by entity,legacy_id",
    )
  ).rows;
  const map = new Map(rows.map((r) => [r.entity + ":" + r.legacy_id, r]));
  const differences = [];
  for (const r of plan.records) {
    const actual = map.get(r.entity + ":" + r.legacy_id);
    if (
      !actual ||
      actual.source_hash !== r.source_hash ||
      actual.target_id !== r.target_id ||
      hash(actual.payload) !== hash(r.payload)
    )
      differences.push({
        entity: r.entity,
        id: r.legacy_id,
        reason: "Missing, changed payload, score/status, or unstable mapping",
      });
  }
  return {
    staging_rows: rows.length,
    expected_valid: plan.records.length,
    quarantine_source_rows: plan.quarantine.length,
    differences,
    native_domain_parity: "NOT_RUN",
    production_migration: "BLOCKED_SOURCE_AND_SIGNOFF",
    passed: differences.length === 0,
  };
}

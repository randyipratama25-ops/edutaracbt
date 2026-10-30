import { describe, it, expect } from 'vitest';
import { evaluateRelease, requiredProofs, assertAnswersPreserved } from '../scripts/release/gate.mjs';
const now = new Date('2026-10-29T14:00:00Z');
const commit = 'a'.repeat(40);
const proof = () => ({ passed: true, candidate_sha: commit, recorded_at: now.toISOString(), artifact: 'docs/evidence/review.json' });
const valid = () => ({
  format: 'edutara-release-v2', candidate_sha: commit,
  production_project: 'cwklpfplqoofvehlyfvd', production_origin: 'https://edutara-cbt-ashen.vercel.app',
  observed_at: now.toISOString(), active_attempts: 0, scheduler_count: 1, schedulers: [{name:"edutara-operations",active:true,schedule:"* * * * *"},{name:"edutara-recovery-retention",active:true,schedule:"*/15 * * * *"},{name:"edutara-results-publication",active:true,schedule:"* * * * *"}],
  backup: { id: '9e895868-859d-4e66-9074-572bafd7d924', status: 'succeeded', completed_at: now.toISOString(), checksum: 'b'.repeat(64) },
  data_mode: 'legacy', observation_minutes: 60,
  proofs: Object.fromEntries([...requiredProofs, 'legacy_freeze', 'delta_parity'].map(k => [k, proof()])),
});
describe('cutover evidence gate', () => {
  it('refuses missing or malformed evidence rather than treating an empty manifest as ready', () => {
    for (const value of [null, {}, { active_attempts: 0 }]) expect(evaluateRelease(value, now).ready).toBe(false);
  });
  it('requires current-commit evidence for every role, device, load, recovery and rollback gate', () => {
    const m = valid(); delete m.proofs.uat_all_roles_devices;
    expect(evaluateRelease(m, now).ready).toBe(false);
    m.proofs.uat_all_roles_devices = { ...proof(), candidate_sha: 'c'.repeat(40) };
    expect(evaluateRelease(m, now).ready).toBe(false);
    m.proofs.uat_all_roles_devices = proof();
    expect(evaluateRelease(m, now).ready).toBe(true);
  });
  it('blocks active attempts, duplicated scheduler, stale backup, stale/future preflight', () => {
    for (const patch of [{ active_attempts: 1 }, { scheduler_count: 2 }, { scheduler_count: 0 }, { observed_at: '2026-10-29T13:54:59Z' }, { observed_at: '2026-10-29T14:00:01Z' }]) expect(evaluateRelease({ ...valid(), ...patch }, now).ready).toBe(false);
    const m = valid(); m.backup.completed_at = '2026-10-29T12:59:59Z';
    expect(evaluateRelease(m, now).ready).toBe(false);
  });
  it('does not infer fresh-start permission from missing legacy data', () => {
    const m = { ...valid(), data_mode: 'fresh' }; delete m.proofs.legacy_freeze; delete m.proofs.delta_parity;
    expect(evaluateRelease(m, now).ready).toBe(false);
    m.proofs.owner_fresh_start = proof();
    expect(evaluateRelease(m, now).ready).toBe(true);
  });
  it('rejects false evidence, unknown deployment target and credential-bearing evidence links', () => {
    expect(evaluateRelease({ ...valid(), production_project: 'other' }, now).ready).toBe(false);
    const m = valid(); m.proofs.security.artifact = 'https://example.invalid?token=secret';
    expect(evaluateRelease(m, now).ready).toBe(false);
    m.proofs.security = { ...proof(), passed: false };
    expect(evaluateRelease(m, now).ready).toBe(false);
  });
});
describe('post-backup answer preservation', () => {
  const old = { table: 'public.attempt_answers', key: 'attempt/q1/revision1', sha256: 'a'.repeat(64) };
  const fresh = { table: 'private.answer_revisions', key: 'attempt/q1/revision2', sha256: 'b'.repeat(64) };
  it('refuses a historical restore that discards a new revision or changes its content', () => {
    expect(() => assertAnswersPreserved([old, fresh], [old])).toThrow();
    expect(() => assertAnswersPreserved([old, fresh], [old, { ...fresh, sha256: 'c'.repeat(64) }])).toThrow();
    expect(assertAnswersPreserved([old, fresh], [fresh, old])).toEqual({ preserved: 2, additional_rows: 0 });
  });
  it('refuses empty or duplicate inventories and permits additional intact rows', () => {
    expect(() => assertAnswersPreserved([], [])).toThrow();
    expect(() => assertAnswersPreserved([old], [old, old])).toThrow();
    expect(assertAnswersPreserved([old], [old, fresh]).additional_rows).toBe(1);
  });
});

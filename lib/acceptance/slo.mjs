// A report is evidence only when all 150 clients complete the same measured profile.
export function evaluateSlo(r) {
  const blockers = [];
  if (r?.target_scope !== "ISOLATED_STAGING")
    blockers.push("Lingkungan staging terisolasi belum terbukti.");
  if (r?.logical_clients !== 150 || r?.completed !== 150)
    blockers.push("Seluruh 150 siswa harus menyelesaikan alur.");
  if (
    !Number.isInteger(r?.requests) ||
    r.requests <= 0 ||
    !Number.isInteger(r?.errors) ||
    r.errors < 0 ||
    r.errors > r.requests ||
    r.errors / r.requests > 0.01
  )
    blockers.push("Error request harus ≤1% dengan denominator lengkap.");
  if (r?.semantic_errors !== 0 || r?.answer_mismatches !== 0)
    blockers.push("Kesalahan semantik dan selisih jawaban harus nol.");
  for (const [name, max] of [
    ["login", 3000],
    ["autosave", 1500],
    ["submit", 3000],
  ]) {
    const m = r?.metrics?.[name];
    if (
      !m ||
      m.count < 150 ||
      !Number.isFinite(m.p95_ms) ||
      m.p95_ms <= 0 ||
      m.p95_ms > max
    )
      blockers.push(
        `SLO ${name}: 150 sampel berhasil dan p95 ≤${max} ms wajib.`,
      );
  }
  if (!["burst-login-http", "authenticated-session-http"].includes(r?.profile))
    blockers.push("Profil uji wajib disebutkan.");
  return {
    passed: blockers.length === 0,
    blockers,
    scope: "HTTP backend; bukan UAT perangkat fisik",
    profile: r?.profile || "unknown",
  };
}

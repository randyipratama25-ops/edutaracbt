import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { settingsSchema, systemMutation } from "../lib/system/validation";
import {
  ambiguousDelivery,
  reminderText,
  readSmallBody,
  validatePartPath,
} from "../supabase/functions/operations-worker/shared";
import {
  transformLegacy,
  splitAnswers,
  stableId,
  redact,
} from "../scripts/legacy/transform.mjs";
import { loadStaging } from "../scripts/legacy/load-staging.mjs";
import { parity } from "../scripts/parity-check/index.mjs";
const source = {
  format: "edutara-legacy-export-v1",
  sheets: {
    Users: [
      {
        UserID: "siswa-001",
        Nama: "Uji",
        Role: "Siswa",
        Password: "do-not-export",
        SessionToken: "never-export",
      },
    ],
    Exams: [
      {
        ExamID: "e1",
        Date: "2026-10-29T00:00:00Z",
        EndDate: "2026-10-29T01:00:00Z",
        Status: "Completed",
        PIN: "123456",
      },
    ],
    Questions: [
      { QuestionID: "q1", ExamID: "e1", Type: "Esai", Content: "Jelaskan" },
    ],
    Responses: [
      {
        ResponseID: "r1",
        UserID: "siswa-001",
        ExamID: "e1",
        Status: "Completed",
        Score: 0,
        AnswersJSON: JSON.stringify({
          q1: { text: "Jawaban" },
          _essay_scores_per_question: { q1: 0 },
          _manual_essay_score: 0,
          _ai_scores: { q1: 1 },
          _ai_reasons: { q1: "Saran saja" },
          __pausedElapsedSec__: 20,
        }),
      },
    ],
    Konfigurasi: [{ Key: "GEMINI_API_KEY", Value: "NEVER-EXPORT-KEY" }],
  },
};
describe("system boundaries", () => {
  it("validates secret writes without exposing a read operation", () => {
    expect(
      systemMutation.parse({
        action: "secret",
        key: "smtp_password",
        value: "sample-password",
      }),
    ).toHaveProperty("key", "smtp_password");
    expect(() =>
      systemMutation.parse({ action: "secret_read", key: "smtp_password" }),
    ).toThrow();
  });
  it("rejects invalid setting types and unsafe TTL", () => {
    expect(() =>
      settingsSchema.parse({ name: "X", retention_days: 0 }),
    ).toThrow();
  });
  it("treats transport ambiguity conservatively and interpolates only allowed variables", () => {
    expect(ambiguousDelivery({ code: "ETIMEDOUT", command: "CONN" })).toBe(
      true,
    );
    expect(ambiguousDelivery({ code: "EAUTH" })).toBe(false);
    expect(
      reminderText("Halo {{nama}} {{rahasia}}", {
        name: "Guru",
        period: "akhir",
        deficit: "2",
        url: "https://example.invalid",
      }),
    ).toBe("Halo Guru {{rahasia}}");
  });
  it("bounds worker request streams and blocks path escapes", async () => {
    await expect(
      readSmallBody(
        new Request("https://example.invalid", {
          method: "POST",
          body: "x".repeat(3000),
        }),
      ),
    ).rejects.toThrow();
    expect(() => validatePartPath("org/job", "org/job/../secret")).toThrow();
  });
});
describe("legacy staging and parity", () => {
  it("separates metadata with exact manual zero and no automatic AI acceptance", () => {
    const x = splitAnswers(source.sheets.Responses[0].AnswersJSON);
    expect(x.manual_total).toBe(0);
    expect(x.essay_scores).toEqual({ q1: 0 });
    expect(x.ai_scores).toEqual({ q1: 1 });
    expect(Object.keys(x.answers)).toEqual(["q1"]);
    expect(x.elapsed_seconds).toBe(20);
  });
  it("removes nested secrets, configuration values and query credentials", () => {
    const p = transformLegacy(source);
    const text = JSON.stringify(p);
    expect(text).not.toContain("do-not-export");
    expect(text).not.toContain("never-export");
    expect(text).not.toContain("NEVER-EXPORT-KEY");
    expect(text).not.toContain("123456");
    expect(
      redact({ url: "https://example.invalid/image?token=SECRET&id=a" }),
    ).toEqual({ url: "https://example.invalid/image?id=a" });
  });
  it("uses stable mapping, preserves historic scores/status and blocks production promotion", () => {
    const a = transformLegacy(source),
      b = transformLegacy(source);
    expect(a.counts).toEqual({ source: 5, staged: 5, quarantined: 0 });
    expect(a.records.map((r) => r.target_id)).toEqual(
      b.records.map((r) => r.target_id),
    );
    expect(
      a.records.find((r) => r.entity === "Responses")?.payload,
    ).toMatchObject({ original_score: 0, original_status: "Completed" });
    expect(a.promotion_blocked).toBe(true);
    expect(stableId("Users", "7A")).not.toBe(stableId("Users", "7A1"));
  });
  it("quarantines duplicate IDs and dependent responses rather than silently merging", () => {
    const p = transformLegacy({
      ...source,
      sheets: {
        ...source.sheets,
        Users: [...source.sheets.Users, ...source.sheets.Users],
      },
    });
    expect(p.quarantine.filter((r) => r.entity === "Users")).toHaveLength(2);
    expect(p.quarantine.some((r) => r.entity === "Responses")).toBe(true);
    expect(p.counts.source).toBe(p.counts.staged + p.counts.quarantined);
  });
  it("loads the complete staging plan twice without duplication and preserves parity", async () => {
    const db = new PGlite();
    try {
      const plan = transformLegacy(source);
      await loadStaging(db, plan);
      await loadStaging(db, plan);
      const p = await parity(db, plan);
      expect(p.passed).toBe(true);
      expect(p.staging_rows).toBe(5);
      expect(p.native_domain_parity).toBe("NOT_RUN");
    } finally {
      await db.close();
    }
  }, 30000);
  it("retains every quarantined duplicate source row on repeat staging load", async () => {
    const db = new PGlite();
    try {
      const plan = transformLegacy({
        ...source,
        sheets: {
          ...source.sheets,
          Users: [...source.sheets.Users, ...source.sheets.Users],
        },
      });
      await loadStaging(db, plan);
      await loadStaging(db, plan);
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from migration_staging",
          )
        ).rows[0].n,
      ).toBe(plan.counts.source);
    } finally {
      await db.close();
    }
  }, 30000);
});

describe("load test safety", () => {
  it("refuses the production project and main branch before any network mutation", async () => {
    const { assertStaging, metrics } = await import(
      "../scripts/load/attempts.mjs"
    );
    expect(() =>
      assertStaging(
        "https://edutara-cbt-ashen.vercel.app",
        "cwklpfplqoofvehlyfvd",
      ),
    ).toThrow();
    expect(() =>
      assertStaging("https://app-git-main-team.vercel.app", "stagingref"),
    ).toThrow();
    expect(
      assertStaging("https://app-git-uat-team.vercel.app", "stagingref"),
    ).toBe("https://app-git-uat-team.vercel.app");
    expect(metrics([1, 2, 3, 4, 100]).p95_ms).toBe(100);
  });
});

"use client";
import { z } from "zod";
import { clientRequest } from "../../lib/client/request";

import { FeedbackMessage } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { useCallback, useEffect, useRef, useState } from "react";
import { providers, providerId } from "../../lib/ai/schema";
import { Button } from "../ui/button";
import { HelpDisclosure } from "../ui/help-disclosure";
const configList = z.array(
  z.object({
    provider: providerId,
    model: z.string(),
    version: z.number().int().positive(),
    configured: z.boolean(),
    consent: z.boolean(),
    enabled: z.boolean(),
    tested: z.boolean(),
    daily_limit: z.number().int().min(1).max(1000),
    last_tested_at: z.iso.datetime({ offset: true }).nullable(),
    used_today: z.number().int().nonnegative(),
    failed_today: z.number().int().nonnegative(),
  }),
);
type Config = z.infer<typeof configList>[number];
const endpoint = "/api/ai/providers";
const catalog: Record<string, string> = {
  openai: "https://developers.openai.com/api/docs/models",
  anthropic: "https://platform.claude.com/docs/en/models/overview",
  google: "https://ai.google.dev/gemini-api/docs/models",
  deepseek: "https://api-docs.deepseek.com",
  mistral: "https://docs.mistral.ai",
  groq: "https://console.groq.com/docs/models",
  xai: "https://docs.x.ai",
  openrouter: "https://openrouter.ai/models",
};
export function AISettings() {
  const [rows, setRows] = useState<Config[]>([]),
    [provider, setProvider] = useState("openai"),
    [model, setModel] = useState(""),
    [key, setKey] = useState(""),
    [consent, setConsent] = useState(false),
    [limit, setLimit] = useState(100),
    [message, setMessage] = useState(""),
    [tone, setTone] = useState<"info" | "success" | "error">("info"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    read = useRef<AbortController | null>(null);
  const selected = rows.find((r) => r.provider === provider);
  const dirty =
    model !== (selected?.model || "") ||
    !!key ||
    consent !== (selected?.consent || false) ||
    limit !== (selected?.daily_limit || 100);
  function populate(p: string, data: Config[]) {
    const c = data.find((r) => r.provider === p);
    setProvider(p);
    setModel(c?.model || "");
    setKey("");
    setConsent(c?.consent || false);
    setLimit(c?.daily_limit || 100);
  }
  const load = useCallback(async (current = "openai") => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const data = await clientRequest(
        endpoint,
        undefined,
        configList,
        controller,
      );
      if (read.current === controller) {
        setRows(data);
        populate(current, data);
      }
      return true;
    } catch {
      if (read.current === controller) setFailed(true);
      return false;
    } finally {
      if (read.current === controller) {
        read.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
      const controller = read.current;
      read.current = null;
      controller?.abort();
    };
  }, [load]);
  async function act(action: "save" | "test" | "activate" | "disable") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const current = provider;
    try {
      const input =
        action === "save"
          ? {
              action,
              provider: current,
              model,
              version: selected?.version || 0,
              consent,
              daily_limit: limit,
              ...(key ? { api_key: key } : {}),
            }
          : action === "test"
            ? { action, provider: current }
            : { action, provider: current, version: selected?.version };
      const receipt =
        action === "test"
          ? z.object({ ok: z.literal(true) })
          : z.object({ saved: z.literal(true) });
      await clientRequest<unknown>(endpoint, input, receipt, new AbortController(), {
        mutation: true,
        uncertainMessage:
          "Hasil tindakan belum dapat dipastikan. Muat ulang konfigurasi sebelum mencoba lagi.",
      });
      if (!live.current) return;
      setKey("");
      const refreshed = await load(current);
      if (!live.current) return;
      setTone("success");
      const success =
        action === "test"
          ? "Koneksi berhasil diuji. Pilih Aktifkan untuk mulai menggunakannya."
          : action === "activate"
            ? "Penyedia aktif untuk penilai."
            : action === "disable"
              ? "Penyedia dinonaktifkan. Riwayat saran dipertahankan."
              : "Konfigurasi tersimpan. Uji koneksi sebelum mengaktifkan.";
      setMessage(
        refreshed ? success : success + " Status terbaru belum dapat dimuat.",
      );
    } catch (e) {
      if (live.current) {
        setTone("error");
        setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
      }
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function switchProvider(p: string) {
    if (dirty && !confirm("Abaikan perubahan yang belum disimpan?")) return;
    populate(p, rows);
    setMessage("");
  }
  return (
    <section className="panel stack">
      <div className="actions">
        <h2>Penyedia AI</h2>
        <Button
          type="button"
          variant="outline"
          disabled={busy || loading}
          onClick={() => {
            if (!dirty || confirm("Muat ulang dan abaikan perubahan?")) {
              setMessage("");
              void load(provider);
            }
          }}
        >
          Muat ulang
        </Button>
      </div>
      <p>Pilih penyedia → simpan konfigurasi → uji koneksi → aktifkan.</p>
      <FeedbackMessage tone={tone}>{message}</FeedbackMessage>
      {loading ? (
        <FeedbackMessage tone="loading" role="status">
          Memuat konfigurasi AI…
        </FeedbackMessage>
      ) : failed ? (
        <p>
          Konfigurasi belum tersedia. Gunakan Muat ulang untuk mencoba kembali.
        </p>
      ) : (
        <>
          <div className="ai-provider-grid" aria-label="Status penyedia">
            {Object.entries(providers).map(([id, label]) => {
              const c = rows.find((r) => r.provider === id);
              return (
                <button
                  type="button"
                  className="ai-provider-card"
                  key={id}
                  aria-pressed={provider === id}
                  disabled={busy}
                  onClick={() => switchProvider(id)}
                >
                  <strong>{label}</strong>
                  <span>
                    {c?.enabled
                      ? "Aktif"
                      : c?.configured
                        ? "Nonaktif"
                        : "Belum dikonfigurasi"}
                  </span>
                  <small>{c?.model || "Model belum dipilih"}</small>
                </button>
              );
            })}
          </div>
          <ValidatedForm
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act("save");
            }}
          >
            <fieldset disabled={busy} className="stack">
              <legend>{providers[provider as keyof typeof providers]}</legend>
              <div className="form-grid">
                <label>
                  ID model
                  <input
                    required
                    maxLength={150}
                    pattern={String.raw`[a-zA-Z0-9_.\/:\-]+`}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    required={!selected?.configured}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={5000}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={
                      selected?.configured
                        ? "Tersimpan; kosongkan untuk mempertahankan"
                        : "Masukkan API key"
                    }
                  />
                </label>
                <label>
                  Batas esai per hari (UTC)
                  <input
                    required
                    type="number"
                    min={1}
                    max={1000}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                  />
                </label>
              </div>
              <p>
                Status: {selected?.enabled ? "Aktif" : "Nonaktif"} ·{" "}
                {selected?.configured ? "Key tersimpan" : "Belum ada key"} ·{" "}
                {selected?.tested ? "Konfigurasi teruji" : "Perlu uji koneksi"}
              </p>
              <a href={catalog[provider]} target="_blank" rel="noreferrer">
                Lihat model pada dokumentasi penyedia
              </a>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Izinkan teks soal, rubrik dan jawaban dikirim ke penyedia ini.
              </label>
              <HelpDisclosure title="Keamanan dan uji koneksi">
                <p>
                  API key tidak ditampilkan kembali. Penggantian model/key atau
                  penyimpanan konfigurasi menonaktifkan penyedia sampai diuji
                  dan diaktifkan kembali. Nonaktifkan penyedia sebelum menguji
                  ulang. Uji memakai contoh soal dan dapat memakai kuota API.
                </p>
              </HelpDisclosure>
              <div className="actions">
                <Button disabled={busy || !dirty}>
                  {busy ? "Memproses…" : "Simpan konfigurasi"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy || dirty || !selected?.configured || selected?.enabled
                  }
                  onClick={() => void act("test")}
                >
                  Uji koneksi tersimpan
                </Button>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    dirty ||
                    !selected?.tested ||
                    !selected?.consent ||
                    selected?.enabled
                  }
                  onClick={() => void act("activate")}
                >
                  Aktifkan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || dirty || !selected?.enabled}
                  onClick={() => void act("disable")}
                >
                  Nonaktifkan
                </Button>
              </div>
            </fieldset>
          </ValidatedForm>
          <section className="stack" aria-label="Pemakaian penyedia">
            <h3>Pemakaian hari ini</h3>
            <p>
              {selected
                ? `${selected.used_today ?? 0} / ${selected.daily_limit} esai diminta · ${selected.failed_today ?? 0} gagal`
                : "Belum ada konfigurasi."}
            </p>
            <p>
              Uji koneksi berhasil terakhir:{" "}
              {selected?.last_tested_at
                ? new Date(selected.last_tested_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  }) + " WIB"
                : "Belum tercatat"}
              .
            </p>
            <p className="muted">
              Batas harian adalah jumlah esai, bukan batas biaya. Permintaan
              gagal ikut dihitung; uji koneksi memakai batas tersendiri. Biaya
              dan token tetap diperiksa pada dashboard penyedia.
            </p>
          </section>
        </>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { clientRequest } from "../../lib/client/request";
import {
  integrityProfile,
  policyConfig,
  policySave,
  profiles,
  type PolicyConfig,
} from "../../lib/operations/exam-policy";
import { Button } from "../ui/button";

const url = "/api/exam-integrity";
const localTime = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});
export function IntegrityPolicy({ exam }: { exam: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="panel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Kebijakan integritas ujian</summary>
      {open && <PolicyForm exam={exam} />}
    </details>
  );
}

function PolicyForm({ exam }: { exam: string }) {
  const [config, setConfig] = useState<PolicyConfig>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [student, setStudent] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void clientRequest(
      url + "?action=config&exam=" + exam,
      undefined,
      policyConfig,
      controller,
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setConfig(data);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Konfigurasi belum dapat dimuat.",
          );
      });
    return () => controller.abort();
  }, [exam, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || busy || !config.editable) return;
    setError("");
    setNotice("");
    const input = policySave.safeParse({
      ...config,
      action: "save",
      exam_id: exam,
    });
    if (!input.success) {
      setError(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      setConfig(
        await clientRequest(
          url,
          input.data,
          policyConfig,
          new AbortController(),
          { mutation: true },
        ),
      );
      setNotice("Kebijakan integritas tersimpan.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kebijakan belum dapat disimpan.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!config)
    return error ? (
      <div className="stack" role="alert">
        <p>{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            setError("");
            setRevision((n) => n + 1);
          }}
        >
          Muat ulang
        </Button>
      </div>
    ) : (
      <p role="status">Memuat kebijakan…</p>
    );
  const names = new Map(config.students.map((p) => [p.id, p.name]));
  return (
    <form className="stack" onSubmit={(event) => void save(event)}>
      {!config.editable && (
        <p>
          Kebijakan dikunci setelah ujian keluar dari draf atau memiliki
          attempt.
        </p>
      )}
      <fieldset className="stack" disabled={busy || !config.editable}>
        <label>
          Profil ujian
          <select
            value={config.profile}
            onChange={(event) => {
              const profile = integrityProfile.parse(event.target.value);
              setConfig({
                ...config,
                profile,
                focus_ms: profile === "strict" ? 1000 : 1500,
                hidden_seconds: profile === "strict" ? 5 : 10,
                fullscreen_review: profile === "strict",
              });
            }}
          >
            {Object.entries(profiles).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Latihan mencatat tanpa menandai perubahan fokus. Standar menandai
          perubahan fokus mulai 1,5 detik. Ketat memakai ambang 1 detik dan
          mewajibkan persetujuan pengawas saat pindah perangkat.
        </p>
        {config.profile !== "practice" && (
          <fieldset className="stack">
            <legend>Sinyal untuk ditinjau pengawas</legend>
            <label>
              Durasi kehilangan fokus (detik)
              <input
                type="number"
                min={0.5}
                max={60}
                step={0.1}
                required
                value={config.focus_ms ? config.focus_ms / 1000 : ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    focus_ms: Math.round(Number(event.target.value) * 1000),
                  })
                }
              />
            </label>
            <label>
              Halaman masih tersembunyi setelah (detik)
              <input
                type="number"
                min={2}
                max={120}
                step={1}
                required
                value={config.hidden_seconds || ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    hidden_seconds: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={config.fullscreen_review}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    fullscreen_review: event.target.checked,
                  })
                }
              />{" "}
              Tandai saat keluar dari layar penuh
            </label>
          </fieldset>
        )}
        <fieldset className="stack">
          <legend>Paket soal setara</legend>
          <p>
            Susun dua atau tiga paket untuk ujian ini di Bank Soal dengan
            kisi-kisi yang sama. Kosongkan pilihan untuk memakai seluruh soal
            aktif.
          </p>
          {!config.available_packs.length && (
            <p>Belum ada paket siap dipilih.</p>
          )}
          {config.available_packs.map((pack, index) => (
            <label key={pack.id}>
              <input
                type="checkbox"
                checked={config.packs.includes(pack.id)}
                disabled={
                  !config.packs.includes(pack.id) && config.packs.length >= 3
                }
                onChange={(event) =>
                  setConfig({
                    ...config,
                    packs: event.target.checked
                      ? [...config.packs, pack.id]
                      : config.packs.filter((id) => id !== pack.id),
                  })
                }
              />{" "}
              Paket {index + 1} · {pack.count} soal ·{" "}
              {localTime.format(new Date(pack.created_at))} WIB
            </label>
          ))}
          {config.packs.some(
            (id) => !config.available_packs.some((pack) => pack.id === id),
          ) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfig({ ...config, packs: [] })}
            >
              Hapus pilihan paket yang berubah
            </Button>
          )}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={config.watermark}
            onChange={(event) =>
              setConfig({ ...config, watermark: event.target.checked })
            }
          />{" "}
          Tampilkan kode sesi pada soal
        </label>
        <fieldset className="stack">
          <legend>Pengecualian aksesibilitas untuk penandaan fokus</legend>
          <label>
            Peserta
            <select
              value={student}
              onChange={(event) => setStudent(event.target.value)}
            >
              <option value="">Pilih peserta</option>
              {config.students
                .filter((p) => !config.accommodations.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!student}
            onClick={() => {
              setConfig({
                ...config,
                accommodations: [...config.accommodations, student],
              });
              setStudent("");
            }}
          >
            Tambahkan pengecualian
          </Button>
          {config.accommodations.map((id) => (
            <div className="actions" key={id}>
              <span>{names.get(id) ?? "Peserta tidak tersedia"}</span>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setConfig({
                    ...config,
                    accommodations: config.accommodations.filter(
                      (value) => value !== id,
                    ),
                  })
                }
              >
                Hapus pengecualian
              </Button>
            </div>
          ))}
        </fieldset>
        <div>
          <Button type="submit" disabled={busy}>
            Simpan kebijakan
          </Button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}

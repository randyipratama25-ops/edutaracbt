"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { z } from "zod";
import { ListFilters, SearchField } from "../ui/list-filters";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import {
  allowedMediaTypes,
  mediaListSchema,
  cleanupListSchema,
  signedMediaSchema,
  mediaWriteSchema,
  driveListSchema,
  fileProblem,
  type MediaRow as Media,
} from "../../lib/operations/media-contracts";
export function MediaPanel({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<Media[]>([]),
    [totalMedia, setTotalMedia] = useState(0),
    [mediaPage, setMediaPage] = useState(1),
    [view, setView] = useState("gallery"),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [listError, setListError] = useState(""),
    [cleanupError, setCleanupError] = useState(""),
    [cleanup, setCleanup] = useState<z.infer<typeof cleanupListSchema>>([]);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [target, setTarget] = useState<Media | null>(null),
    [uncertain, setUncertain] = useState(false),
    [dragging, setDragging] = useState(false);
  const [drive, setDrive] = useState<z.infer<typeof driveListSchema>["files"]>(
      [],
    ),
    [folder, setFolder] = useState(""),
    [driveToken, setDriveToken] = useState(""),
    [driveSelected, setDriveSelected] = useState<string[]>([]);
  const mounted = useRef(true),
    sequence = useRef(0),
    controllers = useRef(new Set<AbortController>()),
    readController = useRef<AbortController | null>(null),
    lock = useRef(false),
    flight = useRef<{ seq: number; promise: Promise<void> } | null>(null);
  const request = useCallback(async function request<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    controller = new AbortController(),
    timeoutMs?: number,
  ) {
    if (!mounted.current) throw Error("Permintaan dibatalkan.");
    controllers.current.add(controller);
    try {
      const value = await clientRequest(url, input, schema, controller, {
        mutation:
          !!input &&
          !(
            url === "/api/media/drive" &&
            "action" in input &&
            input.action === "list"
          ),
        timeoutMs,
      });
      if (!mounted.current) throw Error("Permintaan dibatalkan.");
      return value;
    } finally {
      controllers.current.delete(controller);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current,
      seq = sequence;
    return () => {
      mounted.current = false;
      seq.current++;
      active.forEach((c) => c.abort());
    };
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++;
    readController.current?.abort();
    flight.current = null;
  }, []);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    if (flight.current?.seq === sequence.current) return flight.current.promise;
    const seq = ++sequence.current,
      c = new AbortController();
    readController.current = c;
    setLoading(true);
    setListError("");
    const promise = (async () => {
      const [list, pending] = await Promise.allSettled([
        request(
          "/api/media/manage?page=" +
            mediaPage +
            "&mime=" +
            encodeURIComponent(filter) +
            "&search=" +
            encodeURIComponent(search.trim()),
          undefined,
          mediaListSchema,
          c,
        ),
        request("/api/media/manage?cleanup=1", undefined, cleanupListSchema, c),
      ]);
      if (!mounted.current || seq !== sequence.current) return;
      let clamped = false;
      if (list.status === "fulfilled") {
        const last = Math.max(1, Math.ceil(list.value.total / 50));
        if (mediaPage > last) {
          clamped = true;
          setRows([]);
          setMediaPage(last);
        } else setRows(list.value.rows);
        setTotalMedia(list.value.total);
        setUncertain(false);
      } else {
        setRows([]);
        setListError(
          list.reason instanceof Error
            ? list.reason.message
            : "Media belum dapat dimuat.",
        );
      }
      if (pending.status === "fulfilled") {
        setCleanup(pending.value);
        setCleanupError("");
      } else
        setCleanupError(
          "Daftar pembersihan belum dapat dimuat. Muat ulang untuk mencoba lagi.",
        );
      setLoading(clamped);
      flight.current = null;
    })();
    flight.current = { seq, promise };
    return promise;
  }, [mediaPage, filter, search, request]);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load(), 250);
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [load, invalidate]);
  function changeFilter(update: () => void) {
    invalidate();
    setRows([]);
    setLoading(true);
    setListError("");
    update();
    setMediaPage(1);
  }
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      if (mounted.current) {
        setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
        if (e instanceof ClientRequestError && e.uncertain) setUncertain(true);
      }
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        setProgress("");
      }
    }
  }
  async function upload(files: File[]) {
    if (!files.length || lock.current || target) return;
    if (files.length > 25) {
      setMessage("Maksimal 25 file per batch.");
      return;
    }
    await run(async () => {
      let success = 0;
      const errors: string[] = [];
      for (let i = 0; i < files.length && mounted.current; i++) {
        const f = files[i],
          problem = fileProblem(f);
        setProgress(`Mengunggah ${i + 1} / ${files.length}`);
        if (problem) {
          errors.push(`${f.name}: ${problem}`);
          continue;
        }
        const c = new AbortController();
        controllers.current.add(c);
        const form = new FormData();
        form.set("file", f);
        let rejected = false;
        try {
          const r = await fetch("/api/authoring/media", {
            method: "POST",
            body: form,
            signal: AbortSignal.any([c.signal, AbortSignal.timeout(35000)]),
          });
          const j = await r.json();
          if (!r.ok || j?.success !== true) {
            if (r.status >= 500)
              throw new ClientRequestError(
                "Hasil unggah belum dapat dipastikan. Periksa daftar media sebelum mencoba lagi.",
                true,
              );
            rejected = true;
            throw Error(j?.error?.message || "Unggah ditolak.");
          }
          z.object({ id: z.uuid() }).parse(j.data);
          success++;
        } catch (e) {
          const unknown = !rejected;
          errors.push(
            `${f.name}: ${unknown ? "Hasil unggah belum pasti; periksa daftar sebelum mengirim ulang." : e instanceof Error ? e.message : "Gagal."}`,
          );
          if (unknown) {
            if (mounted.current) setUncertain(true);
            break;
          }
        } finally {
          controllers.current.delete(c);
        }
      }
      if (!mounted.current) return;
      setMessage(`${success}/${files.length} berhasil. ${errors.join("; ")}`);
      invalidate();
      await load();
    });
  }
  async function remove() {
    if (!target) return;
    const id = target.id;
    await run(async () => {
      const d = await request(
        "/api/media/manage",
        { action: "delete", id },
        mediaWriteSchema,
      );
      setTarget(null);
      setMessage(d.message);
      invalidate();
      await load();
    });
  }
  async function copy(value: string, success = "ID media disalin.") {
    try {
      if (!navigator.clipboard?.writeText) throw Error("clipboard");
      await navigator.clipboard.writeText(value);
      if (mounted.current) setMessage(success);
    } catch {
      if (mounted.current)
        setMessage("Clipboard tidak tersedia. Salin ID media secara manual.");
    }
  }
  async function copyURL(m: Media) {
    await run(async () => {
      const d = await request(
        "/api/authoring/media?id=" + m.id,
        undefined,
        signedMediaSchema,
      );
      await copy(d.url, "URL privat disalin; berlaku 60 detik.");
    });
  }
  async function listDrive(more = false) {
    await run(async () => {
      const d = await request(
        "/api/media/drive",
        { action: "list", ...(more ? { page_token: driveToken } : {}) },
        driveListSchema,
      );
      setDrive((prev) =>
        more && folder === d.folder
          ? [
              ...prev,
              ...d.files.filter((f) => !prev.some((p) => p.id === f.id)),
            ]
          : d.files,
      );
      setFolder(d.folder);
      setDriveToken(d.next_page_token);
      if (!more) setDriveSelected([]);
    });
  }
  const shown = loading || listError ? [] : rows;
  const actions = (m: Media) => (
    <div className="actions">
      <Button variant="outline" onClick={() => void copy(m.id)}>
        Salin ID
      </Button>
      <Button variant="outline" onClick={() => void copyURL(m)}>
        Salin URL 60 detik
      </Button>
      <Button
        variant="outline"
        disabled={m.referenced || uncertain}
        onClick={() => {
          if (lock.current) return;
          setMessage("");
          setTarget(m);
        }}
      >
        Hapus
      </Button>
    </div>
  );
  return (
    <section
      className="panel stack media-page"
      aria-label="Pustaka media soal"
      aria-busy={busy}
    >
      <fieldset className="media-controls stack" disabled={busy || !!target}>
        <div
          className={"ops-drop" + (dragging ? " media-dragging" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            if (!lock.current && !target) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!lock.current && !target)
              void upload(Array.from(e.dataTransfer.files));
          }}
        >
          <label>
            Unggah gambar atau audio
            <input
              type="file"
              accept={allowedMediaTypes.join(",")}
              multiple
              aria-describedby="media-upload-help"
              disabled={uncertain}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                void upload(files);
              }}
            />
          </label>
          <p id="media-upload-help" className="muted">
            Tarik berkas ke sini atau pilih dari perangkat. Maksimal 25 berkas
            per batch, 5 MiB per berkas.
          </p>
        </div>
        <p role="status" aria-live="polite" hidden={!progress&&!message}>
          {progress} {message}
        </p>
        <ListFilters
          label="media soal"
          active={
            [search && "Pencarian", filter && "Tipe"].filter(
              Boolean,
            ) as string[]
          }
          total={listError ? undefined : totalMedia}
          loading={loading}
          error={listError}
          onReset={() =>
            changeFilter(() => {
              setSearch("");
              setFilter("");
            })
          }
        >
          <SearchField
            label="Cari ID atau path media"
            value={search}
            maxLength={100}
            onChange={(value) => changeFilter(() => setSearch(value))}
          />
          <label>
            Tampilan
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="gallery">Galeri</option>
              <option value="table">Tabel</option>
            </select>
          </label>
          <label>
            Tipe
            <select
              value={filter}
              onChange={(e) => changeFilter(() => setFilter(e.target.value))}
            >
              <option value="">Semua</option>
              <option value="image/">Gambar</option>
              <option value="audio/">Audio</option>
            </select>
          </label>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            Muat ulang
          </Button>
        </ListFilters>
        {uncertain && (
          <p className="notice">
            Periksa daftar media dan pembersihan sebelum mencoba perubahan lagi.
            Muat ulang untuk memeriksa status terbaru.
          </p>
        )}
        <nav className="actions media-pagination" aria-label="Halaman media">
          <Button
            variant="outline"
            disabled={mediaPage <= 1 || loading || !!listError}
            onClick={() => {
              invalidate();
              setRows([]);
              setLoading(true);
              setMediaPage(mediaPage - 1);
            }}
          >
            Sebelumnya
          </Button>
          <span>
            {listError
              ? "Data belum tersedia"
              : `${totalMedia} media · halaman ${mediaPage} / ${Math.max(1, Math.ceil(totalMedia / 50))}`}
          </span>
          <Button
            variant="outline"
            disabled={mediaPage * 50 >= totalMedia || loading || !!listError}
            onClick={() => {
              invalidate();
              setRows([]);
              setLoading(true);
              setMediaPage(mediaPage + 1);
            }}
          >
            Berikutnya
          </Button>
        </nav>
        {view === "table" ? (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Tabel media soal; geser untuk melihat kolom lain"
          >
            <table>
              <thead>
                <tr>
                  <th>Media ID / path</th>
                  <th>Tipe</th>
                  <th>Ukuran</th>
                  <th>Referensi</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <code>{m.id}</code>
                      <small>{m.object_path}</small>
                    </th>
                    <td>{m.mime_type}</td>
                    <td>{(m.byte_size / 1024).toFixed(1)} KiB</td>
                    <td>{m.referenced ? "Dilindungi" : "Belum dipakai"}</td>
                    <td>{actions(m)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ops-gallery">
            {shown.map((m) => (
              <article className="panel stack media-card" key={m.id}>
                <MediaPreview media={m} />
                <small>
                  {m.mime_type} · {(m.byte_size / 1024).toFixed(1)} KiB
                </small>
                <code>{m.id}</code>
                <details>
                  <summary>Path berkas</summary>
                  <code>{m.object_path}</code>
                </details>
                <p className={m.referenced ? "media-protected" : "muted"}>
                  {m.referenced
                    ? "Dipakai soal/laporan · dilindungi"
                    : "Belum dirujuk"}
                </p>
                {actions(m)}
              </article>
            ))}
          </div>
        )}
        {!loading && !listError && !shown.length && (
          <div className="empty-state">
            <h2>Belum ada media yang cocok</h2>
            <p>Unggah berkas atau ubah pencarian dan filter.</p>
          </div>
        )}
        {cleanupError && <p role="alert">{cleanupError}</p>}
        {!!cleanup.length && (
          <details>
            <summary>Pembersihan tertunda ({cleanup.length})</summary>
            <ul className="media-cleanup-list">
              {cleanup.map((c) => (
                <li key={c.id}>
                  <code>{c.path}</code>
                  <Button
                    disabled={uncertain}
                    onClick={() =>
                      void run(async () => {
                        const d = await request(
                          "/api/media/manage",
                          { action: "cleanup", id: c.id },
                          mediaWriteSchema,
                        );
                        setMessage(d.message);
                        invalidate();
                        await load();
                      })
                    }
                  >
                    Coba bersihkan
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {admin && (
          <details className="media-drive">
            <summary>Impor folder Google Drive (Admin)</summary>
            <p className="muted">
              Folder dan akses baca dikonfigurasi di server. Unggah lokal tetap
              dapat digunakan bila Drive belum tersedia.
            </p>
            <div className="actions">
              <Button variant="outline" onClick={() => void listDrive()}>
                Baca folder berizin
              </Button>
              <Button
                variant="outline"
                disabled={!driveToken}
                onClick={() => void listDrive(true)}
              >
                Muat file berikutnya
              </Button>
              <Button
                disabled={!driveSelected.length || uncertain}
                onClick={() =>
                  void run(async () => {
                    setProgress("Mengimpor berkas Drive…");
                    const d = await request(
                      "/api/media/drive",
                      { action: "import", ids: driveSelected, folder },
                      z.object({ message: z.string().min(1) }),
                      undefined,
                      290000,
                    );
                    setMessage(d.message);
                    setDriveSelected([]);
                    invalidate();
                    await load();
                  })
                }
              >
                Impor pilihan ({driveSelected.length} / 25)
              </Button>
            </div>
            <div className="ops-choice-list">
              {drive.map((f) => (
                <label className="check" key={f.id}>
                  <input
                    type="checkbox"
                    checked={driveSelected.includes(f.id)}
                    disabled={
                      !driveSelected.includes(f.id) &&
                      driveSelected.length >= 25
                    }
                    onChange={(e) =>
                      setDriveSelected((prev) =>
                        e.target.checked
                          ? [...new Set([...prev, f.id])].slice(0, 25)
                          : prev.filter((id) => id !== f.id),
                      )
                    }
                  />
                  <span>
                    {f.name} · {f.mimeType} ·{" "}
                    {(Number(f.size) / 1024).toFixed(1)} KiB
                  </span>
                </label>
              ))}
            </div>
          </details>
        )}
      </fieldset>
      <Dialog
        open={!!target}
        onOpenChange={(v) => {
          if (!v && !lock.current) {
            setTarget(null);
            setMessage("");
            void load();
          }
        }}
        title="Hapus media"
        description="Server menolak media yang dipakai soal, bank soal, snapshot, logo atau laporan."
      >
        <p>
          Hapus <code>{target?.id}</code>?
        </p>
        <p className="muted">
          Berkas yang gagal dibersihkan tetap tercatat untuk dicoba kembali.
        </p>
        <Button disabled={busy || uncertain} onClick={() => void remove()}>
          {busy ? "Menghapus…" : "Hapus permanen"}
        </Button>
        <p role="status">{message}</p>
        {uncertain && (
          <Button
            variant="outline"
            onClick={() => {
              if (lock.current) return;
              setTarget(null);
              void load();
            }}
          >
            Tutup dan periksa ulang
          </Button>
        )}
      </Dialog>
    </section>
  );
}
function MediaPreview({ media }: { media: Media }) {
  const audio = useRef<HTMLAudioElement | null>(null),
    position = useRef(0),
    restoring = useRef(false);
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true,
      running = false;
    const c = new AbortController();
    setUrl("");
    setError("");
    const load = async (force = false) => {
      if (
        !active ||
        running ||
        (audio.current &&
          !force &&
          ((!audio.current.paused && !audio.current.ended) ||
            audio.current.currentTime > 0))
      )
        return;
      running = true;
      try {
        const d = await clientRequest(
          "/api/authoring/media?id=" + media.id,
          undefined,
          signedMediaSchema,
          c,
        );
        if (active) {
          if (
            !force &&
            audio.current &&
            ((!audio.current.paused && !audio.current.ended) ||
              audio.current.currentTime > 0)
          )
            return;
          if (audio.current) position.current = audio.current.currentTime;
          restoring.current = true;
          setUrl(d.url);
          setError("");
        }
      } catch {
        if (active) setError("Pratinjau belum dapat dimuat. Coba kembali.");
      } finally {
        running = false;
      }
    };
    void load(true);
    const timer = setInterval(() => void load(), 50000);
    return () => {
      active = false;
      clearInterval(timer);
      c.abort();
    };
  }, [media.id, retry]);
  return (
    <div className="media-preview">
      {error ? (
        <div role="status">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            Coba pratinjau
          </Button>
        </div>
      ) : !url ? (
        <p role="status">Memuat pratinjau…</p>
      ) : media.mime_type.startsWith("image/") ? (
        <Image
          src={url}
          alt={"Media " + media.id}
          width={400}
          height={240}
          unoptimized
          onError={() =>
            setError("Gambar belum dapat ditampilkan. Coba pratinjau kembali.")
          }
          style={{ width: "100%", height: 180, objectFit: "contain" }}
        />
      ) : (
        <audio
          ref={audio}
          onPause={(e) => {
            if (!restoring.current && e.currentTarget.readyState >= 1)
              position.current = e.currentTarget.currentTime;
          }}
          onTimeUpdate={(e) => {
            if (!restoring.current && e.currentTarget.readyState >= 1)
              position.current = e.currentTarget.currentTime;
          }}
          onLoadedMetadata={(e) => {
            if (
              position.current > 0 &&
              Number.isFinite(e.currentTarget.duration)
            )
              e.currentTarget.currentTime = Math.min(
                position.current,
                e.currentTarget.duration,
              );
            restoring.current = false;
          }}
          controls
          preload="metadata"
          src={url}
          aria-label={"Audio " + media.id}
          onError={() =>
            setError("Audio belum dapat diputar. Coba pratinjau kembali.")
          }
        />
      )}
    </div>
  );
}

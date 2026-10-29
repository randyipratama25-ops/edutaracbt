"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { api } from "./shared";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
type Media = {
  id: string;
  object_path: string;
  mime_type: string;
  byte_size: number;
  referenced: boolean;
};
export function MediaPanel() {
  const [rows, setRows] = useState<Media[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [mediaPage, setMediaPage] = useState(1),
    [totalMedia, setTotalMedia] = useState(0),
    [view, setView] = useState("gallery"),
    [filter, setFilter] = useState(""),
    [target, setTarget] = useState<Media | null>(null),
    [progress, setProgress] = useState(""),
    [drive, setDrive] = useState<
      { id: string; name: string; mimeType: string; size: string }[]
    >([]),
    [cleanup, setCleanup] = useState<{ id: string; path: string }[]>([]),
    [driveToken, setDriveToken] = useState(""),
    [folder, setFolder] = useState(""),
    [driveSelected, setDriveSelected] = useState<string[]>([]);
  const load = useCallback(async () => {
    try {
      const [rows, pending] = await Promise.all([
        api<{ rows: Media[]; total: number }>(
          "/api/media/manage?page=" +
            mediaPage +
            "&mime=" +
            encodeURIComponent(filter),
        ),
        api<{ id: string; path: string }[]>("/api/media/manage?cleanup=1"),
      ]);
      setRows(rows.rows);
      setTotalMedia(rows.total);
      setCleanup(pending);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Media gagal dimuat.");
    }
  }, [mediaPage, filter]);
  useEffect(() => {
    void load();
  }, [load]);
  async function upload(files: File[]) {
    if (busy) return;
    if (files.length > 25) {
      setMessage("Maksimal 25 file per batch.");
      return;
    }
    setBusy(true);
    let success = 0;
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress(`${i + 1}/${files.length}`);
      const form = new FormData();
      form.set("file", files[i]);
      try {
        const r = await fetch("/api/authoring/media", {
          method: "POST",
          body: form,
        });
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        success++;
      } catch (e) {
        errors.push(
          files[i].name + ": " + (e instanceof Error ? e.message : "Gagal"),
        );
      }
    }
    setMessage(`${success}/${files.length} berhasil. ${errors.join("; ")}`);
    setBusy(false);
    setProgress("");
    await load();
  }
  async function remove() {
    if (!target) return;
    setBusy(true);
    try {
      const r = await api<{ message: string }>("/api/media/manage", {
        action: "delete",
        id: target.id,
      });
      setMessage(r.message);
      setTarget(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Penghapusan gagal.");
    } finally {
      setBusy(false);
    }
  }
  const shown = rows.filter((m) => !filter || m.mime_type.startsWith(filter));
  return (
    <section className="panel stack">
      <div
        className="ops-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <label>
          Tarik file ke sini atau pilih file (maks. 25 file/batch, 5 MiB/file)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav"
            multiple
            disabled={busy}
            onChange={(e) => {
              void upload(Array.from(e.target.files || []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p role="status">
        {progress} {message}
      </p>
      <div className="toolbar">
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
            onChange={(e) => {
              setFilter(e.target.value);
              setMediaPage(1);
            }}
          >
            <option value="">Semua</option>
            <option value="image/">Gambar</option>
            <option value="audio/">Audio</option>
          </select>
        </label>
        <Button variant="outline" onClick={() => void load()}>
          Muat ulang
        </Button>
      </div>
      <div className="actions">
        <Button
          variant="outline"
          disabled={mediaPage <= 1}
          onClick={() => setMediaPage(mediaPage - 1)}
        >
          Sebelumnya
        </Button>
        <span>
          {totalMedia} media · halaman {mediaPage}
        </span>
        <Button
          variant="outline"
          disabled={mediaPage * 50 >= totalMedia}
          onClick={() => setMediaPage(mediaPage + 1)}
        >
          Berikutnya
        </Button>
      </div>
      {view === "table" ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Media ID</th>
                <th>Tipe</th>
                <th>Ukuran</th>
                <th>Referensi</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td>
                    <code>{m.id}</code>
                  </td>
                  <td>{m.mime_type}</td>
                  <td>{(m.byte_size / 1024).toFixed(1)} KiB</td>
                  <td>{m.referenced ? "Dilindungi" : "Belum dipakai"}</td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="outline"
                        onClick={() =>
                          void api<{ url: string }>(
                            "/api/authoring/media?id=" + m.id,
                          )
                            .then((r) => navigator.clipboard.writeText(r.url))
                            .then(() =>
                              setMessage("URL privat 60 detik disalin."),
                            )
                            .catch((e) => setMessage(e.message))
                        }
                      >
                        Salin URL
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy || m.referenced}
                        onClick={() => setTarget(m)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ops-gallery">
          {shown.map((m) => (
            <article className="panel stack" key={m.id}>
              <MediaPreview media={m} />
              <small>
                {m.mime_type} · {(m.byte_size / 1024).toFixed(1)} KiB
              </small>
              <code>{m.id}</code>
              <p>
                {m.referenced
                  ? "Dipakai soal/laporan · dilindungi"
                  : "Belum dirujuk"}
              </p>
              <div className="actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(m.id)
                      .then(() => setMessage("ID lampiran disalin."))
                      .catch(() =>
                        setMessage(
                          "Clipboard tidak tersedia. Salin ID secara manual.",
                        ),
                      )
                  }
                >
                  Salin ID
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void api<{ url: string }>("/api/authoring/media?id=" + m.id)
                      .then((r) => navigator.clipboard.writeText(r.url))
                      .then(() =>
                        setMessage("URL privat disalin; berlaku 60 detik."),
                      )
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Salin URL 60 detik
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || m.referenced}
                  onClick={() => setTarget(m)}
                >
                  Hapus
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {!shown.length && <p>Belum ada media pada tipe ini.</p>}
      {cleanup.length > 0 && (
        <details>
          <summary>Pembersihan tertunda ({cleanup.length})</summary>
          {cleanup.map((c) => (
            <p key={c.id}>
              {c.path}
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void api<{ message: string }>("/api/media/manage", {
                    action: "cleanup",
                    id: c.id,
                  })
                    .then((d) => {
                      setMessage(d.message);
                      return load();
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Coba bersihkan
              </Button>
            </p>
          ))}
        </details>
      )}
      <details>
        <summary>Impor folder Google Drive (Admin)</summary>
        <p>
          Memakai folder dan kredensial baca-saja yang dikonfigurasi di server;
          akses Drive aplikasi belum diaktifkan jika konfigurasi belum tersedia.
        </p>
        <div className="actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void api<{
                files: typeof drive;
                folder: string;
                next_page_token: string;
              }>("/api/media/drive", { action: "list" })
                .then((d) => {
                  setDrive(d.files);
                  setFolder(d.folder);
                  setDriveToken(d.next_page_token || "");
                  setDriveSelected([]);
                })
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Baca folder berizin
          </Button>
          <Button
            variant="outline"
            disabled={busy || !driveToken}
            onClick={() => {
              setBusy(true);
              void api<{ files: typeof drive; next_page_token: string }>(
                "/api/media/drive",
                { action: "list", page_token: driveToken },
              )
                .then((d) => {
                  setDrive((prev) => [
                    ...prev,
                    ...d.files.filter((f) => !prev.some((p) => p.id === f.id)),
                  ]);
                  setDriveToken(d.next_page_token || "");
                })
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Muat file berikutnya
          </Button>
          <Button
            disabled={busy || !driveSelected.length}
            onClick={() => {
              setBusy(true);
              void api<{ message: string }>("/api/media/drive", {
                action: "import",
                ids: driveSelected,
                folder,
              })
                .then((d) => {
                  setMessage(d.message);
                  return load();
                })
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Impor pilihan (maks. 25)
          </Button>
        </div>
        {drive.map((f) => (
          <label key={f.id}>
            <input
              type="checkbox"
              checked={driveSelected.includes(f.id)}
              onChange={(e) =>
                setDriveSelected(
                  e.target.checked
                    ? [...driveSelected, f.id]
                    : driveSelected.filter((id) => id !== f.id),
                )
              }
            />
            {f.name} · {f.mimeType}
          </label>
        ))}
      </details>
      <Dialog
        open={!!target}
        onOpenChange={(v) => {
          if (!busy && !v) setTarget(null);
        }}
        title="Hapus media"
        description="Server menolak media yang masih dipakai soal, snapshot jawaban, logo atau laporan."
      >
        <p>Hapus {target?.id}?</p>
        <Button disabled={busy} onClick={() => void remove()}>
          Hapus permanen
        </Button>
        <p role="status">{message}</p>
      </Dialog>
    </section>
  );
}
function MediaPreview({ media }: { media: Media }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      void api<{ url: string }>("/api/authoring/media?id=" + media.id)
        .then((r) => {
          if (active) {
            setUrl(r.url);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const timer = setInterval(load, 50000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [media.id]);
  return error ? (
    <p>{error}</p>
  ) : !url ? (
    <p>Memuat pratinjau…</p>
  ) : media.mime_type.startsWith("image/") ? (
    <Image
      src={url}
      alt={"Media " + media.id}
      width={400}
      height={240}
      unoptimized
      style={{ width: "100%", height: 180, objectFit: "contain" }}
    />
  ) : (
    <audio
      controls
      preload="metadata"
      src={url}
      aria-label={"Audio " + media.id}
    />
  );
}

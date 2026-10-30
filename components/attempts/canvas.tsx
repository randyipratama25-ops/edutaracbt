"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { parseCanvasDraft, storeCanvasDraft } from "../../lib/attempts/recovery";
import { Button } from "../ui/button";
type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
};
export function EssayCanvas({
  writer,
  questionId,
  recoveryScope,
  savedId,
  onSaved,
  onDirty,
  disabled,
  canvasWidth = 1200,
  canvasHeight = 800,
}: {
  writer: { attempt_id: string; client_id: string; epoch: number };
  questionId: string;
  recoveryScope: string;
  savedId?: string;
  onSaved: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  disabled: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}) {
  const initialSavedId = useRef(savedId);
  const draftKey = `edutara:canvas:v1:${recoveryScope}:${writer.attempt_id}:${writer.client_id}:${writer.epoch}:${questionId}`;
  const [loading, setLoading] = useState(true);
  const [olderDrafts, setOlderDrafts] = useState<{ key: string; image: string; updatedAt: number }[]>([]);
  const [storageWarning, setStorageWarning] = useState("");
  function saveLocal(mediaId?: string) {
    try {
      const image = ref.current?.toDataURL("image/png");
      if (image) storeCanvasDraft(draftKey, image, mediaId);
    } catch { setStorageWarning("Draf canvas belum dapat disimpan di perangkat. Jangan muat ulang sebelum unggahan dan jawaban diakui server."); }
  }
  const ref = useRef<HTMLCanvasElement>(null),
    paths = useRef<Stroke[]>([]),
    base = useRef<HTMLImageElement | null>(null),
    drawing = useRef(false),
    gen = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    uploading = useRef(false);
  const [color, setColor] = useState("#142c32"),
    [width, setWidth] = useState(3),
    [message, setMessage] = useState("");
  function redraw() {
    const c = ref.current,
      ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (base.current) ctx.drawImage(base.current, 0, 0, c.width, c.height);
    for (const stroke of paths.current) {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.arc(p.x, p.y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.stroke();
    }
  }
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    redraw();
    async function restore() {
      try {
        let local: { image: string; mediaId?: string; updatedAt: number } | null = null;
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            local = parseCanvasDraft(raw);
          }
          if (local?.mediaId && local.mediaId === initialSavedId.current) {
            localStorage.removeItem(draftKey);
            local = null;
          }
        } catch { setStorageWarning("Draf canvas perangkat tidak tersedia."); }
        let src = local?.image;
        if (!src && initialSavedId.current) {
          const r = await fetch("/api/attempts/canvas?id=" + initialSavedId.current, { signal: AbortSignal.timeout(12000) });
          if (!r.ok) throw Error("Canvas lama belum dapat dimuat. Muat ulang status sebelum menggambar agar gambar lama tidak tertimpa.");
          url = URL.createObjectURL(await r.blob()); src = url;
        }
        if (src) {
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve(); img.onerror = () => reject(Error("Gambar canvas belum dapat dipulihkan.")); img.src = src!;
          });
          if (active) { base.current = img; redraw(); }
        }
        if (active) {
          if (local) { gen.current++; onDirty(true); setMessage("Draf canvas dipulihkan. Tekan Simpan untuk mengunggah dan menghubungkannya ke jawaban."); }
          setLoading(false);
        }
      } catch (e) { if (active) setMessage(e instanceof Error ? e.message : "Canvas gagal dimuat."); }
    }
    void restore();
    try {
      const prefix = `edutara:canvas:v1:${recoveryScope}:${writer.attempt_id}:`;
      const drafts = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key === draftKey || !key.startsWith(prefix) || !key.endsWith(`:${questionId}`)) continue;
        const d = parseCanvasDraft(localStorage.getItem(key));
        if (d && (!d.mediaId || d.mediaId !== initialSavedId.current)) drafts.push({ key, image: d.image, updatedAt: d.updatedAt });
      }
      setOlderDrafts(drafts.sort((a,b) => b.updatedAt-a.updatedAt).slice(0,3));
    } catch { /* Persistent device storage may be blocked. */ }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draftKey, onDirty, questionId, recoveryScope, writer.attempt_id]);
  async function upload() {
    if (disabled || loading || uploading.current) return;
    const canvas = ref.current;
    if (!canvas) return;
    uploading.current = true;
    const current = gen.current;
    setMessage("Mengunggah canvas utuh…");
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PNG gagal dibuat."))),
          "image/png",
        ),
      );
      if (blob.size > 5242880)
        throw Error(
          "Canvas melebihi 5 MiB. Tidak ada data yang dipotong; kurangi gambar sebelum menyimpan.",
        );
      const form = new FormData();
      form.set("file", blob, "answer.png");
      for (const [k, v] of Object.entries({
        ...writer,
        question_id: questionId,
      }))
        form.set(k, String(v));
      const r = await fetch("/api/attempts/canvas", {
        signal: AbortSignal.timeout(20000),
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      if (current === gen.current) {
        saveLocal(j.data.id);
        onSaved(j.data.id);
        onDirty(false);
        setMessage("Canvas tersimpan di Storage; menunggu pengakuan jawaban.");
      } else schedule();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unggah gagal.");
      onDirty(true);
    } finally {
      uploading.current = false;
    }
  }
  function schedule() {
    saveLocal();
    onDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void upload(), 1000);
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * e.currentTarget.width) / rect.width,
      y: ((e.clientY - rect.top) * e.currentTarget.height) / rect.height,
    };
  }
  return (
    <section className="stack">
      <div className="actions">
        <label>
          Warna pena
          <input
            type="color"
            value={color}
            disabled={disabled || loading}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <label>
          Ukuran pena
          <input
            type="range"
            min={1}
            max={20}
            value={width}
            disabled={disabled || loading}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => {
            paths.current.pop();
            gen.current++;
            redraw();
            schedule();
          }}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || loading}
          onClick={() => {
            paths.current = [];
            base.current = null;
            gen.current++;
            redraw();
            schedule();
          }}
        >
          Bersihkan canvas
        </Button>
      </div>
      {olderDrafts.length > 0 && <section className="notice">
        <p>Ada draf canvas dari tab/sesi sebelumnya. Memulihkan draf mengganti gambar editor; unggah sebelum melanjutkan.</p>
        {olderDrafts.map(d => <Button key={d.key} disabled={disabled || loading} variant="outline" onClick={() => {
          const img = new Image();
          img.onload = () => { base.current = img; paths.current = []; gen.current++; redraw(); saveLocal(); onDirty(true); setMessage("Draf canvas dipulihkan; simpan untuk mengunggah."); setOlderDrafts([]); };
          img.onerror = () => setMessage("Draf canvas belum dapat dimuat.");
          img.src = d.image;
        }}>Pulihkan canvas {new Date(d.updatedAt).toLocaleTimeString("id-ID")}</Button>)}
      </section>}
      <canvas
        ref={ref}
        width={canvasWidth}
        height={canvasHeight}
        className="essay-canvas"
        aria-label="Canvas jawaban esai; gunakan kotak teks sebagai alternatif yang dapat diakses"
        onPointerDown={(e) => {
          if (disabled || loading) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          paths.current.push({ color, width, points: [point(e)] });
          gen.current++;
          onDirty(true);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current || disabled || loading) return;
          paths.current.at(-1)?.points.push(point(e));
          gen.current++;
          redraw();
        }}
        onPointerUp={() => {
          if (drawing.current) {
            drawing.current = false;
            schedule();
          }
        }}
        onPointerCancel={() => {
          drawing.current = false;
          schedule();
        }}
      />
      <Button
        type="button"
        disabled={disabled || loading}
        variant="outline"
        onClick={() => void upload()}
      >
        Simpan / coba unggah canvas lagi
      </Button>
      <p role="status">{loading ? "Canvas belum siap. " : ""}{message}</p>
      {storageWarning && <p role="alert">{storageWarning}</p>}
    </section>
  );
}

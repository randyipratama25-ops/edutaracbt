"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "../ui/button";
type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
};
export function EssayCanvas({
  writer,
  questionId,
  savedId,
  onSaved,
  onDirty,
  disabled,
  canvasWidth = 1200,
  canvasHeight = 800,
}: {
  writer: { attempt_id: string; client_id: string; epoch: number };
  questionId: string;
  savedId?: string;
  onSaved: (id: string) => void;
  onDirty: (dirty: boolean) => void;
  disabled: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}) {
  const initialSavedId = useRef(savedId);
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
    if (initialSavedId.current)
      fetch("/api/attempts/canvas?id=" + initialSavedId.current)
        .then(async (r) => {
          if (!r.ok) throw Error("Canvas lama belum dapat dimuat.");
          url = URL.createObjectURL(await r.blob());
          const img = new Image();
          img.onload = () => {
            if (active) {
              base.current = img;
              redraw();
            }
            URL.revokeObjectURL(url!);
          };
          img.src = url;
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  async function upload() {
    if (disabled || uploading.current) return;
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
        method: "POST",
        body: form,
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      if (current === gen.current) {
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
            disabled={disabled}
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
            disabled={disabled}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
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
          disabled={disabled}
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
      <canvas
        ref={ref}
        width={canvasWidth}
        height={canvasHeight}
        className="essay-canvas"
        aria-label="Canvas jawaban esai; gunakan kotak teks sebagai alternatif yang dapat diakses"
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          paths.current.push({ color, width, points: [point(e)] });
          gen.current++;
          onDirty(true);
          redraw();
        }}
        onPointerMove={(e) => {
          if (!drawing.current || disabled) return;
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
        disabled={disabled}
        variant="outline"
        onClick={() => void upload()}
      >
        Simpan / coba unggah canvas lagi
      </Button>
      <p role="status">{message}</p>
    </section>
  );
}

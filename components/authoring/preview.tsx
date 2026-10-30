"use client";
import { useEffect, useState } from "react";
import katex from "katex";
import Image from "next/image";
import "katex/dist/katex.min.css";
import { Button } from "../ui/button";
import { safeHtml, type Question } from "../../lib/authoring/schema";
export function QuestionPreview({
  question: q,
  showKey = true,
  showOptions = true,
  showMeta = true,
  attachmentBaseUrl = "/api/authoring/media",
}: {
  question: Question;
  showKey?: boolean;
  showOptions?: boolean;
  showMeta?: boolean;
  attachmentBaseUrl?: string;
}) {
  const html = safeHtml(q.stem).replace(
    /\$\$([^$]+)\$\$|\$([^$]+)\$/g,
    (_, block, inline) =>
      katex.renderToString(block || inline, {
        displayMode: !!block,
        throwOnError: false,
        trust: false,
        strict: "warn",
      }),
  );
  return (
    <section className="question-preview" dir={q.direction}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {q.attachments.map((id) => (
        <Attachment key={id} id={id} baseUrl={attachmentBaseUrl} />
      ))}
      {showOptions && q.options.map((o, i) => (
        <p key={o.id}>
          <b>{o.id}.</b> {o.text}
          {showKey && q.type === "JODOH" ? ` → ${q.key[i]}` : ""}
        </p>
      ))}
      {showKey && (
        <>
          <p>
            <b>Kunci:</b> {q.key.join(", ") || "Penilaian manual"}
          </p>
          <p>
            <b>Rubrik:</b> {q.rubric || "—"}
          </p>
          <div dangerouslySetInnerHTML={{ __html: safeHtml(q.explanation) }} />
        </>
      )}
      {showMeta && <p className="muted">
        {q.points} poin · {q.required ? "Wajib" : "Opsional"}
        {q.type === "Esai" ? ` · minimal ${q.minChars} karakter` : ""}
      </p>}
    </section>
  );
}

function Attachment({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [media, setMedia] = useState<{ url: string; mime: string } | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMedia(null); setError("");
    fetch(baseUrl + "?id=" + encodeURIComponent(id), { signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok || !j.success || !j.data?.url) throw Error("Lampiran belum dapat dimuat."); return j; })
      .then((j) => { if (active) setMedia(j.data); })
      .catch(() => { if (active && !controller.signal.aborted) setError("Lampiran belum dapat dimuat. Periksa koneksi lalu coba lagi."); });
    return () => { active = false; controller.abort(); };
  }, [id, baseUrl, version]);
  if (error) return <div className="notice"><p role="status">{error}</p><Button type="button" variant="outline" onClick={() => setVersion(v => v+1)}>Coba muat lampiran</Button></div>;
  if (!media) return <p role="status">Memuat lampiran…</p>;
  return media.mime.startsWith("image/") ? (
    <Image
      src={media.url}
      alt="Lampiran soal"
      onError={() => setError("Gambar lampiran belum dapat ditampilkan. Coba muat ulang.")}
      unoptimized
      width={1200}
      height={800}
      style={{ width: "100%", height: "auto" }}
    />
  ) : (
    <audio src={media.url} controls preload="metadata" onError={() => setError("Audio lampiran belum dapat diputar. Coba muat ulang.")} />
  );
}

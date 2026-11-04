"use client";
import {FeedbackMessage} from "../feedback/state";
import { useEffect, useState } from "react";
import katex from "katex";
import Image from "next/image";
import "katex/dist/katex.min.css";
import {z} from "zod";
import {clientRequest} from "../../lib/client/request";
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
          {!!q.rubricCriteria?.length&&<ul>{q.rubricCriteria.map(c=><li key={c.id}>{c.label}: maksimal {c.maxPoints} poin</li>)}</ul>}
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
    clientRequest(baseUrl + "?id=" + encodeURIComponent(id),undefined,z.object({url:z.url(),mime:z.string()}),controller)
      .then((media) => { if (active) setMedia(media); })
      .catch(() => { if (active) setError("Lampiran belum dapat dimuat. Periksa koneksi lalu coba lagi."); });
    return () => { active = false; controller.abort(); };
  }, [id, baseUrl, version]);
  if (error) return <div className="notice"><FeedbackMessage tone="info" role="status">{error}</FeedbackMessage><Button type="button" variant="outline" onClick={() => setVersion(v => v+1)}>Coba muat lampiran</Button></div>;
  if (!media) return <FeedbackMessage tone="loading" role="status">Memuat lampiran…</FeedbackMessage>;
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

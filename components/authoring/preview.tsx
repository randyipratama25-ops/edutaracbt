"use client";
import { useEffect, useState } from "react";
import katex from "katex";
import Image from "next/image";
import "katex/dist/katex.min.css";
import { safeHtml, type Question } from "../../lib/authoring/schema";
export function QuestionPreview({
  question: q,
  showKey = true,
}: {
  question: Question;
  showKey?: boolean;
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
        <Attachment key={id} id={id} />
      ))}
      {q.options.map((o, i) => (
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
      <p className="muted">
        {q.points} poin · {q.required ? "Wajib" : "Opsional"}
        {q.type === "Esai" ? ` · minimal ${q.minChars} karakter` : ""}
      </p>
    </section>
  );
}

function Attachment({ id }: { id: string }) {
  const [media, setMedia] = useState<{ url: string; mime: string } | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    fetch("/api/authoring/media?id=" + encodeURIComponent(id))
      .then((r) => r.json())
      .then((j) => {
        if (active && j.success) setMedia(j.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  if (!media) return <p>Memuat lampiran…</p>;
  return media.mime.startsWith("image/") ? (
    <Image
      src={media.url}
      alt="Lampiran soal"
      unoptimized
      width={1200}
      height={800}
      style={{ width: "100%", height: "auto" }}
    />
  ) : (
    <audio src={media.url} controls preload="metadata" />
  );
}

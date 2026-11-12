"use client";

import { BookOpen, ChevronDown, CircleHelp, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { helpFor, helpPageTitle, type HelpAudience } from "../../lib/help/catalog";
import { pageGuides } from "../../lib/help/start-here";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

type Props = {
  audience: HelpAudience;
  page: string;
  duringExam?: boolean;
};

export function ContextHelp(props: Props) {
  return <HelpPanel key={`${props.audience}:${props.page}`} {...props} />;
}

function HelpPanel({ audience, page, duringExam = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allPages, setAllPages] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const rows = helpFor(audience, page, query, allPages);
  const title = helpPageTitle(audience, page);
  const guide = title === "Panduan umum" ? undefined : pageGuides[page];

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setAllPages(false);
          setOpen(true);
        }}
      >
        <CircleHelp size={17} aria-hidden="true" />
        Bantuan
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Panduan halaman"
        description={title}
        className="context-help-dialog"
        onCloseAutoFocus={(event) => {
          if (trigger.current?.isConnected && trigger.current.getClientRects().length) {
            event.preventDefault();
            trigger.current.focus();
          }
        }}
      >
        <div className="page-guide">
          {duringExam && (
            <p className="page-guide-exam">
              Waktu ujian tetap berjalan. Untuk menghubungi pengawas, pilih Minta bantuan
              dari menu Alat atau layar kendala. Jika offline, hubungi pengawas langsung.
            </p>
          )}
          {guide && !query.trim() && !allPages && (
            <section className="page-guide-quick" aria-labelledby={`${id}-quick`}>
              <h3 id={`${id}-quick`}><BookOpen size={17} aria-hidden="true" /> Mulai dari sini</h3>
              <ol><li>{guide.first}</li><li>{guide.next}</li></ol>
            </section>
          )}
          <div className="page-guide-filters">
            <label htmlFor={`${id}-query`}>
              Cari panduan
              <span className="page-guide-search">
                <Search size={16} aria-hidden="true" />
                <input
                  id={`${id}-query`}
                  type="search"
                  maxLength={120}
                  value={query}
                  placeholder="Contoh: PIN atau simpan"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </span>
            </label>
            <label htmlFor={`${id}-scope`}>
              Cakupan
              <select id={`${id}-scope`} value={allPages ? "all" : "page"} onChange={(event) => setAllPages(event.target.value === "all")}>
                <option value="page">Halaman ini</option>
                <option value="all">Semua panduan peran saya</option>
              </select>
            </label>
          </div>
          <p className="page-guide-count" role="status">{rows.length} panduan ditemukan</p>
          {rows.length ? (
            <div className="help-topic-list">
              {rows.map((topic) => (
                <details key={topic.id} className="help-topic">
                  <summary>{topic.title}<ChevronDown size={17} aria-hidden="true" /></summary>
                  <div className="help-topic-content">
                    <ol>{topic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    <p className="page-guide-trouble">{topic.trouble}</p>
                    {topic.resource && <a className="page-guide-resource" href={topic.resource.href}>{topic.resource.label}</a>}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="page-guide-empty">
              <p>Tidak ada panduan yang cocok.</p>
              <Button type="button" variant="outline" onClick={() => { setQuery(""); setAllPages(true); }}>
                Tampilkan semua panduan peran saya
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

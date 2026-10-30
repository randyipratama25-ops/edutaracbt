"use client";
import { completionLabels, type Completion } from "../../lib/attempts/presentation";
export type NavigationItem = { id: string; state: Completion; flagged: boolean };
export function QuestionNavigation({ items, index, onSelect }: { items: NavigationItem[]; index: number; onSelect: (index: number) => void }) {
  const complete = items.filter(q => q.state === "complete").length;
  return <div className="question-map">
    <h2>Daftar soal</h2>
    <p className="question-progress">{complete} dari {items.length} soal terjawab</p>
    <progress value={complete} max={Math.max(1, items.length)} aria-label="Kemajuan jawaban" />
    <nav aria-label="Navigasi soal" className="question-nav">
      {items.map((q,i) => <button type="button" key={q.id} className={`question-number is-${q.state}${i === index ? " selected" : ""}${q.flagged ? " is-flagged" : ""}`} aria-current={i === index ? "step" : undefined} aria-label={`Soal ${i+1}, ${completionLabels[q.state]}${q.flagged ? ", ditandai ragu" : ""}`} onClick={() => onSelect(i)}>{i+1}</button>)}
    </nav>
    <div className="question-legend" aria-label="Keterangan status soal">
      <span><i className="legend-dot complete" aria-hidden="true" />Terjawab</span>
      <span><i className="legend-dot partial" aria-hidden="true" />Belum lengkap</span>
      <span><i className="legend-dot" aria-hidden="true" />Belum dijawab</span>
      <span><i className="legend-dot flagged" aria-hidden="true" />Ditandai ragu</span>
    </div>
  </div>;
}

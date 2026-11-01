"use client";
import { useState } from 'react';
import { QuestionPreview } from '../authoring/preview';
import type { Question } from '../../lib/authoring/schema';
const sample: Question = { type: 'Esai', stem: '<p>Contoh teks: Indonesia. Contoh rumus: $x^2 + 2x + 1$.</p>', direction: 'ltr', options: [], key: [], attachments: [], points: 1, required: false, minChars: 0, rubric: '', explanation: '', keywords: [], rubricCriteria: [], distractors: [], canvas: {enabled: false, width: 600, height: 160} };
export function DeviceSamples() {
  const [mediaError, setMediaError] = useState(false);
  return <div className="stack device-samples">
    <QuestionPreview question={sample} showKey={false} showMeta={false} />
    {/* Native image mirrors a simple visual test without collecting device data. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/preflight-sample.svg" alt="Contoh gambar: lingkaran biru dan segitiga hijau" width={240} height={90} onError={() => setMediaError(true)} />
    <label>Contoh ketik (tidak disimpan)<input maxLength={100} placeholder="Ketik beberapa kata di sini" autoComplete="off" /></label>
    <label>Contoh audio (opsional, tekan Putar)<audio controls preload="none" src="/preflight-tone.wav" onError={() => setMediaError(true)} /></label>
    {mediaError && <p role="status">Contoh media gagal dimuat. Periksa koneksi lalu muat ulang sebelum ujian. Hubungi pengawas bila media diperlukan.</p>}
  </div>;
}

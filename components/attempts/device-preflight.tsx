"use client";
import {FeedbackMessage} from "../feedback/state";
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '../ui/button';
import { canStartWithReport, inspectDevice, type DeviceReport } from '../../lib/attempts/preflight';
const Samples = dynamic(() => import('./device-samples').then(m => m.DeviceSamples));
export function DevicePreflight({ onReadyChange }: { onReadyChange: (ready: boolean, expiresAt: number) => void }) {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [busy, setBusy] = useState(false), [acknowledged, setAcknowledged] = useState(false), [message, setMessage] = useState('Belum diperiksa.');
  const [ready, setReady] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const invalidate = () => { controller.current?.abort(); setBusy(false); setReport(null); setAcknowledged(false); setReady(false); setMessage('Koneksi berubah. Jalankan pemeriksaan ulang sebelum memulai ujian baru.'); };
    window.addEventListener('offline', invalidate);
    return () => { controller.current?.abort(); window.removeEventListener('offline', invalidate); };
  }, []);
  useEffect(() => {
    const update = () => {
      const valid = canStartWithReport(report, acknowledged, performance.now());
      setReady(valid); onReadyChange(valid, report?.expiresAt || 0);
      if (report && performance.now() >= report.expiresAt) setMessage('Hasil pemeriksaan kedaluwarsa. Periksa ulang sebelum memulai.');
    };
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [report, acknowledged, onReadyChange]);
  async function run() {
    if (controller.current && !controller.current.signal.aborted) return;
    const current = new AbortController(); controller.current = current;
    setBusy(true); setReport(null); setAcknowledged(false); setReady(false); onReadyChange(false, 0); setMessage('Memeriksa perangkat…');
    const timeout = setTimeout(() => current.abort(), 10000);
    try {
      const result = await inspectDevice(current.signal);
      if (current.signal.aborted) return;
      setReport(result); setMessage(result.checks.some(c => c.level === 'blocked') ? 'Ada kendala yang perlu diperbaiki. Ikuti petunjuk lalu periksa ulang.' : 'Pemeriksaan selesai. Coba contoh di bawah, lalu konfirmasi kesiapan.');
    } catch {
      if (controller.current === current) setMessage('Pemeriksaan belum selesai. Periksa koneksi lalu coba lagi.');
    } finally {
      clearTimeout(timeout);
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }
  return <section className="panel stack device-preflight" aria-labelledby="device-check-title">
    <div className="actions"><h2 id="device-check-title">Pemeriksaan perangkat</h2><Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? 'Memeriksa…' : report ? 'Periksa ulang perangkat' : 'Periksa perangkat'}</Button></div>
    <FeedbackMessage tone="info" role="status" aria-live="polite">{ready ? 'Siap memulai · hasil berlaku 5 menit sejak pemeriksaan.' : message}</FeedbackMessage>
    <p className="muted">Periksa sebelum ujian baru. Waktu ujian belum dimulai. Melanjutkan ujian yang sudah berjalan tetap tersedia.</p>
    {report && <>
      <ul className="device-check-list">{report.checks.map(c => <li key={c.id}><details open={c.level !== 'ok'}><summary>{c.label} · {c.level === 'ok' ? 'Lulus' : c.level === 'warning' ? 'Perhatian' : 'Perlu diperbaiki'}</summary><p>{c.detail}</p></details></li>)}</ul>
      <p className="muted">Diperiksa {new Date(report.checkedAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB. Hasil hanya untuk tab ini; tidak disimpan sebagai rekam perangkat.</p>
      <details><summary>Coba teks, rumus, gambar, audio dan area gambar</summary><Samples /><DrawingSample /></details>
      <label className="check"><input type="checkbox" checked={acknowledged} disabled={busy || report.checks.some(c => c.level === 'blocked')} onChange={e => setAcknowledged(e.target.checked)} />Saya sudah mencoba contoh yang diperlukan, memastikan daya cukup, dan memahami peringatan. Jika ada kendala, saya sudah menghubungi pengawas.</label>
    </>}
  </section>;
}
function DrawingSample() {
  const ref = useRef<HTMLCanvasElement>(null), drawing = useRef(false);
  function draw(e: PointerEvent<HTMLCanvasElement>, start = false) {
    const canvas = e.currentTarget, ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (start) { drawing.current = true; canvas.setPointerCapture(e.pointerId); ctx.beginPath(); }
    if (!drawing.current) return;
    const box = canvas.getBoundingClientRect();
    const x = (e.clientX - box.left) * canvas.width / box.width, y = (e.clientY - box.top) * canvas.height / box.height;
    if (start) ctx.moveTo(x, y); else { ctx.lineTo(x, y); ctx.lineWidth = 3; ctx.stroke(); }
  }
  return <div className="stack"><p>Coba menggambar dengan jari/mouse bila diperlukan. Contoh tidak diunggah.</p><canvas ref={ref} width={600} height={160} className="device-test-canvas" aria-label="Area mencoba gambar" onPointerDown={e => draw(e, true)} onPointerMove={e => draw(e)} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} onLostPointerCapture={() => { drawing.current = false; }} /><Button type="button" variant="outline" onClick={() => ref.current?.getContext('2d')?.clearRect(0, 0, 600, 160)}>Bersihkan contoh gambar</Button></div>;
}

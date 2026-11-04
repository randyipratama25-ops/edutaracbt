import {feedbackFetch} from "../client/feedback-transport";
export type DeviceCheck = { id: string; label: string; level: 'ok' | 'warning' | 'blocked'; detail: string };
export type DeviceReport = { checks: DeviceCheck[]; checkedAt: number; expiresAt: number };
export const PREFLIGHT_TTL = 5 * 60 * 1000;
// A dedicated, unique probe must never overwrite or clear a student's drafts.
export function probeStorage(storage: Pick<Storage, 'setItem' | 'getItem' | 'removeItem'>, key: string) {
  try {
    storage.setItem(key, 'edutara-check');
    const matches = storage.getItem(key) === 'edutara-check';
    storage.removeItem(key);
    return matches && storage.getItem(key) === null;
  } catch { return false; }
  finally { try { storage.removeItem(key); } catch {} }
}
export function canStartWithReport(report: DeviceReport | null, acknowledged: boolean, now: number) {
  return !!report && acknowledged && now < report.expiresAt && report.checks.every(c => c.level !== 'blocked');
}
export async function inspectDevice(signal: AbortSignal): Promise<DeviceReport> {
  const checks: DeviceCheck[] = [];
  const secure = window.isSecureContext && typeof crypto?.randomUUID === 'function';
  checks.push({ id: 'browser', label: 'Browser dan koneksi aman', level: secure ? 'ok' : 'blocked', detail: secure ? 'Fitur identitas sesi tersedia pada koneksi aman.' : 'Buka alamat HTTPS aplikasi di browser terbaru. Hubungi pengawas bila tetap gagal.' });
  for (const [id, label] of [['localStorage', 'Cadangan draf lokal'], ['sessionStorage', 'Identitas tab']] as const) {
    let ok = false;
    try { ok = probeStorage(window[id], `edutara:preflight:${id}:${crypto.randomUUID()}`); } catch {}
    checks.push({ id, label, level: ok ? 'ok' : 'warning', detail: ok ? 'Uji tulis, baca dan hapus data sementara berhasil.' : 'Penyimpanan terblokir/penuh. Izinkan penyimpanan situs atau ganti browser. Jika tetap lanjut, jangan tutup atau muat ulang sebelum jawaban diakui server.' });
  }
  let canvas = false;
  try { canvas = !!document.createElement('canvas').getContext('2d'); } catch {}
  checks.push({ id: 'canvas', label: 'Area gambar', level: canvas ? 'ok' : 'warning', detail: canvas ? 'Canvas tersedia. Coba goreskan pada contoh di bawah.' : 'Canvas tidak tersedia. Hubungi pengawas jika ujian memerlukan jawaban gambar.' });
  checks.push({ id: 'screen', label: 'Layar', level: innerWidth >= 360 ? 'ok' : 'warning', detail: innerWidth >= 360 ? 'Tata letak responsif tersedia. Pastikan teks nyaman dibaca.' : 'Layar sempit. Coba orientasi mendatar bila teks sulit dibaca.' });
  const start = performance.now();
  try {
    const r = await feedbackFetch('/api/attempts/preflight', { cache: 'no-store', signal });
    const body = await r.json();
    if (!r.ok || body.data?.ready !== true) throw Error(r.status === 403 ? 'Sesi siswa tidak tersedia. Masuk ulang sebelum memulai.' : 'Layanan belum dapat dijangkau. Periksa internet lalu ulangi pemeriksaan.');
    const ms = Math.round(performance.now() - start);
    checks.push({ id: 'connection', label: 'Koneksi dan sesi siswa', level: ms > 2000 ? 'warning' : 'ok', detail: `${ms} ms pada satu permintaan. ${ms > 2000 ? 'Respons lambat; dekatkan ke Wi-Fi atau hubungi pengawas.' : 'Layanan merespons dan sesi siswa aktif.'} Ini bukan jaminan kestabilan selama ujian.` });
  } catch (e) {
    if (signal.aborted) throw e;
    checks.push({ id: 'connection', label: 'Koneksi dan sesi siswa', level: 'blocked', detail: e instanceof Error && e.message.includes('Sesi siswa') ? e.message : 'Layanan belum dapat dijangkau. Periksa internet atau masuk ulang, lalu ulangi pemeriksaan.' });
  }
  return { checks, checkedAt: Date.now(), expiresAt: performance.now() + PREFLIGHT_TTL };
}

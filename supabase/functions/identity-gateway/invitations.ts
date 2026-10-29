export class InvitationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type InvitationActor = { id: string; organization_id: string; role: string; active: boolean };
export type InvitationTarget = { id: string; organization_id: string; active: boolean; archived_at?: string | null };
export type InvitationAccount = { id: string; email?: string; invited_at?: string; email_confirmed_at?: string };
export function assertInvitationAccess(actor: InvitationActor, target: InvitationTarget | null) {
  if (!actor.active || actor.role !== 'admin') throw new InvitationError(403, 'Hanya Admin yang dapat mengirim ulang undangan.');
  if (!target || target.organization_id !== actor.organization_id) throw new InvitationError(404, 'Pengguna tidak tersedia.');
}
export function invitationState(target: InvitationTarget, account: InvitationAccount) {
  if (!target.active || target.archived_at) return { eligible: false, reason: 'Akun nonaktif atau diarsipkan. Aktifkan akun terlebih dahulu.' };
  if (account.id !== target.id || !account.email) return { eligible: false, reason: 'Email akun tidak tersedia.' };
  if (account.email_confirmed_at) return { eligible: false, reason: 'Email sudah dikonfirmasi. Jika pengguna belum dapat masuk, gunakan Lupa password pada halaman login.' };
  if (!account.invited_at) return { eligible: false, reason: 'Akun ini tidak memiliki undangan. Gunakan alur pemulihan akun yang sesuai.' };
  return { eligible: true, reason: '' };
}
export async function resendInvitation(input: {
  actor: InvitationActor; target: InvitationTarget | null; account: InvitationAccount;
  site: string; now?: number; budget: () => Promise<boolean>;
  send: (email: string, redirectTo: string) => Promise<{ error: { status?: number; code?: string } | null; userId?: string }>;
  audit: () => Promise<void>;
}) {
  assertInvitationAccess(input.actor, input.target);
  const state = invitationState(input.target!, input.account);
  if (!state.eligible) throw new InvitationError(409, state.reason);
  const sentAt = Date.parse(input.account.invited_at!);
  if (Number.isFinite(sentAt) && (input.now ?? Date.now()) - sentAt < 60000) throw new InvitationError(429, 'Undangan baru dikirim. Tunggu setidaknya 60 detik sebelum mencoba lagi.');
  if (!(await input.budget())) throw new InvitationError(429, 'Batas kirim ulang tercapai. Tunggu 15 menit sebelum mencoba lagi.');
  let result;
  try { result = await input.send(input.account.email!, input.site + '/auth/reset'); }
  catch { throw new InvitationError(503, 'Hasil pengiriman belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba lagi.'); }
  if (result.error) {
    if (result.error.status === 429 || result.error.code === 'over_email_send_rate_limit') throw new InvitationError(429, 'Layanan email membatasi pengiriman. Tunggu beberapa saat sebelum mencoba lagi.');
    if (result.error.code === 'email_exists' || result.error.code === 'user_already_exists') throw new InvitationError(409, 'Email sudah dikonfirmasi. Gunakan Lupa password pada halaman login.');
    throw new InvitationError(502, 'Undangan gagal dikirim. Periksa konfigurasi SMTP Supabase Auth atau coba lagi nanti.');
  }
  if (result.userId !== input.target!.id) throw new InvitationError(503, 'Hasil pengiriman perlu diperiksa Admin. Jangan buat ulang akun.');
  // An audit failure must not report the already accepted email as failed.
  await input.audit().catch(() => console.error(JSON.stringify({ event: 'invitation_resend_audit_failed' })));
  return { sent: true, message: 'Undangan berhasil dikirim ulang ke ' + input.account.email + '. Gunakan tautan dari email terbaru; periksa folder spam bila belum terlihat.' };
}

import { actor } from '../../../../lib/auth/actor';
import { failure, HttpError, json } from '../../../../lib/http';
// Read-only: actor verifies the Auth session and active profile in the database.
export async function GET() {
  try {
    const a = await actor();
    if (!a || a.role !== 'student' || a.context !== 'student')
      throw new HttpError(403, 'Silakan masuk sebagai siswa.');
    return json({ ready: true });
  } catch (error) { return failure(error); }
}

import { actor } from "../auth/actor";
import { HttpError } from "../http";
export async function staff() {
  const a = await actor();
  if (!a || a.context !== "staff" || !["admin", "teacher"].includes(a.role))
    throw new HttpError(403, "Akses Admin/Guru diperlukan.");
  return a;
}

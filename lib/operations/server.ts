import { actor } from "../auth/actor";
import { HttpError } from "../http";
export async function operator(student = false) {
  const a = await actor();
  if (
    !a ||
    (!student &&
      !(
        (a.context === "staff" && ["admin", "teacher"].includes(a.role)) ||
        a.context === "supervisor"
      ))
  )
    throw new HttpError(403, "Akses operasional diperlukan.");
  return a;
}

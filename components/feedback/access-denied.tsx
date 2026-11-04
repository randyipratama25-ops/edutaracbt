import Link from "next/link";
import { StateCard } from "./state";
export function AccessDenied() {
  return (
    <StateCard
      heading="h1"
      kind="permission"
      actions={
        <Link href="/dashboard" className="button button-outline">
          Kembali ke ringkasan
        </Link>
      }
    />
  );
}

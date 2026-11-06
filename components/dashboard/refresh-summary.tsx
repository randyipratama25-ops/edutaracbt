"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
export function RefreshSummary() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      loading={pending}
      type="button"
      variant="outline"
      disabled={pending}
      aria-label="Perbarui data madrasah"
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Memperbarui…" : "Perbarui data"}
    </Button>
  );
}

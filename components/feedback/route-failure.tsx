"use client";
import { StateCard } from "./state";
import { Button } from "../ui/button";
export function RouteFailure({ retry }: { retry?: () => void }) {
  return (
    <StateCard
      role="alert"
      heading="h1"
      kind="error"
      title="Halaman belum dapat dimuat"
      description="Coba lagi untuk memuat halaman. Jika sebelumnya menyimpan data, periksa hasilnya sebelum mengulang penyimpanan."
      actions={
        <Button type="button" disabled={!retry} onClick={() => retry?.()}>
          Coba lagi
        </Button>
      }
    />
  );
}

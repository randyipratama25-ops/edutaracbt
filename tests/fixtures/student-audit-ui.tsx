"use client";
import { useState } from "react";
import { StudentPortal } from "../../components/attempts/player";
import { EssayCanvas } from "../../components/attempts/canvas";
export default function StudentAuditFixture({ mode }: { mode: string }) {
  const [show, setShow] = useState(true),
    [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState("");
  if (mode !== "canvas")
    return <StudentPortal studentId="03000000-0000-4000-8000-000000000002" />;
  return (
    <main id="main-content" className="workspace student-shell">
      <h1>Uji canvas siswa</h1>
      <p id="canvas-state">
        {dirty ? "Belum tersimpan" : "Tidak ada perubahan"} · {saved}
      </p>
      <button onClick={() => setShow((v) => !v)}>Buka/tutup canvas</button>
      {show && (
        <EssayCanvas
          writer={{
            attempt_id: "03000000-0000-4000-8000-000000000010",
            client_id: "03000000-0000-4000-8000-000000000011",
            epoch: 1,
          }}
          questionId="03000000-0000-4000-8000-000000000015"
          recoveryScope="03000000-0000-4000-8000-000000000002"
          onDirty={setDirty}
          onSaved={setSaved}
          disabled={false}
        />
      )}
    </main>
  );
}

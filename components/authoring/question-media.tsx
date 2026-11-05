"use client";

import { questionMediaTypes } from "../../lib/authoring/upload";

export function QuestionMedia({
  disabled,
  onUpload,
}: {
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  return (
    <div className="form-grid" aria-label="Lampiran soal">
      {(["image", "audio"] as const).map((kind) => (
        <label key={kind}>
          {kind === "image" ? "Unggah gambar" : "Unggah audio"} (maks. 5 MiB)
          <input
            type="file"
            disabled={disabled}
            accept={questionMediaTypes[kind]}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
      ))}
    </div>
  );
}

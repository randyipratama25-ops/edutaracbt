"use client";

import { Editor } from "@tinymce/tinymce-react";
import { useId, useRef, useState } from "react";
import { Button } from "../ui/button";
import { MathContent } from "./math-content";
import { FeedbackMessage } from "../feedback/state";

const cloudKey = process.env.NEXT_PUBLIC_TINYMCE_API_KEY;
const allowed = "p,br,b,strong,i,em,u,sub,sup,ul,ol,li,blockquote";

export function QuestionEditor({
  value,
  direction,
  onChange,
  disabled,
}: {
  value: string;
  direction: "ltr" | "rtl";
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const editor = useRef<{
    insertContent: (html: string) => void;
    getContent: () => string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [basic, setBasic] = useState(false);
  const [formula, setFormula] = useState("");
  const [display, setDisplay] = useState(false);
  const rich = Boolean(cloudKey) && !failed && !basic;

  const delimiter = display ? "$$" : "$";
  const tex = formula.trim();
  const formulaText = tex ? delimiter + tex + delimiter : "";
  const escape = (text: string) =>
    text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  function insert(text: string) {
    const escaped = escape(text);
    if (rich && editor.current) {
      editor.current.insertContent(escaped);
      onChange(editor.current.getContent());
    } else {
      onChange(value + (value ? " " : "") + escaped);
    }
  }

  function insertFormula() {
    if (!formulaText || disabled) return;
    insert(formulaText);
    setFormula("");
  }

  return (
    <div className="question-editor stack">
      <label id={id + "-label"} htmlFor={id}>
        Isi soal
      </label>
      {rich ? (
        <Editor
          id={id}
          apiKey={cloudKey}
          disabled={disabled}
          value={value}
          onInit={(_, instance) => {
            editor.current = instance;
          }}
          onScriptsLoadError={() => setFailed(true)}
          onEditorChange={onChange}
          init={{
            menubar: false,
            branding: false,
            promotion: false,
            height: 270,
            directionality: direction,
            iframe_aria_text: "Isi soal",
            valid_elements: allowed,
            paste_data_images: false,
            toolbar_mode: "wrap",
            toolbar:
              "undo redo | bold italic underline | subscript superscript | bullist numlist | blockquote removeformat",
            plugins: "lists",
          }}
        />
      ) : (
        <>
          <textarea
            id={id}
            required
            maxLength={50000}
            dir={direction}
            rows={6}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
          {failed && (
            <FeedbackMessage tone="error">
              TinyMCE gagal dimuat. Isi soal masih dapat diedit di kolom ini.
            </FeedbackMessage>
          )}
        </>
      )}
      {cloudKey && !failed && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            editor.current = null;
            setBasic((current) => !current);
          }}
        >
          {basic ? "Gunakan TinyMCE" : "Gunakan editor dasar"}
        </Button>
      )}
      <details>
        <summary>Karakter cepat</summary>
        <div className="actions">
          {["أ ب ت ث", "≤ ≥ ≠ × ÷ √ π"].map((text) => (
            <Button
              type="button"
              variant="outline"
              key={text}
              disabled={disabled}
              onClick={() => insert(text)}
            >
              {text}
            </Button>
          ))}
        </div>
      </details>
      <details>
        <summary>Sisipkan rumus LaTeX</summary>
        <div className="stack">
          <label>
            Rumus LaTeX
            <input
              value={formula}
              maxLength={2000}
              disabled={disabled}
              placeholder={String.raw`\frac{a}{b}`}
              onChange={(event) => setFormula(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertFormula();
                }
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={display}
              disabled={disabled}
              onChange={(event) => setDisplay(event.target.checked)}
            />{" "}
            Tampilkan di baris tersendiri
          </label>
          {formulaText && <MathContent html={escape(formulaText)} />}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !tex}
            onClick={insertFormula}
          >
            Sisipkan rumus
          </Button>
        </div>
      </details>
    </div>
  );
}

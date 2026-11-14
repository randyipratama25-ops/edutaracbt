"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { useMobileDevice } from "../../lib/device/use-landscape";
import { essayLength } from "../../lib/attempts/essay";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { mathKeys } from "./essay-keyboard-math";

const layouts = {
  ABC: ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) => [...row]),
  "123": ["1234567890", "-/.,?!\"'()", "@%&_=:;<>"].map((row) => [...row]),
  "#+=": ["[]{}#%^*+=", "_\\|~<>€£¥•", "$…©®™§¶°`"].map((row) => [...row]),
  Arab: [
    [..."ضصثقفغعهخحج"],
    [..."شسيبلاتنمكط"],
    ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ"],
  ],
};
const arabicMarks = [
  [..."ًٌٍَُِّْـءأ"],
  ["إ", "آ", "ؤ", "ئ", "لأ", "لإ", "لآ", "لا", "ى", "ة", "ط"],
  [..."ٰٱؿؾؽٮڈژڑک"],
];
const modes = ["ABC", "123", "#+=", "Arab", "Matematika"] as const;
const mathCategories = Object.keys(mathKeys) as (keyof typeof mathKeys)[];

export function EssayKeyboard({
  value,
  direction,
  minChars,
  disabled,
  onChange,
}: {
  value: string;
  direction: "ltr" | "rtl";
  minChars: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const mobile = useMobileDevice();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<(typeof modes)[number]>(direction === "rtl" ? "Arab" : "ABC");
  const [shift, setShift] = useState<"off" | "once" | "caps">("off");
  const [marks, setMarks] = useState(false);
  const [category, setCategory] = useState<keyof typeof mathKeys>("Aritmatika");
  const editor = useRef<HTMLTextAreaElement>(null);
  const nextCaret = useRef<number | null>(null);
  const setEditor = useCallback((field: HTMLTextAreaElement | null) => {
    editor.current = field;
    field?.setSelectionRange(field.value.length, field.value.length);
  }, []);

  useLayoutEffect(() => {
    const field = editor.current;
    if (field && nextCaret.current !== null) {
      field.setSelectionRange(nextCaret.current, nextCaret.current);
      nextCaret.current = null;
    }
  }, [value]);

  function edit(insert: string) {
    const field = editor.current;
    if (!field || disabled) return;
    let start = field.selectionStart;
    const end = field.selectionEnd;
    if (!insert && start === end && start > 0) {
      // Match legacy deletion by code point, including Arabic marks and surrogate pairs.
      start -= (Array.from(value.slice(0, start)).pop() ?? "").length;
    }
    const result = value.slice(0, start) + insert + value.slice(end);
    if (result.length > 100000) return;
    const caret = start + insert.length;
    if (result === value) {
      field.setSelectionRange(caret, caret);
    } else {
      nextCaret.current = caret;
      onChange(result);
    }
    if (insert && mode === "ABC" && shift === "once") setShift("off");
  }

  function moveCaret(step: -1 | 1) {
    const field = editor.current;
    if (!field) return;
    let position = step < 0 ? field.selectionStart : field.selectionEnd;
    if (field.selectionStart === field.selectionEnd) {
      const adjacent = step < 0
        ? Array.from(value.slice(0, position)).pop()
        : String.fromCodePoint(value.codePointAt(position) ?? 0);
      position = Math.min(value.length, Math.max(0, position + step * (adjacent?.length ?? 0)));
    }
    field.setSelectionRange(position, position);
  }

  const keyProps = { type: "button", onMouseDown: (event: MouseEvent) => event.preventDefault() } as const;
  const rows = mode === "Matematika" ? [] : mode === "Arab" && marks ? arabicMarks : layouts[mode];

  const answerField = (
    <>
      <label>
        Jawaban esai
        <textarea
          aria-describedby={id}
          dir={direction}
          rows={mobile ? 5 : 8}
          maxLength={100000}
          disabled={disabled}
          value={value}
          readOnly={mobile}
          inputMode={mobile ? "none" : undefined}
          onChange={mobile ? undefined : (event) => onChange(event.target.value)}
        />
      </label>
      <p id={id}>{essayLength(value)} karakter · minimum {minChars}</p>
    </>
  );

  if (!mobile) {
    return (
      <>
        {answerField}
        <div className="actions">
          {["<b>teks</b>", "<i>teks</i>", "$\\frac{a}{b}$", "أ ب ت ث", "≤ ≥ ≠ √"].map((snippet) => (
            <Button
              key={snippet}
              type="button"
              disabled={disabled || value.length + snippet.length + 1 > 100000}
              variant="outline"
              onClick={() => onChange(value + " " + snippet)}
            >
              {snippet}
            </Button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {answerField}
      <div className="actions">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
          Buka keyboard esai
        </Button>
      </div>
      <Dialog
        open={open && !disabled}
        onOpenChange={setOpen}
        draggable
        className="essay-keyboard-dialog"
        title="Keyboard esai"
        description="Geser judul untuk memindahkan keyboard. Ketuk tombol di layar untuk menulis."
      >
        <label className="essay-keyboard-answer">
          Jawaban esai
          <textarea
            ref={setEditor}
            dir={direction}
            rows={3}
            value={value}
            readOnly
            inputMode="none"
          />
        </label>
        <div className="essay-keyboard-controls" role="group" aria-label="Mode keyboard">
          {modes.map((item) => (
            <button key={item} {...keyProps} aria-pressed={mode === item} onClick={() => setMode(item)}>
              {item}
            </button>
          ))}
        </div>
        {mode === "Matematika" ? (
          <>
            <div className="essay-keyboard-controls" role="group" aria-label="Kategori matematika">
              {mathCategories.map((item) => (
                <button key={item} {...keyProps} aria-pressed={category === item} onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="essay-keyboard-math">
              {mathKeys[category].map((key) => (
                <button key={key.label} {...keyProps} aria-label={key.description} title={key.description} onClick={() => edit(key.value)}>
                  {key.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          rows.map((row, index) => (
            <div className="essay-keyboard-row" key={index}>
              {row.map((character) => {
                const label = mode === "ABC" && shift !== "off" ? character.toUpperCase() : character;
                return (
                  <button key={character} {...keyProps} onClick={() => edit(label)}>
                    {mode === "Arab" && marks && /^\p{Mark}$/u.test(label) ? `◌${label}` : label}
                  </button>
                );
              })}
            </div>
          ))
        )}
        <div className="essay-keyboard-controls">
          {mode === "ABC" && (
            <button {...keyProps} aria-pressed={shift !== "off"} onClick={() => setShift(shift === "off" ? "once" : shift === "once" ? "caps" : "off")}>
              {shift === "caps" ? "Caps Lock" : "Shift"}
            </button>
          )}
          {mode === "Arab" && (
            <button {...keyProps} aria-pressed={marks} onClick={() => setMarks(!marks)}>Harakat</button>
          )}
          <button {...keyProps} aria-label="Mundur satu karakter" onClick={() => moveCaret(-1)}>‹</button>
          <button {...keyProps} className="essay-keyboard-space" onClick={() => edit(" ")}>Spasi</button>
          <button {...keyProps} aria-label="Maju satu karakter" onClick={() => moveCaret(1)}>›</button>
          <button {...keyProps} onClick={() => edit("\n")}>Baris baru</button>
          <button {...keyProps} onClick={() => edit("")}>Hapus</button>
        </div>
        <Button type="button" onClick={() => setOpen(false)}>Selesai</Button>
      </Dialog>
    </>
  );
}

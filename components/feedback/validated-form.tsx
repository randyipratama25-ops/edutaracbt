"use client";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { StateCard } from "./state";
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function fieldLabel(field: Field) {
  const label = field.labels?.[0];
  const text = label
    ? [...label.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join(" ")
        .trim()
    : "";
  return (text || field.getAttribute("aria-label") || "Kolom ini").slice(
    0,
    100,
  );
}
export function ValidatedForm({
  children,
  className = "",
  onInvalidCapture,
  onInputCapture,
  onResetCapture,
  ...props
}: ComponentProps<"form">) {
  const [errors, setErrors] = useState<
    { field: Field; label: string; message: string }[]
  >([]);
  const frame = useRef<number | null>(null),
    shown = useRef(false),
    activeForm=useRef<HTMLFormElement|null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const update=useCallback((form: HTMLFormElement)=>{
    activeForm.current=form;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!form.isConnected) return;
      const fields = [...form.elements]
        .filter(
          (e): e is Field =>
            e instanceof HTMLInputElement ||
            e instanceof HTMLSelectElement ||
            e instanceof HTMLTextAreaElement,
        )
        .filter((e) => e.willValidate && !e.validity.valid);
      const next = fields.map((field) => ({
          field,
          label: fieldLabel(field),
          message: field.validity.valueMissing
            ? "Wajib diisi."
            : field.validity.typeMismatch
              ? "Gunakan format yang sesuai."
              : field.validity.tooShort
                ? `Minimal ${field.getAttribute("minlength")} karakter.`
                : field.validity.tooLong
                  ? `Maksimal ${field.getAttribute("maxlength")} karakter.`
                  : field.validity.rangeUnderflow
                    ? `Nilai minimal ${field.getAttribute("min")}.`
                    : field.validity.rangeOverflow
                      ? `Nilai maksimal ${field.getAttribute("max")}.`
                      : "Periksa format atau nilai isian ini.",
        }));
      setErrors(previous=>previous.length===next.length&&previous.every((item,i)=>item.field===next[i].field&&item.label===next[i].label&&item.message===next[i].message)?previous:next);
    });
  },[]);
  useEffect(()=>{if(shown.current&&activeForm.current?.isConnected)update(activeForm.current);},[children,update]);
  return (
    <form
      {...props}
      className={`validated-form ${className}`}
      onInvalidCapture={(e) => {
        onInvalidCapture?.(e);
        shown.current = true;
        update(e.currentTarget);
      }}
      onInputCapture={(e) => {
        onInputCapture?.(e);
        if (shown.current) update(e.currentTarget);
      }}
      onResetCapture={(e) => {
        onResetCapture?.(e);
        queueMicrotask(()=>{if (!e.defaultPrevented) {
          if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}
          shown.current = false;
          setErrors([]);
        }});
      }}
    >
      {errors.length > 0 && (
        <div role="alert" className="form-validation-summary">
          <StateCard
            kind="validation"
            title="Periksa kembali isian"
            description={`${errors.length} kolom perlu diperbaiki.`}
          />
          <ul>
            {errors.slice(0, 20).map(({ field, label, message }, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    if (field.isConnected) {
                      field.focus();
                      field.scrollIntoView({
                        block: "center",
                        behavior: "auto",
                      });
                    }
                  }}
                >
                  {label}: {message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </form>
  );
}

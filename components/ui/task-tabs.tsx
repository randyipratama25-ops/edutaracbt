"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type Tab = { id: string; label: string; content: ReactNode };

export function TaskTabs({
  label, items, value, onValueChange,
}: {
  label: string;
  items: readonly Tab[];
  value?: string;
  onValueChange?: (id: string) => void;
}) {
  const prefix = useId();
  const [current, setCurrent] = useState(items[0]?.id);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selected = items.find(({ id }) => id === (value ?? current))?.id ?? items[0]?.id;

  function select(id: string) {
    if (value === undefined) setCurrent(id);
    onValueChange?.(id);
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % items.length; break;
      case "ArrowLeft": next = (index + items.length - 1) % items.length; break;
      case "Home": next = 0; break;
      case "End": next = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const { id } = items[next];
    select(id);
    buttons.current.get(id)?.focus();
  }

  if (!items.length) return null;
  return (
    <div className="task-tabs">
      {items.length > 1 && (
        <div className="task-tab-list" role="tablist" aria-label={label}>
          {items.map(({ id, label: title }, index) => (
            <button
              key={id}
              type="button"
              id={`${prefix}-tab-${id}`}
              role="tab"
              aria-selected={selected === id}
              aria-controls={`${prefix}-panel-${id}`}
              tabIndex={selected === id ? 0 : -1}
              ref={(button) => {
                if (button) buttons.current.set(id, button);
                else buttons.current.delete(id);
              }}
              onKeyDown={(event) => moveFocus(event, index)}
              onClick={() => select(id)}
            >
              {title}
            </button>
          ))}
        </div>
      )}
      {items.map(({ id, content }) => (
        <div
          key={id}
          className="task-tab-panel"
          id={`${prefix}-panel-${id}`}
          role={items.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={items.length > 1 ? `${prefix}-tab-${id}` : undefined}
          hidden={selected !== id}
          tabIndex={items.length > 1 && selected === id ? 0 : undefined}
        >
          {content}
        </div>
      ))}
    </div>
  );
}

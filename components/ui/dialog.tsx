"use client";
import {ConnectionNotice} from "../feedback/provider";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
  onCloseAutoFocus,
  dismissible = true,
  draggable = false,
  headerControls,
  contentStyle,
}: {
  dismissible?: boolean;
  draggable?: boolean;
  headerControls?: ReactNode;
  contentStyle?: CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);

  function startDrag(event: PointerEvent<HTMLHeadingElement>) {
    const popup = content.current;
    if (!popup || event.button !== 0 || !event.isPrimary) return;
    const rect = popup.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
  }

  function moveDrag(event: PointerEvent<HTMLHeadingElement>) {
    const popup = content.current;
    const start = drag.current;
    if (!popup || !start || start.pointer !== event.pointerId) return;
    const left = start.left + event.clientX - start.x;
    const top = start.top + event.clientY - start.y;
    // Clamp against the popup's live dimensions, including after viewport changes.
    popup.style.left = `clamp(0px, ${left}px, 100vw - var(--dialog-drag-width))`;
    popup.style.top = `clamp(0px, ${top}px, 100dvh - var(--dialog-drag-height))`;
    popup.style.setProperty("--dialog-drag-height", `${popup.offsetHeight}px`);
    popup.style.setProperty("--dialog-drag-width", `${popup.offsetWidth}px`);
    popup.style.transform = "none";
  }

  const attachContent = useCallback((popup: HTMLDivElement | null) => {
    content.current = popup;
    if (!popup || !draggable) return;
    const observer = new ResizeObserver(() => {
      popup.style.setProperty("--dialog-drag-height", `${popup.offsetHeight}px`);
      popup.style.setProperty("--dialog-drag-width", `${popup.offsetWidth}px`);
    });
    observer.observe(popup);
    return () => {
      observer.disconnect();
      content.current = null;
      drag.current = null;
    };
  }, [draggable]);

  // Capture before the portal moves focus; an autofocus callback may already see body.
  useLayoutEffect(() => {
    if (!open) return;
    const focused = document.activeElement;
    opener.current = focused instanceof HTMLElement && focused !== document.body && !content.current?.contains(focused) ? focused : null;
  }, [open]);
  const heading = (
    <DialogPrimitive.Title
      className={draggable ? "dialog-title dialog-drag-handle" : "dialog-title"}
      onPointerDown={draggable ? startDrag : undefined}
      onPointerMove={draggable ? moveDrag : undefined}
      onLostPointerCapture={draggable ? () => { drag.current = null; } : undefined}
    >
      {title}
    </DialogPrimitive.Title>
  );
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (next || dismissible) onOpenChange(next); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content ref={attachContent} style={contentStyle} className={`dialog-content ${className}`}
          onEscapeKeyDown={event => { if (!dismissible) event.preventDefault(); }}
          onInteractOutside={event => { if (!dismissible) event.preventDefault(); }}
          onOpenAutoFocus={event => {
            const focused = document.activeElement;
            if (!opener.current && focused instanceof HTMLElement && focused !== document.body && !(event.target instanceof HTMLElement && event.target.contains(focused))) opener.current = focused;
          }}
          onCloseAutoFocus={event => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              const target = opener.current?.isConnected ? opener.current : document.getElementById("main-content");
              if (target) { event.preventDefault(); target.focus(); }
            }
          }}>
          {headerControls ? (
            <div className="dialog-header">{heading}{headerControls}</div>
          ) : heading}
          <DialogPrimitive.Description className="dialog-description">
            {description}
          </DialogPrimitive.Description>
          <ConnectionNotice compact/>
          {children}
          {dismissible && <DialogPrimitive.Close
            type="button"
            aria-label="Tutup dialog"
            className="dialog-close"
          >
            <X size={20} />
          </DialogPrimitive.Close>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

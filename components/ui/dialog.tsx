"use client";
import {ConnectionNotice} from "../feedback/provider";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = "",
  onCloseAutoFocus,
}: {
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
  // Capture before the portal moves focus; an autofocus callback may already see body.
  useLayoutEffect(() => {
    if (!open) return;
    const focused = document.activeElement;
    opener.current = focused instanceof HTMLElement && focused !== document.body && !content.current?.contains(focused) ? focused : null;
  }, [open]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content ref={content} className={`dialog-content ${className}`}
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
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="dialog-description">
            {description}
          </DialogPrimitive.Description>
          <ConnectionNotice compact/>
          {children}
          <DialogPrimitive.Close
            type="button"
            aria-label="Tutup dialog"
            className="dialog-close"
          >
            <X size={20} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

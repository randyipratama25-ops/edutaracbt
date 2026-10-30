"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className={`dialog-content ${className}`}
          onOpenAutoFocus={event => {
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && !(event.target instanceof HTMLElement && event.target.contains(focused))) opener.current = focused;
          }}
          onCloseAutoFocus={event => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented && opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
          }}>
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description>
            {description}
          </DialogPrimitive.Description>
          {children}
          <DialogPrimitive.Close
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

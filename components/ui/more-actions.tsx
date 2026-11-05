import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function MoreActions({ children, label = "Opsi lainnya" }: { children: ReactNode; label?: string }) {
  return (
    <details className="more-actions">
      <summary className="button button-outline">
        {label}<ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="actions more-actions-content">{children}</div>
    </details>
  );
}

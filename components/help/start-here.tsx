import { Lightbulb } from "lucide-react";
import { pageGuides } from "../../lib/help/start-here";

export function StartHere({ page }: { page: string }) {
  const guide = pageGuides[page];
  if (!guide) return null;

  return (
    <details className="start-here">
      <summary><Lightbulb size={18} aria-hidden="true" /><strong>Mulai dari sini</strong></summary>
      <ol>
        <li>{guide.first}</li>
        <li>{guide.next}</li>
      </ol>
    </details>
  );
}

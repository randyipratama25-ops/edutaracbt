"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StartHere } from "../help/start-here";

export function PageHeading({ title, description }: { title: string; description?: ReactNode }) {
  const page = usePathname();
  return (
    <header className="page-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      <StartHere key={page} page={page} />
    </header>
  );
}

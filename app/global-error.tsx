"use client";
import "./globals.css";
import { RouteFailure } from "../components/feedback/route-failure";
export default function GlobalError({
  retry,
  reset,
}: {
  error?: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  return (
    <html lang="id">
      <body>
        <main id="main-content" tabIndex={-1} className="workspace">
          <RouteFailure retry={retry ?? reset} />
        </main>
      </body>
    </html>
  );
}

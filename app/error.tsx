"use client";
import { RouteFailure } from "../components/feedback/route-failure";
export default function ErrorPage({
  retry,
  reset,
}: {
  error?: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="workspace">
      <RouteFailure retry={retry ?? reset} />
    </main>
  );
}

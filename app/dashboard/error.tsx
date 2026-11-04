"use client";
import { RouteFailure } from "../../components/feedback/route-failure";
export default function ErrorPage({
  retry,
  reset,
}: {
  error?: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  return <RouteFailure retry={retry ?? reset} />;
}

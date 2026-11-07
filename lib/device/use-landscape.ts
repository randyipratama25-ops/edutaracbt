"use client";
import { useSyncExternalStore } from "react";
import { requiresLandscape } from "./orientation";

function subscribe(update: () => void) {
  const orientation = window.screen?.orientation;
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  orientation?.addEventListener("change", update);
  return () => {
    window.removeEventListener("resize", update);
    window.removeEventListener("orientationchange", update);
    orientation?.removeEventListener("change", update);
  };
}
export function useLandscapeRequired() {
  return useSyncExternalStore(subscribe, requiresLandscape, () => false);
}

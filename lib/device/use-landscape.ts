"use client";
import { useSyncExternalStore } from "react";
import { isMobileDevice, requiresLandscape } from "./orientation";

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

// Device identity stays fixed while the viewport resizes or rotates.
function subscribeToDevice() {
  return () => {};
}

export function useMobileDevice() {
  return useSyncExternalStore(subscribeToDevice, isMobileDevice, () => false);
}

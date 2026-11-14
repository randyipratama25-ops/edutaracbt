export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Physical orientation avoids mistaking the software keyboard for a rotation. */
export function requiresLandscape(): boolean {
  if (!isMobileDevice()) return false;
  const orientation = window.screen?.orientation?.type;
  if (orientation) return orientation.startsWith("portrait");
  // Safari exposes the physical device angle even when the keyboard resizes the viewport.
  const angle = (window as Window & { orientation?: number }).orientation;
  if (typeof angle === "number") return Math.abs(angle) % 180 === 0;
  return window.matchMedia("(orientation: portrait)").matches;
}

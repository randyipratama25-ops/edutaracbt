"use client";

import { useEffect } from "react";

/** Dashboard invitations may return to the configured site root. */
export function ActivationRedirect() {
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.has("access_token") && fragment.has("refresh_token")) {
      window.location.replace("/auth/reset" + window.location.hash);
    }
  }, []);
  return null;
}

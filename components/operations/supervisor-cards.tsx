"use client";
import { useEffect, useRef, useState } from "react";
import { CardsPanel } from "./cards";

/** Load the secondary workflow on demand; retain its draft/retry state after closing. */
export function SupervisorCards() {
  const details = useRef<HTMLDetailsElement>(null);
  const [loaded, setLoaded] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === "#kartu-peserta" && details.current) {
        details.current.open = true;
        setLoaded(true);
        setExpanded(true);
      }
    };
    const follow = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('a[href="#kartu-peserta"]') &&
        details.current
      ) {
        details.current.open = true;
        setLoaded(true);
        setExpanded(true);
      }
    };
    reveal();
    document.addEventListener("click", follow);
    window.addEventListener("hashchange", reveal);
    return () => {
      window.removeEventListener("hashchange", reveal);
      document.removeEventListener("click", follow);
    };
  }, []);
  return (
    <details
      id="kartu-peserta"
      ref={details}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        if (event.currentTarget.open) setLoaded(true);
      }}
    >
      <summary>Kartu peserta</summary>
      {loaded && <CardsPanel enabled={expanded} subscribe={false} />}
    </details>
  );
}

"use client";

import Link, { useLinkStatus } from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button";

function SignInContent() {
  const { pending } = useLinkStatus();
  return <>
    <span>Masuk ke aplikasi</span>
    <span className="home-link-state" data-pending={pending} aria-hidden="true">
      {pending ? <LoaderCircle size={18} /> : <ArrowRight size={18} />}
    </span>
    <span className="sr-only" role="status">{pending ? "Halaman masuk sedang dibuka…" : ""}</span>
  </>;
}

export function SignInLink() {
  return <Button asChild><Link href="/login"><SignInContent /></Link></Button>;
}

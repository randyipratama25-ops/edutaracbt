"use client";
import Image from "next/image";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
export function LoginBrand({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="login-brand">
      {logo && !failed ? (
        <Image
          src={logo}
          alt="Logo madrasah"
          width={48}
          height={48}
          unoptimized
          onError={() => setFailed(true)}
          style={{ objectFit: "contain" }}
        />
      ) : (
        <span className="brand-mark">
          <GraduationCap size={25} aria-hidden="true" />
        </span>
      )}
      <p className="eyebrow">{name}</p>
    </div>
  );
}

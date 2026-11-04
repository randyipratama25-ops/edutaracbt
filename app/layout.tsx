import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import {FeedbackProvider} from "../components/feedback/provider";

export const metadata: Metadata = {
  title: "EDUTARA CBT",
  description: "Sistem ujian berbasis komputer EDUTARA CBT",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body><a className="skip-link" href="#main-content">Lewati ke konten utama</a><FeedbackProvider>{children}</FeedbackProvider></body>
    </html>
  );
}

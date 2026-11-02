import { PageHeading } from "../../../components/layout/page-heading";
import { MediaPanel } from "../../../components/operations/media";
import { actor } from "../../../lib/auth/actor";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Media soal | EDUTARA CBT" };
export default async function Media() {
  const a = await actor();
  if (!a) redirect("/login");
  if (a.context !== "staff" || !["admin", "teacher"].includes(a.role))
    redirect("/dashboard");
  return (
    <>
      <PageHeading title="Media soal" description="Unggah media, periksa pratinjau, lalu gunakan dalam soal." />
      <MediaPanel admin={a.role === "admin"} />
    </>
  );
}

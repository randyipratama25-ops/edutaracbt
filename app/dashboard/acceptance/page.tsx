import {AccessDenied} from "../../../components/feedback/access-denied";
import { PageHeading } from "../../../components/layout/page-heading";
import { redirect } from "next/navigation";
import { actor } from "../../../lib/auth/actor";
import { AcceptancePanel } from "../../../components/acceptance/panel";
export default async function Page() {
  const a = await actor();
  if(!a)redirect("/login");
  if(a.role!=="admin"||a.context!=="staff")return <AccessDenied/>;
  return (
    <>
      <PageHeading title="Penerimaan operasional" />
      <AcceptancePanel />
    </>
  );
}

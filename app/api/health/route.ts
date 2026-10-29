import { json } from "../../../lib/http";
export function GET() {
  return json({
    service: "edutara-cbt",
    status: "ok",
    scope: "application-runtime",
  });
}

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-stage2-*/**", "next-env.d.ts", "supabase/functions/**"]),
  { rules: { "react-hooks/set-state-in-effect": "off" } },
]);

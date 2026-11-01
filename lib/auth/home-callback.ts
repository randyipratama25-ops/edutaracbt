import { activationTokensSchema } from "./password";
/** Only hand off to existing local auth routes. Never render or log provider values. */
export type HomeCallback =
  | { kind: "none" }
  | { kind: "redirect"; href: string }
  | { kind: "invalid"; cleanHref: string };
const sensitiveKeys = ["code", "token_hash", "type", "access_token", "refresh_token", "error", "error_code", "error_description", "expires_in", "expires_at", "token_type"];
export function homeCallback(search: string, hash: string, cleanPath: "/" | "/auth/reset" = "/"): HomeCallback {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const invalid = (): HomeCallback => {
    for (const key of sensitiveKeys) query.delete(key);
    const rest = query.toString();
    return { kind: "invalid", cleanHref: cleanPath + (rest ? "?" + rest : "") };
  };
  const hasError = (params: URLSearchParams) => ["error", "error_code", "error_description"].some(key => params.has(key));
  if (hasError(query) || hasError(fragment)) return invalid();
  // Tokens in a query string are not an accepted callback format.
  if (query.has("access_token") || query.has("refresh_token")) return invalid();
  const hasTokens = fragment.has("access_token") || fragment.has("refresh_token");
  if (hasTokens) {
    const access = fragment.get("access_token") || "";
    const refresh = fragment.get("refresh_token") || "";
    if (!activationTokensSchema.safeParse({access_token:access,refresh_token:refresh}).success) return invalid();
    return { kind: "redirect", href: "/auth/reset" + hash };
  }
  if (query.has("code")) {
    const code = query.get("code") || "";
    if (!code.trim() || code.length > 10000) return invalid();
    return { kind: "redirect", href: "/auth/confirm?" + new URLSearchParams({ code }) };
  }
  if (query.has("token_hash")) {
    const tokenHash = query.get("token_hash") || "";
    const type = query.get("type") || "";
    if (!tokenHash.trim() || tokenHash.length > 10000 || !["invite", "recovery"].includes(type)) return invalid();
    return { kind: "redirect", href: "/auth/confirm?" + new URLSearchParams({ token_hash: tokenHash, type }) };
  }
  return { kind: "none" };
}

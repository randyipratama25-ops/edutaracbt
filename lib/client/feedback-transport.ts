export const FEEDBACK_REQUEST_EVENT = "edutara:request-state";
export type RequestFeedback = {
  id: number;
  phase: "start" | "end";
  status?: number;
  scope?: string;
};
let sequence = 0;
/** Optional observations never change credentials, payloads, abort signals or retries. */
async function observe<T>(
  work: (status: (value: number) => void) => Promise<T>,
): Promise<T> {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  )
    return work(() => {});
  const id = ++sequence,
    scope = window.location?.pathname;
  let status: number | undefined;
  const emit = (detail: RequestFeedback) => {
    try {
      window.dispatchEvent(new CustomEvent(FEEDBACK_REQUEST_EVENT, { detail }));
    } catch {
      /* Feedback must never interrupt a request. */
    }
  };
  emit({ id, phase: "start", scope });
  try {
    return await work((value) => {
      status = value;
    });
  } finally {
    emit({ id, phase: "end", status, scope });
  }
}
export function feedbackFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return observe(async (status) => {
    const response = await fetch(input, init);
    status(response.status);
    return response;
  });
}
/** JSON requests include body download/parsing in their pending duration, without a second read. */
export function feedbackJSON<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ response: Response; data: T }> {
  return observe(async (status) => {
    const response = await fetch(input, init);
    status(response.status);
    const data: T = await response.json();
    return { response, data };
  });
}

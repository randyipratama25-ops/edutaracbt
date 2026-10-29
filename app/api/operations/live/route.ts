import { operator } from "../../../../lib/operations/server";
import { failure } from "../../../../lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const a = await operator(true);
    const inbox = new URL(request.url).searchParams.get("inbox") === "1";
    if (!inbox) await operator();
    const { data } = await a.client.auth.getSession();
    await a.client.realtime.setAuth(data.session?.access_token);
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const send = () => {
          if (!closed) controller.enqueue(encoder.encode("data: changed\n\n"));
        };
        const channel = a.client
          .channel(inbox ? "inbox:" + a.id : "ops:" + a.organization_id, {
            config: { private: true },
          })
          .on("broadcast", { event: "changed" }, send);
        cleanup = () => {
          if (closed) return;
          closed = true;
          clearTimeout(end);
          clearInterval(heartbeat);
          request.signal.removeEventListener("abort", cleanup);
          void a.client.removeChannel(channel);
          try {
            controller.close();
          } catch {}
        };
        const heartbeat = setInterval(() => {
          if (closed) return;
          if (a.context === "supervisor") {
            void a.client.rpc("has_supervisor_context").then((r) => {
              if (r.error || !r.data) cleanup();
            });
          }
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 15000);
        const end = setTimeout(cleanup, 50000);
        request.signal.addEventListener("abort", cleanup, { once: true });
        controller.enqueue(encoder.encode("retry: 5000\n\n"));
        if (request.signal.aborted) cleanup();
        else channel.subscribe();
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "private,no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return failure(e);
  }
}

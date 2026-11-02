import { operator } from "../../../../lib/operations/server";
import { failure, HttpError } from "../../../../lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const a = await operator(true);
    const inbox = new URL(request.url).searchParams.get("inbox") === "1";
    if (!inbox) await operator();
    const { data,error } = await a.client.auth.getSession();
    if(error||!data.session?.access_token)throw new HttpError(401,"Silakan masuk kembali.");
    await a.client.realtime.setAuth(data.session?.access_token);
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const send = () => {
          if (!closed)try{controller.enqueue(encoder.encode("data: changed\n\n"));}catch{cleanup();}
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
          void a.client.removeChannel(channel).catch(()=>{});
          try {
            controller.close();
          } catch {}
        };
        const heartbeat = setInterval(() => {
          if (closed) return;
          if (a.context === "supervisor") {
            void Promise.resolve(a.client.rpc("has_supervisor_context")).then((r) => {
              if (r.error || !r.data) cleanup();
            }).catch(cleanup);
          }
          try{controller.enqueue(encoder.encode(": heartbeat\n\n"));}catch{cleanup();}
        }, 15000);
        const end = setTimeout(cleanup, 50000);
        request.signal.addEventListener("abort", cleanup, { once: true });
        controller.enqueue(encoder.encode("retry: 5000\n\n"));
        if (request.signal.aborted) cleanup();
        else try{channel.subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')cleanup();});}catch{cleanup();}
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

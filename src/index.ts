import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const app = new Hono();

const clients: Set<(data: string) => void> = new Set();

app.get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: "connected", event: "connected" });

    const send = (data: string) => {
      stream.writeSSE({ data, event: "webhook" });
    };

    clients.add(send);

    stream.onAbort(() => {
      clients.delete(send);
    });

    while (true) {
      await stream.sleep(30000);
      await stream.writeSSE({ data: "ping", event: "keepalive" });
    }
  });
});

app.post("/webhook", async (c) => {
  const payload = await c.req.json();

  for (const client of clients) {
    client(JSON.stringify(payload));
  }

  return c.json({ received: true });
});

export default app;

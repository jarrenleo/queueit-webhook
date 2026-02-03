import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const app = new Hono();

const clients: Set<(data: string) => void> = new Set();

app.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    const client = (data: string) => {
      stream.writeSSE({ data, event: "sse" });
    };

    clients.add(client);

    stream.onAbort(() => {
      clients.delete(client);
    });

    while (true) {
      await stream.writeSSE({
        data: "ping",
        event: "keepalive",
      });
      await stream.sleep(1000);
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

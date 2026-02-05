import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { createClient } from "redis";
import { processData, type ProcessedData } from "./helper";

const app = new Hono();

app.use("*", cors());

const redis = createClient({
  url: process.env.REDIS_URL,
});
await redis.connect();
redis.on("error", (error) => console.error("Redis error:", error));

// Redis keys
const ITEMS_DATA_KEY = "items:data"; // Hash map (id : data object)
const ITEMS_ORDER_KEY = "items:order"; // Array of IDs (oldest -> latest)

const CLEANUP_INTERVAL = 60 * 1000;
const MAX_DATA_COUNT = 30;

// Connected SSE clients
const clients: Set<(data: string, event: string) => void> = new Set();

// Broadcast to all connected clients
function broadcast(data: object, event: string): void {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    client(payload, event);
  }
}

// Get all items in order
async function getData(): Promise<ProcessedData[]> {
  const ids = await redis.lRange(ITEMS_ORDER_KEY, 0, -1);
  if (!ids.length) return [];

  // Single call to get all items at once
  const data = await redis.hmGet(ITEMS_DATA_KEY, ids);

  return data.filter((d): d is string => d !== null).map((d) => JSON.parse(d));
}

// Increment click count for an item
async function incrementClick(id: string): Promise<ProcessedData | null> {
  const data = await redis.hGet(ITEMS_DATA_KEY, id);
  if (!data) return null;

  const item: ProcessedData = JSON.parse(data);
  item.click_count += 1;

  await redis.hSet(ITEMS_DATA_KEY, id, JSON.stringify(item));

  return item;
}

async function cleanup() {
  const count = await redis.lLen(ITEMS_ORDER_KEY);
  if (!count) return;

  if (count <= MAX_DATA_COUNT) {
    // Get the last (most recent) webhook's ID
    const lastId = await redis.lIndex(ITEMS_ORDER_KEY, -1);
    if (!lastId) return;

    // Get the last webhook's data
    const lastItemData = await redis.hGet(ITEMS_DATA_KEY, lastId);
    if (!lastItemData) return;

    // Parse the last webhook's data
    const lastItem: ProcessedData = JSON.parse(lastItemData);

    const tenMinutes = 10 * 60 * 1000;

    // Check if last webhook is older than 10 minutes
    if (Date.now() - lastItem.timestamp <= tenMinutes) return;
    // Clear everything
    await redis.del(ITEMS_DATA_KEY);
    await redis.del(ITEMS_ORDER_KEY);

    broadcast({ success: true, data: [] }, "cleanup");
  } else {
    const toRemove = count - MAX_DATA_COUNT;

    // Get the IDs to remove (oldest at the front)
    const idsToRemove = await redis.lRange(ITEMS_ORDER_KEY, 0, toRemove - 1);

    // Delete from Hash (no trim available, must delete by key)
    if (idsToRemove.length > 0) await redis.hDel(ITEMS_DATA_KEY, idsToRemove);

    // Trim List to keep only the newest MAX_DATA_COUNT
    await redis.lTrim(ITEMS_ORDER_KEY, toRemove, -1);

    const data = await getData();
    broadcast({ success: true, data }, "cleanup");
  }
}

// Reset counter every minute
setInterval(cleanup, CLEANUP_INTERVAL);

// GET /data - Return all current items for initial load/refresh
app.get("/data", async (c) => {
  const data = await getData();
  return c.json(data);
});

// GET /sse - SSE stream for real-time updates
app.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    const client = (data: string, event: string) => {
      stream.writeSSE({ data, event });
    };

    clients.add(client);

    stream.onAbort(() => {
      clients.delete(client);
    });

    // Keep connection alive - ping every 10 seconds to prevent Railway proxy timeout
    while (true) {
      await stream.writeSSE({
        data: "ping",
        event: "keepalive",
      });
      await stream.sleep(10000);
    }
  });
});

// POST /webhook - Receive new webhook data (store in pending queue)
app.post("/webhook", async (c) => {
  const data = await c.req.json();
  const processedData = processData(data);
  if (!processedData)
    return c.json({ success: false, reason: "invalid_data" }, 400);

  // Store in Redis
  await redis.rPush(ITEMS_ORDER_KEY, processedData.id);
  await redis.hSet(
    ITEMS_DATA_KEY,
    processedData.id,
    JSON.stringify(processedData),
  );

  // Broadcast new data to all clients
  broadcast(processedData, "new_data");

  return c.json({ success: true });
});

// POST /click/:id - Increment click count
app.post("/click/:id", async (c) => {
  const id = c.req.param("id");
  const updatedData = await incrementClick(id);

  if (!updatedData) return c.json({ success: false, reason: "not_found" }, 404);

  // Broadcast click update to all clients
  broadcast({ success: true, data: updatedData }, "click_update");

  return c.json({ success: true });
});

export default app;

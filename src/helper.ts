import { randomUUID } from "node:crypto";
import sql from "./db";

export interface ProcessedData {
  id: string;
  bot_name: string;
  link: string;
  click_count: number;
  timestamp: number;
}

function processSBData(data: any): ProcessedData {
  const link = data.embeds[0].url;

  return {
    id: randomUUID(),
    bot_name: "SecuredBot",
    link,
    click_count: 0,
    timestamp: Date.now(),
  };
}

function processOWData(data: any): ProcessedData {
  const link = data.embeds[0].fields[0].value;

  return {
    id: randomUUID(),
    bot_name: "OW",
    link,
    click_count: 0,
    timestamp: Date.now(),
  };
}

async function processTKTData(data: any): Promise<ProcessedData> {
  const id = randomUUID();
  const fields = data.embeds[0].fields;
  const proxy = fields[4].value.split("||")[1];
  const link = fields[6].value.split("||")[1];
  const timestamp = Date.now();

  await sql`INSERT INTO "TKT Records" (id, bot, proxy, timestamp) VALUES (${id}, ${"TKT"}, ${proxy}, ${new Date(timestamp).toISOString()})`;

  return {
    id,
    bot_name: "TKT",
    link,
    click_count: 0,
    timestamp,
  };
}

export async function processData(data: any): Promise<ProcessedData | null> {
  const title = data.embeds?.[0]?.title;

  switch (title) {
    case "Queue Passed!":
      return processSBData(data);
    case "PASSED QUEUE":
      return processOWData(data);
    case "--Queue SUCCESS--":
      return await processTKTData(data);
    default:
      return null;
  }
}

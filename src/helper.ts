import { randomUUID } from "node:crypto";

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

function processTKTData(data: any): ProcessedData {
  const link = data.embeds[0].fields[6].value.split("||")[1];

  return {
    id: randomUUID(),
    bot_name: "TKT",
    link,
    click_count: 0,
    timestamp: Date.now(),
  };
}

export function processData(data: any): ProcessedData {
  const title = data.embeds?.[0]?.title;

  switch (title) {
    case "Queue Passed!":
      return processSBData(data);
    case "PASSED QUEUE":
      return processOWData(data);
    case "--Queue SUCCESS--":
      return processTKTData(data);
    default:
      return {
        id: "",
        bot_name: "",
        link: "",
        click_count: 0,
        timestamp: 0,
      };
  }
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Channel = {
  name: string; niche: string; audience: string; language: string; tone: string;
  target_words: number; scenes: number;
};

export function loadChannel(): Channel {
  return JSON.parse(readFileSync(join(process.cwd(), "channel.json"), "utf8"));
}

import OpenAI from "openai";
import type { Channel } from "./channel";

// "gpt-5.6" (the old default) is not a model id; requests with it fail.
const MODEL = () => process.env.OPENAI_MODEL || "gpt-5.5";
const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

let cached: OpenAI | undefined;
function client() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return (cached ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

export type Source = { title: string; url: string };
export type Topic = { topic: string; angle: string; why_now: string; sources: Source[] };
export type Scene = { narration: string; image_prompt: string };
export type Script = {
  title: string; description: string; tags: string[]; thumbnail_prompt: string;
  scenes: Scene[]; sources: Source[];
};
export type Review = { pass: boolean; issues: string[] };

// Web-search responses can wrap JSON in prose or code fences; take the outermost object.
function parseJson<T>(text: string): T {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model returned no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

async function ask<T>(instructions: string, input: string, webSearch: boolean): Promise<T> {
  const r = await client().responses.create({
    model: MODEL(),
    instructions,
    input,
    tools: webSearch ? [{ type: "web_search" }] : undefined,
  });
  return parseJson<T>(r.output_text);
}

const RULES = `Never invent facts, numbers, quotes or sources. Every factual claim must be supported by a source you actually found with web search, and sources must be real URLs you visited. If evidence is thin, say so or drop the claim. No medical, financial or legal advice framed as instruction. Respond with a single JSON object and nothing else.`;

export function pickTopic(channel: Channel, recentTitles: string[], performance: string): Promise<Topic> {
  return ask<Topic>(
    `You choose the next video for a faceless YouTube channel. ${RULES}`,
    `Channel: ${JSON.stringify(channel)}
Today: ${new Date().toISOString().slice(0, 10)}
Already covered (do not repeat or near-duplicate): ${JSON.stringify(recentTitles)}
How past videos performed: ${performance || "no data yet"}

Search the web for what this audience is searching for and talking about right now (last 2-4 weeks). Pick ONE topic with real demand, a specific angle competitors miss, and enough solid sources for a ${channel.target_words}-word video.
Return {"topic": string, "angle": string, "why_now": string, "sources": [{"title": string, "url": string}]} with 3-8 sources.`,
    true,
  );
}

export function writeScript(channel: Channel, topic: Topic, feedback?: string[]): Promise<Script> {
  return ask<Script>(
    `You write narration scripts for a faceless YouTube channel. ${RULES}`,
    `Channel: ${JSON.stringify(channel)}
Topic: ${JSON.stringify(topic)}
${feedback?.length ? `A reviewer rejected the previous draft. Fix every issue: ${JSON.stringify(feedback)}` : ""}

Research the topic with web search, then write a ${channel.target_words}-word voiceover split into exactly ${channel.scenes} scenes.
- Scene 1 is a hook that states the payoff in the first 2 sentences. The last scene recaps and asks one specific comment question.
- Spoken English, short sentences, no stage directions, no URLs or markdown read aloud.
- image_prompt: a 16:9 editorial illustration of that scene. No text, logos, real people's faces or brand marks in the image.
- title: under 70 characters, specific, honest to the content.
- description: 2 short paragraphs (no links; sources are appended separately).
- tags: 8-15 lowercase search phrases.
- thumbnail_prompt: one bold, simple, high-contrast image with a single focal subject and no text.
Return {"title","description","tags","thumbnail_prompt","scenes":[{"narration","image_prompt"}],"sources":[{"title","url"}]}.`,
    true,
  );
}

export function reviewScript(channel: Channel, script: Script): Promise<Review> {
  return ask<Review>(
    `You are a strict pre-publication reviewer for a YouTube channel. ${RULES}`,
    `Channel: ${JSON.stringify(channel)}
Script: ${JSON.stringify(script)}

Use web search to spot-check the most important factual claims against the listed sources and other reputable sources. Fail the script if any of these are true: a claim is false or unsupported; a source is not real or does not support what it is cited for; the title or thumbnail idea promises something the script does not deliver; it gives instructions that could cause financial, medical or legal harm; it copies substantial text from a source; it is under 80% or over 125% of ${channel.target_words} words.
Return {"pass": boolean, "issues": [specific, actionable problems]}.`,
    true,
  );
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const r = await client().images.generate({
    model: IMAGE_MODEL(),
    prompt: `${prompt}\nStyle: cinematic editorial illustration, rich lighting, no text, no logos, no watermarks.`,
    size: "1536x1024",
    quality: "medium",
  });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image");
  return Buffer.from(b64, "base64");
}

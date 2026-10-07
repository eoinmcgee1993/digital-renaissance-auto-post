import OpenAI from "openai";
import { sql } from "./db";

const openai = () => {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

const MODEL = process.env.OPENAI_MODEL || "gpt-5.6";

export type ContentPackage = {
  hook: string;
  title: string;
  thumbnail_text: string;
  angle: string;
  script: string;
  description: string;
  tags: string[];
  chapters: { time: string; title: string }[];
  broll: { cue: string; visual: string }[];
  qa_notes: string[];
};

export async function generateContent(topic: string, opportunity: Record<string, unknown>): Promise<ContentPackage> {
  const response = await openai().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are the content architect for a faceless YouTube channel. Create an original, evidence-aware package. Never invent sources or statistics. Separate claims that need verification. Optimize for viewer satisfaction, retention, clarity and packaging without clickbait that the video cannot deliver.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Turn this opportunity into a production-ready YouTube package.",
          topic,
          opportunity,
          output: {
            hook: "first 15 seconds",
            title: "one strong title",
            thumbnail_text: "2-5 words",
            angle: "specific thesis",
            script: "full narration",
            description: "publish-ready description with a concise disclosure that claims should be checked against cited sources",
            tags: "array",
            chapters: "array",
            broll: "visual cue list",
            qa_notes: "claims or production risks requiring verification",
          },
        }),
      },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
  return parsed as ContentPackage;
}

export async function createJobFromOpportunity(opportunityId: string) {
  const rows = await sql<{ id: string; topic: string; payload: Record<string, unknown> }>(
    "select id, topic, payload from opportunities where id=$1 limit 1",
    [opportunityId],
  );
  const opportunity = rows[0];
  if (!opportunity) throw new Error("Opportunity not found");

  const existing = await sql<{ id: string }>(
    "select id from content_jobs where title=$1 and stage='ideation' limit 1",
    [opportunity.topic],
  );
  if (existing[0]) return existing[0].id;

  const job = await sql<{ id: string }>(
    "insert into content_jobs(channel_id,stage,status,topic,title,score,decision,payload) values($1,'ideation','queued',$2,$2,$3,'pending',$4) returning id",
    [process.env.CHANNEL_NAME || "default", opportunity.topic, Number(opportunity.payload?.score || 0), opportunity.payload],
  );
  return job[0].id;
}

export async function runGeneration(limit = 3) {
  const opportunities = await sql<{ id: string }>(
    "select o.id from opportunities o where not exists (select 1 from content_jobs j where j.topic=o.topic) order by o.score desc nulls last limit $1",
    [limit],
  );

  const results = [];
  for (const opportunity of opportunities) {
    const jobId = await createJobFromOpportunity(opportunity.id);
    const job = await sql<{ topic: string; payload: Record<string, unknown> }>(
      "select topic,payload from content_jobs where id=$1",
      [jobId],
    );
    const pkg = await generateContent(job[0].topic, job[0].payload);
    await sql(
      "update content_jobs set stage='qa',status='queued',title=$2,payload=payload || $3::jsonb,updated_at=now() where id=$1",
      [jobId, pkg.title, JSON.stringify({ package: pkg })],
    );
    results.push({ jobId, title: pkg.title });
  }
  return results;
}

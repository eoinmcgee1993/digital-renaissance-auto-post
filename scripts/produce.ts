// One production run: learn from past videos, research, script, review, voice, render, upload.
// Runs on GitHub Actions (see .github/workflows/produce.yml); Vercel functions are too short for rendering.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadChannel, type Channel } from "../lib/channel";
import { bootstrap, closeDb, sql } from "../lib/db";
import { speak } from "../lib/elevenlabs";
import { generateImage, pickTopic, reviewScript, writeScript, type Script, type Topic } from "../lib/llm";
import { concatScenes, placeholderAudio, placeholderImage, renderScene, toThumbnail } from "../lib/render";
import { setThumbnail, uploadVideo, videoStats, youtubeConfigured } from "../lib/youtube";

const DRY = process.env.DRY_RUN === "1";
const OUT = join(process.cwd(), "out");
const useDb = Boolean(process.env.DATABASE_URL);

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function summary(md: string) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
}

// Runs fn over items with at most `limit` in flight, preserving order.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

// Learning loop: refresh stats for uploaded videos and describe what worked.
async function learn(): Promise<string> {
  if (!useDb || !youtubeConfigured()) return "";
  const jobs = await sql<{ id: string; video_id: string; title: string; created_at: Date }>(
    "select id, video_id, title, created_at from content_jobs where video_id is not null order by created_at desc limit 100");
  const stats = new Map((await videoStats(jobs.map((j) => j.video_id))).map((s) => [s.id, s]));
  for (const j of jobs) {
    const s = stats.get(j.video_id);
    if (!s) continue;
    await sql(
      "update content_jobs set status = $2, payload = payload || jsonb_build_object('stats', $3::jsonb), updated_at = now() where id = $1",
      [j.id, s.privacy === "public" ? "published" : "awaiting_approval", JSON.stringify(s)]);
  }
  const mature = jobs
    .filter((j) => stats.get(j.video_id)?.privacy === "public" && Date.now() - j.created_at.getTime() > 3 * 864e5)
    .map((j) => ({ title: j.title, views: stats.get(j.video_id)!.views }))
    .sort((a, b) => b.views - a.views);
  if (mature.length < 2) return "";
  const best = mature.slice(0, Math.min(3, Math.floor(mature.length / 2)));
  const weakest = mature.slice(-best.length);
  return `Best: ${JSON.stringify(best)}. Weakest: ${JSON.stringify(weakest)}. Lean toward what the best ones have in common.`;
}

async function draft(channel: Channel, topic: Topic): Promise<Script> {
  let script = await writeScript(channel, topic);
  for (let attempt = 1; ; attempt++) {
    const review = await reviewScript(channel, script);
    if (review.pass) return script;
    log(`Review rejected draft ${attempt}: ${review.issues.length} issue(s)`);
    if (attempt === 2) throw new Error(`Script failed review twice: ${review.issues.join(" | ")}`);
    script = await writeScript(channel, topic, review.issues);
  }
}

function dryScript(channel: Channel): Script {
  return {
    title: "DRY RUN: render pipeline check",
    description: "Placeholder video produced without calling any paid API.",
    tags: ["dry run"],
    thumbnail_prompt: "",
    scenes: Array.from({ length: 3 }, (_, i) => ({ narration: `Scene ${i + 1}`, image_prompt: "" })),
    sources: [{ title: channel.name, url: "https://example.com" }],
  };
}

function fullDescription(script: Script) {
  const sources = script.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
  return `${script.description}\n\nSources:\n${sources}\n\nThis video was researched, written and narrated with AI tools and reviewed before publishing.`;
}

async function main() {
  const channel = loadChannel();
  await mkdir(OUT, { recursive: true });
  if (useDb) await bootstrap();

  let jobId: string | undefined;
  try {
    let script: Script;
    let topic: Topic | undefined;
    if (DRY) {
      log("DRY_RUN: skipping research, OpenAI, ElevenLabs and YouTube");
      script = dryScript(channel);
    } else {
      const performance = await learn();
      const recent = useDb
        ? (await sql<{ title: string }>("select coalesce(title, topic) as title from content_jobs where status <> 'failed' order by created_at desc limit 40")).map((r) => r.title)
        : [];
      topic = await pickTopic(channel, recent, performance);
      log(`Topic: ${topic.topic}`);
      if (useDb) {
        jobId = (await sql<{ id: string }>(
          "insert into content_jobs(channel_id, stage, status, topic, payload) values($1, 'scripting', 'running', $2, $3) returning id",
          [channel.name, topic.topic, JSON.stringify({ topic })]))[0].id;
      }
      script = await draft(channel, topic);
      log(`Script approved by review: "${script.title}"`);
    }
    await writeFile(join(OUT, "script.json"), JSON.stringify(script, null, 2));
    if (jobId) await sql("update content_jobs set stage = 'rendering', title = $2, payload = payload || $3::jsonb, updated_at = now() where id = $1", [jobId, script.title, JSON.stringify({ script })]);

    const n = script.scenes.length;
    const images = await mapLimit(script.scenes, 3, async (s, i) => {
      const file = join(OUT, `scene-${i}.png`);
      if (DRY) await placeholderImage(file, i); else await writeFile(file, await generateImage(s.image_prompt));
      return file;
    });
    log(`Images: ${n}`);
    const audio = await mapLimit(script.scenes, 2, async (s, i) => {
      const file = join(OUT, `scene-${i}.mp3`);
      if (DRY) await placeholderAudio(file, 3);
      else await writeFile(file, await speak(s.narration, script.scenes[i - 1]?.narration, script.scenes[i + 1]?.narration));
      return file;
    });
    log(`Voiceover: ${n} clips`);
    const clips = [];
    for (let i = 0; i < n; i++) {
      const clip = join(OUT, `scene-${i}.mp4`);
      await renderScene(images[i], audio[i], clip, i);
      clips.push(clip);
    }
    const video = join(OUT, "video.mp4");
    await concatScenes(clips, OUT, video);
    const thumbPng = join(OUT, "thumbnail.png");
    if (DRY) await placeholderImage(thumbPng, 0); else await writeFile(thumbPng, await generateImage(script.thumbnail_prompt));
    const thumb = join(OUT, "thumbnail.jpg");
    await toThumbnail(thumbPng, thumb);
    const description = fullDescription(script);
    await writeFile(join(OUT, "description.txt"), `${script.title}\n\n${description}\n\nTags: ${script.tags.join(", ")}\n`);
    log("Rendered video.mp4");

    let videoId: string | undefined;
    if (!DRY && youtubeConfigured()) {
      videoId = await uploadVideo(await readFile(video), { title: script.title, description, tags: script.tags });
      log("Uploaded to YouTube as private");
      try { await setThumbnail(videoId, await readFile(thumb)); } catch (e) { log(`Thumbnail not set: ${(e as Error).message}`); }
    }
    if (jobId) {
      await sql("update content_jobs set stage = 'review', status = 'awaiting_approval', video_id = $2, updated_at = now() where id = $1", [jobId, videoId ?? null]);
    }
    await summary([
      `## ${script.title}`,
      videoId
        ? `Uploaded as **private**. Review and publish it in YouTube Studio: https://studio.youtube.com/video/${videoId}/edit`
        : "Not uploaded to YouTube. Download the `video` artifact from this run and upload it yourself.",
      "", "Sources:", ...script.sources.map((s) => `- [${s.title}](${s.url})`),
    ].join("\n"));
  } catch (e) {
    if (jobId) await sql("update content_jobs set status = 'failed', error = $2, updated_at = now() where id = $1", [jobId, String(e)]);
    throw e;
  } finally {
    if (useDb) await closeDb();
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const FPS = 30;

export async function durationSeconds(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

// One still per scene with a slow push-in, timed to that scene's narration.
export async function renderScene(image: string, audio: string, out: string, index: number) {
  const frames = Math.ceil((await durationSeconds(audio) + 0.4) * FPS);
  // Upscaling before zoompan avoids the stair-step jitter it produces at output resolution;
  // alternating the zoom anchor keeps consecutive scenes from feeling identical.
  const x = index % 2 ? "iw-iw/zoom" : "0";
  const filter =
    `[0:v]scale=3840:-2,crop=3840:2160,` +
    `zoompan=z='min(zoom+0.0004,1.12)':x='${x}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${FPS},` +
    `format=yuv420p[v];[1:a]apad=pad_dur=0.4[a]`;
  await run("ffmpeg", [
    "-y", "-v", "error", "-i", image, "-i", audio,
    "-filter_complex", filter, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
    "-frames:v", String(frames), out,
  ], { maxBuffer: 1 << 26 });
}

export async function concatScenes(scenes: string[], dir: string, out: string) {
  const list = join(dir, "scenes.txt");
  await writeFile(list, scenes.map((s) => `file '${s}'`).join("\n"));
  await run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out]);
}

export async function toThumbnail(png: string, out: string) {
  await run("ffmpeg", ["-y", "-v", "error", "-i", png, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-q:v", "3", out]);
}

// DRY_RUN fixtures, so the render path can be exercised without spending API credit.
export async function placeholderImage(out: string, index: number) {
  const colors = ["0x1f3a5f", "0x5f1f3a", "0x3a5f1f", "0x5f4b1f"];
  await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=s=1536x1024,drawbox=c=${colors[index % 4]}@0.6:t=fill`, "-frames:v", "1", out]);
}

export async function placeholderAudio(out: string, seconds: number) {
  await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=f=220:d=${seconds}`, "-c:a", "libmp3lame", "-b:a", "128k", out]);
}

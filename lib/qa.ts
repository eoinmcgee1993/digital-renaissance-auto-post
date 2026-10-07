import { sql } from "./db";
import type { ContentPackage } from "./pipeline";

const banned = [/^guaranteed/i, /100%\s+(true|accurate|proven)/i];

export function validatePackage(pkg: ContentPackage) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!pkg.title || pkg.title.length < 10) errors.push("title_too_short");
  if (!pkg.hook || pkg.hook.length < 40) errors.push("hook_too_short");
  if (!pkg.script || pkg.script.length < 500) errors.push("script_too_short");
  if (!Array.isArray(pkg.tags) || pkg.tags.length < 3) warnings.push("thin_tag_set");
  if (!Array.isArray(pkg.broll) || pkg.broll.length < 3) warnings.push("thin_broll_plan");
  if (banned.some((rx) => rx.test(pkg.title))) errors.push("unsupported_certainty_in_title");

  const repeated = pkg.title.trim().toLowerCase() === pkg.thumbnail_text?.trim().toLowerCase();
  if (repeated) warnings.push("thumbnail_repeats_title");

  return { passed: errors.length === 0, errors, warnings };
}

export async function runQA(limit = 10) {
  const jobs = await sql<{ id: string; payload: { package?: ContentPackage } }>(
    "select id,payload from content_jobs where stage='qa' and status='queued' order by created_at asc limit $1",
    [limit],
  );
  const results = [];
  for (const job of jobs) {
    const pkg = job.payload.package;
    if (!pkg) {
      await sql("update content_jobs set status='failed',error=$2,updated_at=now() where id=$1", [job.id, "missing_content_package"]);
      continue;
    }
    const result = validatePackage(pkg);
    await sql(
      "update content_jobs set stage=$2,status=$3,decision=$4,error=$5,payload=payload || $6::jsonb,updated_at=now() where id=$1",
      [
        job.id,
        result.passed ? "render" : "qa",
        result.passed ? "queued" : "blocked",
        result.passed ? "approved" : "rejected",
        result.errors.join(",") || null,
        JSON.stringify({ qa: result }),
      ],
    );
    results.push({ id: job.id, ...result });
  }
  return results;
}

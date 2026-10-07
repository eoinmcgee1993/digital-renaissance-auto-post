import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Pipeline secrets live in GitHub Actions, so Vercel can only report its own config and the job counts.
export async function GET() {
  const oauthHelper = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  let jobs: Record<string, number> | string = "DATABASE_URL is not configured on Vercel";
  if (process.env.DATABASE_URL) {
    try {
      const rows = await sql<{ status: string; n: number }>("select status, count(*)::int as n from content_jobs group by status");
      jobs = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    } catch {
      jobs = "no runs yet";
    }
  }
  return NextResponse.json({ oauth_helper_ready: oauthHelper, jobs });
}

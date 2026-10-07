import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { bootstrap } from "@/lib/db";
import { runGeneration } from "@/lib/pipeline";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    await bootstrap();
    return NextResponse.json({ ok: true, results: await runGeneration(3) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

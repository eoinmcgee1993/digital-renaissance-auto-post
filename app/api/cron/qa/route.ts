import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { bootstrap } from "@/lib/db";
import { runQA } from "@/lib/qa";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    await bootstrap();
    return NextResponse.json({ ok: true, results: await runQA(10) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

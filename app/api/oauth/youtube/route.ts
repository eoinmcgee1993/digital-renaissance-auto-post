import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { YOUTUBE_SCOPE } from "@/lib/youtube";

// One-time helper: the channel owner signs in here to mint the refresh token the pipeline uses.
export async function GET(req: Request) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) return new NextResponse("YOUTUBE_CLIENT_ID is not configured on Vercel", { status: 503 });
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${new URL(req.url).origin}/api/oauth/youtube/callback`,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent", // forces Google to return a refresh token every time
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/oauth/youtube" });
  return res;
}

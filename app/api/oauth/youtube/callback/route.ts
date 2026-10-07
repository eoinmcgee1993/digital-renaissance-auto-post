import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>YouTube connection</title>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5">${body}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = (await cookies()).get("yt_oauth_state")?.value;
  if (!state || state !== url.searchParams.get("state")) return page("<h1>Sign-in expired</h1><p>Start again from /api/oauth/youtube.</p>", 400);
  const code = url.searchParams.get("code");
  if (!code) return page(`<h1>Not connected</h1><p>Google returned: ${escape(url.searchParams.get("error") ?? "no code")}</p>`, 400);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      redirect_uri: `${url.origin}/api/oauth/youtube/callback`,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) return page(`<h1>Not connected</h1><p>Google token exchange failed (HTTP ${res.status}).</p>`, 502);

  // Shown once, to whoever just completed Google's consent for their own channel; nothing is stored.
  return page(`<h1>YouTube connected</h1>
<p>Copy this refresh token into a GitHub Actions secret named <code>YOUTUBE_REFRESH_TOKEN</code>
(repo Settings &rarr; Secrets and variables &rarr; Actions), then close this tab. It is not stored anywhere else.</p>
<textarea readonly rows="4" style="width:100%;font-family:monospace">${escape(data.refresh_token)}</textarea>`);
}

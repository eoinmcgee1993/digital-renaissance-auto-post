const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";

export function youtubeConfigured() {
  return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN);
}

async function accessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`YouTube token refresh failed with HTTP ${res.status} (an OAuth app left in "Testing" expires refresh tokens after 7 days)`);
  return (await res.json()).access_token;
}

export type UploadMeta = { title: string; description: string; tags: string[] };

// Uploads as private: the human approval gate is publishing it from YouTube Studio.
export async function uploadVideo(video: Buffer, meta: UploadMeta): Promise<string> {
  const token = await accessToken();
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(video.length),
      },
      body: JSON.stringify({
        snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: "28" },
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
      }),
    },
  );
  const location = init.headers.get("location");
  if (!init.ok || !location) throw new Error(`YouTube upload init failed with HTTP ${init.status}`);
  const put = await fetch(location, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" },
    body: new Uint8Array(video),
  });
  if (!put.ok) throw new Error(`YouTube upload failed with HTTP ${put.status}`);
  return (await put.json()).id;
}

export async function setThumbnail(videoId: string, jpeg: Buffer) {
  const token = await accessToken();
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: new Uint8Array(jpeg),
  });
  // Custom thumbnails need a phone-verified channel; the video is still usable without one.
  if (!res.ok) throw new Error(`Thumbnail upload failed with HTTP ${res.status}`);
}

export type VideoStats = { id: string; privacy: string; views: number; likes: number; comments: number };

export async function videoStats(ids: string[]): Promise<VideoStats[]> {
  if (!ids.length) return [];
  const token = await accessToken();
  const out: VideoStats[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,status&id=${ids.slice(i, i + 50).join(",")}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`YouTube stats request failed with HTTP ${res.status}`);
    for (const v of (await res.json()).items ?? []) {
      out.push({
        id: v.id,
        privacy: v.status?.privacyStatus ?? "unknown",
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
      });
    }
  }
  return out;
}

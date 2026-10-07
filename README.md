# YouTube Content Engine

Produces faceless YouTube videos for the channel described in `channel.json`, three times a week, and uploads each one to YouTube as **private** so a human approves it before it goes public.

## How a run works

GitHub Actions (`.github/workflows/produce.yml`, Mon/Wed/Fri 06:17 UTC) runs `scripts/produce.ts`:

1. **Learn**: refreshes view counts for past uploads and marks any you've published.
2. **Research**: an OpenAI model with live web search picks a topic with current demand, avoiding past topics and leaning toward what performed.
3. **Script**: writes a sourced ~1,000-word, 10-scene voiceover, title, description, tags and thumbnail idea.
4. **Review**: a second, stricter pass fact-checks it against the web. One rewrite is allowed; a second rejection fails the run before anything is spent on images or voice.
5. **Produce**: one image per scene (OpenAI images), ElevenLabs voiceover, ffmpeg render (1080p, slow push-in per scene), thumbnail.
6. **Upload**: to YouTube as private, flagged as AI-generated, with sources in the description. The video, thumbnail and description are also kept as a run artifact for 14 days.
7. **You** open the YouTube Studio link in the run summary, watch it and publish it.

Vercel (`digital-renaissance-auto-post-engin.vercel.app`) only hosts `/api/health` and the one-time YouTube sign-in at `/api/oauth/youtube`. Rendering doesn't run there because Vercel Hobby functions are too short for it.

| Path | What it is |
|---|---|
| `channel.json` | Channel name, niche, audience, tone, length. Edit this to change what gets made. |
| `scripts/produce.ts` | The pipeline above |
| `lib/llm.ts` | Research, script, review and image prompts |
| `lib/elevenlabs.ts`, `lib/youtube.ts`, `lib/render.ts` | Voice, YouTube API, ffmpeg |
| `lib/db.ts` | Postgres state (`content_jobs`) |
| `app/api/oauth/youtube` | One-time sign-in that shows the refresh token |

## Setup

### 1. Database
In Vercel → `digital-renaissance-auto-post-engine` → Storage, add a **Neon** Postgres database. It sets `DATABASE_URL` on Vercel. Copy the same value into GitHub (step 4).

### 2. YouTube API access
1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. OAuth consent screen: External, add the `.../auth/youtube` scope, then **Publish app** (set it to "In production"). Left in "Testing", Google expires the refresh token after 7 days and uploads stop.
3. Credentials → Create OAuth client ID → Web application. Authorised redirect URI: `https://digital-renaissance-auto-post-engin.vercel.app/api/oauth/youtube/callback`
4. In Vercel, add `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` as environment variables and redeploy.
5. Visit `https://digital-renaissance-auto-post-engin.vercel.app/api/oauth/youtube`, sign in with the channel's Google account, and copy the refresh token it shows.

**Audit:** YouTube locks videos uploaded through unaudited API projects to private. Until Google approves the project through the [YouTube API Services audit form](https://support.google.com/youtube/contact/yt_api_form), you can't publish the uploaded copy. Download the `video` artifact from the run and upload it yourself in Studio instead.

### 3. Keys
- OpenAI API key (platform.openai.com). Needs access to web search and image generation.
- ElevenLabs API key. Each video is about 6,000 characters of voice, so check your plan's monthly limit against 3 videos a week.

### 4. GitHub secrets
Repo → Settings → Secrets and variables → Actions → **Secrets**:
`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `DATABASE_URL`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`.

Optional **Variables**: `OPENAI_MODEL` (default `gpt-5.5`), `ELEVENLABS_VOICE_ID` (default: the premade "George" narrator).

Without the three `YOUTUBE_*` secrets, runs still produce the video as an artifact and skip the upload.

### 5. Test
Actions → Produce video → Run workflow:
- tick **dry_run** first. It renders a placeholder video with no paid API calls, to prove the runner works.
- then run it without dry_run for a real video.

## Run locally
```
npm ci
DRY_RUN=1 npm run produce          # needs ffmpeg; writes out/video.mp4
npm run typecheck && npm run build
```

## Safety
- Nothing is made public automatically. Every upload is private until you publish it.
- Every factual claim must come from a source found by web search; sources are listed in the description.
- Uploads set YouTube's "altered or synthetic content" flag.
- CI logs on this public repo never print keys or API response bodies.

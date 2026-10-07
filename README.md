# YouTube Content Engine V3

This repository is the runtime control plane for the Content Engine V2 deployment specification.

## Runtime
- Next.js on Vercel
- Vercel Cron for scheduled orchestration (Hobby plan: each job may run at most once a day)
- PostgreSQL/Neon-compatible DATABASE_URL for persistent state
- OpenAI-compatible reasoning layer
- YouTube OAuth for publishing/analytics
- ElevenLabs for voiceover
- External research provider for live evidence

## Safety
Publishing is blocked unless QA, originality, policy, metadata and OAuth gates pass. Missing credentials never get fabricated.

## Required environment variables
DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL, CHANNEL_NAME, CHANNEL_NICHE, CHANNEL_AUDIENCE, CHANNEL_LANGUAGE, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, ELEVENLABS_API_KEY, RESEARCH_API_KEY, CRON_SECRET.

The existing V2 pack remains the operating specification. This repository is the executable control plane, not a replacement for evidence sources or media-rendering services.

The cron routes return 401 unless `CRON_SECRET` is set and Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`.

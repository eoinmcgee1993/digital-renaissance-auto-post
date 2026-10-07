# YouTube Content Engine V3

This repository is the runtime control plane for the autonomous faceless YouTube pipeline.

## Pipeline
1. Research discovers opportunities.
2. Generation turns high-scoring opportunities into a production package.
3. QA validates packaging, script minimums and obvious unsupported claims.
4. Render is the next gated stage for an external media renderer.
5. Publish remains gated behind media readiness, OAuth and policy checks.
6. Analytics and weekly reporting feed lessons back into future opportunity scoring.

## Runtime
- Next.js on Vercel
- Vercel Cron, with each job scheduled at most once a day for Hobby compatibility
- PostgreSQL/Neon-compatible DATABASE_URL
- OpenAI for orchestration and content generation
- YouTube OAuth for publishing and analytics
- External research and media-rendering providers

## Required environment variables
DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL, CHANNEL_NAME, CHANNEL_NICHE, CHANNEL_AUDIENCE, CHANNEL_LANGUAGE, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, ELEVENLABS_API_KEY, RESEARCH_API_KEY, CRON_SECRET.

Additional provider endpoints can be added as the research and render adapters are enabled.

## Safety
Publishing is blocked unless QA, originality, policy, metadata and OAuth gates pass. Missing credentials never get fabricated. External evidence must be marked as unavailable when a research source is not configured.

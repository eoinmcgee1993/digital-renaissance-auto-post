// George, an ElevenLabs premade narrator voice available on every account.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";

export async function speak(text: string, previousText?: string, nextText?: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured");
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // previous/next text keep intonation continuous across separately generated scenes.
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        previous_text: previousText,
        next_text: nextText,
      }),
    },
  );
  // Only the status goes into the error: CI logs on this public repo are world-readable.
  if (!res.ok) throw new Error(`ElevenLabs TTS failed with HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

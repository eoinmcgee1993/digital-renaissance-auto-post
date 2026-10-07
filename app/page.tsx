export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 40, maxWidth: 900, margin: "auto" }}>
      <h1>YouTube Content Engine</h1>
      <p>Videos are produced on a schedule by GitHub Actions and uploaded to YouTube as private for review.</p>
      <p><a href="/api/health">Status</a></p>
    </main>
  );
}

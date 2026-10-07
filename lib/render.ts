import { sql } from "./db";

export async function runRender(limit=3) {
  const endpoint=process.env.RENDER_API_URL, key=process.env.RENDER_API_KEY;
  if(!endpoint || !key) throw new Error("RENDER_API_URL and RENDER_API_KEY are required for rendering");
  const jobs=await sql<{id:string;title:string;payload:any}>(`select id,title,payload from content_jobs where stage='render' and status='queued' order by created_at asc limit $1`,[limit]);
  const results=[];
  for(const job of jobs){
    const pkg=job.payload?.package;
    const voice=await renderVoice(pkg?.script||"");
    const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify({job_id:job.id,title:job.title,package:pkg,voice_url:voice})});
    if(!r.ok){await sql("update content_jobs set status='blocked',error=$2,updated_at=now() where id=$1",[job.id,`render_request_failed:${r.status}`]);continue}
    const rendered=await r.json();
    if(!rendered.video_url) throw new Error("Render provider returned no video_url");
    await sql("update content_jobs set stage='publish',status='queued',payload=payload || $2::jsonb,updated_at=now() where id=$1",[job.id,JSON.stringify({render:rendered})]);
    results.push({id:job.id,video_url:rendered.video_url});
  }
  return results;
}

async function renderVoice(script:string){
  const key=process.env.ELEVENLABS_API_KEY;
  if(!key) throw new Error("ELEVENLABS_API_KEY is required for voice generation");
  const voiceId=process.env.ELEVENLABS_VOICE_ID;
  if(!voiceId) throw new Error("ELEVENLABS_VOICE_ID is required for voice generation");
  const r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,{method:"POST",headers:{"xi-api-key":key,"content-type":"application/json","accept":"audio/mpeg"},body:JSON.stringify({text:script,model_id:process.env.ELEVENLABS_MODEL_ID||"eleven_multilingual_v2"})});
  if(!r.ok) throw new Error(`ElevenLabs failed: ${r.status}`);
  const endpoint=process.env.ASSET_UPLOAD_URL;
  const uploadKey=process.env.ASSET_UPLOAD_KEY;
  if(!endpoint || !uploadKey) throw new Error("ASSET_UPLOAD_URL and ASSET_UPLOAD_KEY are required to persist generated audio");
  const up=await fetch(endpoint,{method:"POST",headers:{"content-type":"audio/mpeg",authorization:`Bearer ${uploadKey}`},body:await r.arrayBuffer()});
  if(!up.ok) throw new Error(`Audio asset upload failed: ${up.status}`);
  const data=await up.json(); if(!data.url) throw new Error("Audio asset provider returned no url");
  return data.url as string;
}
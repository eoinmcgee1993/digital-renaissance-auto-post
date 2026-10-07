import { sql } from "./db";
import { publishVideo } from "./youtube";

export async function runPublish(limit=3){
  const jobs=await sql<{id:string;title:string;payload:any}>(`select id,title,payload from content_jobs where stage='publish' and status='queued' and decision='approved' order by created_at asc limit $1`,[limit]);
  const results=[];
  for(const job of jobs){
    const render=job.payload?.render;
    const pkg=job.payload?.package;
    if(!render?.video_url){await sql("update content_jobs set status='blocked',error=$2 where id=$1",[job.id,"missing_rendered_video"]);continue}
    const published=await publishVideo({videoUrl:render.video_url,title:job.title||pkg?.title,description:pkg?.description||"",tags:pkg?.tags||[],privacyStatus:process.env.YOUTUBE_PRIVACY_STATUS||"private"});
    await sql("insert into published_videos(job_id,video_id,url,status,payload) values($1,$2,$3,$4,$5)",[job.id,published.id,`https://www.youtube.com/watch?v=${published.id}`,process.env.YOUTUBE_PRIVACY_STATUS||"private",published]);
    await sql("update content_jobs set stage='published',status='complete',payload=payload || $2::jsonb,updated_at=now() where id=$1",[job.id,JSON.stringify({youtube:published})]);
    results.push({id:job.id,videoId:published.id});
  }
  return results;
}
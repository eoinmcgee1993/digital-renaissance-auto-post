import { sql } from "./db";
import { fetchAnalytics } from "./youtube";

export async function runAnalytics() {
  const report=await fetchAnalytics(7);
  let stored=0;
  for(const row of report.rows||[]){
    const [videoId,views,likes,comments,minutes,avgDuration,avgPercent]=row;
    await sql(`insert into video_analytics(video_id,views,likes,comments,estimated_minutes_watched,average_view_duration,average_view_percentage,raw,measured_at) values($1,$2,$3,$4,$5,$6,$7,$8,now())`,[videoId,views,likes,comments,minutes,avgDuration,avgPercent,row]);
    await sql(`insert into lessons(video_id,lesson_type,lesson,payload) values($1,'performance','Performance data ingested for feedback loop',$2)`,[videoId,JSON.stringify({views,likes,comments,minutes,avgDuration,avgPercent})]);
    stored++;
  }
  return {stored,columns:report.columnHeaders||[]};
}
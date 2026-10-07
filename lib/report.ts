import OpenAI from "openai";
import { sql } from "./db";

export async function runReport(){
  const [jobs,analytics,lessons]=await Promise.all([
    sql("select stage,status,count(*)::int as count from content_jobs group by stage,status order by stage,status"),
    sql("select coalesce(sum(views),0)::numeric as views,coalesce(sum(likes),0)::numeric as likes,coalesce(sum(comments),0)::numeric as comments,coalesce(avg(average_view_percentage),0)::numeric as avg_view_percentage from video_analytics where measured_at > now()-interval '7 days'"),
    sql("select lesson_type,lesson from lessons where created_at > now()-interval '7 days' order by created_at desc limit 20")
  ]);
  let summary="Weekly report generated from persisted pipeline state.";
  if(process.env.OPENAI_API_KEY){
    const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const r=await ai.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-5.6",response_format:{type:"json_object"},messages:[
      {role:"system",content:"Create a concise weekly operating report. Return JSON {summary,priorities}. Only infer what the supplied data supports."},
      {role:"user",content:JSON.stringify({jobs,analytics,lessons})}
    ]});
    const data=JSON.parse(r.choices[0]?.message?.content||"{}"); summary=data.summary||summary;
    return {summary,priorities:data.priorities||[],jobs,analytics,lessons};
  }
  return {summary,jobs,analytics,lessons};
}
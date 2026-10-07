import { sql } from "./db";
import OpenAI from "openai";

export async function runLearning(){
  const rows=await sql("select video_id,views,likes,comments,average_view_percentage,average_view_duration from video_analytics where measured_at > now()-interval '14 days' order by views desc limit 50");
  if(!rows.length) return {lessons:0};
  if(!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for learning");
  const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const r=await ai.chat.completions.create({model:process.env.OPENAI_MODEL||"gpt-5.6",response_format:{type:"json_object"},messages:[
    {role:"system",content:"Analyze YouTube performance data. Return JSON {lessons:[{lesson_type,lesson,action}]} with practical, evidence-grounded lessons. Do not invent causes not supported by the data."},
    {role:"user",content:JSON.stringify(rows)}
  ]});
  const data=JSON.parse(r.choices[0]?.message?.content||"{}");
  for(const l of data.lessons||[]) await sql("insert into lessons(lesson_type,lesson,payload) values($1,$2,$3)",[l.lesson_type||"performance",l.lesson||"Unspecified",l]);
  return {lessons:(data.lessons||[]).length};
}
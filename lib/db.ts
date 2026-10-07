import { Pool, type QueryResultRow } from "pg";
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("sslmode=require")?{rejectUnauthorized:false}:undefined});
export async function sql<T extends QueryResultRow=any>(text:string,values:any[]=[]){if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured"); const c=await pool.connect(); try{return (await c.query<T>(text,values)).rows} finally{c.release()}}
export async function bootstrap(){await sql(`create extension if not exists pgcrypto;
create table if not exists content_jobs(id uuid primary key default gen_random_uuid(),channel_id text not null,stage text not null,status text not null,topic text,title text,score numeric,decision text,payload jsonb not null default '{}'::jsonb,retry_count int not null default 0,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table content_jobs add column if not exists video_id text;
create table if not exists opportunities(id uuid primary key default gen_random_uuid(),topic text not null,score numeric,kind text,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists lessons(id uuid primary key default gen_random_uuid(),video_id text,lesson_type text not null,lesson text not null,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists published_videos(id uuid primary key default gen_random_uuid(),job_id uuid not null references content_jobs(id),video_id text not null,url text,status text not null,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create table if not exists video_analytics(id uuid primary key default gen_random_uuid(),video_id text not null,views numeric,likes numeric,comments numeric,estimated_minutes_watched numeric,average_view_duration numeric,average_view_percentage numeric,raw jsonb not null default '{}'::jsonb,measured_at timestamptz not null default now());
create index if not exists content_jobs_stage_status_idx on content_jobs(stage,status);
create index if not exists opportunities_score_idx on opportunities(score desc);
create index if not exists video_analytics_video_idx on video_analytics(video_id,measured_at desc);`)}
export async function closeDb(){await pool.end()}
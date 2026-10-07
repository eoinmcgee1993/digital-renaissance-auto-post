import { sql } from "./db";

async function accessToken() {
  const id = process.env.YOUTUBE_CLIENT_ID, secret = process.env.YOUTUBE_CLIENT_SECRET, refresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) throw new Error("YouTube OAuth credentials are not configured");
  const body = new URLSearchParams({ client_id:id, client_secret:secret, refresh_token:refresh, grant_type:"refresh_token" });
  const r = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
  if (!r.ok) throw new Error(`YouTube token refresh failed: ${r.status}`);
  return (await r.json()).access_token as string;
}

export async function publishVideo(input:{videoUrl:string;title:string;description:string;tags:string[];privacyStatus?:string}) {
  const token=await accessToken();
  const metadata={snippet:{title:input.title,description:input.description,tags:input.tags},status:{privacyStatus:input.privacyStatus||"private"}};
  const init=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Upload-Content-Type":"video/mp4"},body:JSON.stringify(metadata)});
  if(!init.ok) throw new Error(`YouTube upload init failed: ${init.status}`);
  const location=init.headers.get("location"); if(!location) throw new Error("YouTube upload session missing");
  const video=await fetch(input.videoUrl); if(!video.ok) throw new Error(`Rendered video unavailable: ${video.status}`);
  const put=await fetch(location,{method:"PUT",headers:{"Content-Type":"video/mp4"},body:await video.arrayBuffer()});
  if(!put.ok) throw new Error(`YouTube upload failed: ${put.status}`);
  return await put.json();
}

export async function fetchAnalytics(days=7) {
  const token=await accessToken();
  const end=new Date(), start=new Date(end.getTime()-days*86400000);
  const qs=new URLSearchParams({ids:"channel==MINE",startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10),metrics:"views,likes,comments,estimatedMinutesWatched,averageViewDuration,averageViewPercentage",dimensions:"video",sort:"-views",maxResults:"200"});
  const r=await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok) throw new Error(`YouTube Analytics failed: ${r.status}`);
  return await r.json();
}
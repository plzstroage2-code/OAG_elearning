import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStore } from '@/lib/store';
import { AppError, digest, draw, edit, identity, login, snapshot, assertReady } from '@/lib/domain';
import { toCsv } from '@/lib/csv';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const cookie='ictc_draw_session';
const noStore={'Cache-Control':'private, no-store, max-age=0'};
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:noStore});
function guard(req:NextRequest,mutation:boolean){
  if(process.env.APP_MODE!=='live'&&!['localhost','127.0.0.1','[::1]'].includes(req.nextUrl.hostname))throw new AppError(403,'โหมดสาธิตเปิดได้เฉพาะในเครื่อง');
  if(mutation){
    const origin=req.headers.get('origin');
    const expected=process.env.APP_ORIGIN||req.nextUrl.origin;
    const demoAliases=process.env.APP_MODE!=='live'&&origin&&['http://localhost:3100','http://127.0.0.1:3100'].includes(origin);
    if(!origin||(!demoAliases&&origin!==expected))throw new AppError(403,'แหล่งที่มาของคำสั่งไม่ถูกต้อง');
    if(!req.headers.get('content-type')?.includes('application/json'))throw new AppError(415,'รองรับ JSON เท่านั้น');
    if(Number(req.headers.get('content-length'))>2_100_000)throw new AppError(413,'ข้อมูลมีขนาดใหญ่เกินกำหนด');
  }
}
function failure(e:unknown){
  if(e instanceof AppError)return json({error:e.message},e.status);
  if(e instanceof z.ZodError)return json({error:'ข้อมูลคำสั่งไม่ถูกต้อง กรุณาตรวจสอบช่องที่กรอก'},400);
  if(e instanceof SyntaxError)return json({error:'รูปแบบข้อมูลไม่ถูกต้อง'},400);
  console.error('[draw] request failed:',e instanceof Error?e.message:'unknown');
  return json({error:'ระบบยังไม่พร้อมหรือบันทึกไม่สำเร็จ กรุณาตรวจสถานะก่อนลองอีกครั้ง'},503);
}
export async function GET(req:NextRequest,context:{params:Promise<{action:string[]}>}){
  try{guard(req,false);const action=(await context.params).action.join('/');const store=await getStore();const state=await store.read();const token=req.cookies.get(cookie)?.value;const now=Date.now();
    if(action==='state'){const result=snapshot(state,token,now);result.realtime=!!process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.DATA_DRIVER==='postgres';return json(result);}
    const user=identity(state,token,now);if(!user)throw new AppError(401,'กรุณายืนยันสิทธิ์ผู้จัด');
    if(action==='request'){
      const id=req.nextUrl.searchParams.get('id');const found=state.rounds.find(r=>r.requestId===id);
      return json({found:!!found,roundId:found?.id});
    }
    if(action==='export'){
      const rows:(string|number)[][]=[['รหัสรอบ','รางวัล','IndexID','ชื่อ','หน่วยงาน','ตำแหน่ง','เวลา','สถานะ','เหตุผล']];
      for(const r of state.rounds.filter(r=>r.revealAt<=now))for(const w of r.winners)rows.push([r.id,r.prizeName,w.IndexID,w.Name,w.Department,w.Job_role,new Date(r.createdAt).toISOString(),r.cancelled?'ยกเลิก':'ประกาศแล้ว',r.cancelled?.reason??'']);
      return new NextResponse(toCsv(rows),{headers:{...noStore,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ictc-results.csv"'}});
    }
    if(action==='backup'){
      if(user.role!=='admin')throw new AppError(403,'ต้องใช้สิทธิ์แอดมิน');assertReady(state,now);
      const {schemaVersion,settings,participants,prizes,rounds,currentPrizeId,activeRoundId,excludedIds,version}=state;
      return new NextResponse(JSON.stringify({schemaVersion,settings,participants,prizes,rounds,currentPrizeId,activeRoundId,excludedIds,version},null,2),{headers:{...noStore,'Content-Type':'application/json','Content-Disposition':'attachment; filename="ictc-backup.json"'}});
    }
    throw new AppError(404,'ไม่พบข้อมูล');
  }catch(e){return failure(e);}
}
export async function POST(req:NextRequest,context:{params:Promise<{action:string[]}>}){
  try{guard(req,true);const action=(await context.params).action.join('/');const raw=await req.text();if(raw.length>2_100_000)throw new AppError(413,'ข้อมูลมีขนาดใหญ่เกินกำหนด');const body=JSON.parse(raw);const token=req.cookies.get(cookie)?.value;const store=await getStore();
    if(action==='login'){
      const {code}=z.object({code:z.string().trim().min(1).max(160)}).parse(body);
      const key=digest(process.env.VERCEL?req.headers.get('x-vercel-forwarded-for')??'shared':'local');
      const result=await store.transaction(s=>login(s,code,key));
      if(!result.ok)return json({error:result.message},result.status);
      const res=json({ok:true});res.cookies.set(cookie,result.token,{httpOnly:true,secure:process.env.APP_MODE==='live',sameSite:'strict',path:'/',expires:new Date(result.expiresAt)});return res;
    }
    if(action==='logout'){
      await store.transaction(s=>{s.sessions=s.sessions.filter(session=>session.hash!==digest(token??''));});
      const res=json({ok:true});res.cookies.set(cookie,'',{httpOnly:true,secure:process.env.APP_MODE==='live',sameSite:'strict',path:'/',maxAge:0});return res;
    }
    const result=await store.transaction(s=>{
      const now=Date.now();const user=identity(s,token,now);if(!user)throw new AppError(401,'สิทธิ์หมดอายุ กรุณายืนยันใหม่');
      if(action==='draw'){const r=draw(s,body,user.session.codeId,now);return {ok:true,roundId:r.id};}
      edit(s,action,body,user.role,now);return {ok:true};
    });return json(result);
  }catch(e){return failure(e);}
}

import { randomInt, randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import type { State, Code, Session, Participant, PublicRound, Snapshot } from './types';
import { parseParticipants } from './csv';
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export function createCode(code:string,role:Code['role']='admin',expiresAt=Date.now()+86400_000*30):Code {
  const salt=randomBytes(16).toString('hex');
  return {id:randomUUID(),salt,hash:scryptSync(code,salt,32).toString('hex'),expiresAt,revoked:false,role};
}
export function seedState(demo:boolean,code:string,expiresAt?:number):State {
  const names=['กานต์พิชชา','ณัฐวุฒิ','พิมพ์ชนก','ธนกฤต','สุภาวดี','ปริญญา','ชลธิชา','สิรวิชญ์','อรพรรณ','ภัทรพล'];
  const depts=['ศูนย์เทคโนโลยีสารสนเทศ','สำนักฝึกอบรม','สำนักบริหารทรัพยากรบุคคล','สำนักงานเลขานุการ'];
  return {schemaVersion:1,version:1,demo,settings:{name:'ICTC e-Learning',allowRepeat:false,showDepartment:true,showRole:false,maskNames:false},
    participants:demo?Array.from({length:60},(_,i)=>({IndexID:String(i+1).padStart(4,'0'),Name:`${names[i%10]} ตัวอย่าง${Math.floor(i/10)+1}`,Department:depts[i%4],Job_role:'บุคลากร (ข้อมูลสมมติ)'})):[],
    prizes:demo?[{id:'prize-01',name:'หูฟังไร้สาย',total:3,kind:'audio'},{id:'prize-02',name:'สมาร์ตวอตช์',total:2,kind:'watch'},{id:'prize-03',name:'กระเป๋าไลฟ์สไตล์',total:5,kind:'bag'}]:[],
    rounds:[],currentPrizeId:demo?'prize-01':'',activeRoundId:null,excludedIds:[],codes:[createCode(code,'admin',expiresAt)],sessions:[],attempts:{},audit:[]};
}
export function identity(state:State,token:string|undefined,now=Date.now()):{session:Session;role:Code['role']}|null {
  if(!token)return null;
  const session=state.sessions.find(s=>s.hash===digest(token)&&s.expiresAt>now);
  if(!session)return null;
  const code=state.codes.find(c=>c.id===session.codeId&&!c.revoked&&c.expiresAt>now);
  return code?{session,role:code.role}:null;
}
export function login(state:State,code:string,key:string,now=Date.now()) {
  for(const [k,a] of Object.entries(state.attempts))if(a.until<=now)delete state.attempts[k];
  const attempt=state.attempts[key];
  if(attempt&&attempt.count>=8&&attempt.until>now)return {ok:false as const,status:429,message:'ลองหลายครั้งเกินไป กรุณารอ 5 นาที'};
  const match=state.codes.find(c=>!c.revoked&&c.expiresAt>now&&timingSafeEqual(Buffer.from(c.hash,'hex'),scryptSync(code,c.salt,32)));
  if(!match){ state.attempts[key]={count:(attempt?.count??0)+1,until:attempt?.until??now+300_000};return {ok:false as const,status:401,message:'โค้ดไม่ถูกต้องหรือหมดอายุ'}; }
  delete state.attempts[key];state.sessions=state.sessions.filter(s=>s.expiresAt>now);
  const token=randomBytes(32).toString('hex'),expiresAt=Math.min(now+8*3600_000,match.expiresAt);
  state.sessions.push({hash:digest(token),codeId:match.id,expiresAt});
  state.audit.push({at:now,action:'login',detail:match.id});
  return {ok:true as const,token,expiresAt};
}
export function remaining(state:State,prizeId:string) {
  const prize=state.prizes.find(p=>p.id===prizeId);
  return (prize?.total??0)-state.rounds.filter(r=>r.prizeId===prizeId&&!r.cancelled).reduce((n,r)=>n+r.winners.length,0);
}
export function eligible(state:State):Participant[] {
  const used=new Set(state.excludedIds);
  if(!state.settings.allowRepeat)for(const r of state.rounds)if(!r.cancelled)for(const w of r.winners)used.add(w.IndexID);
  return state.participants.filter(p=>!used.has(p.IndexID));
}
function projected(state:State,r:State['rounds'][number],now:number):PublicRound {
  return {id:r.id,prizeName:r.prizeName,count:r.winners.length,createdAt:r.createdAt,revealAt:r.revealAt,cancelled:r.cancelled,
    winners:now<r.revealAt?[]:r.winners.map(w=>({IndexID:'',Name:state.settings.maskNames?(Array.from(w.Name.split(' ')[0]).slice(0,2).join('')+'•••'):w.Name,Department:state.settings.showDepartment?w.Department:'',Job_role:state.settings.showRole?w.Job_role:''}))};
}
export function snapshot(state:State,token?:string,now=Date.now()):Snapshot {
  const user=identity(state,token,now),r=state.rounds.find(r=>r.id===state.activeRoundId);
  return {version:state.version,serverNow:now,demo:state.demo,settings:state.settings,eligibleCount:eligible(state).length,participantCount:state.participants.length,
    prizes:state.prizes.map(p=>({...p,remaining:remaining(state,p.id)})),currentPrizeId:state.currentPrizeId,
    active:r?projected(state,r,now):null,history:state.rounds.filter(r=>now>=r.revealAt).slice(-100).reverse().map(r=>projected(state,r,now)),
    role:user?.role??'viewer',sessionExpiresAt:user?.session.expiresAt,phase:r?(now<r.revealAt?'drawing':'revealed'):'ready',realtime:false};
}
const uuid=z.string().uuid();
const drawSchema=z.object({requestId:uuid,prizeId:z.string().min(1).max(80),count:z.number().int().min(1).max(20)}).strict();
export function draw(state:State,body:unknown,operator:string,now=Date.now(),random:(max:number)=>number=randomInt) {
  const p=drawSchema.parse(body),payloadKey=JSON.stringify([p.prizeId,p.count]);
  const old=state.rounds.find(r=>r.requestId===p.requestId);
  if(old){if(old.payloadKey!==payloadKey)throw new AppError(409,'รหัสคำสั่งนี้ถูกใช้กับข้อมูลอื่นแล้ว');return old;}
  assertReady(state,now);
  if(state.activeRoundId)throw new AppError(409,'กรุณาเตรียมรอบถัดไปก่อนสุ่มอีกครั้ง');
  const prize=state.prizes.find(prize=>prize.id===p.prizeId);
  if(!prize||state.currentPrizeId!==p.prizeId)throw new AppError(409,'รางวัลเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง');
  const pool=eligible(state);
  if(remaining(state,prize.id)<p.count)throw new AppError(409,'จำนวนรางวัลไม่เพียงพอ');
  if(pool.length<p.count)throw new AppError(409,'จำนวนผู้มีสิทธิ์ไม่เพียงพอ');
  const winners:Participant[]=[];
  for(let i=0;i<p.count;i++){const n=random(pool.length);if(n<0||n>=pool.length||!Number.isInteger(n))throw new Error('Invalid random source');winners.push({...pool[n]});pool[n]=pool[pool.length-1];pool.pop();}
  const round={id:randomUUID(),requestId:p.requestId,payloadKey,prizeId:prize.id,prizeName:prize.name,winners,eligibleCount:pool.length+p.count,createdAt:now,revealAt:now+2200,operator};
  state.rounds.push(round);state.activeRoundId=round.id;state.version++;state.audit.push({at:now,action:'draw',detail:round.id});return round;
}
export function assertReady(state:State,now=Date.now()) {
  const active=state.rounds.find(r=>r.id===state.activeRoundId);
  if(active&&active.revealAt>now)throw new AppError(409,'กำลังเปิดผล กรุณารอสักครู่');
}
export function edit(state:State,action:string,body:unknown,role:Code['role'],now=Date.now()) {
  assertReady(state,now);
  if(action==='prepare'){
    const {prizeId}=z.object({prizeId:z.string()}).parse(body);
    if(!state.prizes.some(p=>p.id===prizeId))throw new AppError(404,'ไม่พบรางวัล');
    state.currentPrizeId=prizeId;state.activeRoundId=null;
  } else if(action==='replay') {
    const {roundId}=z.object({roundId:uuid}).parse(body);
    const round=state.rounds.find(r=>r.id===roundId&&!r.cancelled);
    if(!round||round.revealAt>now)throw new AppError(404,'ไม่พบผลที่เปิดเผยแล้ว');
    state.activeRoundId=round.id;state.currentPrizeId=round.prizeId;
  } else {
    if(role!=='admin')throw new AppError(403,'ต้องใช้สิทธิ์แอดมิน');
    if(action==='import') {
      if(state.rounds.length)throw new AppError(409,'งานเริ่มสุ่มแล้ว ไม่สามารถแทนที่รายชื่อได้');
      const csv=z.object({csv:z.string().max(2_000_000)}).parse(body).csv;
      try{state.participants=parseParticipants(csv);}catch(e){throw new AppError(400,e instanceof Error?e.message:'CSV ไม่ถูกต้อง');}
    } else if(action==='settings') {
      const values=z.object({name:z.string().trim().min(1).max(80),allowRepeat:z.boolean(),showDepartment:z.boolean(),showRole:z.boolean(),maskNames:z.boolean()}).strict().parse(body);
      if(state.rounds.length&&values.allowRepeat!==state.settings.allowRepeat)throw new AppError(409,'ไม่สามารถเปลี่ยนกติการางวัลซ้ำหลังเริ่มงาน');
      state.settings=values;
    } else if(action==='prize') {
      const prize=z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(100),total:z.number().int().min(1).max(5000),kind:z.enum(['audio','watch','bag','gift']),imageUrl:z.string().max(1500).optional()}).strict().parse(body);
      if(prize.imageUrl){let url:URL;try{url=new URL(prize.imageUrl);}catch{throw new AppError(400,'ลิงก์รูปภาพไม่ถูกต้อง');}if(url.protocol!=='https:')throw new AppError(400,'รูปภาพต้องเป็น HTTPS');}else delete prize.imageUrl;
      const spent=state.rounds.filter(r=>r.prizeId===prize.id&&!r.cancelled).reduce((n,r)=>n+r.winners.length,0);
      if(prize.total<spent)throw new AppError(409,'จำนวนทั้งหมดน้อยกว่ารางวัลที่แจกแล้ว');
      const i=state.prizes.findIndex(p=>p.id===prize.id);if(i>=0)state.prizes[i]=prize;else {if(state.prizes.length>=200)throw new AppError(400,'รองรับรางวัลไม่เกิน 200 ประเภท');state.prizes.push(prize);}
      if(!state.currentPrizeId)state.currentPrizeId=prize.id;
    } else if(action==='cancel') {
      const p=z.object({roundId:uuid,reason:z.string().trim().min(5).max(300),returnEligibility:z.boolean()}).parse(body);
      const r=state.rounds.find(r=>r.id===p.roundId);
      if(!r||r.cancelled)throw new AppError(409,'ไม่พบรอบที่ยกเลิกได้');
      r.cancelled={reason:p.reason,at:now};if(!p.returnEligibility)state.excludedIds=[...new Set([...state.excludedIds,...r.winners.map(w=>w.IndexID)])];
      if(state.activeRoundId===r.id)state.activeRoundId=null;
    } else throw new AppError(404,'ไม่พบคำสั่ง');
  }
  state.version++;state.audit.push({at:now,action,detail:'event updated'});
}

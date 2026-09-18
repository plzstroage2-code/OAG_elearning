import { z } from 'zod';
import type { State } from './types';
import { AppError, assertReady } from './domain';
const person=z.object({IndexID:z.string().min(1).max(80),Name:z.string().min(1).max(160),Department:z.string().max(200),Job_role:z.string().max(160)}).strict();
const timestamp=z.number().int().nonnegative().max(8640000000000000);
const prize=z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(100),total:z.number().int().min(1).max(5000),kind:z.enum(['audio','watch','bag','gift']),imageUrl:z.string().url().startsWith('https://').max(1500).optional()});
const schema=z.object({schemaVersion:z.literal(1),version:z.number().int().positive(),settings:z.object({name:z.string().min(1).max(80),allowRepeat:z.boolean(),showDepartment:z.boolean(),showRole:z.boolean(),maskNames:z.boolean()}).strict(),participants:z.array(person).max(5000),prizes:z.array(prize).max(200),
  rounds:z.array(z.object({id:z.string().uuid(),requestId:z.string().uuid(),payloadKey:z.string().max(300),prizeId:z.string(),prizeName:z.string().max(100),winners:z.array(person).min(1).max(20),eligibleCount:z.number().int().nonnegative(),createdAt:timestamp,revealAt:timestamp,operator:z.string(),cancelled:z.object({reason:z.string().min(5).max(300),at:timestamp}).optional()}).strict()).max(10000),currentPrizeId:z.string(),activeRoundId:z.string().uuid().nullable(),excludedIds:z.array(z.string()).max(5000)}).strict();
export function restoreBackup(state:State,input:unknown,now=Date.now()){
  assertReady(state,now);const b=schema.parse(input);
  function unique(values:string[]){return new Set(values).size===values.length;}
  if(!unique(b.participants.map(p=>p.IndexID))||!unique(b.prizes.map(p=>p.id))||!unique(b.rounds.map(r=>r.id))||!unique(b.rounds.map(r=>r.requestId)))throw new AppError(400,'รหัสในไฟล์สำรองซ้ำ');
  const people=new Set(b.participants.map(p=>p.IndexID)),prizes=new Set(b.prizes.map(p=>p.id)),used=new Set<string>();
  if((b.currentPrizeId&&!prizes.has(b.currentPrizeId))||(b.activeRoundId&&!b.rounds.some(r=>r.id===b.activeRoundId))||b.excludedIds.some(id=>!people.has(id)))throw new AppError(400,'ข้อมูลอ้างอิงในไฟล์สำรองไม่ครบ');
  for(const r of b.rounds){
    if(!prizes.has(r.prizeId)||!unique(r.winners.map(w=>w.IndexID))||r.winners.some(w=>!people.has(w.IndexID))||r.revealAt<r.createdAt||r.revealAt>now||r.payloadKey!==JSON.stringify([r.prizeId,r.winners.length])||r.eligibleCount<r.winners.length)throw new AppError(400,'ผลรางวัลในไฟล์สำรองไม่ถูกต้อง');
    if(!r.cancelled&&!b.settings.allowRepeat)for(const w of r.winners){if(used.has(w.IndexID))throw new AppError(400,'พบผู้ชนะซ้ำขัดกับกติกา');used.add(w.IndexID);}
  }
  for(const p of b.prizes)if(b.rounds.filter(r=>r.prizeId===p.id&&!r.cancelled).reduce((n,r)=>n+r.winners.length,0)>p.total)throw new AppError(400,'จำนวนรางวัลเกินโควตา');
  const oldVersion=state.version;Object.assign(state,b);state.version=Math.max(oldVersion,b.version)+1;state.sessions=[];
  state.audit.push({at:now,action:'restore',detail:'Validated backup restored; sessions revoked'});
}

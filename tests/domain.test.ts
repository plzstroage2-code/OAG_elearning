import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedState, draw, edit, login, identity, snapshot, remaining, eligible } from '../src/lib/domain';
import { parseParticipants, toCsv } from '../src/lib/csv';
import { restoreBackup } from '../src/lib/backup';
const template=seedState(true,'test-code',Date.now()+1e9);
const state=()=>structuredClone(template);
const command=(count=1)=>({requestId:randomUUID(),prizeId:'prize-01',count});
test('draw: unique winners, inventory, no leak before reveal even to organizer',()=>{
  const s=state(),r=draw(s,command(3),'admin',10_000,()=>0);
  assert.equal(new Set(r.winners.map(w=>w.IndexID)).size,3);assert.equal(remaining(s,'prize-01'),0);assert.equal(eligible(s).length,57);
  const hidden=snapshot(s,undefined,12_199);assert.equal(hidden.active?.winners.length,0);assert.equal(hidden.history.length,0);
  const shown=snapshot(s,undefined,12_200);assert.equal(shown.active?.winners.length,3);assert.equal(shown.active?.winners[0].IndexID,'');
});
test('idempotency: same command is one round; changed payload and new draw are rejected',()=>{
  const s=state(),p=command();const r=draw(s,p,'admin',1000);
  assert.equal(draw(s,p,'admin',1001).id,r.id);assert.equal(s.rounds.length,1);
  assert.throws(()=>draw(s,{...p,count:2},'admin',1002),/ข้อมูลอื่น/);
  assert.throws(()=>draw(s,command(),'admin',4000),/เตรียมรอบถัดไป/);
});
test('no repeats across rounds; allowing repeat does not duplicate within a round',()=>{
  const s=state();const first=draw(s,command(),'admin',1000,()=>0).winners[0];
  edit(s,'prepare',{prizeId:'prize-01'},'admin',4000);const second=draw(s,command(),'admin',4000,()=>0).winners[0];assert.notEqual(first.IndexID,second.IndexID);
  const repeat=state();repeat.settings.allowRepeat=true;assert.equal(new Set(draw(repeat,command(3),'admin',1000,()=>0).winners.map(w=>w.IndexID)).size,3);
});
test('mutations blocked during drawing; replay never consumes more stock',()=>{
  const s=state(),r=draw(s,command(),'admin',1000);
  assert.throws(()=>edit(s,'prepare',{prizeId:'prize-02'},'admin',1200),/กำลังเปิดผล/);
  edit(s,'replay',{roundId:r.id},'operator',4000);assert.equal(s.rounds.length,1);assert.equal(remaining(s,'prize-01'),2);
});
test('overdraw and too few participants do not mutate state',()=>{
  const s=state();assert.throws(()=>draw(s,command(4),'admin',1000),/รางวัลไม่เพียงพอ/);assert.equal(s.rounds.length,0);
  s.participants=s.participants.slice(0,1);assert.throws(()=>draw(s,command(2),'admin',1000),/ผู้มีสิทธิ์/);assert.equal(s.rounds.length,0);
});
test('cancel restores inventory and can keep former winners excluded',()=>{
  const s=state(),r=draw(s,command(),'admin',1000);
  edit(s,'cancel',{roundId:r.id,reason:'ไม่สามารถรับรางวัลได้',returnEligibility:false},'admin',4000);
  assert.equal(remaining(s,'prize-01'),3);assert.equal(eligible(s).length,59);assert.equal(s.rounds.length,1);assert.equal(s.activeRoundId,null);
  assert.throws(()=>edit(s,'cancel',{roundId:r.id,reason:'ซ้ำอีกครั้ง',returnEligibility:true},'admin',4001));
});
test('codes, session expiry, revocation and durable attempt limit',()=>{
  const s=state();for(let i=0;i<8;i++)assert.equal(login(s,'wrong','ip',1000).ok,false);
  assert.equal(login(s,'test-code','ip',1001).status,429);
  const result=login(s,'test-code','ip',301001);assert.equal(result.ok,true);if(!result.ok)return;
  assert.equal(identity(s,result.token,301002)?.role,'admin');assert.equal(identity(s,result.token,result.expiresAt),null);
  s.codes[0].revoked=true;assert.equal(identity(s,result.token,301002),null);
});
test('CSV respects quoted values, BOM, zero-leading IDs, duplicate IDs and formula defense',()=>{
  const people=parseParticipants('\uFEFFIndexID,Name,Department,Job_role\r\n0001,"ชื่อ, ทดสอบ",หน่วยงาน,งาน\r\n0002,"ชื่อ, ทดสอบ",หน่วยงาน,งาน');
  assert.equal(people[0].IndexID,'0001');assert.equal(people[0].Name,'ชื่อ, ทดสอบ');
  assert.throws(()=>parseParticipants('IndexID,Name,Department,Job_role\n1,a,b,c\n1,d,e,f'),/ซ้ำ/);
  assert.throws(()=>parseParticipants('IndexID,Name,Department,Job_role\n1,"unterminated,b,c'),/ปิดไม่ครบ/);
  assert.match(toCsv([['=1+1','+SUM(A1)','normal']]),/"'=1\+1"/);
});
test('operator cannot import; edits cannot silently change post-draw rules',()=>{
  const s=state();assert.throws(()=>edit(s,'import',{csv:'x'},'operator'),/แอดมิน/);
  draw(s,command(),'admin',1000);assert.throws(()=>edit(s,'settings',{...s.settings,allowRepeat:true},'admin',4000),/เปลี่ยนกติกา/);
});
test('privacy masking is applied consistently in active result and history',()=>{
  const s=state();draw(s,command(),'admin',1000);s.settings.maskNames=true;s.settings.showDepartment=false;
  const view=snapshot(s,undefined,4000);assert.match(view.active!.winners[0].Name,/•••/);assert.equal(view.history[0].winners[0].Department,'');assert.equal(view.history[0].winners[0].IndexID,'');
});
test('validated restore preserves credentials, revokes sessions, advances version and rejects impossible inventory',()=>{
  const s=state();draw(s,command(),'admin',1000);
  const {codes,sessions,attempts,audit,demo,...backup}=s;void sessions;void attempts;void audit;void demo;
  const target=state();target.version=99;target.sessions=[{hash:'old',codeId:'x',expiresAt:999999}];
  restoreBackup(target,backup,5000);assert.equal(target.version,100);assert.deepEqual(target.codes,codes);assert.equal(target.sessions.length,0);
  const bad=structuredClone(backup);bad.rounds[0].winners.push(bad.rounds[0].winners[0]);assert.throws(()=>restoreBackup(target,bad,5000));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createFileStore } from '../src/lib/store';
import { seedState, draw } from '../src/lib/domain';
test('concurrent duplicate requests commit only one round and survive reopening',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ictc-store-')),path=join(dir,'event.json');
  const store=createFileStore(path,()=>seedState(true,'test'));
  const body={requestId:randomUUID(),prizeId:'prize-01',count:1};
  const results=await Promise.all(Array.from({length:12},()=>store.transaction(s=>draw(s,body,'admin',1000))));
  assert.equal(new Set(results.map(r=>r.id)).size,1);
  const reopened=createFileStore(path,()=>{throw new Error('Must not reseed');});assert.equal((await reopened.read()).rounds.length,1);
  assert.equal(JSON.parse(await readFile(path+'.bak','utf8')).rounds.length,1);
});
test('racing different requests produce one success; transaction error leaves no partial write',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ictc-race-')),store=createFileStore(join(dir,'event.json'),()=>seedState(true,'test'));
  const results=await Promise.allSettled(Array.from({length:8},()=>store.transaction(s=>draw(s,{requestId:randomUUID(),prizeId:'prize-01',count:1},'admin',1000))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const before=await store.read();await assert.rejects(store.transaction(s=>{s.participants=[];throw new Error('Simulated failure');}));
  assert.deepEqual(await store.read(),before);
});
test('corrupt persisted data fails closed instead of silently reseeding',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ictc-corrupt-')),path=join(dir,'event.json');await writeFile(path,'{bad');
  let seeded=false;const store=createFileStore(path,()=>{seeded=true;return seedState(true,'test');});
  await assert.rejects(store.read(),/ข้อมูลสาธิตเสียหาย/);assert.equal(seeded,false);
});

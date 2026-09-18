import { mkdir, readFile, rename, open, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import type { State } from './types';
import { seedState } from './domain';
type Store = { read():Promise<State>; transaction<T>(fn:(state:State)=>T|Promise<T>):Promise<T> };
const globals=globalThis as unknown as {drawQueues?:Map<string,Promise<unknown>>;drawPool?:Pool};
const queues=globals.drawQueues??=new Map();
export function createFileStore(path:string,initial:()=>State):Store {
  async function locked<T>(fn:()=>Promise<T>):Promise<T>{const old=queues.get(path)??Promise.resolve();const p=old.catch(()=>{}).then(fn);queues.set(path,p.then(()=>{},()=>{}));return p;}
  async function load(){
    try {const data=JSON.parse(await readFile(path,'utf8')) as State;if(data.schemaVersion!==1||!Array.isArray(data.rounds)||!Array.isArray(data.codes))throw new Error('Invalid state file');return data;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('ข้อมูลสาธิตเสียหาย กรุณากู้จากไฟล์สำรอง ห้ามสร้างงานใหม่ทับข้อมูลเดิม');return initial();}
  }
  async function save(state:State){
    await mkdir(dirname(path),{recursive:true});const temp=path+'.tmp';
    const handle=await open(temp,'w');try{await handle.writeFile(JSON.stringify(state));await handle.sync();}finally{await handle.close();}
    try{await copyFile(path,path+'.bak');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await rename(temp,path);
  }
  return {read:()=>locked(async()=>{const s=await load();try{await readFile(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')await save(s);else throw e;}return s;}),
    transaction:<T>(fn:(state:State)=>T|Promise<T>)=>locked(async()=>{const state=await load();const result=await fn(state);await save(state);return result;})};
}
function initialState(){
  const live=process.env.APP_MODE==='live';
  const code=process.env.ADMIN_ACCESS_CODE||(live?'':'ICTC-DEMO');
  if(live&&(code.length<16||process.env.DATA_DRIVER!=='postgres'||!process.env.APP_ORIGIN?.startsWith('https://')))throw new Error('Live mode requires PostgreSQL, HTTPS origin and ADMIN_ACCESS_CODE of at least 16 characters');
  const expiry=process.env.CODE_EXPIRES_AT?Date.parse(process.env.CODE_EXPIRES_AT):undefined;
  if(expiry!==undefined&&(!Number.isFinite(expiry)||expiry<=Date.now()))throw new Error('CODE_EXPIRES_AT must be a future date');
  return seedState(!live,code,expiry);
}
async function postgresStore():Promise<Store>{
  if(!process.env.DATABASE_URL)throw new Error('Missing DATABASE_URL');
  const pool=globals.drawPool??=new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:20_000,connectionTimeoutMillis:8_000,ssl:{rejectUnauthorized:true}});
  const eventId=process.env.NEXT_PUBLIC_REALTIME_EVENT||'ictc-main';
  function checked(document:State){if(document.schemaVersion!==1||document.demo!==(process.env.APP_MODE!=='live'))throw new Error('Stored event mode does not match APP_MODE. Use a separate event ID for live and rehearsal.');return document;}
  // Bootstrap is idempotent. Only the winning INSERT persists its generated code hash.
  const present=await pool.query('select 1 from draw_private.events where id=$1',[eventId]);
  if(!present.rowCount)await pool.query('insert into draw_private.events(id,document) values($1,$2) on conflict do nothing',[eventId,JSON.stringify(initialState())]);
  return {
    async read(){const result=await pool.query('select document from draw_private.events where id=$1',[eventId]);return checked(result.rows[0].document as State);},
    async transaction<T>(fn:(s:State)=>T|Promise<T>){const client=await pool.connect();try{
      await client.query('begin');await client.query("set local lock_timeout = '5s'");await client.query("set local statement_timeout = '15s'");
      const res=await client.query('select document from draw_private.events where id=$1 for update',[eventId]);
      const state=checked(res.rows[0].document as State),old=state.version;
      const result=await fn(state);
      await client.query('update draw_private.events set document=$2, updated_at=now() where id=$1',[eventId,JSON.stringify(state)]);
      if(state.version!==old)await client.query('insert into public.stage_signals(event_id,revision) values($1,$2) on conflict(event_id) do update set revision=excluded.revision',[eventId,state.version]);
      await client.query('commit');return result;
    }catch(e){await client.query('rollback');throw e;}finally{client.release();}}
  };
}
export async function getStore():Promise<Store>{
  if(process.env.APP_MODE==='live'){
    if(process.env.DATA_DRIVER!=='postgres'||!process.env.APP_ORIGIN?.startsWith('https://')||!process.env.ADMIN_ACCESS_CODE||process.env.ADMIN_ACCESS_CODE.length<16)throw new Error('Live configuration incomplete');
  }
  return process.env.DATA_DRIVER==='postgres'?postgresStore():createFileStore(process.env.DRAW_DATA_FILE?resolve(process.env.DRAW_DATA_FILE):resolve(process.cwd(),'.data','event.json'),initialState);
}

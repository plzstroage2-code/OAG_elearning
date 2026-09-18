import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { getStore } from '../src/lib/store';
import { createCode } from '../src/lib/domain';
import { restoreBackup } from '../src/lib/backup';
async function main(){
  const [command,arg,confirmation]=process.argv.slice(2);
  if(!['create-code','revoke-codes','restore'].includes(command??'')){console.log('Commands:\n create-code admin|operator\n revoke-codes --confirm\n restore <backup.json> --confirm\nLoad .env.local before use; secrets are printed only when you explicitly create a code.');return;}
  if(command==='revoke-codes'&&arg!=='--confirm')throw new Error('Use revoke-codes --confirm');
  if(command==='restore'&&(!arg||confirmation!=='--confirm'))throw new Error('Use restore <backup.json> --confirm. This replaces event data and logs out all operators.');
  const store=await getStore();
  if(command==='create-code'){
    if(arg!=='admin'&&arg!=='operator')throw new Error('Choose admin or operator');
    const code=randomBytes(18).toString('base64url');const record=createCode(code,arg,Date.now()+7*86400_000);
    await store.transaction(s=>{s.codes.push(record);s.audit.push({at:Date.now(),action:'create-code',detail:record.id});});
    console.log(`New ${arg} code (expires in 7 days; do not commit or show on stream):\n${code}`);
  }else if(command==='revoke-codes'){
    await store.transaction(s=>{s.codes.forEach(c=>c.revoked=true);s.sessions=[];s.audit.push({at:Date.now(),action:'revoke-codes',detail:'all'});});console.log('All access codes and sessions revoked. Create a new code to restore access.');
  }else{
    const content=await readFile(arg,'utf8');if(content.length>10_000_000)throw new Error('Backup too large');
    const parsed=JSON.parse(content);await store.transaction(s=>restoreBackup(s,parsed));console.log('Backup validated and restored. All operator sessions were revoked.');
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});

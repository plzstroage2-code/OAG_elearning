import type { Participant } from './types';
const headers = ['IndexID','Name','Department','Job_role'] as const;
export function parseParticipants(text: string): Participant[] {
  if (text.length > 2_000_000) throw new Error('ไฟล์มีขนาดใหญ่เกิน 2 MB');
  const input = text.replace(/^\uFEFF/,'');
  const delimiter = input.split(/\r?\n/)[0].includes('\t') ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false;
  for(let i=0;i<input.length;i++) {
    const ch=input[i];
    if(quoted) { if(ch==='"') { if(input[i+1]==='"'){value+='"';i++;} else {quoted=false;closed=true;} } else value+=ch; continue; }
    if(ch==='"') { if(value.length || closed) throw new Error('รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง'); quoted=true; }
    else if(ch===delimiter) { row.push(value.trim());value='';closed=false; }
    else if(ch==='\n'||ch==='\r') { if(ch==='\r'&&input[i+1]==='\n')i++; row.push(value.trim());if(row.some(Boolean))rows.push(row);row=[];value='';closed=false; }
    else { if(closed && ch.trim())throw new Error('มีข้อความหลังเครื่องหมายปิด CSV'); value+=ch; }
  }
  if(quoted)throw new Error('เครื่องหมายคำพูดใน CSV ปิดไม่ครบ');
  row.push(value.trim());if(row.some(Boolean))rows.push(row);
  if(!rows.length)throw new Error('ไม่พบข้อมูล');
  const columns=rows.shift()!;
  const indices=headers.map(h=>columns.indexOf(h));
  if(indices.some(i=>i<0)||new Set(columns).size!==columns.length)throw new Error('หัวตารางต้องมี IndexID, Name, Department, Job_role และไม่ซ้ำ');
  if(!rows.length||rows.length>5000)throw new Error('รองรับรายชื่อ 1–5,000 คน');
  const seen=new Set<string>();
  return rows.map((r,i)=>{
    if(r.length!==columns.length)throw new Error(`แถว ${i+2}: จำนวนช่องไม่ตรงกับหัวตาราง`);
    const [IndexID,Name,Department,Job_role]=indices.map(n=>r[n]);
    if(!IndexID||!Name)throw new Error(`แถว ${i+2}: รหัสและชื่อต้องไม่ว่าง`);
    if(IndexID.length>80||Name.length>160||Department.length>200||Job_role.length>160)throw new Error(`แถว ${i+2}: ข้อมูลยาวเกินกำหนด`);
    if(seen.has(IndexID))throw new Error(`แถว ${i+2}: IndexID ${IndexID} ซ้ำ`);
    seen.add(IndexID);return {IndexID,Name,Department,Job_role};
  });
}
export function toCsv(rows: (string|number)[][]) {
  const escape=(v:string|number)=>{ let s=String(v); if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'; };
  return '\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n');
}

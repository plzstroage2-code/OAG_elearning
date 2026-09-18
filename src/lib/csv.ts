import type { Participant } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_HEADERS = ['IndexID', 'Name', 'Department', 'Job_role'] as const;
const MAX_FILE_SIZE    = 2_000_000; // 2 MB
const MAX_PARTICIPANTS = 5_000;

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * แปลงข้อความ CSV/TSV เป็น array ของ Participant
 * รองรับ UTF-8 BOM, CRLF, quoted fields
 * @throws {Error} เมื่อรูปแบบไม่ถูกต้อง
 */
export function parseParticipants(text: string): Participant[] {
  if (text.length > MAX_FILE_SIZE) {
    throw new Error('ไฟล์มีขนาดใหญ่เกิน 2 MB');
  }

  // ลบ BOM และเลือก delimiter
  const input     = text.replace(/^\uFEFF/, '');
  const delimiter = input.split(/\r?\n/)[0].includes('\t') ? '\t' : ',';

  // ── Tokenise ────────────────────────────────────────────────────────────────
  const rows: string[][] = [];
  let row: string[] = [];
  let value  = '';
  let quoted = false;
  let closed = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // escaped quote
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (value.length || closed) {
        throw new Error('รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง');
      }
      quoted = true;
    } else if (ch === delimiter) {
      row.push(value.trim());
      value  = '';
      closed = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row    = [];
      value  = '';
      closed = false;
    } else {
      if (closed && ch.trim()) {
        throw new Error('มีข้อความหลังเครื่องหมายปิด CSV');
      }
      value += ch;
    }
  }

  if (quoted) throw new Error('เครื่องหมายคำพูดใน CSV ปิดไม่ครบ');

  // เพิ่มแถวสุดท้าย
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);

  if (!rows.length) throw new Error('ไม่พบข้อมูล');

  // ── Validate headers ────────────────────────────────────────────────────────
  const columns = rows.shift()!;
  const indices = REQUIRED_HEADERS.map(h => columns.indexOf(h));
  const hasDuplicateColumns = new Set(columns).size !== columns.length;

  if (indices.some(i => i < 0) || hasDuplicateColumns) {
    throw new Error('หัวตารางต้องมี IndexID, Name, Department, Job_role และไม่ซ้ำ');
  }

  if (!rows.length || rows.length > MAX_PARTICIPANTS) {
    throw new Error('รองรับรายชื่อ 1–5,000 คน');
  }

  // ── Map rows to Participant ─────────────────────────────────────────────────
  const seen = new Set<string>();

  return rows.map((r, i) => {
    const lineNum = i + 2; // +2 เพราะ header อยู่แถวที่ 1

    if (r.length !== columns.length) {
      throw new Error(`แถว ${lineNum}: จำนวนช่องไม่ตรงกับหัวตาราง`);
    }

    const [IndexID, Name, Department, Job_role] = indices.map(n => r[n]);

    if (!IndexID || !Name) {
      throw new Error(`แถว ${lineNum}: รหัสและชื่อต้องไม่ว่าง`);
    }
    if (
      IndexID.length    > 80  ||
      Name.length       > 160 ||
      Department.length > 200 ||
      Job_role.length   > 160
    ) {
      throw new Error(`แถว ${lineNum}: ข้อมูลยาวเกินกำหนด`);
    }
    if (seen.has(IndexID)) {
      throw new Error(`แถว ${lineNum}: IndexID ${IndexID} ซ้ำ`);
    }

    seen.add(IndexID);
    return { IndexID, Name, Department, Job_role };
  });
}

// ─── CSV Writer ───────────────────────────────────────────────────────────────

/**
 * แปลง 2-D array เป็นข้อความ CSV พร้อม UTF-8 BOM
 * ป้องกัน CSV injection โดยใส่ ' นำหน้า
 */
export function toCsv(rows: (string | number)[][]): string {
  const escape = (v: string | number): string => {
    let s = String(v);
    // ป้องกัน formula injection
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };

  return '\uFEFF' + rows.map(r => r.map(escape).join(',')).join('\r\n');
}

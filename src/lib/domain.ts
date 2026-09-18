import {
  randomInt,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { z } from 'zod';
import type { State, Code, Session, Participant, PublicRound, Snapshot } from './types';
import { parseParticipants } from './csv';

// ─── Error class ──────────────────────────────────────────────────────────────

/** Error ที่มี HTTP status code — ส่งกลับ client โดยตรง */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/** สร้าง SHA-256 hex digest */
export const digest = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

// ─── Code management ──────────────────────────────────────────────────────────

/**
 * สร้าง Code object จาก plain-text code
 * (เก็บเฉพาะ hash+salt ไม่เก็บ plain-text)
 */
export function createCode(
  code:      string,
  role:      Code['role'] = 'admin',
  expiresAt: number       = Date.now() + 86_400_000 * 30,
): Code {
  const salt = randomBytes(16).toString('hex');
  return {
    id:        randomUUID(),
    salt,
    hash:      scryptSync(code, salt, 32).toString('hex'),
    expiresAt,
    revoked:   false,
    role,
  };
}

// ─── Seed / initial state ─────────────────────────────────────────────────────

/** สร้าง State เริ่มต้น (demo หรือ live) พร้อมข้อมูลสมมติ */
export function seedState(demo: boolean, code: string, expiresAt?: number): State {
  const names = [
    'กานต์พิชชา', 'ณัฐวุฒิ', 'พิมพ์ชนก', 'ธนกฤต', 'สุภาวดี',
    'ปริญญา', 'ชลธิชา', 'สิรวิชญ์', 'อรพรรณ', 'ภัทรพล',
  ];
  const depts = [
    'ศูนย์เทคโนโลยีสารสนเทศ',
    'สำนักฝึกอบรม',
    'สำนักบริหารทรัพยากรบุคคล',
    'สำนักงานเลขานุการ',
  ];

  const demoParticipants: Participant[] = demo
    ? Array.from({ length: 60 }, (_, i) => ({
        IndexID:    String(i + 1).padStart(4, '0'),
        Name:       `${names[i % 10]} ตัวอย่าง${Math.floor(i / 10) + 1}`,
        Department: depts[i % 4],
        Job_role:   'บุคลากร (ข้อมูลสมมติ)',
      }))
    : [];

  return {
    schemaVersion:  1,
    version:        1,
    demo,
    settings: {
      name:           'ICTC e-Learning',
      allowRepeat:    false,
      showDepartment: true,
      showRole:       false,
      maskNames:      false,
    },
    participants:   demoParticipants,
    prizes: demo
      ? [
          { id: 'prize-01', name: 'หูฟังไร้สาย',         total: 3, kind: 'audio' },
          { id: 'prize-02', name: 'สมาร์ตวอตช์',          total: 2, kind: 'watch' },
          { id: 'prize-03', name: 'กระเป๋าไลฟ์สไตล์',    total: 5, kind: 'bag'   },
        ]
      : [],
    rounds:         [],
    currentPrizeId: demo ? 'prize-01' : '',
    activeRoundId:  null,
    excludedIds:    [],
    codes:          [createCode(code, 'admin', expiresAt)],
    sessions:       [],
    attempts:       {},
    audit:          [],
  };
}

// ─── Identity / session ───────────────────────────────────────────────────────

/**
 * ตรวจสอบ token และคืนค่า session + role
 * คืน null ถ้า token ไม่ถูกต้องหรือหมดอายุ
 */
export function identity(
  state: State,
  token: string | undefined,
  now   = Date.now(),
): { session: Session; role: Code['role'] } | null {
  if (!token) return null;

  const session = state.sessions.find(
    s => s.hash === digest(token) && s.expiresAt > now,
  );
  if (!session) return null;

  const code = state.codes.find(
    c => c.id === session.codeId && !c.revoked && c.expiresAt > now,
  );
  return code ? { session, role: code.role } : null;
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * ตรวจสอบ code และสร้าง session ใหม่
 * มี rate-limit 8 ครั้งต่อ 5 นาที
 */
export function login(state: State, code: string, key: string, now = Date.now()) {
  // ล้าง attempt ที่หมดอายุ
  for (const [k, a] of Object.entries(state.attempts)) {
    if (a.until <= now) delete state.attempts[k];
  }

  const attempt = state.attempts[key];
  if (attempt && attempt.count >= 8 && attempt.until > now) {
    return { ok: false as const, status: 429, message: 'ลองหลายครั้งเกินไป กรุณารอ 5 นาที' };
  }

  const match = state.codes.find(c =>
    !c.revoked &&
    c.expiresAt > now &&
    timingSafeEqual(Buffer.from(c.hash, 'hex'), scryptSync(code, c.salt, 32)),
  );

  if (!match) {
    state.attempts[key] = {
      count: (attempt?.count ?? 0) + 1,
      until: attempt?.until ?? now + 300_000,
    };
    return { ok: false as const, status: 401, message: 'โค้ดไม่ถูกต้องหรือหมดอายุ' };
  }

  // สำเร็จ — สร้าง session
  delete state.attempts[key];
  state.sessions = state.sessions.filter(s => s.expiresAt > now);

  const token     = randomBytes(32).toString('hex');
  const expiresAt = Math.min(now + 8 * 3600_000, match.expiresAt);
  state.sessions.push({ hash: digest(token), codeId: match.id, expiresAt });
  state.audit.push({ at: now, action: 'login', detail: match.id });

  return { ok: true as const, token, expiresAt };
}

// ─── Prize queries ────────────────────────────────────────────────────────────

/** จำนวนรางวัลคงเหลือของ prize ID ที่ระบุ */
export function remaining(state: State, prizeId: string): number {
  const prize   = state.prizes.find(p => p.id === prizeId);
  const awarded = state.rounds
    .filter(r => r.prizeId === prizeId && !r.cancelled)
    .reduce((sum, r) => sum + r.winners.length, 0);
  return (prize?.total ?? 0) - awarded;
}

/** รายชื่อผู้มีสิทธิ์ลุ้นรางวัลในรอบถัดไป */
export function eligible(state: State): Participant[] {
  const excluded = new Set(state.excludedIds);
  if (!state.settings.allowRepeat) {
    for (const r of state.rounds) {
      if (!r.cancelled) {
        for (const w of r.winners) excluded.add(w.IndexID);
      }
    }
  }
  return state.participants.filter(p => !excluded.has(p.IndexID));
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/** แปลง Round เป็น PublicRound (ซ่อนผลก่อนถึงเวลา revealAt) */
function projected(state: State, r: State['rounds'][number], now: number): PublicRound {
  const hiddenWinners: PublicRound['winners'] = now < r.revealAt
    ? []
    : r.winners.map(w => ({
        IndexID:    '',
        Name:       state.settings.maskNames
          ? Array.from(w.Name.split(' ')[0]).slice(0, 2).join('') + '•••'
          : w.Name,
        Department: state.settings.showDepartment ? w.Department : '',
        Job_role:   state.settings.showRole       ? w.Job_role   : '',
      }));

  return {
    id:         r.id,
    prizeName:  r.prizeName,
    count:      r.winners.length,
    createdAt:  r.createdAt,
    revealAt:   r.revealAt,
    cancelled:  r.cancelled,
    winners:    hiddenWinners,
  };
}

/**
 * สร้าง Snapshot สำหรับส่งกลับ client
 * ผลรางวัลจะซ่อนอยู่จนกว่าจะถึงเวลา revealAt
 */
export function snapshot(state: State, token?: string, now = Date.now()): Snapshot {
  const user        = identity(state, token, now);
  const activeRound = state.rounds.find(r => r.id === state.activeRoundId);

  const phase: Snapshot['phase'] = activeRound
    ? (now < activeRound.revealAt ? 'drawing' : 'revealed')
    : 'ready';

  const recentHistory = state.rounds
    .filter(r => now >= r.revealAt)
    .slice(-100)
    .reverse()
    .map(r => projected(state, r, now));

  return {
    version:          state.version,
    serverNow:        now,
    demo:             state.demo,
    settings:         state.settings,
    eligibleCount:    eligible(state).length,
    participantCount: state.participants.length,
    prizes:           state.prizes.map(p => ({ ...p, remaining: remaining(state, p.id) })),
    currentPrizeId:   state.currentPrizeId,
    active:           activeRound ? projected(state, activeRound, now) : null,
    history:          recentHistory,
    role:             user?.role ?? 'viewer',
    sessionExpiresAt: user?.session.expiresAt,
    phase,
    realtime:         false,
  };
}

// ─── Guard ────────────────────────────────────────────────────────────────────

/**
 * ตรวจว่า state พร้อมรับคำสั่งใหม่
 * (ไม่มีรอบที่กำลัง drawing อยู่)
 */
export function assertReady(state: State, now = Date.now()): void {
  const active = state.rounds.find(r => r.id === state.activeRoundId);
  if (active && active.revealAt > now) {
    throw new AppError(409, 'กำลังเปิดผล กรุณารอสักครู่');
  }
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

const drawSchema = z.object({
  requestId: z.string().uuid(),
  prizeId:   z.string().min(1).max(80),
  count:     z.number().int().min(1).max(20),
}).strict();

/**
 * สุ่มผู้โชคดีและบันทึกผล
 * Idempotent: คืนผลเดิมถ้า requestId เคยใช้แล้ว
 * @throws {AppError} เมื่อเงื่อนไขไม่ครบ
 */
export function draw(
  state:    State,
  body:     unknown,
  operator: string,
  now      = Date.now(),
  random:  (max: number) => number = randomInt,
) {
  const params      = drawSchema.parse(body);
  const payloadKey  = JSON.stringify([params.prizeId, params.count]);

  // Idempotency check
  const existing = state.rounds.find(r => r.requestId === params.requestId);
  if (existing) {
    if (existing.payloadKey !== payloadKey) {
      throw new AppError(409, 'รหัสคำสั่งนี้ถูกใช้กับข้อมูลอื่นแล้ว');
    }
    return existing;
  }

  // Guard checks
  assertReady(state, now);
  if (state.activeRoundId) {
    throw new AppError(409, 'กรุณาเตรียมรอบถัดไปก่อนสุ่มอีกครั้ง');
  }

  const prize = state.prizes.find(p => p.id === params.prizeId);
  if (!prize || state.currentPrizeId !== params.prizeId) {
    throw new AppError(409, 'รางวัลเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง');
  }

  const pool = eligible(state);
  if (remaining(state, prize.id) < params.count) {
    throw new AppError(409, 'จำนวนรางวัลไม่เพียงพอ');
  }
  if (pool.length < params.count) {
    throw new AppError(409, 'จำนวนผู้มีสิทธิ์ไม่เพียงพอ');
  }

  // Fisher-Yates partial shuffle
  const winners: Participant[] = [];
  for (let i = 0; i < params.count; i++) {
    const n = random(pool.length);
    if (n < 0 || n >= pool.length || !Number.isInteger(n)) {
      throw new Error('Invalid random source');
    }
    winners.push({ ...pool[n] });
    pool[n] = pool[pool.length - 1];
    pool.pop();
  }

  const round = {
    id:            randomUUID(),
    requestId:     params.requestId,
    payloadKey,
    prizeId:       prize.id,
    prizeName:     prize.name,
    winners,
    eligibleCount: pool.length + params.count,
    createdAt:     now,
    revealAt:      now + 2_200,
    operator,
  };

  state.rounds.push(round);
  state.activeRoundId = round.id;
  state.version++;
  state.audit.push({ at: now, action: 'draw', detail: round.id });

  return round;
}

// ─── Edit commands ────────────────────────────────────────────────────────────

/**
 * ประมวลผลคำสั่งจากผู้จัด (prepare, replay, import, settings, prize, cancel)
 * @throws {AppError} เมื่อสิทธิ์ไม่เพียงพอหรือข้อมูลไม่ถูกต้อง
 */
export function edit(
  state:  State,
  action: string,
  body:   unknown,
  role:   Code['role'],
  now     = Date.now(),
): void {
  assertReady(state, now);

  if (action === 'prepare') {
    const { prizeId } = z.object({ prizeId: z.string() }).parse(body);
    if (!state.prizes.some(p => p.id === prizeId)) {
      throw new AppError(404, 'ไม่พบรางวัล');
    }
    state.currentPrizeId = prizeId;
    state.activeRoundId  = null;
    return;
  }

  if (action === 'replay') {
    const { roundId } = z.object({ roundId: z.string().uuid() }).parse(body);
    const round = state.rounds.find(r => r.id === roundId && !r.cancelled);
    if (!round || round.revealAt > now) {
      throw new AppError(404, 'ไม่พบผลที่เปิดเผยแล้ว');
    }
    state.activeRoundId  = round.id;
    state.currentPrizeId = round.prizeId;
    return;
  }

  // คำสั่งด้านล่างต้องการสิทธิ์ admin
  if (role !== 'admin') {
    throw new AppError(403, 'ต้องใช้สิทธิ์แอดมิน');
  }

  if (action === 'import') {
    if (state.rounds.length) {
      throw new AppError(409, 'งานเริ่มสุ่มแล้ว ไม่สามารถแทนที่รายชื่อได้');
    }
    const { csv } = z.object({ csv: z.string().max(2_000_000) }).parse(body);
    try {
      state.participants = parseParticipants(csv);
    } catch (e) {
      throw new AppError(400, e instanceof Error ? e.message : 'CSV ไม่ถูกต้อง');
    }

  } else if (action === 'settings') {
    const values = z.object({
      name:           z.string().trim().min(1).max(80),
      allowRepeat:    z.boolean(),
      showDepartment: z.boolean(),
      showRole:       z.boolean(),
      maskNames:      z.boolean(),
    }).strict().parse(body);

    if (state.rounds.length && values.allowRepeat !== state.settings.allowRepeat) {
      throw new AppError(409, 'ไม่สามารถเปลี่ยนกติการางวัลซ้ำหลังเริ่มงาน');
    }
    state.settings = values;

  } else if (action === 'prize') {
    const prize = z.object({
      id:       z.string().min(1).max(80),
      name:     z.string().trim().min(1).max(100),
      total:    z.number().int().min(1).max(5_000),
      kind:     z.enum(['audio', 'watch', 'bag', 'gift']),
      imageUrl: z.string().max(1_500).optional(),
    }).strict().parse(body);

    // ตรวจสอบ imageUrl เป็น HTTPS
    if (prize.imageUrl) {
      let url: URL;
      try {
        url = new URL(prize.imageUrl);
      } catch {
        throw new AppError(400, 'ลิงก์รูปภาพไม่ถูกต้อง');
      }
      if (url.protocol !== 'https:') {
        throw new AppError(400, 'รูปภาพต้องเป็น HTTPS');
      }
    } else {
      delete prize.imageUrl;
    }

    const awarded = state.rounds
      .filter(r => r.prizeId === prize.id && !r.cancelled)
      .reduce((sum, r) => sum + r.winners.length, 0);

    if (prize.total < awarded) {
      throw new AppError(409, 'จำนวนทั้งหมดน้อยกว่ารางวัลที่แจกแล้ว');
    }

    const idx = state.prizes.findIndex(p => p.id === prize.id);
    if (idx >= 0) {
      state.prizes[idx] = prize;
    } else {
      if (state.prizes.length >= 200) {
        throw new AppError(400, 'รองรับรางวัลไม่เกิน 200 ประเภท');
      }
      state.prizes.push(prize);
    }
    if (!state.currentPrizeId) state.currentPrizeId = prize.id;

  } else if (action === 'cancel') {
    const params = z.object({
      roundId:           z.string().uuid(),
      reason:            z.string().trim().min(5).max(300),
      returnEligibility: z.boolean(),
    }).parse(body);

    const round = state.rounds.find(r => r.id === params.roundId);
    if (!round || round.cancelled) {
      throw new AppError(409, 'ไม่พบรอบที่ยกเลิกได้');
    }

    round.cancelled = { reason: params.reason, at: now };

    if (!params.returnEligibility) {
      state.excludedIds = [
        ...new Set([...state.excludedIds, ...round.winners.map(w => w.IndexID)]),
      ];
    }
    if (state.activeRoundId === round.id) {
      state.activeRoundId = null;
    }

  } else {
    throw new AppError(404, 'ไม่พบคำสั่ง');
  }

  state.version++;
  state.audit.push({ at: now, action, detail: 'event updated' });
}

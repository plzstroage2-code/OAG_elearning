import { z } from 'zod';
import type { State } from './types';
import { AppError, assertReady } from './domain';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const personSchema = z.object({
  IndexID:    z.string().min(1).max(80),
  Name:       z.string().min(1).max(160),
  Department: z.string().max(200),
  Job_role:   z.string().max(160),
}).strict();

const timestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(8_640_000_000_000_000); // max JS Date value

const prizeSchema = z.object({
  id:        z.string().min(1).max(80),
  name:      z.string().min(1).max(100),
  total:     z.number().int().min(1).max(5_000),
  kind:      z.enum(['audio', 'watch', 'bag', 'gift']),
  imageUrl:  z.string().url().startsWith('https://').max(1_500).optional(),
});

const roundSchema = z.object({
  id:             z.string().uuid(),
  requestId:      z.string().uuid(),
  payloadKey:     z.string().max(300),
  prizeId:        z.string(),
  prizeName:      z.string().max(100),
  winners:        z.array(personSchema).min(1).max(20),
  eligibleCount:  z.number().int().nonnegative(),
  createdAt:      timestampSchema,
  revealAt:       timestampSchema,
  operator:       z.string(),
  cancelled:      z.object({
    reason: z.string().min(5).max(300),
    at:     timestampSchema,
  }).optional(),
}).strict();

const backupSchema = z.object({
  schemaVersion:  z.literal(1),
  version:        z.number().int().positive(),
  settings: z.object({
    name:           z.string().min(1).max(80),
    allowRepeat:    z.boolean(),
    showDepartment: z.boolean(),
    showRole:       z.boolean(),
    maskNames:      z.boolean(),
  }).strict(),
  participants:   z.array(personSchema).max(5_000),
  prizes:         z.array(prizeSchema).max(200),
  rounds:         z.array(roundSchema).max(10_000),
  currentPrizeId: z.string(),
  activeRoundId:  z.string().uuid().nullable(),
  excludedIds:    z.array(z.string()).max(5_000),
}).strict();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

// ─── Restore ──────────────────────────────────────────────────────────────────

/**
 * กู้คืน State จากไฟล์สำรอง JSON
 * ตรวจสอบความสมบูรณ์ของข้อมูลก่อนนำเข้า
 * เซสชันทั้งหมดจะถูกยกเลิกทันที
 * @throws {AppError} เมื่อข้อมูลไม่ถูกต้อง
 */
export function restoreBackup(state: State, input: unknown, now = Date.now()): void {
  assertReady(state, now);

  const b = backupSchema.parse(input);

  // ── ตรวจสอบ uniqueness ─────────────────────────────────────────────────────
  if (
    !allUnique(b.participants.map(p => p.IndexID)) ||
    !allUnique(b.prizes.map(p => p.id))            ||
    !allUnique(b.rounds.map(r => r.id))            ||
    !allUnique(b.rounds.map(r => r.requestId))
  ) {
    throw new AppError(400, 'รหัสในไฟล์สำรองซ้ำ');
  }

  // ── ตรวจสอบ foreign-key references ────────────────────────────────────────
  const peopleIds = new Set(b.participants.map(p => p.IndexID));
  const prizeIds  = new Set(b.prizes.map(p => p.id));

  const hasInvalidCurrentPrize = b.currentPrizeId && !prizeIds.has(b.currentPrizeId);
  const hasInvalidActiveRound  = b.activeRoundId && !b.rounds.some(r => r.id === b.activeRoundId);
  const hasInvalidExcluded     = b.excludedIds.some(id => !peopleIds.has(id));

  if (hasInvalidCurrentPrize || hasInvalidActiveRound || hasInvalidExcluded) {
    throw new AppError(400, 'ข้อมูลอ้างอิงในไฟล์สำรองไม่ครบ');
  }

  // ── ตรวจสอบ rounds ─────────────────────────────────────────────────────────
  const usedWinnerIds = new Set<string>();

  for (const r of b.rounds) {
    const expectedPayloadKey = JSON.stringify([r.prizeId, r.winners.length]);
    const isValidRound =
      prizeIds.has(r.prizeId)                      &&
      allUnique(r.winners.map(w => w.IndexID))      &&
      r.winners.every(w => peopleIds.has(w.IndexID)) &&
      r.revealAt >= r.createdAt                     &&
      r.revealAt <= now                             &&
      r.payloadKey === expectedPayloadKey           &&
      r.eligibleCount >= r.winners.length;

    if (!isValidRound) {
      throw new AppError(400, 'ผลรางวัลในไฟล์สำรองไม่ถูกต้อง');
    }

    // ตรวจสอบผู้ชนะซ้ำ (กรณีไม่อนุญาตซ้ำ)
    if (!r.cancelled && !b.settings.allowRepeat) {
      for (const w of r.winners) {
        if (usedWinnerIds.has(w.IndexID)) {
          throw new AppError(400, 'พบผู้ชนะซ้ำขัดกับกติกา');
        }
        usedWinnerIds.add(w.IndexID);
      }
    }
  }

  // ── ตรวจสอบโควตารางวัล ────────────────────────────────────────────────────
  for (const p of b.prizes) {
    const awarded = b.rounds
      .filter(r => r.prizeId === p.id && !r.cancelled)
      .reduce((sum, r) => sum + r.winners.length, 0);

    if (awarded > p.total) {
      throw new AppError(400, 'จำนวนรางวัลเกินโควตา');
    }
  }

  // ── นำเข้าข้อมูล ──────────────────────────────────────────────────────────
  const oldVersion = state.version;
  Object.assign(state, b);
  state.version  = Math.max(oldVersion, b.version) + 1;
  state.sessions = []; // revoke sessions ทั้งหมด
  state.audit.push({
    at:     now,
    action: 'restore',
    detail: 'Validated backup restored; sessions revoked',
  });
}

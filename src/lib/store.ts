import { mkdir, readFile, rename, open, copyFile } from 'node:fs/promises';
import { dirname, resolve }                         from 'node:path';
import { Pool }                                     from 'pg';
import type { State }                               from './types';
import { seedState }                                from './domain';

// ─── Store interface ──────────────────────────────────────────────────────────

/** Interface สำหรับ data store ทั้งแบบ file และ PostgreSQL */
type Store = {
  /** อ่าน State ปัจจุบัน */
  read(): Promise<State>;
  /** อ่าน State → รัน fn (mutate) → บันทึก — atomic per process */
  transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T>;
};

// ─── Global singletons (Hot reload safe) ─────────────────────────────────────

/** เก็บ queue และ pool ใน globalThis เพื่อไม่ให้ HMR สร้างใหม่ */
const globals = globalThis as unknown as {
  drawQueues?: Map<string, Promise<unknown>>;
  drawPool?:   Pool;
};
const queues = globals.drawQueues ??= new Map();

// ─── File store ───────────────────────────────────────────────────────────────

/**
 * สร้าง file-based store (สำหรับ demo / dev)
 * ใช้ mutex queue เพื่อป้องกัน race condition ภายใน process เดียว
 */
export function createFileStore(path: string, initial: () => State): Store {
  // ── mutex ──────────────────────────────────────────────────────────────────
  async function locked<T>(fn: () => Promise<T>): Promise<T> {
    const previous = queues.get(path) ?? Promise.resolve();
    const next     = previous.catch(() => {}).then(fn);
    queues.set(path, next.then(() => {}, () => {}));
    return next;
  }

  // ── load ───────────────────────────────────────────────────────────────────
  async function load(): Promise<State> {
    try {
      const raw  = await readFile(path, 'utf8');
      const data = JSON.parse(raw) as State;
      if (
        data.schemaVersion !== 1 ||
        !Array.isArray(data.rounds) ||
        !Array.isArray(data.codes)
      ) {
        throw new Error('Invalid state file');
      }
      return data;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(
          'ข้อมูลสาธิตเสียหาย กรุณากู้จากไฟล์สำรอง ห้ามสร้างงานใหม่ทับข้อมูลเดิม',
        );
      }
      return initial();
    }
  }

  // ── save (atomic write + backup) ───────────────────────────────────────────
  async function save(state: State): Promise<void> {
    await mkdir(dirname(path), { recursive: true });

    const temp   = path + '.tmp';
    const handle = await open(temp, 'w');
    try {
      await handle.writeFile(JSON.stringify(state));
      await handle.sync();
    } finally {
      await handle.close();
    }

    // เก็บ backup ก่อน rename
    try {
      await copyFile(path, path + '.bak');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }

    await rename(temp, path);
  }

  // ── store implementation ───────────────────────────────────────────────────
  return {
    read: () => locked(async () => {
      const s = await load();
      // สร้างไฟล์ถ้ายังไม่มี
      try {
        await readFile(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          await save(s);
        } else {
          throw e;
        }
      }
      return s;
    }),

    transaction: <T>(fn: (state: State) => T | Promise<T>) =>
      locked(async () => {
        const state  = await load();
        const result = await fn(state);
        await save(state);
        return result;
      }),
  };
}

// ─── Initial state factory ────────────────────────────────────────────────────

/** สร้าง initial state โดยอ่านจาก env variables */
function initialState(): State {
  const isLive = process.env.APP_MODE === 'live';
  const code   = process.env.ADMIN_ACCESS_CODE ?? (isLive ? '' : 'ICTC-DEMO');

  if (
    isLive && (
      code.length < 16 ||
      process.env.DATA_DRIVER !== 'postgres' ||
      !process.env.APP_ORIGIN?.startsWith('https://')
    )
  ) {
    throw new Error(
      'Live mode requires PostgreSQL, HTTPS origin and ADMIN_ACCESS_CODE of at least 16 characters',
    );
  }

  const expiryRaw = process.env.CODE_EXPIRES_AT;
  const expiry    = expiryRaw ? Date.parse(expiryRaw) : undefined;

  if (expiry !== undefined && (!Number.isFinite(expiry) || expiry <= Date.now())) {
    throw new Error('CODE_EXPIRES_AT must be a future date');
  }

  return seedState(!isLive, code, expiry);
}

// ─── PostgreSQL store ─────────────────────────────────────────────────────────

/** สร้าง PostgreSQL-backed store (สำหรับ production) */
async function postgresStore(): Promise<Store> {
  if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');

  const pool = globals.drawPool ??= new Pool({
    connectionString:      process.env.DATABASE_URL,
    max:                   3,
    idleTimeoutMillis:     20_000,
    connectionTimeoutMillis: 8_000,
    ssl:                   { rejectUnauthorized: true },
  });

  const eventId = process.env.NEXT_PUBLIC_REALTIME_EVENT || 'ictc-main';

  /** ตรวจสอบว่า document ที่โหลดมาตรงกับ APP_MODE */
  function checked(document: State): State {
    const expectedDemo = process.env.APP_MODE !== 'live';
    if (document.schemaVersion !== 1 || document.demo !== expectedDemo) {
      throw new Error(
        'Stored event mode does not match APP_MODE. Use a separate event ID for live and rehearsal.',
      );
    }
    return document;
  }

  // Bootstrap (idempotent — only winning INSERT persists its code hash)
  const present = await pool.query('select 1 from draw_private.events where id=$1', [eventId]);
  if (!present.rowCount) {
    await pool.query(
      'insert into draw_private.events(id,document) values($1,$2) on conflict do nothing',
      [eventId, JSON.stringify(initialState())],
    );
  }

  return {
    async read() {
      const result = await pool.query(
        'select document from draw_private.events where id=$1',
        [eventId],
      );
      return checked(result.rows[0].document as State);
    },

    async transaction<T>(fn: (s: State) => T | Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query("set local lock_timeout = '5s'");
        await client.query("set local statement_timeout = '15s'");

        const res   = await client.query(
          'select document from draw_private.events where id=$1 for update',
          [eventId],
        );
        const state   = checked(res.rows[0].document as State);
        const oldVer  = state.version;
        const result  = await fn(state);

        await client.query(
          'update draw_private.events set document=$2, updated_at=now() where id=$1',
          [eventId, JSON.stringify(state)],
        );

        // ส่ง Realtime signal ถ้า version เปลี่ยน
        if (state.version !== oldVer) {
          await client.query(
            'insert into public.stage_signals(event_id,revision) values($1,$2) on conflict(event_id) do update set revision=excluded.revision',
            [eventId, state.version],
          );
        }

        await client.query('commit');
        return result;
      } catch (e) {
        await client.query('rollback');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * คืนค่า Store ที่เหมาะสมตาม env variables
 * - `DATA_DRIVER=postgres` → PostgreSQL
 * - อื่นๆ → JSON file
 */
export async function getStore(): Promise<Store> {
  if (process.env.APP_MODE === 'live') {
    if (
      process.env.DATA_DRIVER !== 'postgres'                     ||
      !process.env.APP_ORIGIN?.startsWith('https://')            ||
      !process.env.ADMIN_ACCESS_CODE                             ||
      process.env.ADMIN_ACCESS_CODE.length < 16
    ) {
      throw new Error('Live configuration incomplete');
    }
  }

  if (process.env.DATA_DRIVER === 'postgres') {
    return postgresStore();
  }

  const filePath = process.env.DRAW_DATA_FILE
    ? resolve(process.env.DRAW_DATA_FILE)
    : resolve(process.cwd(), '.data', 'event.json');

  return createFileStore(filePath, initialState);
}

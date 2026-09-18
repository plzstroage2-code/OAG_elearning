'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowRight,
  Backpack,
  Check,
  ChevronRight,
  CircleHelp,
  Gift,
  Headphones,
  History,
  KeyRound,
  LoaderCircle,
  LogOut,
  Maximize,
  Minimize,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UsersRound,
  Volume2,
  VolumeX,
  Watch,
  X,
  AlertCircle,
} from 'lucide-react';
import type { Snapshot, Prize, Settings } from '@/lib/types';
import { parseParticipants } from '@/lib/csv';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionStatus = 'connecting' | 'online' | 'offline';
type ModalType        = 'login' | 'manage' | 'history' | null;

/** คำสั่งสุ่มที่ยังรอยืนยัน (idempotency key) */
type Intent = {
  requestId: string;
  prizeId:   string;
  count:     number;
};

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Error class สำหรับ API response ที่ไม่ OK */
class ApiFailure extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** POST ไปยัง /api/draw/:action และโยน ApiFailure ถ้าไม่สำเร็จ */
async function post(action: string, body: unknown) {
  const response = await fetch(`/api/draw/${action}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiFailure(response.status, data.error || 'ทำรายการไม่สำเร็จ');
  return data;
}

/** แปลง error unknown เป็นข้อความ */
const getMessage = (e: unknown): string =>
  e instanceof Error ? e.message : 'การเชื่อมต่อขัดข้อง';

// ─── Sub-components ───────────────────────────────────────────────────────────

/** ไอคอนประจำประเภทรางวัล */
function PrizeIcon({ kind, size = 22 }: { kind: string; size?: number }) {
  const Icon = kind === 'audio' ? Headphones
             : kind === 'watch' ? Watch
             : kind === 'bag'   ? Backpack
             : Gift;
  return <Icon size={size} strokeWidth={1.6} />;
}

/** ภาพประกอบรางวัล — แสดง URL, SVG หูฟัง, หรือ generic icon */
function ProductArt({ prize }: { prize: Prize | undefined }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [prize?.imageUrl]);

  if (prize?.imageUrl && !bad) {
    return (
      <img
        className="product-image"
        alt={prize.name}
        src={prize.imageUrl}
        onError={() => setBad(true)}
      />
    );
  }

  if (prize?.kind === 'audio') {
    return (
      <svg
        className="headphone-art"
        viewBox="0 0 380 340"
        aria-label="ภาพประกอบหูฟัง"
        role="img"
      >
        <defs>
          <linearGradient id="band" x1="0" x2="1">
            <stop stopColor="#303536" />
            <stop offset=".35" stopColor="#686f6d" />
            <stop offset=".65" stopColor="#252b2c" />
            <stop offset="1"   stopColor="#626967" />
          </linearGradient>
          <linearGradient id="ear" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#777b73" />
            <stop offset=".45" stopColor="#363b37" />
            <stop offset="1"   stopColor="#171e1b" />
          </linearGradient>
        </defs>
        <ellipse cx="193" cy="296" rx="106" ry="12" fill="#31251c" opacity=".1" />
        <g transform="rotate(-13 190 170)">
          <path d="M87 213v-54a103 103 0 0 1 206 0v54" fill="none" stroke="#202726" strokeWidth="33" />
          <path d="M91 181v-23a99 99 0 0 1 198 0v23"  fill="none" stroke="url(#band)" strokeWidth="22" />
          <path d="M87 158a103 103 0 0 1 206 0"        fill="none" stroke="#939a93" strokeWidth="3" opacity=".7" />
          <path d="M89 172v49M291 172v49"              stroke="#adb3a9" strokeWidth="12" />
          <rect x="62"  y="186" width="62" height="96" rx="28" fill="url(#ear)" />
          <rect x="103" y="192" width="21" height="84" rx="10" fill="#161d1a" />
          <rect x="257" y="186" width="62" height="96" rx="28" fill="url(#ear)" />
          <rect x="257" y="192" width="21" height="84" rx="10" fill="#161d1a" />
          <path d="M74 214v40M306 214v40" stroke="#9b9f96" strokeWidth="2" opacity=".5" />
          <circle cx="300" cy="256" r="3" fill="#ef6b35" />
        </g>
      </svg>
    );
  }

  return (
    <div className={`generic-art ${prize?.kind ?? 'gift'}`}>
      <PrizeIcon kind={prize?.kind ?? 'gift'} size={140} />
    </div>
  );
}

/** Modal dialog พร้อม backdrop-click-to-close และ focus trap */
function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title:    string;
  children: React.ReactNode;
  onClose:  () => void;
  wide?:    boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el       = ref.current;
    const previous = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < r.left  ||
      e.clientX > r.right ||
      e.clientY < r.top   ||
      e.clientY > r.bottom
    ) onClose();
  }

  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      onCancel={onClose}
      onClick={handleBackdropClick}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="ปิด">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/** หน้าเวทีสุ่มรางวัล — entry point ของ client UI */
export default function DrawStage() {

  // ── State ──────────────────────────────────────────────────────────────────
  const [data,       setData]       = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [error,      setError]      = useState('');
  const [notice,     setNotice]     = useState('');
  const [modal,      setModal]      = useState<ModalType>(null);
  const [code,       setCode]       = useState('');
  const [busy,       setBusy]       = useState(false);
  const [count,      setCount]      = useState(1);
  const [sound,      setSound]      = useState(false);
  const [quality,    setQuality]    = useState('balanced');
  const [full,       setFull]       = useState(false);
  const [pending,    setPending]    = useState<Intent | null>(null);
  const [winnerPage, setWinnerPage] = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const reduced       = useReducedMotion();
  const dataRef       = useRef<Snapshot | null>(null);
  const loading       = useRef(false);
  const version       = useRef(0);
  const clockOffset   = useRef(0);
  const audioRef      = useRef<AudioContext | null>(null);
  const heard         = useRef(new Set<string>());
  const mounted       = useRef(true);
  const queued        = useRef(false);
  const realtimeReady = useRef(false);
  const failures      = useRef(0);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!mounted.current)  return;
    if (loading.current)   { queued.current = true; return; }
    loading.current = true;

    try {
      const start = Date.now();
      const r     = await fetch('/api/draw/state', {
        cache:  'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      const next = await r.json();
      if (!r.ok) throw new Error(next.error);
      if (!mounted.current) return;

      if (next.version >= version.current) {
        version.current     = next.version;
        clockOffset.current = next.serverNow - (start + Date.now()) / 2;
        dataRef.current     = next;
        setData(next);
      }
      failures.current = 0;
      setConnection('online');
    } catch {
      failures.current++;
      if (mounted.current) setConnection('offline');
    } finally {
      loading.current = false;
      if (queued.current && mounted.current) {
        queued.current = false;
        setTimeout(() => void refresh(), 50);
      }
    }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Mount: restore persisted prefs and start polling
  useEffect(() => {
    mounted.current = true;
    void refresh();

    try {
      setSound(localStorage.getItem('ictc-sound') === 'true');
      setQuality(localStorage.getItem('ictc-quality') || 'balanced');

      const raw = sessionStorage.getItem('ictc-pending');
      if (raw) {
        const p = JSON.parse(raw);
        if (
          typeof p.requestId === 'string' &&
          typeof p.prizeId   === 'string' &&
          Number.isInteger(p.count)
        ) {
          setPending(p);
        }
      }
    } catch { /* storage unavailable */ }

    // Adaptive polling
    let timer:   ReturnType<typeof setTimeout>;
    let disposed = false;

    const tick = async () => {
      if (document.visibilityState === 'visible') await refresh();
      if (!disposed) {
        const delay = failures.current
          ? Math.min(30_000, 1_500 * 2 ** Math.min(failures.current, 5))
          : realtimeReady.current ? 15_000 : 1_600;
        timer = setTimeout(tick, delay + Math.floor(Math.random() * 400));
      }
    };
    timer = setTimeout(tick, 1_800);

    const wake       = () => void refresh();
    const fullscreen = () => setFull(!!document.fullscreenElement);

    window.addEventListener('online',            wake);
    document.addEventListener('visibilitychange', wake);
    document.addEventListener('fullscreenchange', fullscreen);

    return () => {
      disposed        = true;
      mounted.current = false;
      clearTimeout(timer);
      window.removeEventListener('online',            wake);
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('fullscreenchange', fullscreen);
    };
  }, [refresh]);

  // Auto-refresh when drawing phase expires
  useEffect(() => {
    if (!data?.active || data.phase !== 'drawing') return;
    const delay = Math.max(0, data.active.revealAt - (Date.now() + clockOffset.current));
    const timer = setTimeout(() => void refresh(), delay + 30);
    return () => clearTimeout(timer);
  }, [data?.active?.id, data?.phase, data?.serverNow, refresh]);

  // Supabase realtime subscription
  useEffect(() => {
    if (!data?.realtime) return;
    let disposed = false;
    let cleanup  = () => { /* no-op until subscribed */ };

    import('@supabase/supabase-js').then(({ createClient }) => {
      if (disposed) return;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return;

      const client  = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const channel = client
        .channel('ictc-stage')
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'stage_signals',
            filter: `event_id=eq.${process.env.NEXT_PUBLIC_REALTIME_EVENT || 'ictc-main'}`,
          },
          () => void refresh(),
        )
        .subscribe(status => {
          realtimeReady.current = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') void refresh();
        });

      cleanup = () => {
        realtimeReady.current = false;
        void client.removeChannel(channel);
      };
    }).catch(() => { /* supabase unavailable */ });

    return () => { disposed = true; cleanup(); };
  }, [data?.realtime, refresh]);

  // Reset winner pagination when round changes
  useEffect(() => { setWinnerPage(0); }, [data?.active?.id]);

  // Clamp count to available capacity
  useEffect(() => {
    const prize = data?.prizes.find(p => p.id === data.currentPrizeId);
    setCount(c => Math.max(1, Math.min(c, prize?.remaining ?? 1, data?.eligibleCount ?? 1)));
  }, [data?.currentPrizeId, data?.eligibleCount, data?.prizes]);

  // Play winner chime (once per round)
  useEffect(() => {
    if (!data?.active || data.phase !== 'revealed' || heard.current.has(data.active.id)) return;
    heard.current.add(data.active.id);
    if (!sound || !audioRef.current) return;

    try {
      const ctx = audioRef.current;
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        const t    = ctx.currentTime + i * 0.1;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.035, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    } catch { /* audio unavailable */ }
  }, [data?.active?.id, data?.phase, sound]);

  // Auto-dismiss notice toast
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4_000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  /** ส่ง action ไปยัง API และ refresh หลังจากนั้น */
  async function action(name: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await post(name, body);
      await refresh();
      return true;
    } catch (e) {
      setError(getMessage(e));
      if (e instanceof ApiFailure && e.status === 401) void refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Submit login form */
  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    if (await action('login', { code })) {
      setCode('');
      setModal(null);
      setNotice('ยืนยันสิทธิ์ผู้จัดแล้ว');
    }
  }

  /** เริ่มสุ่มรางวัล (หรือส่ง intent เดิมซ้ำ) */
  async function startDraw(intent?: Intent) {
    if (!data || busy) return;

    const command = intent ?? {
      requestId: crypto.randomUUID(),
      prizeId:   data.currentPrizeId,
      count,
    };

    setError('');
    setBusy(true);
    setPending(command);

    try {
      sessionStorage.setItem('ictc-pending', JSON.stringify(command));
    } catch { /* storage unavailable */ }

    try {
      await post('draw', command);
      setPending(null);
      try { sessionStorage.removeItem('ictc-pending'); } catch { /* ignore */ }
      await refresh();
    } catch (e) {
      const isDefiniteFailure =
        e instanceof ApiFailure && e.status < 500 && e.status !== 401;
      if (isDefiniteFailure) {
        setPending(null);
        try { sessionStorage.removeItem('ictc-pending'); } catch { /* ignore */ }
      }
      setError(e instanceof ApiFailure ? e.message : 'ยังไม่ทราบผลคำสั่ง กรุณากดตรวจสอบคำสั่งเดิม');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  /** กู้คืนผลจาก requestId ที่ค้างอยู่ */
  async function recover() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const r      = await fetch(`/api/draw/request?id=${encodeURIComponent(pending.requestId)}`, {
        cache: 'no-store',
      });
      const result = await r.json();
      if (!r.ok) throw new ApiFailure(r.status, result.error);

      if (result.found) {
        setPending(null);
        try { sessionStorage.removeItem('ictc-pending'); } catch { /* ignore */ }
        await refresh();
        setNotice('กู้ผลคำสั่งเดิมแล้ว');
      } else {
        setBusy(false);
        await startDraw(pending);
      }
    } catch (e) {
      setError(getMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** เปิด/ปิดเสียง */
  function toggleSound() {
    const enabled = !sound;
    setSound(enabled);
    try {
      localStorage.setItem('ictc-sound', String(enabled));
      if (enabled) {
        audioRef.current ??= new AudioContext();
        void audioRef.current.resume();
      }
    } catch {
      setNotice('อุปกรณ์นี้ยังไม่พร้อมเล่นเสียง');
    }
  }

  /** Toggle fullscreen */
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setNotice('เบราว์เซอร์ไม่อนุญาตเต็มหน้าจอ ใช้โหมดขยายหน้าต่างแทนได้');
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const prize       = data?.prizes.find(p => p.id === data.currentPrizeId);
  const organizer   = !!data && data.role !== 'viewer';
  const drawing     = data?.phase === 'drawing';
  const revealed    = data?.phase === 'revealed' && !!data.active;
  const active      = data?.active;
  const disableDraw =
    busy                              ||
    connection !== 'online'           ||
    drawing                           ||
    !!pending                         ||
    !prize                            ||
    prize.remaining < count           ||
    (data?.eligibleCount ?? 0) < count;
  const winners = active?.winners.slice(winnerPage * 4, winnerPage * 4 + 4) ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className={`app quality-${quality} ${reduced ? 'reduced' : ''} ${full ? 'is-fullscreen' : ''}`}>

      {/* ── Topbar ── */}
      <header className="topbar">
        <a className="brand" href="/" aria-label="ICTC e-Learning หน้าแรก">
          <span className="brand-mark">
            <img src="/oag-logo.png" alt="OAG Logo" width={32} height={32} />
          </span>
          <span>
            <strong>ICTC<span className="brand-divider">/</span>e-Learning</strong>
            <small>สำนักเทคโนโลยีสารสนเทศและการสื่อสาร สำนักงานอัยการสูงสุด</small>
          </span>
        </a>

        <div className="top-actions">
          <span className={`connection ${connection}`}>
            <i />
            {connection === 'online'  ? 'เชื่อมต่อแล้ว'
           : connection === 'offline' ? 'กำลังเชื่อมต่อใหม่'
           :                            'กำลังเชื่อมต่อ'}
          </span>

          {data?.demo && <span className="demo-label">โหมดสาธิต</span>}

          <button
            className="icon-button"
            onClick={toggleSound}
            aria-label={sound ? 'ปิดเสียง' : 'เปิดเสียง'}
            title={sound ? 'ปิดเสียง' : 'เปิดเสียง'}
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>

          <button
            className="icon-button"
            onClick={toggleFullscreen}
            aria-label={full ? 'ออกจากเต็มหน้าจอ' : 'เต็มหน้าจอ'}
            title="เต็มหน้าจอ"
          >
            {full ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </header>

      {/* ── Workspace ── */}
      <div className="workspace">

        {/* Stage column */}
        <section className="stage-column">

          {/* Intro */}
          <div className="stage-intro">
            <div>
              <span className="eyebrow"><span /> LIVE LUCKY DRAW</span>
              <h1>ช่วงเวลาแห่ง<span>ความโชคดี</span></h1>
              <p>{data?.settings.name ?? 'ICTC e-Learning'} · ขอบคุณที่ร่วมเรียนรู้ไปด้วยกัน</p>
            </div>
            <div className="edition">
              <span>LEARN.</span>
              <span>GROW.</span>
              <span className="orange">GET LUCKY.</span>
            </div>
          </div>

          {/* Stage */}
          <section
            className={`stage ${drawing ? 'is-drawing' : ''} ${revealed ? 'is-revealed' : ''}`}
            aria-label="เวทีสุ่มรางวัล"
          >
            <div className="stage-top">
              <span className="stage-status">
                <span className="status-dot" />
                {drawing  ? 'กำลังสุ่มผู้โชคดี'
               : revealed ? 'ประกาศผู้โชคดี'
               :            'รางวัลในรอบนี้'}
              </span>
              <span className="round-label">
                {active
                  ? `รอบที่ ${Math.max(1, (data?.history.length ?? 0) + (drawing ? 1 : 0))}`
                  : 'พร้อมรับความโชคดี'}
              </span>
            </div>

            <div className="stage-ring ring-one" />
            <div className="stage-ring ring-two" />

            <AnimatePresence mode="wait">
              {revealed && active ? (
                // ── Result panel ──
                <motion.div
                  key={`result-${active.id}`}
                  className="result"
                  initial={{ opacity: 0, y: reduced ? 0 : 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduced ? 0.1 : 0.45 }}
                >
                  <span className="result-kicker">
                    <Sparkles size={18} /> ขอแสดงความยินดี
                  </span>
                  <h2>{active.prizeName}</h2>

                  <div
                    className={`winner-list ${winners.length > 1 ? 'multiple' : ''}`}
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {winners.map((w, i) => (
                      <div className="winner" key={`${active.id}-${winnerPage}-${i}`}>
                        <span className="winner-number">
                          {String(winnerPage * 4 + i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <h3>{w.Name}</h3>
                          {w.Department && <p>{w.Department}</p>}
                          {w.Job_role   && <small>{w.Job_role}</small>}
                        </div>
                        <ShieldCheck size={22} />
                      </div>
                    ))}
                  </div>

                  {active.winners.length > 4 && (
                    <div className="pager">
                      <button
                        disabled={winnerPage === 0}
                        onClick={() => setWinnerPage(p => p - 1)}
                      >
                        ก่อนหน้า
                      </button>
                      <span>{winnerPage + 1} / {Math.ceil(active.winners.length / 4)}</span>
                      <button
                        disabled={(winnerPage + 1) * 4 >= active.winners.length}
                        onClick={() => setWinnerPage(p => p + 1)}
                      >
                        ถัดไป
                      </button>
                    </div>
                  )}

                  <span className="result-note">
                    <Check size={14} /> ผลรางวัลจากระบบกลาง
                  </span>
                </motion.div>
              ) : (
                // ── Prize preview ──
                <motion.div
                  key="prize"
                  className="prize-scene"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="prize-art-wrap">
                    <div className="orbit-label">A LITTLE LUCK, A BIG SMILE</div>
                    <ProductArt prize={prize} />
                    <div className="pedestal" />
                    <div className="prize-sticker">
                      <Sparkles size={17} /><span>FOR YOU</span>
                    </div>
                  </div>
                  <div className="prize-description">
                    <span className="eyebrow">
                      {drawing ? 'YOUR LUCKY MOMENT' : 'THE NEXT LITTLE JOY'}
                    </span>
                    <h2>
                      {prize?.name ?? (data ? 'เตรียมรางวัลแรกของงาน' : 'กำลังเตรียมเวที')}
                    </h2>
                    <p>
                      {drawing ? 'อีกสักครู่… ใครจะเป็นผู้โชคดี'
                      : prize  ? `เหลือ ${prize.remaining} รางวัล · มาร่วมลุ้นไปด้วยกัน`
                      :          'ผู้จัดสามารถเพิ่มรางวัลได้จากเมนูจัดการ'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Drawing ribbon */}
            {drawing && (
              <div className="draw-ribbon" aria-hidden="true">
                <span>ICTC e-Learning</span>
                <Sparkles />
                <span>กำลังสุ่มผู้โชคดี</span>
                <Sparkles />
                <span>ICTC e-Learning</span>
              </div>
            )}

            {/* Confetti */}
            {revealed && !reduced && quality !== 'economy' && (
              <div className="confetti" key={active?.id} aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <i
                    key={i}
                    style={{
                      left:           `${i < 9 ? i * 3 : 76 + (i - 9) * 3}%`,
                      animationDelay: `${(i % 5) * 0.06}s`,
                      transform:      `rotate(${i * 31}deg)`,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="stage-bottom">
              <span>
                <Gift size={15} />{' '}
                {prize ? `${prize.remaining} / ${prize.total} รางวัลคงเหลือ` : 'เวทีรางวัล'}
              </span>
              <span>ICTC · LEARNING TOGETHER</span>
            </div>
          </section>

          {/* Action bar */}
          <div className="action-bar">
            <div className="participant-stat">
              <span className="stat-icon"><UsersRound size={21} /></span>
              <div>
                <strong>
                  {data?.eligibleCount.toLocaleString() ?? '—'} <small>คน</small>
                </strong>
                <span>ผู้มีสิทธิ์ในรอบถัดไป</span>
              </div>
            </div>

            <div className="draw-controls">
              {organizer && (
                <>
                  {/* Count selector */}
                  {!revealed && !pending && (
                    <label className="count-control">
                      ผู้ชนะ
                      <select
                        aria-label="จำนวนผู้ชนะ"
                        value={count}
                        disabled={busy || drawing}
                        onChange={e => setCount(Number(e.target.value))}
                      >
                        {Array.from(
                          { length: Math.max(1, Math.min(20, prize?.remaining ?? 1, data?.eligibleCount ?? 1)) },
                          (_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1} คน</option>
                          ),
                        )}
                      </select>
                    </label>
                  )}

                  {/* Primary action button */}
                  {pending ? (
                    <button className="primary" onClick={recover} disabled={busy}>
                      {busy
                        ? <LoaderCircle className="spin" size={18} />
                        : <RotateCcw size={18} />}
                      ตรวจสอบคำสั่งเดิม
                    </button>
                  ) : revealed ? (
                    <button
                      className="primary"
                      disabled={busy || connection !== 'online'}
                      onClick={() => void action('prepare', { prizeId: data.currentPrizeId })}
                    >
                      เตรียมรอบถัดไป <ArrowRight size={19} />
                    </button>
                  ) : (
                    <button
                      className="primary draw-button"
                      disabled={disableDraw}
                      onClick={() => void startDraw()}
                    >
                      {busy || drawing
                        ? <LoaderCircle className="spin" size={19} />
                        : <Sparkles size={20} />}
                      {' '}
                      {drawing ? 'กำลังสุ่มผู้โชคดี' : busy ? 'กำลังส่งคำสั่ง' : 'สุ่มผู้โชคดี'}
                      {!drawing && !busy && <ArrowRight size={19} />}
                    </button>
                  )}
                </>
              )}

              {!organizer && (
                <div className="viewer-message">
                  <span className={drawing ? 'pulse-dot' : 'quiet-dot'} />
                  {drawing  ? 'กำลังลุ้นไปพร้อมกัน…'
                 : revealed ? 'ยินดีกับผู้โชคดีทุกท่าน'
                 :            'รอผู้จัดเริ่มสุ่มรางวัล'}
                </div>
              )}
            </div>
          </div>

          {/* Error alert */}
          {error && (
            <div className="alert" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button className="icon-button" aria-label="ปิดข้อความ" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}

          {/* Offline note */}
          {connection === 'offline' && (
            <div className="connection-note" role="status">
              กำลังเชื่อมต่อใหม่ ผลที่แสดงเป็นข้อมูลล่าสุดที่ได้รับ · ปุ่มสุ่มจะพร้อมเมื่อเชื่อมต่อสำเร็จ
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div>
              <span className="eyebrow">THE REWARD LINEUP</span>
              <h2>รางวัลวันนี้<span>{data?.prizes.length ?? 0}</span></h2>
            </div>
            <Gift size={22} />
          </div>

          {/* Prize lineup */}
          <div className="prize-lineup">
            {data?.prizes.map((p, i) => (
              <button
                key={p.id}
                className={[
                  'lineup-item',
                  p.id === data.currentPrizeId ? 'selected'  : '',
                  p.remaining === 0            ? 'sold-out'  : '',
                ].join(' ')}
                disabled={!organizer || busy || drawing || !!pending}
                onClick={() => { setCount(1); void action('prepare', { prizeId: p.id }); }}
              >
                <span className="lineup-art"><PrizeIcon kind={p.kind} size={27} /></span>
                <span className="lineup-info">
                  <small>รางวัล {String(i + 1).padStart(2, '0')}</small>
                  <strong>{p.name}</strong>
                  <span>{p.remaining > 0 ? `${p.remaining} รางวัลคงเหลือ` : 'มอบครบแล้ว'}</span>
                </span>
                {p.id === data.currentPrizeId
                  ? <span className="selected-dot" />
                  : <ChevronRight size={16} />}
              </button>
            ))}
            {data?.prizes.length === 0 && (
              <p className="muted">ยังไม่มีรางวัล ผู้จัดเพิ่มรางวัลได้จากแผงจัดการ</p>
            )}
          </div>

          {/* History preview */}
          <div className="history-preview">
            <div className="section-title">
              <h3>ความโชคดีที่ผ่านมา</h3>
              <span>{data?.history.filter(r => !r.cancelled).length ?? 0} รอบ</span>
            </div>

            {data?.history
              .filter(r => !r.cancelled)
              .slice(0, 2)
              .map(r => (
                <div className="mini-result" key={r.id}>
                  <span className="mini-check"><Check size={15} /></span>
                  <div>
                    <strong>
                      {r.winners[0]?.Name}
                      {r.winners.length > 1 ? ` และอีก ${r.winners.length - 1} คน` : ''}
                    </strong>
                    <small>{r.prizeName}</small>
                  </div>
                </div>
              ))}

            {!data?.history.length && (
              <div className="first-moment">
                <span>01</span>
                <p>รอเรื่องราวดี ๆ<br />ของผู้โชคดีคนแรก</p>
              </div>
            )}

            <button className="text-button" onClick={() => setModal('history')}>
              ดูผลทั้งหมด <ArrowRight size={15} />
            </button>
          </div>

          {/* Side note */}
          <div className="side-note">
            <span className="note-mark">"</span>
            <p>ทุกการเรียนรู้<br />มีสิ่งดี ๆ รออยู่เสมอ</p>
            <span>ICTC e-Learning</span>
          </div>
        </aside>
      </div>

      {/* ── Footer ── */}
      <footer>
        <span>
          ICTC e-Learning <span className="footer-dot">·</span>{' '}
          {data?.demo ? 'ข้อมูลสมมติสำหรับซ้อมระบบ' : 'เวทีสุ่มรางวัล'}
        </span>
        <div>
          {organizer ? (
            <>
              <span className="organizer-label"><ShieldCheck size={14} /> ผู้จัด</span>
              <button onClick={() => setModal('manage')}>
                <Settings2 size={15} /> จัดการ
              </button>
              <button onClick={() => void action('logout', {})}>
                <LogOut size={14} /> ออกจากสิทธิ์
              </button>
            </>
          ) : (
            <button onClick={() => { setError(''); setModal('login'); }}>
              <KeyRound size={14} /> สำหรับผู้จัด
            </button>
          )}
        </div>
      </footer>

      {/* ── Toast ── */}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />{notice}
        </div>
      )}

      {/* ── Modals ── */}

      {modal === 'login' && (
        <Dialog title="ยืนยันสิทธิ์ผู้จัด" onClose={() => { setModal(null); setCode(''); }}>
          <div className="login-icon"><KeyRound size={27} /></div>
          <p className="muted">กรอกโค้ดที่ได้รับจากแอดมินเพื่อเปิดปุ่มสุ่มและเครื่องมือจัดการ</p>
          <form onSubmit={submitLogin}>
            <label className="field">
              โค้ดผู้จัด
              <input
                autoFocus
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
                autoComplete="off"
                maxLength={160}
                required
                placeholder="กรอกโค้ดของคุณ"
              />
            </label>
            {error && <p className="field-error" role="alert">{error}</p>}
            <button className="primary full-width" disabled={busy || !code.trim()}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
              ยืนยันสิทธิ์
            </button>
          </form>
          {data?.demo && (
            <p className="demo-help">
              <CircleHelp size={16} /> โหมดซ้อมในเครื่อง · ใช้โค้ด <code>ICTC-DEMO</code>
            </p>
          )}
        </Dialog>
      )}

      {modal === 'history' && (
        <Dialog title="ผลการสุ่มทั้งหมด" onClose={() => setModal(null)} wide>
          <p className="muted">แสดงเฉพาะผลที่ถึงเวลาประกาศแล้ว</p>
          {!data?.history.length ? (
            <div className="empty-history">
              <History size={32} />
              <p>ยังไม่มีผลการสุ่ม</p>
            </div>
          ) : (
            <div className="history-list">
              {data.history.map(r => (
                <article className="history-row" key={r.id}>
                  <div>
                    <small>
                      {new Date(r.createdAt).toLocaleTimeString('th-TH', {
                        hour:   '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {r.winners.length} คน
                      {r.cancelled ? ' · ยกเลิกแล้ว' : ''}
                    </small>
                    <h3>{r.prizeName}</h3>
                    <p>{r.winners.map(w => w.Name).join(' · ')}</p>
                    {r.cancelled && <p className="field-error">{r.cancelled.reason}</p>}
                  </div>
                  {organizer && !r.cancelled && (
                    <button
                      className="secondary"
                      disabled={busy || drawing || !!pending}
                      onClick={async () => {
                        if (await action('replay', { roundId: r.id })) setModal(null);
                      }}
                    >
                      แสดงผลเดิม
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {organizer && (
            <a className="secondary download" href="/api/draw/export">
              <ArrowDownToLine size={17} /> ดาวน์โหลดผล CSV
            </a>
          )}
        </Dialog>
      )}

      {modal === 'manage' && data && (
        <Dialog title="จัดการงาน" onClose={() => setModal(null)} wide>
          <Manager
            data={data}
            busy={busy || !!drawing || !!pending}
            action={action}
            quality={quality}
            setQuality={q => {
              setQuality(q);
              try { localStorage.setItem('ictc-quality', q); } catch { /* ignore */ }
            }}
          />
          {error && <p className="field-error" role="alert">{error}</p>}
        </Dialog>
      )}
    </main>
  );
}

// ─── Manager component ────────────────────────────────────────────────────────

type ManagerProps = {
  data:       Snapshot;
  busy:       boolean;
  action:     (name: string, body: unknown) => Promise<boolean>;
  quality:    string;
  setQuality: (q: string) => void;
};

type PrizeFormState = {
  id:       string;
  name:     string;
  total:    number;
  kind:     Prize['kind'];
  imageUrl: string;
};

/** แผงจัดการสำหรับผู้จัด — tabs: ตั้งค่า / รายชื่อ / รางวัล / ประวัติ */
function Manager({ data, busy, action, quality, setQuality }: ManagerProps) {
  const [tab,      setTab]      = useState('general');
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [csv,      setCsv]      = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvCount, setCsvCount] = useState(0);
  const [saved,    setSaved]    = useState('');

  const [prize, setPrize] = useState<PrizeFormState>({
    id:       crypto.randomUUID(),
    name:     '',
    total:    1,
    kind:     'gift',
    imageUrl: '',
  });

  const [cancelId,           setCancelId]           = useState('');
  const [reason,             setReason]             = useState('');
  const [returnEligibility,  setReturnEligibility]  = useState(false);

  /** ตรวจสอบ CSV และ update count/error */
  function preview(text: string) {
    setCsv(text);
    try {
      const rows = parseParticipants(text);
      setCsvCount(rows.length);
      setCsvError('');
    } catch (e) {
      setCsvCount(0);
      setCsvError(getMessage(e));
    }
  }

  /** ส่งคำสั่งและแสดง feedback */
  async function save(name: string, body: unknown) {
    setSaved('');
    if (await action(name, body)) setSaved('บันทึกแล้ว');
  }

  const tabs: [id: string, label: string][] = [
    ['general', 'ตั้งค่า'],
    ['people',  'รายชื่อ'],
    ['prizes',  'รางวัล'],
    ['records', 'ประวัติ / สำรอง'],
  ];

  const toggleFields: [key: keyof Settings, label: string][] = [
    ['showDepartment', 'แสดงหน่วยงาน'],
    ['showRole',       'แสดงตำแหน่งงาน'],
    ['maskNames',      'ปิดบังชื่อบางส่วน'],
    ['allowRepeat',    'รับรางวัลซ้ำข้ามรอบได้'],
  ];

  return (
    <>
      {/* Tab bar */}
      <div className="tabs" role="tablist" aria-label="เมนูจัดการ">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => { setTab(id); setSaved(''); }}
          >
            {label}
          </button>
        ))}
      </div>

      <fieldset disabled={busy} className="manager-body">

        {/* ── General ── */}
        {tab === 'general' && (
          <>
            <label className="field">
              ชื่องาน
              <input
                value={settings.name}
                maxLength={80}
                onChange={e => setSettings({ ...settings, name: e.target.value })}
              />
            </label>

            {toggleFields.map(([key, label]) => (
              <label className="toggle-row" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key] as boolean}
                  disabled={
                    data.role !== 'admin' ||
                    (key === 'allowRepeat' && data.history.length > 0)
                  }
                  onChange={e => setSettings({ ...settings, [key]: e.target.checked })}
                />
              </label>
            ))}

            <label className="field">
              คุณภาพภาพ
              <select value={quality} onChange={e => setQuality(e.target.value)}>
                <option value="balanced">สมดุล</option>
                <option value="full">เต็ม</option>
                <option value="economy">ประหยัด</option>
              </select>
            </label>

            <button
              className="primary"
              disabled={data.role !== 'admin'}
              onClick={() => void save('settings', settings)}
            >
              บันทึกการตั้งค่า <Check size={16} />
            </button>
          </>
        )}

        {/* ── People ── */}
        {tab === 'people' && (
          <>
            <p className="muted">
              มีรายชื่อ {data.participantCount} คน · นำเข้าแทนที่ได้ก่อนเริ่มสุ่มครั้งแรกเท่านั้น
            </p>

            <label className="upload-zone">
              <Upload size={24} />
              <strong>เลือกไฟล์ CSV</strong>
              <span>UTF-8 · ไม่เกิน 2 MB · สูงสุด 5,000 คน</span>
              <input
                type="file"
                accept=".csv,.tsv,text/csv"
                disabled={data.role !== 'admin' || data.history.length > 0}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 2_000_000) { setCsvError('ไฟล์ใหญ่เกิน 2 MB'); return; }
                  preview(await f.text());
                }}
              />
            </label>

            <label className="field">
              หรือวางข้อมูลจากตาราง
              <textarea
                value={csv}
                onChange={e => preview(e.target.value)}
                rows={6}
                placeholder={'IndexID,Name,Department,Job_role\n0001,ชื่อผู้เข้าร่วม,หน่วยงาน,ตำแหน่ง'}
              />
            </label>

            {csvError && <p className="field-error">{csvError}</p>}
            {csvCount > 0 && (
              <p className="success-text">ตรวจรูปแบบแล้ว {csvCount} รายชื่อ พร้อมนำเข้าแทนที่</p>
            )}

            <button
              className="primary"
              disabled={!csvCount || data.history.length > 0 || data.role !== 'admin'}
              onClick={() => void save('import', { csv })}
            >
              ยืนยันนำเข้า {csvCount || ''} รายชื่อ
            </button>
          </>
        )}

        {/* ── Prizes ── */}
        {tab === 'prizes' && (
          <>
            <label className="field">
              แก้ไขรางวัล / เพิ่มใหม่
              <select
                value={data.prizes.some(p => p.id === prize.id) ? prize.id : 'new'}
                onChange={e => {
                  const p = data.prizes.find(p => p.id === e.target.value);
                  setPrize(
                    p
                      ? { id: p.id, name: p.name, total: p.total, kind: p.kind, imageUrl: p.imageUrl ?? '' }
                      : { id: crypto.randomUUID(), name: '', total: 1, kind: 'gift', imageUrl: '' },
                  );
                }}
              >
                <option value="new">+ เพิ่มรางวัลใหม่</option>
                {data.prizes.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label className="field">
              ชื่อรางวัล
              <input
                value={prize.name}
                maxLength={100}
                onChange={e => setPrize({ ...prize, name: e.target.value })}
              />
            </label>

            <div className="form-grid">
              <label className="field">
                จำนวนทั้งหมด
                <input
                  type="number"
                  min={1}
                  max={5_000}
                  value={prize.total}
                  onChange={e => setPrize({ ...prize, total: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                ภาพประกอบ
                <select
                  value={prize.kind}
                  onChange={e => setPrize({ ...prize, kind: e.target.value as Prize['kind'] })}
                >
                  <option value="gift">กล่องของขวัญ</option>
                  <option value="audio">หูฟัง</option>
                  <option value="watch">นาฬิกา</option>
                  <option value="bag">กระเป๋า</option>
                </select>
              </label>
            </div>

            <label className="field">
              ลิงก์รูป HTTPS (ถ้ามี)
              <input
                type="url"
                value={prize.imageUrl}
                onChange={e => setPrize({ ...prize, imageUrl: e.target.value })}
                placeholder="https://…"
              />
            </label>

            <button
              className="primary"
              disabled={!prize.name.trim() || data.role !== 'admin'}
              onClick={() => void save('prize', prize)}
            >
              <Plus size={17} />บันทึกรางวัล
            </button>
          </>
        )}

        {/* ── Records ── */}
        {tab === 'records' && (
          <>
            <div className="export-actions">
              <a className="secondary download" href="/api/draw/export">
                <ArrowDownToLine size={17} /> ผลรางวัล CSV
              </a>
              {data.role === 'admin' && (
                <a className="secondary download" href="/api/draw/backup">
                  <ArrowDownToLine size={17} /> สำรองงาน JSON
                </a>
              )}
            </div>

            <p className="muted">
              ไฟล์สำรองไม่รวมโค้ดและเซสชันผู้จัด การกู้คืนทำผ่านเครื่องมือผู้ดูแลในโปรเจกต์
            </p>

            {data.role === 'admin' && (
              <div className="cancel-section">
                <h3>ยกเลิกผลเพื่อสุ่มทดแทน</h3>
                <p className="muted">ผลเดิมยังอยู่ในประวัติ และโควตารางวัลจะคืนเมื่อยืนยัน</p>

                <label className="field">
                  รอบที่ต้องการยกเลิก
                  <select value={cancelId} onChange={e => setCancelId(e.target.value)}>
                    <option value="">เลือกรอบ</option>
                    {data.history
                      .filter(r => !r.cancelled)
                      .map(r => (
                        <option key={r.id} value={r.id}>
                          {r.prizeName} · {r.winners[0]?.Name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  เหตุผล (อย่างน้อย 5 ตัวอักษร)
                  <textarea
                    value={reason}
                    maxLength={300}
                    onChange={e => setReason(e.target.value)}
                  />
                </label>

                <label className="toggle-row">
                  <span>คืนสิทธิ์ผู้ชนะเดิมให้ลุ้นใหม่ได้</span>
                  <input
                    type="checkbox"
                    checked={returnEligibility}
                    onChange={e => setReturnEligibility(e.target.checked)}
                  />
                </label>

                <button
                  className="danger-button"
                  disabled={!cancelId || reason.trim().length < 5}
                  onClick={async () => {
                    if (confirm('ยืนยันยกเลิกผลรอบนี้และคืนจำนวนรางวัล? ประวัติเดิมจะยังอยู่')) {
                      await save('cancel', { roundId: cancelId, reason, returnEligibility });
                    }
                  }}
                >
                  ยืนยันยกเลิกผล
                </button>
              </div>
            )}
          </>
        )}
      </fieldset>

      {saved && (
        <p className="success-text" role="status">
          <Check size={16} /> {saved}
        </p>
      )}
      {busy && <p className="muted">รอให้คำสั่งปัจจุบันเสร็จก่อนเปลี่ยนข้อมูล</p>}
    </>
  );
}

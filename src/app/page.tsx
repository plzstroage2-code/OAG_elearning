"use client";

import { useState, useRef, useEffect, useCallback, useEffectEvent } from "react";
import WinnerCelebration from "./WinnerCelebration";
import { useDrawState } from '@/lib/useDrawState';
import { dataService, Participant, type Prize } from '@/lib/dataService';
import { DRAW_CONFIG } from '@/lib/drawConfig';
import { isSupabaseConfigured, isDemoMode } from '@/lib/supabase';

const fallbackNamesPool = [
    "นายกรัฐมนตรี ทรงพลัง", "สมชาย สายฟ้า", "สมหญิง พลิกนรก", "กฤตชัย ไซเบอร์",
    "วิภาวี เรืองแสง", "เดอะแมทริกซ์", "นีโอ ผู้ปลดแอก", "จอห์น วิค",
    "ลิซ่า แบล็คพิงก์", "แบมแบม ก๊อตเซเว่น", "ไอรอนแมน", "ธอร์ เทพเจ้าสายฟ้า",
    "แจ็คสัน หวัง", "คัลแลน ผจญภัย", "พี่จอง ยิ้มแฉ่ง", "ซุปเปอร์แมน",
    "แบทแมน อัศวินรัตติกาล", "ซานิ พลังเสียง", "หนุ่ม กรรชัย เดือด", "เดดพูล เกรียนแต้ก"
];

export default function ModernLuckyDraw() {
    const { drawState, connectionError } = useDrawState();
    const [dataError, setDataError] = useState('');
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [prizes, setPrizes] = useState<Prize[]>([]);
    const [drawPrizeId, setDrawPrizeId] = useState<string | null>(null);
    const [cardsList, setCardsList] = useState<string[]>([]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [winnerName, setWinnerName] = useState<string | null>(null);
    const [statusLabel, setStatusLabel] = useState("READY FOR DRAW");

    const [isSuspense, setIsSuspense] = useState(false);
    const [drawCount, setDrawCount] = useState(0);
    const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasDrawnRef = useRef(false);
    const trackRef = useRef<HTMLDivElement>(null);
    const lineRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const animationFrameIdRef = useRef<number | null>(null);
    const cardsDomRef = useRef<NodeListOf<HTMLElement> | null>(null);
    const isSpinningRef = useRef(false);
    const displayedDrawIdRef = useRef<string | undefined>(undefined);
    const displayedPrizeId = isSpinning || winnerName ? drawPrizeId : drawState.currentPrizeId;
    const prizeName = drawState.currentPrizeName || prizes.find(prize => prize.id === displayedPrizeId)?.name;

    useEffect(() => {
        let cancelled = false;
        const loadPrizes = async () => {
            try {
                const data = await dataService.getPrizes();
                if (!cancelled) setPrizes(data);
            } catch { if (!cancelled) setDataError('Could not load prize information. Retrying...'); }
        };
        void loadPrizes();
        const interval = setInterval(loadPrizes, 5000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [drawState.currentPrizeId]);

    // Load participants
    useEffect(() => {
        const load = async () => {
            try {
                const data = await dataService.getActiveParticipants();
                setParticipants(data); setDataError('');
            } catch { setDataError('Could not load participants. Retrying...'); }
        };
        load();
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, []);

    // Web Audio Synthesizer
    const getAudioCtx = useCallback(() => {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume().catch(() => { });
        return audioCtxRef.current;
    }, []);

    const playStartTone = useCallback(() => {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.6);
        } catch { /* Audio is optional when browser autoplay is blocked. */ }
    }, [getAudioCtx]);

    const playTick = useCallback((speedRatio: number) => {
        try {
            const ctx = getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const freq = 360 + (speedRatio * 500);
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.025);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.025);
        } catch { /* Audio is optional when browser autoplay is blocked. */ }
    }, [getAudioCtx]);

    const playWinFanfare = useCallback(() => {
        try {
            const ctx = getAudioCtx();
            [392, 523.25, 659.25, 783.99, 1046.50, 130, 523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                const startTime = ctx.currentTime + (i < 5 ? i * 0.11 : 0.6);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.setValueAtTime(0.09, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.2);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(startTime); osc.stop(startTime + 2.2);
            });
        } catch { /* Audio is optional when browser autoplay is blocked. */ }
    }, [getAudioCtx]);

    const celebrate = useCallback((finalWinner: string) => {
        playWinFanfare();
        setWinnerName(finalWinner);

        // 1. Fade-out center line
        if (lineRef.current) {
            lineRef.current.classList.add('winner-active');
        }

        // 2. Show dark blur overlay over non-winner cards
        if (overlayRef.current) {
            overlayRef.current.classList.add('active');
        }

        // 3. Apply winner card zoom + glow (clear inline style from physics loop first)
        if (cardsDomRef.current) {
            const winnerCard = cardsDomRef.current[DRAW_CONFIG.winnerIndex];
            if (winnerCard) {
                winnerCard.style.cssText = ''; // clear physics-loop inline style
                winnerCard.classList.add('winner-card');
            }
        }

    }, [playWinFanfare]);

    const startSpin = useCallback((selectedWinner: string) => {
        if (isSpinningRef.current) return;
        isSpinningRef.current = true;
        setIsSpinning(true);
        displayedDrawIdRef.current = drawState.drawId;
        setDrawPrizeId(drawState.currentPrizeId);
        hasDrawnRef.current = true;
        setIsSuspense(false);
        setDrawCount(drawState.poolCount ?? (participants.length || fallbackNamesPool.length));
        overlayRef.current?.classList.remove('active');
        cardsDomRef.current?.forEach(card => card.classList.remove('winner-card'));
        setWinnerName(null);
        setStatusLabel("DRAWING WINNER...");

        if (lineRef.current) {
            lineRef.current.classList.remove('winner-active');
        }

        playStartTone();

        // Build track cards
        const pool = participants.length > 0 ? participants.map(p => p.name) : isDemoMode ? fallbackNamesPool : ['?'];
        const items: string[] = [];
        for (let i = 0; i < DRAW_CONFIG.totalItems; i++) {
            if (i === DRAW_CONFIG.winnerIndex) {
                items.push(selectedWinner);
            } else {
                items.push(pool[Math.floor(Math.random() * pool.length)]);
            }
        }
        setCardsList(items);

        spinTimerRef.current = setTimeout(() => {
            if (!trackRef.current) return;
            const track = trackRef.current;
            const cards = track.querySelectorAll<HTMLElement>('.reel-card');
            cardsDomRef.current = cards;

            // Reset track position
            track.style.transition = 'none';
            track.style.transform = 'translateY(0px)';
            track.classList.remove('is-spinning');
            void track.offsetWidth;
            track.classList.add('is-spinning');

            /**
             * ===== PHYSICS-BASED ANIMATION ENGINE =====
             *
             * หลักการ CS:GO จริง:
             * 1. กำหนด "จุดหยุด" ล่วงหน้า (targetY) โดยรวม landing offset เข้าไปใน total distance
             * 2. ใช้ exponential deceleration: v(t) = v_peak × e^(-λt)
             *    → ทำให้ velocity ลดลงอย่างต่อเนื่องแบบ smooth ไม่มีการ "snap"
             * 3. ความเร็วสูงสุดต้นจะ consistent ทุกครั้ง → ending duration ใกล้เคียงกัน
             * 4. Position = integral ของ velocity → เป็น natural deceleration curve
             *
             * สาเหตุที่ดีกว่า CSS cubic-bezier:
             * - CSS transition จะ stretch/compress easing ตาม distance → เมื่อ offset ต่างกัน
             *   ทำให้ช่วง "เกือบหยุด" สั้นหรือยาวต่างกัน ดูไม่เป็นธรรมชาติ
             * - Physics loop ใช้ velocity จริง → landing duration สม่ำเสมอทุก spin
             */

            // จุดหยุดกลางการ์ด winner (ไม่มี offset ยัง)
            const winnerCenterY = -(DRAW_CONFIG.winnerIndex * DRAW_CONFIG.itemFullHeight);
            // สุ่ม sub-pixel offset (จุดที่ขีดกลางจะชี้ในการ์ด)
            const landingOffset = DRAW_CONFIG.calculateLandingOffset();
            // targetY รวม offset เข้าไปแล้ว = จุดหยุดแท้จริง
            const targetY = winnerCenterY + landingOffset;

            // ระยะทางรวมที่ต้องวิ่ง (เป็นค่าบวก = track เลื่อนขึ้น)
            const totalDistance = Math.abs(targetY); // px

            /**
             * Physics parameters:
             * v(t) = v0 × e^(-λt)
             * x(t) = (v0/λ) × (1 - e^(-λt))
             *
             * เราต้องการให้: x(T) = totalDistance และ v(T) → ~0
             * จากสมการ: v0/λ = totalDistance / (1 - e^(-λT))
             *
             * เลือก λ ที่ทำให้ animation ดูสมจริง:
             * λ มาก → decelerate เร็ว (จะหยุดเร็ว, ดูสั้น)
             * λ น้อย → decelerate ช้า (เหมือน CS:GO ที่ค่อยๆ ช้าลง)
             */
            const T = DRAW_CONFIG.totalDurationMs; // ms
            // lambda = 8/T → at t=T, v(T) = v0 × e^(-8) ≈ 0.00034 × v0 → ~0.3px/frame (sub-pixel)
            // vs lambda = 5.5/T ที่เดิม → v(T) ≈ 2.5px/frame ซึ่งยังพอสังเกตเห็นได้ก่อน snap
            // ผลลัพธ์: ล้อแทบหยุดสนิทที่ t≈6s ก่อนถึง deadline → natural settle ไม่ force
            const lambda = 8 / T;
            const v0 = (totalDistance * lambda) / (1 - Math.exp(-lambda * T));

            let currentPos = 0;
            let startTimestamp: number | null = null;
            let lastTimestamp: number | null = null;
            let lastY = 0;
            let lastPassedIndex = -1;
            let suspenseStarted = false;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            function physicsTick(timestamp: number) {
                if (!isSpinningRef.current) return;
                if (!startTimestamp) {
                    startTimestamp = timestamp;
                    lastTimestamp = timestamp;
                }

                const elapsed = timestamp - startTimestamp;
                if (elapsed >= T - 1600 && !suspenseStarted) {
                    suspenseStarted = true;
                    setIsSuspense(true);
                    setStatusLabel('THE MOMENT IS HERE...');
                }
                if (reducedMotion && elapsed < T) {
                    animationFrameIdRef.current = requestAnimationFrame(physicsTick);
                    return;
                }

                // ==========================================
                // Physics: position จาก integral ของ v(t)
                // x(t) = (v0/λ) × (1 - e^(-λt))
                // ==========================================
                const expFactor = Math.exp(-lambda * elapsed);
                currentPos = (v0 / lambda) * (1 - expFactor);

                // Clamp ไม่ให้เกิน targetY
                const clampedPos = Math.min(currentPos, totalDistance);
                const currentY = -clampedPos; // negative = เลื่อนขึ้น

                track.style.transform = `translateY(${currentY}px)`;

                // Real-time velocity (px/ms) สำหรับ tick sound
                const dt = Math.max(1, timestamp - (lastTimestamp || timestamp));
                const dy = Math.abs(currentY - lastY);
                const currentVelocity = dy / dt;
                lastY = currentY;
                lastTimestamp = timestamp;

                // ==========================================
                // Render: perspective tilt + opacity per card
                // ==========================================
                for (let i = 0; i < cards.length; i++) {
                    const centerOffset = (i * DRAW_CONFIG.itemFullHeight) + currentY;
                    const distanceRatio = Math.abs(centerOffset / DRAW_CONFIG.itemFullHeight);

                    if (distanceRatio > 3.0) {
                        if (cards[i].style.opacity !== '0') cards[i].style.opacity = '0';
                        continue;
                    }

                    const angle = Math.min(30, distanceRatio * 10);
                    const sign = centerOffset > 0 ? -1 : 1;
                    const opacity = Math.max(0.25, 1 - (distanceRatio * 0.32));
                    const blurAmount = distanceRatio < 0.6 ? 0 : Math.min(1.2, (distanceRatio - 0.55) * 0.8);
                    const transform = `perspective(850px) rotateX(${angle * sign}deg)`;
                    const isCenter = distanceRatio < 0.45;

                    if (isCenter) {
                        cards[i].style.cssText =
                            `transform:${transform};` +
                            `opacity:1;` +
                            `filter:blur(0px);` +
                            `color:#0f172a;` +
                            `background:rgba(255, 255, 255, 0.98);` +
                            `border:1px solid rgba(226, 232, 240, 0.9);` +
                            `box-shadow:0 4px 12px -2px rgba(15, 23, 42, 0.05);`;
                    } else {
                        cards[i].style.cssText =
                            `transform:${transform};` +
                            `opacity:${opacity};` +
                            `filter:blur(${blurAmount.toFixed(1)}px);` +
                            `color:#64748b;` +
                            `background:transparent;` +
                            `border:1px solid transparent;` +
                            `box-shadow:none;`;
                    }
                }

                // Audio Tick: synchronized to real-time velocity
                const currentIndex = Math.abs(currentY / DRAW_CONFIG.itemFullHeight);
                const passedIndex = Math.floor(currentIndex + 0.5);
                if (passedIndex !== lastPassedIndex) {
                    lastPassedIndex = passedIndex;
                    const speedRatio = Math.min(1, Math.max(0.05, currentVelocity / 2.2));
                    playTick(speedRatio);
                }

                // ==========================================
                // Termination: หยุดเมื่อ velocity ต่ำมากพอ หรือเกิน duration
                // ==========================================
                const currentVelocityRaw = v0 * expFactor; // px/ms
                const isDone = elapsed >= T || currentVelocityRaw < 0.005;

                if (!isDone) {
                    animationFrameIdRef.current = requestAnimationFrame(physicsTick);
                } else {
                    // Snap ไปยัง targetY อย่างแม่นยำ (ไม่มี drift)
                    track.style.transform = `translateY(${targetY}px)`;
                    track.classList.remove('is-spinning');
                    isSpinningRef.current = false;
                    setIsSpinning(false);
                    setIsSuspense(false);
                    celebrate(selectedWinner);
                    setStatusLabel("WINNER CONFIRMED");
                }
            }

            animationFrameIdRef.current = requestAnimationFrame(physicsTick);
        }, 50);
    }, [participants, celebrate, playStartTone, playTick, drawState.currentPrizeId, drawState.poolCount, drawState.drawId]);

    // Sync with Admin Dashboard
    const syncDraw = useEffectEvent(() => {
        if (drawState.phase === 'READY') {
            if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
            hasDrawnRef.current = false;
            setIsSuspense(false);
            // หยุด physics loop ที่อาจกำลัง run อยู่
            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = null;
            }
            if (trackRef.current) {
                trackRef.current.style.transition = 'none';
                trackRef.current.style.transform = 'translateY(0px)';
                trackRef.current.classList.remove('is-spinning');
            }
            // Clear winner effects
            if (overlayRef.current) overlayRef.current.classList.remove('active');
            if (cardsDomRef.current) {
                cardsDomRef.current.forEach(card => {
                    card.classList.remove('winner-card');
                    card.style.cssText = '';
                });
            }
            setIsSpinning(false);
            isSpinningRef.current = false;
            setWinnerName(null);
            setStatusLabel("READY FOR DRAW");
            if (lineRef.current) lineRef.current.classList.remove('winner-active');
        } else if (drawState.phase === 'COUNTDOWN') {
            setWinnerName(null);
            overlayRef.current?.classList.remove('active');
            setStatusLabel(`STARTING IN ${drawState.countdownValue}...`);
        } else if (drawState.phase === 'SHUFFLE') {
            if (!isSpinningRef.current) {
                if (isSupabaseConfigured && drawState.targetWinnerName) {
                    startSpin(drawState.targetWinnerName);
                    return;
                }
                let winName = "ผู้โชคดี";
                if (drawState.targetWinnerId) {
                    const p = participants.find(x => x.id === drawState.targetWinnerId);
                    if (p) winName = p.name;
                } else if (participants.length > 0) {
                    winName = participants[Math.floor(Math.random() * participants.length)].name;
                }
                startSpin(winName);
            }
        } else if (drawState.phase === 'WINNER' && drawState.targetWinnerName && (!winnerName || displayedDrawIdRef.current !== drawState.drawId)) {
            // Recover the committed result after a refresh or a disconnected display.
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
            if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
            isSpinningRef.current = false;
            setIsSpinning(false); setIsSuspense(false);
            setDrawPrizeId(drawState.currentPrizeId);
            setDrawCount(drawState.poolCount ?? participants.length);
            hasDrawnRef.current = true;
            displayedDrawIdRef.current = drawState.drawId;
            celebrate(drawState.targetWinnerName);
            setStatusLabel('WINNER CONFIRMED');
        }
    });
    // Reconcile display state only when the external admin command changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { syncDraw(); }, [drawState.phase, drawState.countdownValue, drawState.targetWinnerId, drawState.drawId]);
    useEffect(() => () => {
        isSpinningRef.current = false;
        if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
    }, []);

    // Preserve the current draw across participant refreshes.
    useEffect(() => {
        if (hasDrawnRef.current) return;
        const pool = participants.length > 0 ? participants.map(p => p.name) : isDemoMode ? fallbackNamesPool : ['?'];
        const initial: string[] = [];
        for (let i = 0; i < DRAW_CONFIG.totalItems; i++) {
            initial.push(pool[i % pool.length]);
        }
        setCardsList(initial);
    }, [participants]);

    const handleManualSpin = () => {
        if (isSpinning) return;
        const pool = participants.length > 0 ? participants.map(p => p.name) : isDemoMode ? fallbackNamesPool : ['?'];
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        startSpin(chosen);
    };

    return (
        <main className={`draw-screen min-h-screen flex flex-col items-center justify-center p-6 relative select-none ${isSuspense ? 'draw-suspense' : ''} ${winnerName ? 'draw-won' : ''}`}>
            {(connectionError || dataError) && <p role="alert" className="fixed bottom-3 left-3 z-[250] rounded-lg bg-red-50 p-3 text-sm text-red-800">{connectionError || dataError}</p>}
            <div className="suspense-vignette" aria-hidden="true" />
            {winnerName && <WinnerCelebration name={winnerName} count={drawCount} prizeName={prizeName} />}
            <p className="sr-only" role="status" aria-live="polite">{winnerName ? `Winner: ${winnerName}` : statusLabel}</p>
            {/* Ambient Studio Background */}
            <div className="modern-backdrop"></div>
            <div className="studio-grid"></div>

            {/* Clean Event Header */}
            <header className="mb-5 text-center z-10">

                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900">
                    ICTC e-Learning Award
                </h1>
                {prizeName && (
                    <p className="mt-3 max-w-3xl break-words text-balance text-xl font-semibold tracking-tight text-slate-600 md:text-2xl" aria-live="polite">
                        <span className="sr-only">Current prize: </span>{prizeName}
                    </p>
                )}
            </header>

            {/* Main Stage: Compact Reel Viewport with Single Center Line */}
            <div className="reel-viewport z-10">
                {/* Winner blur overlay — sits above other cards, below winner card */}
                <div className="winner-overlay" ref={overlayRef}></div>

                {/* ขีดเล็กๆ คั่นกลาง (Simple Center Indicator Line) */}
                <div className="center-line-indicator" ref={lineRef}></div>

                {/* Vertical Scrolling Reel */}
                <div className="reel-track" ref={trackRef}>
                    {cardsList.map((name, idx) => (
                        <div key={idx} className="reel-card">
                            <span>{name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer Control & Status */}
            <footer className="draw-controls mt-5 flex flex-col items-center gap-2.5 z-10">
                {/* Status Badge */}
                <div className="text-[11px] font-bold tracking-widest text-slate-400 uppercase bg-white/80 border border-slate-200 px-4 py-1.5 rounded-full shadow-xs">
                    {statusLabel}
                </div>

                {/* Manual Trigger Button */}
                {isDemoMode && <button
                    disabled={isSpinning}
                    onClick={handleManualSpin}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-xs tracking-wider uppercase rounded-full shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
                >
                    {isSpinning ? "SPINNING REEL..." : winnerName ? "TEST ANOTHER DRAW" : "TEST SPIN (MANUAL)"}
                </button>}
            </footer>
        </main>
    );
}

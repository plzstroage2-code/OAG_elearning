"use client";

import { useEffect, type CSSProperties } from "react";
import { Trophy, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

export default function WinnerCelebration({ name, count, prizeName }: { name: string; count: number; prizeName?: string }) {
    useEffect(() => {
        const colors = ["#fbbf24", "#fde68a", "#fff8e7", "#34d399"];
        const timers: ReturnType<typeof setTimeout>[] = [];
        const burst = (options: confetti.Options) => confetti({
            colors, zIndex: 200, disableForReducedMotion: true,
            ticks: 240, gravity: 0.85, ...options,
        });
        burst({ particleCount: 140, spread: 110, startVelocity: 48, origin: { x: 0.5, y: 0.58 } });
        // Choreographed volleys leave the winner's name readable between bursts.
        [350, 1100, 2100, 3400].forEach(delay => timers.push(setTimeout(() => {
            burst({ particleCount: 55, angle: 58, spread: 55, startVelocity: 58, origin: { x: 0, y: 0.8 } });
            burst({ particleCount: 55, angle: 122, spread: 55, startVelocity: 58, origin: { x: 1, y: 0.8 } });
        }, delay)));
        for (let i = 0; i < 14; i++) timers.push(setTimeout(() => {
            burst({ particleCount: 9, spread: 100, startVelocity: 5, scalar: 0.8,
                origin: { x: 0.15 + Math.random() * 0.7, y: -0.05 } });
        }, 1800 + i * 250));
        return () => { timers.forEach(clearTimeout); confetti.reset(); };
    }, []);

    return (
        <section className="winner-stage" aria-label="Draw winner">
            <div className="winner-rays" aria-hidden="true" />
            <div className="winner-spotlight spotlight-left" aria-hidden="true" />
            <div className="winner-spotlight spotlight-right" aria-hidden="true" />
            <div className="winner-ring" aria-hidden="true" />
            <div className="winner-stars" aria-hidden="true">
                {Array.from({ length: 24 }, (_, i) => <i key={i} style={{
                    left: `${(i * 37 + 7) % 100}%`, top: `${(i * 23 + 11) % 100}%`,
                    "--delay": `${(i % 7) * 0.3}s`, "--size": `${3 + i % 4}px`,
                } as CSSProperties} />)}
            </div>
            <div className="winner-content">
                <p className="winner-eyebrow"><Sparkles size={16} /> THIS IS YOUR MOMENT <Sparkles size={16} /></p>
                <div className="winner-trophy" aria-hidden="true"><Trophy strokeWidth={1.4} /></div>
                <p className="winner-heading">WE HAVE A WINNER!</p>
                <h2 className="winner-name">{name}</h2>
                {prizeName && <p className="winner-prize"><span className="sr-only">Prize: </span>{prizeName}</p>}
                <div className="winner-rule" />
                <p className="winner-congratulations">ยินดีด้วย! <span>Congratulations</span></p>
                <p className="winner-pool">{count.toLocaleString()} people in the draw. One incredible moment.</p>
            </div>
        </section>
    );
}

"use client";

import { useRef, useState } from "react";
import gsap from "gsap";

const MOCK_PLAYERS = [
    "กิตติพงษ์ แสงทอง",
    "ศุภชัย ใจดี",
    "ณัฐวุฒิ สุขสวัสดิ์",
    "พิมพ์ชนก วัฒนะ",
    "ธนกร รุ่งเรือง",
    "ชนากานต์ ศรีสุข",
    "ปิยะพงษ์ อินทร์ทอง",
    "ชลธิชา มีทรัพย์",
    "ภานุพงศ์ แก้วคำ",
    "ณัฐชา วงศ์ดี",
    "อนุชา พรหมมา",
    "พัชราภา แสงแก้ว",
];

type DrawPhase =
    | "idle"
    | "iris"
    | "drop"
    | "shake"
    | "burst"
    | "winner"
    | "complete";

export default function Home() {
    const [winner, setWinner] = useState("");
    const [phase, setPhase] = useState<DrawPhase>("idle");
    const [isRunning, setIsRunning] = useState(false);

    const sceneRef = useRef<HTMLDivElement>(null);
    const irisRef = useRef<HTMLDivElement>(null);
    const giftRef = useRef<HTMLDivElement>(null);
    const giftBodyRef = useRef<HTMLDivElement>(null);
    const lidRef = useRef<HTMLDivElement>(null);
    const winnerRef = useRef<HTMLDivElement>(null);
    const flashRef = useRef<HTMLDivElement>(null);
    const shockwaveRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<HTMLDivElement>(null);

    const startDraw = () => {
        if (isRunning) return;

        const selected =
            MOCK_PLAYERS[Math.floor(Math.random() * MOCK_PLAYERS.length)];

        setWinner(selected);
        setIsRunning(true);
        setPhase("iris");

        const tl = gsap.timeline({
            onComplete: () => {
                setPhase("complete");
                setIsRunning(false);
            },
        });

        gsap.set(giftRef.current, {
            y: -900,
            scale: 0.7,
            rotation: -8,
            opacity: 0,
        });

        gsap.set(winnerRef.current, {
            opacity: 0,
            scale: 0.2,
            y: 80,
            filter: "blur(20px)",
        });

        gsap.set(lidRef.current, {
            x: 0,
            y: 0,
            rotation: 0,
        });

        gsap.set(giftBodyRef.current, {
            opacity: 1,
            scale: 1,
        });

        gsap.set(flashRef.current, {
            opacity: 0,
        });

        gsap.set(shockwaveRef.current, {
            opacity: 0,
            scale: 0.2,
        });

        gsap.set(".particle", {
            opacity: 0,
            x: 0,
            y: 0,
            rotation: 0,
            scale: 0,
        });

        gsap.set(irisRef.current, {
            "--iris-size": "150vmax",
        } as gsap.TweenVars);

        // IRIS OUT
        tl.to(irisRef.current, {
            "--iris-size": "9rem",
            duration: 0.8,
            ease: "power4.inOut",
            onStart: () => setPhase("iris"),
        });

        // WAIT / CINEMATIC DARKNESS
        tl.to({}, { duration: 0.12 });

        // GIFT DROP
        tl.to(giftRef.current, {
            y: 0,
            opacity: 1,
            scale: 1,
            rotation: 0,
            duration: 0.72,
            ease: "power4.in",
            onStart: () => setPhase("drop"),
        });

        // IMPACT SQUASH
        tl.to(giftRef.current, {
            scaleX: 1.15,
            scaleY: 0.82,
            duration: 0.08,
            ease: "power2.out",
        });

        tl.to(giftRef.current, {
            scaleX: 0.94,
            scaleY: 1.08,
            duration: 0.1,
        });

        tl.to(giftRef.current, {
            scaleX: 1,
            scaleY: 1,
            duration: 0.1,
        });

        // SCREEN IMPACT
        tl.to(
            sceneRef.current,
            {
                x: 8,
                y: 3,
                duration: 0.04,
                repeat: 5,
                yoyo: true,
            },
            "<"
        );

        // SHAKE - LIGHT
        tl.to(giftRef.current, {
            rotation: 2,
            x: 4,
            duration: 0.06,
            repeat: 5,
            yoyo: true,
            ease: "none",
            onStart: () => setPhase("shake"),
        });

        // SHORT PAUSE
        tl.to(giftRef.current, {
            rotation: 0,
            x: 0,
            duration: 0.16,
        });

        // SHAKE - MEDIUM
        tl.to(giftRef.current, {
            rotation: 5,
            x: 8,
            duration: 0.045,
            repeat: 9,
            yoyo: true,
            ease: "none",
        });

        // SHAKE - EXTREME
        tl.to(giftRef.current, {
            rotation: 9,
            x: 13,
            scale: 1.05,
            duration: 0.03,
            repeat: 11,
            yoyo: true,
            ease: "none",
        });

        // ANTICIPATION
        tl.to(giftRef.current, {
            x: 0,
            rotation: 0,
            scale: 1.08,
            duration: 0.15,
            ease: "power4.out",
        });

        // DEAD SILENCE
        tl.to({}, { duration: 0.17 });

        // FLASH
        tl.to(flashRef.current, {
            opacity: 1,
            duration: 0.04,
            onStart: () => setPhase("burst"),
        });

        tl.to(flashRef.current, {
            opacity: 0,
            duration: 0.3,
        });

        // EXPLOSION
        tl.to(
            lidRef.current,
            {
                y: -300,
                x: 100,
                rotation: 80,
                duration: 0.7,
                ease: "power4.out",
            },
            "<"
        );

        tl.to(
            giftBodyRef.current,
            {
                scale: 1.5,
                opacity: 0,
                duration: 0.25,
                ease: "power4.out",
            },
            "<"
        );

        // PARTICLES
        const particleDirections = [
            [-260, -210],
            [-180, -330],
            [-70, -300],
            [70, -350],
            [180, -280],
            [290, -170],
            [-300, -40],
            [320, 20],
            [-240, 170],
            [-100, 250],
            [110, 240],
            [260, 170],
        ];

        document.querySelectorAll(".particle").forEach((particle, index) => {
            const [x, y] =
                particleDirections[index % particleDirections.length];

            tl.to(
                particle,
                {
                    opacity: 1,
                    scale: gsap.utils.random(0.7, 1.6),
                    x,
                    y,
                    rotation: gsap.utils.random(-240, 240),
                    duration: 0.7,
                    ease: "power4.out",
                },
                "<"
            );

            tl.to(
                particle,
                {
                    opacity: 0,
                    duration: 0.35,
                },
                "-=0.25"
            );
        });

        // SHOCKWAVE
        tl.to(
            shockwaveRef.current,
            {
                opacity: 0.8,
                scale: 6,
                duration: 0.7,
                ease: "power3.out",
            },
            "<"
        );

        tl.to(
            shockwaveRef.current,
            {
                opacity: 0,
                duration: 0.25,
            },
            "-=0.25"
        );

        // WINNER REVEAL
        tl.to(
            winnerRef.current,
            {
                opacity: 1,
                scale: 1.25,
                y: 0,
                filter: "blur(0px)",
                duration: 0.5,
                ease: "back.out(1.8)",
                onStart: () => setPhase("winner"),
            },
            "-=0.42"
        );

        tl.to(winnerRef.current, {
            scale: 1,
            duration: 0.3,
            ease: "power2.out",
        });

        // IRIS OPEN
        tl.to(
            irisRef.current,
            {
                "--iris-size": "150vmax",
                duration: 1,
                ease: "power4.inOut",
            },
            "-=0.2"
        );
    };

    return (
        <main ref={sceneRef} className="scene">
            <div className="ambient ambient-one" />
            <div className="ambient ambient-two" />

            <div className="topbar">
                <div>
                    <span className="eyebrow">EVENT SYSTEM</span>
                    <h1>LUCKY DRAW</h1>
                </div>

                <div className="counter">
                    <span>ผู้เข้าร่วม</span>
                    <strong>{MOCK_PLAYERS.length}</strong>
                </div>
            </div>

            <section className="draw-area">
                {phase === "idle" && (
                    <div className="intro">
                        <span className="intro-label">GRAND PRIZE</span>

                        <h2>
                            พร้อมหรือยัง
                            <br />
                            สำหรับผู้โชคดีคนต่อไป?
                        </h2>

                        <p>กดปุ่มด้านล่างเพื่อเริ่มการสุ่มรางวัล</p>
                    </div>
                )}

                <div ref={giftRef} className="gift">
                    <div ref={lidRef} className="gift-lid">
                        <div className="lid-ribbon-vertical" />
                        <div className="bow bow-left" />
                        <div className="bow bow-right" />
                        <div className="bow-center" />
                    </div>

                    <div ref={giftBodyRef} className="gift-body">
                        <div className="ribbon-vertical" />
                        <div className="ribbon-horizontal" />

                        <span className="gift-star">★</span>
                    </div>
                </div>

                <div ref={shockwaveRef} className="shockwave" />

                <div ref={particlesRef} className="particles">
                    {Array.from({ length: 12 }).map((_, index) => (
                        <span
                            className={`particle particle-${(index % 4) + 1}`}
                            key={index}
                        />
                    ))}
                </div>

                <div ref={winnerRef} className="winner">
                    <span className="winner-label">CONGRATULATIONS</span>

                    <div className="winner-card">
                        <span className="winner-crown">♛</span>

                        <h2>{winner}</h2>

                        <div className="winner-line" />

                        <p>ผู้โชคดีประจำรอบนี้</p>
                    </div>
                </div>
            </section>

            <div className="controls">
                <span className="phase">
                    STATUS / <b>{phase.toUpperCase()}</b>
                </span>

                <button
                    className="draw-button"
                    disabled={isRunning}
                    onClick={startDraw}
                >
                    <span>{isRunning ? "กำลังสุ่ม..." : "เริ่มสุ่มรางวัล"}</span>

                    {!isRunning && <span className="button-arrow">→</span>}
                </button>
            </div>

            <div ref={flashRef} className="flash" />

            <div ref={irisRef} className="iris-layer">
                <div className="iris-darkness" />
            </div>
        </main>
    );
}
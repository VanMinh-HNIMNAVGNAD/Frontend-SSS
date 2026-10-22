import { useEffect, useRef, useState } from 'react';
import { Sparkles, Flower2, Sunset } from 'lucide-react';

export default function AnimatedBackground({ mode = 'sunset' }) {
    const canvasRef = useRef(null);
    const glowRef = useRef(null);
    const [themeMode, setThemeMode] = useState(mode); // 'sunset' | 'tech' | 'petals'

    // Mouse tracking with Lerp (Linear Interpolation) for ultra-smooth gentle movement
    const targetMouse = useRef({ x: 0.5, y: 0.5 });
    const currentMouse = useRef({ x: 0.5, y: 0.5 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            targetMouse.current = {
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            };
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let time = 0;

        let width = (canvas.width = window.innerWidth);
        let height = (canvas.height = window.innerHeight);

        const handleResize = () => {
            if (!canvas) return;
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        // Particle count according to mode
        const particlesCount = themeMode === 'petals' ? 35 : 45;
        const items = [];

        if (themeMode === 'tech') {
            for (let i = 0; i < particlesCount; i++) {
                items.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    radius: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.3 + 0.15,
                });
            }
        } else if (themeMode === 'petals') {
            for (let i = 0; i < particlesCount; i++) {
                items.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    size: Math.random() * 6 + 4,
                    speedY: Math.random() * 0.8 + 0.3,
                    speedX: Math.random() * 0.4 - 0.2,
                    rotation: Math.random() * 360,
                    rotationSpeed: (Math.random() - 0.5) * 1.5,
                    opacity: Math.random() * 0.4 + 0.2,
                });
            }
        } else {
            // Sunset mode floating subtle ambient dust
            for (let i = 0; i < particlesCount; i++) {
                items.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.3 - 0.15,
                    size: Math.random() * 2.5 + 1,
                    alpha: Math.random() * 0.35 + 0.1,
                    color: i % 2 === 0 ? 'rgba(251, 146, 60, ' : 'rgba(244, 63, 94, ',
                });
            }
        }

        const render = () => {
            time += 0.008;
            ctx.clearRect(0, 0, width, height);

            // Interpolate current mouse towards target mouse (Lerp factor = 0.035 for gentle fluid motion)
            currentMouse.current.x += (targetMouse.current.x - currentMouse.current.x) * 0.035;
            currentMouse.current.y += (targetMouse.current.y - currentMouse.current.y) * 0.035;

            // Calculate gentle sine wave offset so glow continuously moves even when mouse is still
            const waveX = Math.sin(time * 0.7) * 0.03;
            const waveY = Math.cos(time * 0.5) * 0.03;

            const finalX = Math.max(0, Math.min(1, currentMouse.current.x + waveX));
            const finalY = Math.max(0, Math.min(1, currentMouse.current.y + waveY));

            const mouseXPercent = (finalX * 100).toFixed(2);
            const mouseYPercent = (finalY * 100).toFixed(2);

            // Update smooth diluted sunset radial backdrop DOM directly without React state rerenders
            if (glowRef.current) {
                glowRef.current.style.background = `
                    radial-gradient(900px circle at ${mouseXPercent}% ${mouseYPercent}%, rgba(251, 146, 60, 0.14), rgba(244, 63, 94, 0.09) 40%, rgba(192, 132, 252, 0.05) 70%, transparent 90%),
                    radial-gradient(1100px circle at ${100 - mouseXPercent}% ${100 - mouseYPercent}%, rgba(245, 158, 11, 0.08), rgba(99, 102, 241, 0.05) 65%, transparent 95%)
                `;
            }

            if (themeMode === 'tech') {
                for (let i = 0; i < items.length; i++) {
                    const p = items[i];
                    p.x += p.vx;
                    p.y += p.vy;

                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.vy *= -1;

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(59, 130, 246, ${p.alpha})`;
                    ctx.fill();

                    for (let j = i + 1; j < items.length; j++) {
                        const p2 = items[j];
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < 110) {
                            ctx.beginPath();
                            ctx.moveTo(p.x, p.y);
                            ctx.lineTo(p2.x, p2.y);
                            ctx.strokeStyle = `rgba(99, 102, 241, ${0.15 * (1 - dist / 110)})`;
                            ctx.lineWidth = 0.6;
                            ctx.stroke();
                        }
                    }
                }
            } else if (themeMode === 'petals') {
                for (let i = 0; i < items.length; i++) {
                    const p = items[i];
                    p.y += p.speedY;
                    p.x += Math.sin(p.y * 0.01) + p.speedX;
                    p.rotation += p.rotationSpeed;

                    if (p.y > height + 20) {
                        p.y = -20;
                        p.x = Math.random() * width;
                    }

                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate((p.rotation * Math.PI) / 180);

                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.bezierCurveTo(-p.size / 2, -p.size / 2, -p.size, p.size / 3, 0, p.size);
                    ctx.bezierCurveTo(p.size, p.size / 3, p.size / 2, -p.size / 2, 0, 0);
                    ctx.fillStyle = `rgba(244, 114, 182, ${p.opacity})`;
                    ctx.fill();

                    ctx.restore();
                }
            } else {
                for (let i = 0; i < items.length; i++) {
                    const p = items[i];
                    p.x += p.vx;
                    p.y += p.vy;

                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.y = height;

                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fillStyle = `${p.color}${p.alpha})`;
                    ctx.fill();
                }
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [themeMode]);

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            {/* Dark Base Atmosphere */}
            <div className="absolute inset-0 bg-[#161618]" />

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-grid-pattern opacity-25" />

            {/* ULTRA SMOOTH & DILUTED SUNSET GRADIENT OVERLAY (Lerp + Wave Easing) */}
            <div
                ref={glowRef}
                className="absolute inset-0 transition-opacity duration-1000 pointer-events-none"
            />

            {/* Hero Soft Diluted Sunset Ambient Glow */}
            <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-orange-500/10 via-rose-500/05 to-transparent rounded-full blur-[160px] pointer-events-none animate-pulse-glow" />

            {/* Interactive Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-60" />
        </div>
    );
}


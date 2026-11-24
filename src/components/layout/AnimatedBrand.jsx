import { useEffect, useRef } from 'react';
import { animate, spring, stagger } from 'animejs';
import { bulkMotionAllowed } from '../../utils/motion';

/**
 * Logo + chữ "cloudSSS" trên thanh đầu trang, có hoạt ảnh anime.js (24/11/2026):
 *  - Mở trang: đám mây bật ra, từng chữ cái rơi từ trên xuống rồi nảy lò xo (so le từng chữ).
 *  - Đám mây lơ lửng nhẹ lên xuống mãi.
 *  - Rê chuột: các chữ nhảy thành làn sóng, "SSS" nảy cao hơn và xoay một vòng.
 *  - Bấm: cả khối nhún xuống rồi bật lại.
 *  - Ngồi yên: cứ ~12 giây "SSS" nhún nhảy một lượt (tab đang ẩn thì thôi).
 *
 * Mỗi chữ cái là một <span> do React vẽ (không dùng `splitText` của anime.js — nó sửa DOM sau
 * lưng React). Chỉ animate transform/opacity. Tắt khi "Giảm chuyển động" của hệ điều hành
 * hoặc chế độ kính Tiết kiệm (`bulkMotionAllowed`).
 *
 * @param {object} props
 * @param {string} props.logoSrc  ảnh đám mây
 * @param {() => void} props.onClick
 * @param {string} [props.title]
 */
const WORD = [...'cloud'];
const ACCENT = [...'SSS'];

const BOUNCY = spring({ bounce: 0.6, duration: 620 });

export default function AnimatedBrand({ logoSrc, onClick, title }) {
    const rootRef = useRef(null);
    const logoRef = useRef(null);
    const busyRef = useRef(false);

    const letters = () => rootRef.current?.querySelectorAll('[data-ch]') ?? [];
    const accents = () => rootRef.current?.querySelectorAll('[data-ch="accent"]') ?? [];

    useEffect(() => {
        if (!bulkMotionAllowed() || !rootRef.current) return undefined;
        const running = [];

        // Màn mở đầu: đám mây bật ra, chữ rơi xuống nảy lò xo.
        running.push(
            animate(logoRef.current, {
                scale: { from: 0.2, to: 1, ease: spring({ bounce: 0.55, duration: 700 }) },
                rotate: { from: -40, to: 0, ease: spring({ bounce: 0.4, duration: 700 }) },
                opacity: { from: 0, to: 1, duration: 200 },
            }),
            animate(letters(), {
                y: { from: '-1.1em', to: 0, ease: BOUNCY },
                rotate: { from: stagger([-25, 25]), to: 0, ease: BOUNCY },
                opacity: { from: 0, to: 1, duration: 180, ease: 'out(2)' },
                delay: stagger(55, { start: 120 }),
            }),
        );

        // Đám mây lơ lửng.
        running.push(
            animate(logoRef.current, {
                translateY: [-1.5, 1.5],
                duration: 2400,
                ease: 'inOutSine',
                alternate: true,
                loop: true,
                delay: 900,
            }),
        );

        // Cứ ~12s "SSS" nhún nhảy một lượt khi người dùng không đụng vào.
        const timer = setInterval(() => {
            if (document.hidden || busyRef.current || !bulkMotionAllowed()) return;
            animate(accents(), {
                y: [
                    { to: '-0.35em', duration: 170, ease: 'out(3)' },
                    { to: 0, ease: BOUNCY },
                ],
                scale: [
                    { to: 1.18, duration: 170, ease: 'out(3)' },
                    { to: 1, ease: BOUNCY },
                ],
                delay: stagger(80),
            });
        }, 12000);

        return () => {
            clearInterval(timer);
            running.forEach((a) => a.revert());
        };
    }, []);

    const handleEnter = () => {
        if (!bulkMotionAllowed() || busyRef.current) return;
        busyRef.current = true;
        animate(letters(), {
            y: [
                { to: '-0.45em', duration: 160, ease: 'out(3)' },
                { to: 0, ease: BOUNCY },
            ],
            delay: stagger(40),
            onComplete: () => {
                busyRef.current = false;
            },
        });
        animate(accents(), {
            rotate: { from: 0, to: 360, duration: 700, ease: 'inOut(3)' },
            delay: stagger(60, { start: 200 }),
        });
        animate(logoRef.current, {
            rotate: [
                { to: -14, duration: 140, ease: 'out(2)' },
                { to: 0, ease: BOUNCY },
            ],
        });
    };

    const handleClick = () => {
        if (bulkMotionAllowed() && rootRef.current) {
            animate(rootRef.current, {
                scaleY: [
                    { to: 0.82, duration: 90, ease: 'out(2)' },
                    { to: 1, ease: spring({ bounce: 0.65, duration: 500 }) },
                ],
                scaleX: [
                    { to: 1.08, duration: 90, ease: 'out(2)' },
                    { to: 1, ease: spring({ bounce: 0.65, duration: 500 }) },
                ],
            });
        }
        onClick?.();
    };

    return (
        <div
            ref={rootRef}
            onClick={handleClick}
            onMouseEnter={handleEnter}
            className="hidden sm:flex items-center cursor-pointer select-none pr-2 origin-bottom"
            title={title}
        >
            <img ref={logoRef} src={logoSrc} alt="" className="w-8 h-8 mr-1" />
            {/* Chữ chỉ hiện từ `md`: ở dải 640–767px (tablet dọc nhỏ, điện thoại xoay ngang) cả bốn
                nút tròn đã quay lại thanh, thêm chữ nữa là ô tìm kiếm lại bị ép còn vài chục pixel. */}
            <span
                className="hidden md:inline-flex items-baseline text-xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 font-sans"
                aria-label="cloudSSS"
            >
                {WORD.map((ch, i) => (
                    <span key={`w${i}`} data-ch="word" aria-hidden="true" className="inline-block">
                        {ch}
                    </span>
                ))}
                {ACCENT.map((ch, i) => (
                    <span
                        key={`a${i}`}
                        data-ch="accent"
                        aria-hidden="true"
                        className="inline-block text-blue-600 dark:text-blue-400 font-black text-2xl"
                    >
                        {ch}
                    </span>
                ))}
            </span>
        </div>
    );
}

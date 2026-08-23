import React, { useEffect, useRef } from "react";

export default function AuthBackground({
  children,
  spacing = 26,
  baseRadius = 2.4,
  influenceRadius = 90,
  mode = "bump",
}) {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement);

    function handleMouseMove(e) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
    }
    function handleMouseLeave() {
      mouseRef.current.active = false;
    }
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const sign = mode === "dent" ? -1 : 1;

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const mouse = mouseRef.current;

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;

          // Sóng nền: lan toả liên tục theo thời gian, không phụ thuộc chuột
          const wave = Math.sin(x * 0.02 + y * 0.02 + t * 0.0012) * 0.5 + 0.5;

          // Hiệu ứng cục bộ quanh con trỏ, giảm dần theo khoảng cách (falloff bậc 2 cho mượt)
          let bump = 0;
          if (mouse.active) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < influenceRadius) {
              const falloff = 1 - dist / influenceRadius;
              bump = falloff * falloff;
            }
          }

          const radius = Math.max(baseRadius + wave * 1.4 + sign * bump * 3.5, 0.4);
          const opacity = 0.1 + wave * 0.1 + bump * 0.35;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${opacity.toFixed(3)})`;
          ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [spacing, baseRadius, influenceRadius, mode]);

  return (
    <div style={styles.wrapper}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* Glow tĩnh phía sau, tạo điểm neo sáng và chiều sâu màu */}
      <div style={styles.glowPrimary} />
      <div style={styles.glowSecondary} />

      <div style={styles.content}>{children}</div>
    </div>
  );
}

const styles = {
  wrapper: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(160deg, #0a0e17 0%, #0d1420 55%, #0a0e17 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    cursor: "default",
  },
  glowPrimary: {
    position: "absolute",
    top: "-15%",
    left: "20%",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  glowSecondary: {
    position: "absolute",
    bottom: "-20%",
    right: "10%",
    width: "450px",
    height: "450px",
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  content: {
    position: "relative",
    zIndex: 10,
    width: "100%",
    maxWidth: "460px",
  },
};


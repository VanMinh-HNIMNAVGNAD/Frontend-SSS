import React from "react";

/**
 * Nền chung của các màn xác thực. Đi theo theme của app (class `dark` trên <html>),
 * không tô cứng một màu riêng — xem `authStyles.js`.
 */
export default function AuthBackground({ children }) {
  return (
    // Nền trong suốt: lớp dưới cùng là nền ambient của <body> (index.css). Vài khối sáng mềm
    // trung tính (trắng / xám bạc — không có sắc xanh navy) để thẻ kính có thứ mà làm mờ.
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-white/80 dark:bg-white/[0.06] blur-[110px] pointer-events-none" />
      <div className="absolute top-1/3 -right-40 w-[560px] h-[560px] rounded-full bg-slate-300/45 dark:bg-zinc-500/[0.12] blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 left-1/4 w-[620px] h-[460px] rounded-full bg-stone-300/40 dark:bg-stone-400/[0.08] blur-[120px] pointer-events-none" />

      {/* Nội dung form */}
      <div className="relative z-10 w-full max-w-[460px]">
        {children}
      </div>
    </div>
  );
}

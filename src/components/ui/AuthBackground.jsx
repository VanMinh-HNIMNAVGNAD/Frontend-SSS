import React from "react";

/**
 * Nền chung của các màn xác thực. Đi theo theme của app (class `dark` trên <html>),
 * không tô cứng một màu riêng — xem `authStyles.js`.
 */
export default function AuthBackground({ children }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[var(--app-bg)] relative overflow-hidden">
      {/* Điểm sáng nhẹ tập trung ngay phía sau form để tôn form nổi bật trên nền đơn sắc */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/[0.10] dark:bg-blue-500/[0.06] rounded-full blur-[140px] pointer-events-none" />

      {/* Hoạ tiết lưới siêu nhẹ tạo chiều sâu tối giản. Nét lưới của bản tối là màu
          trắng, nên bản sáng cần một lớp nét tối riêng — dùng chung thì lưới biến mất. */}
      <div className="absolute inset-0 bg-grid-pattern-ink opacity-60 dark:hidden pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] hidden dark:block pointer-events-none" />

      {/* Nội dung form */}
      <div className="relative z-10 w-full max-w-[460px]">
        {children}
      </div>
    </div>
  );
}

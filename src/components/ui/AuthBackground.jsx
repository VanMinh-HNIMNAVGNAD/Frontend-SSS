import React from "react";

export default function AuthBackground({ children }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0a0e17] relative overflow-hidden">
      {/* Điểm sáng nhẹ tập trung ngay phía sau form để tôn form nổi bật trên nền đơn sắc */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/[0.05] rounded-full blur-[140px] pointer-events-none" />

      {/* Hoạ tiết lưới siêu nhẹ tạo chiều sâu tối giản, không gây rối mắt */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none" />

      {/* Nội dung form */}
      <div className="relative z-10 w-full max-w-[460px]">
        {children}
      </div>
    </div>
  );
}


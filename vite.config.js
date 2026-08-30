import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // KHÔNG khai `envDir`: Vite đọc `.env` ngay trong `frontend/`.
  // Trước đây là `envDir: '..'` để dùng chung `.env` ở gốc repo — nhưng như vậy Vite
  // nhìn thấy cả file chứa bí mật của backend, chỉ cần một khoá bị đặt nhầm tiền tố
  // VITE_ là nó vào thẳng bundle JS. Nay `frontend/.env` chỉ chứa giá trị công khai.
})

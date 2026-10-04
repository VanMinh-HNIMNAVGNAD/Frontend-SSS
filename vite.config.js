import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Thư mục chứa chính file này. KHÔNG dùng process.cwd(): trên Vercel lệnh build
// có thể chạy từ gốc repo với "Root Directory" trỏ vào frontend/, lúc đó cwd
// không phải nơi đặt `.env`.
const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))

/**
 * Chặn build production khi thiếu địa chỉ backend.
 *
 * Vì sao phải chặn: `frontend/.env` bị .gitignore nên không bao giờ tới được
 * Vercel — nếu quên khai VITE_API_BASE_URL trong Environment Variables thì bundle
 * vẫn build THÀNH CÔNG và ship ra production, chỉ có điều nó trỏ về
 * localhost:5000. Không log, không lỗi; người dùng bấm đăng nhập mới lòi ra.
 * Thà hỏng ở bước deploy còn hơn hỏng trong tay người dùng.
 *
 * Trỏ vào localhost thì chỉ CẢNH BÁO chứ không chặn: `pnpm build && pnpm preview`
 * để xem thử bản build với backend chạy local là việc hợp lệ.
 *
 * @param {Record<string, string>} env Biến môi trường Vite đọc được (gồm cả
 *   biến inline của Vercel/CI, không chỉ file `.env`)
 */
function assertApiBaseUrl(env) {
  const url = (env.VITE_API_BASE_URL || env.VITE_API_URL || '').trim()

  if (!url) {
    throw new Error(
      'Thiếu VITE_API_BASE_URL — dừng build.\n' +
        '  Máy dev : chép frontend/.env.example thành frontend/.env rồi điền giá trị.\n' +
        '  Vercel  : Settings > Environment Variables, thêm VITE_API_BASE_URL\n' +
        '            (ví dụ https://<service>.run.app/api/v1) cho cả Production,\n' +
        '            Preview, Development rồi Redeploy.\n' +
        '  Biến VITE_* chỉ được nhúng LÚC BUILD — đổi env mà không redeploy thì\n' +
        '  bundle cũ vẫn giữ giá trị cũ.',
    )
  }

  // Mọi nơi ghép `${API_BASE_URL}/auth/google`, `/files`... nên thiếu `/api/v1` thì build
  // vẫn xanh nhưng MỌI request trúng 404 `Cannot GET /auth/...` — đã xảy ra khi chuyển
  // sang Cloud Run (khai mỗi URL service). Chặn ngay lúc build.
  if (!/\/api\/v1\/?$/.test(url)) {
    throw new Error(
      `VITE_API_BASE_URL phải kết thúc bằng /api/v1 — đang là: ${url}\n` +
        `  Sửa thành: ${url.replace(/\/+$/, '')}/api/v1 rồi Redeploy.`,
    )
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
    console.warn(
      `\n[vite] CẢNH BÁO: đang build với VITE_API_BASE_URL=${url}\n` +
        '       Bundle này chỉ chạy được trên máy có backend ở địa chỉ đó.\n' +
        '       Nếu đây là bản deploy thì đã khai nhầm biến.\n',
    )
  }
}

/**
 * Chặn biến `VITE_*` mang tên của một bí mật (secret/private/password/key_file).
 *
 * Mọi biến `VITE_*` bị nhúng NGUYÊN VĂN vào bundle JS công khai — đặt nhầm
 * `VITE_JWT_SECRET` hay `VITE_DB_PASSWORD` là ai mở DevTools cũng đọc được. Chốt này
 * trước đây nằm ở `backend/src/config/validate-config.ts`, chỉ chạy được khi hai bên
 * còn đọc chung một `.env`; tách `.env` xong thì backend không còn thấy biến VITE_ nào,
 * nên chốt chuyển về đây — đúng chỗ biến bị đóng gói (##74). Chạy cả `dev` lẫn `build`.
 * Site key Turnstile, URL API… là giá trị công khai, không khớp các nhãn này.
 *
 * @param {Record<string, string>} env
 */
function assertNoSecretsInViteEnv(env) {
  const leaked = Object.keys(env).filter((key) => /secret|private|password|key_file/i.test(key))
  if (leaked.length > 0) {
    throw new Error(
      `Biến ${leaked.join(', ')} có tiền tố VITE_ nhưng tên lại là của một bí mật — dừng.\n` +
        '  Biến VITE_* được đóng gói CÔNG KHAI vào JS gửi cho mọi trình duyệt.\n' +
        '  Bí mật thuộc về backend/.env (hoặc env của Cloud Run), không phải frontend.',
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // loadEnv ưu tiên biến đã có sẵn trong process.env (cách Vercel/CI truyền vào)
  // rồi mới tới các file `.env`.
  const env = loadEnv(mode, ROOT_DIR, 'VITE_')

  // Chỉ soi lúc `vite build`. `vite dev` vẫn chạy được khi chưa có `.env` nhờ giá
  // trị dự phòng ở src/constants/api.js.
  assertNoSecretsInViteEnv(env)
  if (command === 'build') assertApiBaseUrl(env)

  return {
    plugins: [react(), tailwindcss()],
    // KHÔNG khai `envDir`: Vite đọc `.env` ngay trong `frontend/`.
    // Trước đây là `envDir: '..'` để dùng chung `.env` ở gốc repo — nhưng như vậy Vite
    // nhìn thấy cả file chứa bí mật của backend, chỉ cần một khoá bị đặt nhầm tiền tố
    // VITE_ là nó vào thẳng bundle JS. Nay `frontend/.env` chỉ chứa giá trị công khai.
  }
})

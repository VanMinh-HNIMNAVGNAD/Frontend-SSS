# cloudSSS - Frontend

Giao diện web của cloudSSS (tên mã `driveR`): ứng dụng lưu trữ và chia sẻ tệp kiểu Google Drive, có trợ lý AI đọc được nội dung tệp và thanh toán VietQR. Đây là một SPA React, gọi API của backend NestJS.

- Website: https://drwkmxjennie.fun
- Hosting: Vercel (tự deploy khi có commit mới)
- Backend: repo riêng `BdriveWApps` (NestJS, chạy trên Google Cloud Run)

## Tính năng chính

- Quản lý tệp: Trang chủ, Drive của tôi, Bộ nhớ dùng chung, Được chia sẻ với tôi, Gần đây, Có gắn dấu sao, Nội dung rác, Thùng rác
- Tạo, đổi tên, di chuyển, sao chép, cắt/dán, gắn sao, đổi màu, chọn nhiều, tải ZIP
- Tải lên nhiều tệp và thư mục bằng kéo thả; tệp lớn tải theo chunk, tạm dừng và tải tiếp được sau F5
- Xem trước ảnh, video, âm thanh, PDF, Word, Excel/CSV, Markdown, mã nguồn
- Chia sẻ theo email hoặc bằng link (hạn dùng, mật khẩu, cho/không cho tải); trang công khai `/share/:token`
- Hỏi AI trên tệp (chuột phải vào tệp, chọn Hỏi AI), trả lời dần từng chữ
- Đăng nhập email + OTP, Google, GitHub; quản lý thiết bị đăng nhập
- Gói cước, thanh toán payOS (VietQR)
- Tiếng Việt / English, giao diện sáng / tối, phím tắt

## Công nghệ

| Hạng mục | Dùng gì |
| --- | --- |
| UI | React 19, React Router 7 |
| Build | Vite 8 |
| CSS | Tailwind CSS 4 |
| Gọi API | Axios |
| Xem trước tệp | pdf.js, docx-preview, mammoth, SheetJS (xlsx), marked, react-syntax-highlighter |
| Khác | lucide-react (icon), react-hot-toast, Cloudflare Turnstile (CAPTCHA) |
| Công cụ | Node.js 22, pnpm 11, ESLint |

## Kiến trúc

```text
Trình duyệt
  React SPA
    |-- REST + SSE -------------> Backend NestJS  (VITE_API_BASE_URL, tiền tố /api/v1)
    |-- PUT byte tệp -----------> Google Cloud Storage (presigned URL / phiên resumable do backend ký)
    |-- GET thumbnail .webp ----> Cloudflare R2 + CDN
  Service Worker (public/sw.js): chỉ cache byte thumbnail
  IndexedDB: cache thumbnail, trạng thái tải tiếp
```

Một số điểm cần biết:

- **Byte tệp không đi qua backend.** Backend chỉ ký URL; trình duyệt tải thẳng lên GCS. Tệp trên 10 MB (`CHUNK_THRESHOLD` trong `src/constants/upload.js`) được chia chunk 10 MB. Nếu đường trực tiếp lỗi, app tự chuyển sang đường proxy qua backend.
- **Xác thực:** access token gửi qua header `Authorization: Bearer`, refresh token nằm trong cookie HttpOnly. Khi gặp 401, `src/services/api.js` gọi `POST /auth/refresh` một lần rồi gửi lại request; refresh cũng lỗi thì mới đăng xuất.
- **Hỏi AI** nhận câu trả lời qua SSE và tự nối lại khi rớt mạng.
- **Service Worker chỉ cache thumbnail**, không cache HTML/JS/CSS hay API, để bản deploy mới luôn tới được người dùng.
- **State dùng chung** nằm trong các Context: `AuthContext`, `FileContext`, `UploadContext`, `AiPanelContext`, `LanguageContext`.

## Cấu trúc thư mục

```text
src/
  pages/          các trang: MyDrivePage, SharedDrivesPage, SharePage, BillingAndQuota, LoginPage...
  components/
    file-manager/ danh sách tệp, menu chuột phải, xem trước, chia sẻ, khung AI, tiến trình tải lên
    layout/       Header, SideBar, MainLayout, cài đặt, tài khoản
    modals/       các hộp thoại khác
    security/     OTP, Turnstile, đồng ý điều khoản
    common/ ui/   thành phần giao diện dùng chung
  context/        state toàn app (Auth, File, Upload, AiPanel, Language)
  services/api.js axios, làm mới token, đếm request
  hooks/          phím tắt, thumbnail, theme, zoom ảnh...
  utils/          cây tải lên, dựng thumbnail, cache TTL, định dạng...
  constants/      URL API, ngưỡng upload, đường dẫn...
  locales/        vi.js, en.js
  routes/         AppRouter.jsx
public/sw.js      Service Worker
scripts/          check-i18n.mjs
vite.config.js    chặn build khi thiếu hoặc sai VITE_API_BASE_URL
```

Các route chính: `/login`, `/register`, `/forgot-password`, `/share/:token`, `/billing/success`, `/billing/cancel`, và phần app dưới `/app/*` (`home`, `my-drive`, `shared-drives`, `shared-with-me`, `recent`, `starred`, `spam`, `trash`, `billing`).

## Chạy trên máy

Cần có Node.js 22, pnpm 11 và backend đang chạy (mặc định `http://localhost:5000`).

```bash
corepack enable
pnpm install
cp .env.example .env
```

Sửa `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA   # khoá thử của Cloudflare, luôn cho qua
```

Khoá Turnstile thử ở trên phải đi cặp với `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` ở backend.

```bash
pnpm dev    # http://localhost:5173
```

Mở app bằng `http://localhost:5173`, không dùng `127.0.0.1`. Nếu frontend và backend khác tên máy (một bên `localhost`, một bên `127.0.0.1`), cookie refresh sẽ không được gửi và phiên đăng nhập không giữ được.

Biến `VITE_*` bị nhúng thẳng vào bundle JS, nên chỉ đặt giá trị công khai ở đây. Bí mật thuộc về `.env` của backend.

## Lệnh thường dùng

| Lệnh | Việc |
| --- | --- |
| `pnpm dev` | Dev server ở cổng 5173 |
| `pnpm build` | Build production vào `dist/`. Dừng nếu `VITE_API_BASE_URL` thiếu hoặc không kết thúc bằng `/api/v1` |
| `pnpm preview` | Chạy bản build ở cổng 4173 (Service Worker chỉ đăng ký ở bản build) |
| `pnpm lint` | ESLint |
| `pnpm i18n:check` | Kiểm `vi.js` và `en.js` có cùng bộ khoá, không khoá nào rỗng |

## Debug

**Xem DevTools, cả Console lẫn Network**, không chỉ nhìn toast. Một số lỗi chỉ được `console.warn` (ví dụ tải lên trực tiếp lỗi rồi app tự chuyển sang proxy).

**Lấy `requestId` để tra log backend.** Mọi response từ backend có header `X-Request-Id` và trường `requestId`. Response lỗi có thêm `errorCode` (vd `FILE_4000_NOT_FOUND`) và `messageKey`.

**Đếm request trong trình duyệt.** Bật sẵn khi chạy `pnpm dev`. Trên bản build thì chạy `localStorage.setItem('driver:metrics', '1')` trong Console rồi F5.

| Lệnh trong Console | Việc |
| --- | --- |
| `__driver.reset()` | Đặt bộ đếm về 0, gọi trước thao tác cần đo |
| `__driver.report()` | Bảng theo endpoint: số lượt, số lượt trùng, thời gian |
| `__driver.api()` | Bảng 200/304 và số byte của API |
| `__driver.bytes()` | Số byte thumbnail đã tải |
| `localStorage.setItem('driver:sw', '0')` | Tắt Service Worker, tải lại trang là nó tự gỡ |

**Lỗi thường gặp**

| Triệu chứng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| Mọi thao tác báo "Network Error" | Origin frontend không có trong `CORS_ORIGINS` của backend, hoặc `VITE_API_BASE_URL` trỏ sai | Kiểm `VITE_API_BASE_URL`; xem log khởi động backend dòng `CORS cho phép: ...` |
| Mọi request trả 404 `Cannot GET /auth/...` | `VITE_API_BASE_URL` thiếu `/api/v1` | Sửa biến rồi build lại |
| Widget CAPTCHA báo lỗi `110200` | Tên miền chưa được thêm vào widget Turnstile | Cloudflare > Turnstile > Domains: thêm tên miền và `localhost` |
| Không đăng nhập được, không thấy CAPTCHA | `VITE_TURNSTILE_SITE_KEY` để trống | Điền khoá site |
| Tải lên lỗi CORS ở bước `PUT storage.googleapis.com` | CORS của bucket GCS chưa có origin frontend | Thêm origin vào CORS của bucket |
| Cứ khoảng 15 phút bị đăng xuất | Trình duyệt chặn cookie bên thứ ba (frontend và backend khác site) | Trong Network, xem `POST /auth/refresh` có gửi cookie `refreshToken` không |
| Đổi env trên Vercel mà app không đổi | `VITE_*` chỉ nhúng lúc build | Redeploy |
| Thumbnail người dùng trước còn hiện sau khi đổi tài khoản | Cache SW / IndexedDB chưa được xoá | Đăng xuất phải gọi `resetSharedCaches` |

## Triển khai

**Vercel** (đang dùng): Vercel tự build khi có commit mới. `vercel.json` rewrite mọi đường dẫn về `index.html`. Trong Settings > Environment Variables, khai `VITE_API_BASE_URL` (URL Cloud Run + `/api/v1`) và `VITE_TURNSTILE_SITE_KEY` cho cả Production, Preview, Development, rồi Redeploy.

**Docker + nginx** (dự phòng): có `Dockerfile` và `nginx.conf`, nhưng Dockerfile hiện chỉ nhận `VITE_API_BASE_URL` qua `--build-arg`, chưa nhận `VITE_TURNSTILE_SITE_KEY`, nên image dựng ra sẽ không đăng nhập được. Cần thêm `ARG`/`ENV VITE_TURNSTILE_SITE_KEY` trước khi dùng.

```bash
docker build --build-arg VITE_API_BASE_URL=https://<backend>/api/v1 -t cloudsss-frontend .
docker run -p 8080:80 cloudsss-frontend
```

Trước khi đẩy code: `pnpm lint && pnpm i18n:check && pnpm build`.

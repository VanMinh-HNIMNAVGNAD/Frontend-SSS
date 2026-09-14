// ─────────────────────────────────────────────────────────────────────────────
// Trang pháp lý — đường dẫn, phiên bản, địa chỉ liên hệ
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO FILE NÀY TỒN TẠI: ba trang /terms, /privacy, /data-deletion không phải
// trang trí. Nghĩa vụ nói cho người dùng biết mình thu thập gì và xoá dữ liệu ra
// sao là bắt buộc, và nhà cung cấp OAuth nào cũng đòi đủ ba URL này khi xét duyệt
// — để trống hoặc trỏ vào một URL trả 404 là hồ sơ bị treo.
//
// Đường dẫn khai ở ĐÂY chứ không gõ chuỗi '/privacy' rải rác trong component:
// URL này nằm trong cấu hình ở phía nhà cung cấp OAuth, nên đổi nó là việc phải
// làm CÓ Ý THỨC ở một chỗ — sửa route mà quên sửa ô trong dashboard là app bị treo
// kiểm duyệt mà không có lỗi nào ở phía mình.

/**
 * Ba tài liệu pháp lý. Khoá của object này chính là `docId` mà <LegalPage />
 * nhận qua route, và cũng là khoá tra trong `locales/legal.vi.js` / `legal.en.js`
 * — trùng tên là CỐ Ý, để không cần một bảng ánh xạ thứ hai luôn có nguy cơ lệch.
 */
export const LEGAL_DOCS = {
  TERMS: 'terms',
  PRIVACY: 'privacy',
  DATA_DELETION: 'dataDeletion',
};

/** Đường dẫn công khai của từng tài liệu — phải khớp <Route> trong AppRouter.jsx */
export const LEGAL_PATHS = {
  [LEGAL_DOCS.TERMS]: '/terms',
  [LEGAL_DOCS.PRIVACY]: '/privacy',
  [LEGAL_DOCS.DATA_DELETION]: '/data-deletion',
};

/**
 * Các URL mang tên khác mà người ngoài hay đoán / hay được dán vào tài liệu của
 * bên thứ ba: '/privacy-policy' là dạng Meta gợi ý trong tài liệu của họ,
 * '/terms-of-service' là dạng phổ biến ở các form khác.
 *
 * Giữ chúng sống bằng redirect thay vì để rơi vào trang 404: một URL pháp lý đã
 * điền vào dashboard của Meta thì KHÔNG bao giờ được phép chết, mà mình không
 * kiểm soát được người ta đã dán bản nào đi đâu.
 */
export const LEGAL_ALIASES = {
  '/privacy-policy': LEGAL_PATHS[LEGAL_DOCS.PRIVACY],
  '/terms-of-service': LEGAL_PATHS[LEGAL_DOCS.TERMS],
  '/tos': LEGAL_PATHS[LEGAL_DOCS.TERMS],
  '/delete-data': LEGAL_PATHS[LEGAL_DOCS.DATA_DELETION],
};

/**
 * Phiên bản của bộ điều khoản mà người dùng bấm đồng ý.
 *
 * Gửi kèm lên backend ở bước 1 của đăng ký (`termsVersion`). Ý nghĩa thực dụng:
 * khi điều khoản được sửa về nội dung, tăng con số này thì mọi lần đồng ý sau đó
 * mang nhãn mới, còn các lần trước vẫn mang nhãn cũ — đó là toàn bộ cơ sở để về
 * sau trả lời được câu "người này đã đồng ý với bản nào".
 *
 * ĐỔI SỐ NÀY KHI VÀ CHỈ KHI nội dung điều khoản đổi. Sửa lỗi chính tả thì không.
 */
export const LEGAL_VERSION = '2026-09-10';

/**
 * Ngày hiệu lực in trên đầu tài liệu. Tách khỏi LEGAL_VERSION vì hai thứ này
 * không cùng vai: một cái để MÁY đối chiếu, một cái để NGƯỜI đọc.
 */
export const LEGAL_EFFECTIVE_DATE = '10/09/2026';

/**
 * Hộp thư nhận yêu cầu về dữ liệu cá nhân.
 *
 * ⚠️ PHẢI LÀ HỘP THƯ CÓ NGƯỜI ĐỌC. Đây là địa chỉ duy nhất mà người dùng — và
 * người kiểm duyệt của Meta — dùng để liên hệ khi họ không tự đăng nhập xoá được
 * dữ liệu. Điền một địa chỉ chỉ-gửi-được (như `noreply@`) là hứa một cánh cửa
 * không tồn tại: `MAIL_FROM` của backend đi qua Resend, và Resend chỉ GỬI, không
 * nhận thư về.
 *
 * Đặt qua `VITE_LEGAL_CONTACT_EMAIL` trong `frontend/.env` để đổi được mà không
 * phải build lại mã nguồn.
 */
export const LEGAL_CONTACT_EMAIL =
  (import.meta.env.VITE_LEGAL_CONTACT_EMAIL || '').trim() || 'privacy@drwkmxjennie.fun';

/** Tên dịch vụ và pháp nhân vận hành, dùng xuyên suốt cả ba tài liệu. */
export const SERVICE_NAME = 'cloudSSS';
export const SERVICE_URL = 'https://drwkmxjennie.fun';

/**
 * Người dùng này có phải đi qua màn "đồng ý điều khoản" trước khi dùng app không?
 *
 * BA TRẠNG THÁI, KHÔNG PHẢI HAI — và phân biệt được chúng là toàn bộ giá trị của
 * hàm này:
 *
 *   • `undefined` → **server chưa biết field này**. Xảy ra thật, trong cửa sổ
 *     deploy: frontend lên Vercel trước, backend lên Heroku sau (xem
 *     `.ai/environment.md`), nên trong khoảng đó `GET /auth/me` trả về hồ sơ
 *     KHÔNG có khoá `termsAcceptedAt` và endpoint `/auth/accept-terms` cũng chưa
 *     tồn tại. Chặn ở trạng thái này là khoá cứng TOÀN BỘ người dùng sau một màn
 *     hình mà nút "Đồng ý" của nó gọi vào một endpoint 404 — không có đường ra.
 *     Nên: KHÔNG chặn.
 *   • `null` → **server đã trả lời, và câu trả lời là chưa đồng ý.** Đây là ca
 *     thật: tài khoản tạo bằng OAuth (luồng đó không có ô tích nào để đi qua) và
 *     mọi tài khoản có trước 10/09/2026 (migration 027 cố ý không backfill).
 *     Nên: CHẶN.
 *   • có giá trị → đã đồng ý. Không chặn.
 *
 * Cùng một tinh thần với `typeof user?.isDiscoverableByEmail === 'boolean'` trong
 * AuthContext.jsx: chỉ hành động khi server thật sự có nói điều gì đó.
 *
 * KHÔNG so `termsVersion` với `LEGAL_VERSION` ở đây. Làm vậy thì mỗi lần sửa lỗi
 * chính tả trong tài liệu (nếu ai đó tăng LEGAL_VERSION theo phản xạ) là dựng màn
 * chặn trước mặt toàn bộ người dùng. Ngày nào điều khoản đổi tới mức cần xin lại
 * sự đồng ý thì đó là một quyết định có chủ ý, và chỗ để viết nó là ở đây.
 *
 * @param {{ termsAcceptedAt?: string | null } | null | undefined} user Hồ sơ từ
 *   `GET /auth/me` (hoặc từ lượt đăng nhập — cả hai đi qua cùng một hình dạng)
 * @returns {boolean}
 */
export function needsTermsAcceptance(user) {
  return user?.termsAcceptedAt === null;
}

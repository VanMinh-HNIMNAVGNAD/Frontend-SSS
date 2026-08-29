// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình HIỂN THỊ của trang Gói dịch vụ & Dung lượng (Billing)
// ─────────────────────────────────────────────────────────────────────────────
//
// NGUYÊN TẮC: file này KHÔNG chứa bảng giá, KHÔNG chứa dung lượng gói.
//
//   • Tên gói, dung lượng, `priceMonthly`, `priceYearly` → luôn đến từ
//     `GET /billing/plans` (`billingApi.getPlans()`). Thêm/xoá/đổi giá một gói
//     trong DB là bảng giá tự đổi theo, không phải sửa code.
//   • Thứ mà API không biết — badge, icon, màu nhấn, các gạch đầu dòng quyền lợi
//     — nằm ở `PLAN_UI_CONFIG` bên dưới, ghép vào dữ liệu API theo `plan.name`.
//
// Trước đây trang render một mảng gói hard-code (có cả giá) nên khi DB lên 5 gói
// thì giá của gói cuối bị lặp lại cho mọi gói phía sau. Đặt `price` /
// `storageBytes` vào đây là dựng lại đúng cái bẫy đó.
//
// Tách khỏi `pages/BillingAndQuota.jsx` để `components/modals/TransactionDetailModal.jsx`
// dùng chung được các nhãn trạng thái/chu kỳ mà không phải import ngược từ page
// (page → modal → page là vòng import).

import {
  AlertTriangle,
  Check,
  Clock,
  Cloud,
  Crown,
  Gem,
  Package,
  Rocket,
  XCircle,
  Zap,
} from 'lucide-react';

// ─────────────────────────────── Định dạng số ───────────────────────────────

/** VND nguyên, không phần thập phân: `price_monthly` / `price_yearly` là numeric(12,0). */
export const formatVnd = (amount) => `${new Intl.NumberFormat('vi-VN').format(Number(amount) || 0)} đ`;

/**
 * `endDate` (ISO từ API) -> `"01/09/2026"`. Chuỗi rỗng nếu thiếu/không parse được, để chỗ gọi
 * không phải tự phòng ngừa và không bao giờ in ra "Invalid Date".
 *
 * Chỉ dùng cho MỐC NGÀY của gói cước, và cố ý format theo giờ MÁY KHÁCH — khách đang ở đâu thì
 * đọc theo giờ ở đó. Câu thông báo sau khi huỷ gia hạn thì KHÁC: nó lấy nguyên `message` của
 * backend (đã format theo giờ VN) chứ không dựng lại ở đây, để hai bên không lệch một ngày.
 */
export const formatPlanDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Nhãn dung lượng cho bảng giá (GB dưới 1 TB, còn lại quy ra TB). */
export const formatStorage = (bytes) => {
  const num = Number(bytes) || 0;
  const inTB = num / 1024 ** 4;
  if (inTB >= 1) return `${Number(inTB.toFixed(2))} TB`;
  return `${Number((num / 1024 ** 3).toFixed(2))} GB`;
};

/**
 * Dung lượng của gói lấy từ API: ưu tiên `storageBytes`, dự phòng `storageGB`.
 * Không có hằng số dung lượng nào ở phía client.
 */
export const resolveStorageBytes = (plan) => {
  const bytes = Number(plan?.storageBytes) || 0;
  if (bytes > 0) return bytes;
  const gb = Number(plan?.storageGB) || 0;
  return gb > 0 ? Math.round(gb * 1024 ** 3) : 0;
};

// ────────────────────────── Chu kỳ thanh toán ──────────────────────────
//
// 4 chu kỳ với chiết khấu theo bundle — khớp 1:1 với
// `BillingService.calculateAmountForCycle` ở backend:
//   1 Tháng: giá gốc · 3 Tháng: -5% · 6 Tháng: -15%
//   1 Năm: dùng `priceYearly` của DB nếu > 0, không thì -20%
//
// NHÃN -17% CỦA CHU KỲ NĂM LÀ SỐ CỦA DỮ LIỆU, KHÔNG PHẢI CỦA CÔNG THỨC. Cả 4 gói trả phí
// trong DB (017-reprice-storage-plans.sql) đều đặt `price_yearly` = 10 tháng, tức -16,67% →
// làm tròn -17%; mức -20% ở `CYCLE_DISCOUNT` chỉ là đường lui cho gói nào để `price_yearly`
// = 0. Đổi `price_yearly` trong DB (hoặc qua CLI `updatePlan`) là phải sửa lại nhãn ở đây —
// con số tiết kiệm IN TRÊN TỪNG THẺ thì không cần, nó suy ngược từ giá thật trong
// `buildPriceInfo` (pages/BillingAndQuota.jsx).

export const CYCLES = [
  { id: 'monthly', label: '1 Tháng', badge: null },
  { id: '3_months', label: '3 Tháng', badge: '-5%' },
  { id: '6_months', label: '6 Tháng', badge: '-15%' },
  { id: 'yearly', label: '1 Năm', badge: '-17% 🔥' },
];

/** Số tháng của mỗi chu kỳ — dùng để quy đổi "mỗi tháng tương đương". */
export const CYCLE_MONTHS = { monthly: 1, '3_months': 3, '6_months': 6, yearly: 12 };

/** Hệ số chiết khấu của mỗi chu kỳ. Sửa ở đây là phải sửa cả backend. */
export const CYCLE_DISCOUNT = { monthly: 1, '3_months': 0.95, '6_months': 0.85, yearly: 0.8 };

export const CYCLE_UNIT = {
  monthly: 'tháng',
  '3_months': '3 tháng',
  '6_months': '6 tháng',
  yearly: 'năm',
};

export const CYCLE_LABEL = {
  monthly: '1 tháng',
  '3_months': '3 tháng (-5%)',
  '6_months': '6 tháng (-15%)',
  yearly: '1 năm (-17%)',
};

// ───────────────────────── CẤU HÌNH GIAO DIỆN CỦA GÓI ─────────────────────────
//
// `match` là các từ khoá dò trong `plan.name` (đã lower-case). Không khớp tên nào
// thì rơi về config theo index — vì `GET /billing/plans` sắp theo `priceMonthly`
// tăng dần nên thứ tự mảng này (rẻ → đắt) cũng chính là thứ tự dự phòng đúng.
//
// Dòng quyền lợi đầu tiên của mỗi thẻ được sinh động từ dung lượng API, nên
// `features` ở đây cố ý không nhắc tới dung lượng gói.
//
// `badge: null` = gói không có huy hiệu; thẻ vẫn giữ đúng chiều cao ô huy hiệu để
// các thẻ trong cùng một hàng không bị xô lệch.

export const PLAN_UI_CONFIG = [
  {
    key: 'free',
    match: ['free', 'miễn phí', 'mien phi'],
    Icon: Cloud,
    badge: {
      label: 'Cơ Bản',
      Icon: null,
      tone: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-transparent',
    },
    highlight: false,
    iconTone: 'text-slate-400 dark:text-slate-500',
    features: ['Truy vấn AI: 5 tệp nhỏ', 'Lưu trữ tiêu chuẩn', 'Đồng bộ đa nền tảng'],
  },
  {
    key: 'lite',
    match: ['lite', 'starter', 'tiêu chuẩn', 'tieu chuan'],
    Icon: Package,
    badge: {
      label: 'Tiết Kiệm',
      Icon: null,
      tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    },
    highlight: false,
    iconTone: 'text-emerald-500 dark:text-emerald-400',
    features: ['Truy vấn AI: Giới hạn thấp', 'Bảo mật mã hoá file', 'Tăng tốc độ tải (Cơ bản)'],
  },
  {
    key: 'pro',
    match: ['pro', 'cá nhân', 'ca nhan', 'personal'],
    Icon: Zap,
    badge: {
      label: 'Phổ Biến',
      Icon: Zap,
      tone: 'bg-blue-600 text-white border border-transparent shadow-sm',
    },
    highlight: true,
    iconTone: 'text-blue-600 dark:text-blue-400',
    features: ['Truy vấn AI: Trung bình', 'Bảo mật mã hoá file', 'Tốc độ Upload/Download cao'],
  },
  {
    key: 'plus',
    match: ['plus', 'cao cấp', 'cao cap', 'premium'],
    Icon: Rocket,
    // Không có huy hiệu theo thiết kế — ô huy hiệu để trống nhưng vẫn chiếm chỗ.
    badge: null,
    highlight: false,
    iconTone: 'text-amber-500 dark:text-amber-400',
    features: [
      'Truy vấn AI: Hạn mức cao',
      'Mã hoá nâng cao',
      'Tốc độ Ưu tiên',
      'Bộ nhớ dùng chung',
    ],
  },
  {
    key: 'ultra',
    match: ['ultra', 'tối thượng', 'toi thuong', 'enterprise', 'business'],
    Icon: Crown,
    badge: {
      label: 'Tối Thượng',
      Icon: null,
      tone: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    },
    highlight: false,
    iconTone: 'text-purple-500 dark:text-purple-400',
    features: [
      'Truy vấn AI: Không giới hạn',
      'Mã hoá E2EE',
      'Băng thông tối đa',
      'Hỗ trợ VIP 24/7',
    ],
  },
];

/** Gói lạ (DB thêm gói mới ngoài 5 gói chuẩn) vẫn render được, chỉ là trung tính. */
export const FALLBACK_PLAN_UI = {
  key: 'custom',
  Icon: Gem,
  badge: null,
  highlight: false,
  iconTone: 'text-slate-400 dark:text-slate-500',
  features: [
    'Toàn bộ tính năng chia sẻ & đồng bộ',
    'Hỗ trợ kỹ thuật tiêu chuẩn',
    'Thanh toán an toàn qua payOS',
  ],
};

/**
 * Ghép config giao diện vào một gói của API: khớp theo tên trước, không có thì theo index.
 *
 * Chọn config có TỪ KHOÁ KHỚP DÀI NHẤT chứ không phải config đứng đầu mảng. Tên "Pro Plus"
 * chứa cả `pro` lẫn `plus`; lấy cái đầu tiên tìm thấy thì `pro` (đứng trước trong mảng) luôn
 * thắng và gói Plus mang nhầm màu/quyền lợi của Pro. Từ khoá dài hơn là từ khoá cụ thể hơn.
 */
export const resolvePlanUi = (plan, index) => {
  const name = (plan?.name || '').toLowerCase();

  let best = null;
  let bestLength = 0;
  for (const cfg of PLAN_UI_CONFIG) {
    for (const keyword of cfg.match) {
      if (keyword.length > bestLength && name.includes(keyword)) {
        best = cfg;
        bestLength = keyword.length;
      }
    }
  }

  return best || PLAN_UI_CONFIG[index] || FALLBACK_PLAN_UI;
};

/**
 * Số cột của lưới bảng giá ở breakpoint lớn nhất.
 *
 * Cố định `xl:grid-cols-5` thì gói thứ 6 trong DB rớt xuống hàng hai một mình. Tailwind quét
 * class theo chuỗi TĨNH nên không thể nội suy `xl:grid-cols-${n}` — phải liệt kê sẵn.
 */
export const PLAN_GRID_COLS = {
  1: 'md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1',
  2: 'md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2',
  3: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
  4: 'md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4',
  5: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3',
};

/** Nhiều hơn 6 gói thì 4 cột là mức vẫn đọc được thẻ trên màn hình 1440px. */
export const PLAN_GRID_COLS_FALLBACK = 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export const resolvePlanGridCols = (count) => PLAN_GRID_COLS[count] || PLAN_GRID_COLS_FALLBACK;

// ───────────────────────── Trạng thái giao dịch ─────────────────────────
//
// Bảy trạng thái bám nguyên PaymentLinkStatus của payOS (và CHECK constraint của
// cột `payment_transactions.status`).

export const TX_STATUS = {
  PAID: { label: 'Thành công', Icon: Check, tone: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/30' },
  PENDING: { label: 'Đang chờ', Icon: Clock, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  PROCESSING: { label: 'Đang xử lý', Icon: Clock, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  UNDERPAID: { label: 'Trả thiếu', Icon: AlertTriangle, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  CANCELLED: { label: 'Đã huỷ', Icon: XCircle, tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  EXPIRED: { label: 'Hết hạn', Icon: XCircle, tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  FAILED: { label: 'Thất bại', Icon: XCircle, tone: 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-500/30' },
};

/** Trạng thái chưa chốt: còn kiểm tra lại được với payOS. */
export const PENDING_STATUSES = ['PENDING', 'PROCESSING'];

/** Nhãn trạng thái cho status lạ (payOS thêm status mới) — không để rơi ra chuỗi trống. */
export const resolveTxStatus = (status) =>
  TX_STATUS[status] || {
    label: status || 'Không xác định',
    Icon: AlertTriangle,
    tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  };

export const PAYMENT_METHOD_LABEL = { PAYOS: 'payOS (VietQR)' };

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  Clock,
  CreditCard,
  HardDrive,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { billingApi, userApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../context/FileContext';
import { formatBytes } from '../utils/formatFileSize';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Trang Gói dịch vụ & Dung lượng
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bảng giá, số tiền và lịch sử giao dịch đều lấy từ server. TRƯỚC ĐÂY trang này
 * hardcode 3 gói kèm giá dạng chuỗi ("45.000 đ") và một mảng `historyData` bịa sẵn,
 * còn nút thanh toán chỉ `alert()` giả lập — không có gói nào thật sự được mua.
 *
 * Vì sao KHÔNG hardcode nữa dù giá hiện tại đang khớp: `storage_plans` là nơi duy
 * nhất đổi giá được (qua CLI admin `updatePlan`), và `planId` là UUID sinh theo từng
 * môi trường DB nên không thể viết cứng trong code — không có planId thật thì không
 * tạo được link thanh toán.
 *
 * Chỉ còn phần TRANG TRÍ là cục bộ (các gạch đầu dòng quảng cáo, nhãn "Phổ biến
 * nhất"): `storage_plans` không có cột nào lưu chúng. Mọi CON SỐ — tên gói, dung
 * lượng, giá tháng/năm — đều đến từ server.
 */

/** VND nguyên, không phần thập phân: `price_monthly` / `price_yearly` là numeric(12,0). */
const formatVnd = (amount) => `${new Intl.NumberFormat('vi-VN').format(Number(amount) || 0)} đ`;

/**
 * Nhãn dung lượng cho bảng giá. KHÔNG dùng formatBytes(bytes, 0): làm tròn 0 chữ số
 * biến một gói 1.5 TB thành "2 TB". Ở đây cắt số 0 vô nghĩa nhưng giữ phần lẻ thật.
 */
const formatStorage = (bytes) => {
  const num = Number(bytes) || 0;
  const inTB = num / 1024 ** 4;
  if (inTB >= 1) return `${Number(inTB.toFixed(2))} TB`;
  return `${Number((num / 1024 ** 3).toFixed(2))} GB`;
};

const CYCLE_UNIT = { monthly: 'tháng', yearly: 'năm' };
const CYCLE_LABEL = { monthly: '1 tháng', yearly: '1 năm' };

/**
 * Gạch đầu dòng quảng cáo theo bậc gói. Chỉ là chữ trang trí — dòng dung lượng thật
 * được chèn ở đầu danh sách từ `plan.storageBytes` của server.
 */
const PERKS_BY_TIER = {
  free: ['Xem & chia sẻ tệp trực tuyến', 'Tải xuống tốc độ tiêu chuẩn'],
  paid: ['Tốc độ tải lên / tải xuống cao', 'Bảo mật liên kết nâng cao', 'Hỗ trợ kỹ thuật 24/7'],
  top: ['Không giới hạn băng thông', 'Khôi phục tệp trong 30 ngày', 'Ưu tiên hỗ trợ kỹ thuật'],
};

/**
 * Bảy trạng thái giao dịch bám nguyên `PaymentLinkStatus` của payOS — cùng tập với
 * TRANSACTION_STATUSES ở backend và với CHECK constraint của migration 013. Không có
 * bảng dịch nào ở giữa nên không có chỗ để dịch sai; ở đây chỉ gắn nhãn tiếng Việt.
 */
const TX_STATUS = {
  PAID: { label: 'Thành công', Icon: Check, tone: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-500/30' },
  PENDING: { label: 'Đang chờ', Icon: Clock, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  PROCESSING: { label: 'Đang xử lý', Icon: Clock, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  UNDERPAID: { label: 'Trả thiếu', Icon: AlertTriangle, tone: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-500/30' },
  CANCELLED: { label: 'Đã huỷ', Icon: XCircle, tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  EXPIRED: { label: 'Hết hạn', Icon: XCircle, tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
  FAILED: { label: 'Thất bại', Icon: XCircle, tone: 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-500/30' },
};

/** Còn xử lý dở -> cho người dùng bấm sang trang đối soát để hỏi lại payOS. */
const PENDING_STATUSES = ['PENDING', 'PROCESSING'];

/** `payment_method` trong DB là 'PAYOS' (BillingService.PAYMENT_METHOD_PAYOS). */
const PAYMENT_METHOD_LABEL = { PAYOS: 'payOS (VietQR)' };

export default function BillingAndQuota() {
  const { user, refreshUser } = useAuth();
  const { refreshStorageInfo } = useFiles();

  const [activeSection, setActiveSection] = useState('pricing'); // 'pricing' | 'history'
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'yearly'

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(null);

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Nạp lại dữ liệu mà không gọi setState từ thân effect (react-hooks/set-state-in-effect):
  // thao tác chỉ tăng token, việc gọi API nằm gọn trong effect.
  const [plansToken, setPlansToken] = useState(0);
  const [txToken, setTxToken] = useState(0);
  const reloadTransactions = useCallback(() => setTxToken((n) => n + 1), []);

  // ───────────────────────────── Nạp dữ liệu ─────────────────────────────

  // Hai effect riêng, KHÔNG gộp vào một Promise.all: bảng giá lỗi thì lịch sử vẫn hiện
  // được và ngược lại. Gộp lại là một endpoint chết kéo cả trang thành trắng.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await billingApi.getPlans();
        if (cancelled) return;
        setPlans(Array.isArray(data) ? data : []);
        setPlansError(null);
      } catch (err) {
        if (cancelled) return;
        setPlansError(err.message || 'Không tải được bảng giá');
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plansToken]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await billingApi.getTransactions();
        if (cancelled) return;
        setTransactions(Array.isArray(data) ? data : []);
        setTxError(null);
      } catch (err) {
        if (cancelled) return;
        setTxError(err.message || 'Không tải được lịch sử giao dịch');
      } finally {
        if (!cancelled) setTxLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [txToken]);

  // ─────────────────────────── Dung lượng hiện tại ───────────────────────────

  // Nguồn: user.storageInfo của /auth/me (AuthContext). Sau khi thanh toán xong,
  // /billing/success gọi refreshUser() nên hạn mức mới hiện ra ngay ở đây.
  const usedBytes = Number(user?.storageInfo?.usedBytes) || 0;
  const limitBytes = Number(user?.storageInfo?.limitBytes) || 0;
  // Tự tính thay vì dùng `storageInfo.percentage`: backend không chặn trần nên vượt
  // hạn mức sẽ ra >100 và thanh tiến trình tràn ra ngoài khung.
  const usedPercent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;
  const freeBytes = Math.max(0, limitBytes - usedBytes);

  // ──────────────────────── Bảng giá + phần trang trí ────────────────────────

  const decoratedPlans = useMemo(() => {
    const priceOf = (plan) => Number(billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly) || 0;

    // Server đã sắp theo priceMonthly tăng dần, nên gói trả phí ĐẦU TIÊN là bậc rẻ nhất
    // có thu tiền — chỗ hợp lý nhất để gắn nhãn "Phổ biến nhất".
    const firstPaidIndex = plans.findIndex((plan) => priceOf(plan) > 0);

    return plans.map((plan, index) => {
      const price = priceOf(plan);
      const planBytes = Number(plan.storageBytes) || 0;
      const isFree = price <= 0;
      const isTop = plans.length > 1 && index === plans.length - 1;
      const tier = isFree ? 'free' : isTop ? 'top' : 'paid';

      return {
        ...plan,
        price,
        planBytes,
        storageLabel: formatStorage(planBytes),
        // Gói đang dùng = hạn mức trong hồ sơ khớp ĐÚNG dung lượng gói. Quota do admin
        // cấp tay không khớp gói nào thì không thẻ nào được đánh dấu — đúng ý.
        isCurrent: limitBytes > 0 && planBytes === limitBytes,
        // Giá 0 thì không mua được: BillingService chặn amount <= 0 và trả 400. Gói Free
        // vẫn nằm trong bảng giá để người dùng thấy mình đang ở bậc nào.
        isFree,
        isPopular: firstPaidIndex >= 0 && index === firstPaidIndex,
        isTop,
        features: [`${formatStorage(planBytes)} lưu trữ Multi-Cloud`, ...PERKS_BY_TIER[tier]],
      };
    });
  }, [plans, billingCycle, limitBytes]);

  /**
   * Mức giảm THẬT của gói năm so với trả tháng 12 lần, lấy mức tốt nhất trong bảng giá.
   * Trước đây nhãn này viết cứng "-20%" trong khi bảng giá thật giảm ~17% (450.000 so
   * với 45.000 × 12) — một con số sai ngay trên nút bấm. Bằng 0 thì ẩn nhãn.
   */
  const yearlyDiscountPercent = useMemo(() => {
    let best = 0;
    for (const plan of plans) {
      const monthly = Number(plan.priceMonthly) || 0;
      const yearly = Number(plan.priceYearly) || 0;
      if (monthly <= 0 || yearly <= 0) continue;
      const fullYear = monthly * 12;
      if (yearly >= fullYear) continue;
      best = Math.max(best, Math.round(((fullYear - yearly) / fullYear) * 100));
    }
    return best;
  }, [plans]);

  // ─────────────────────────────── Thao tác ───────────────────────────────

  const handleRecalculateQuota = async () => {
    try {
      setIsSyncing(true);
      await userApi.recalculateQuota();
      // Nạp lại CẢ HAI nguồn: /auth/me cho thẻ trên trang này, /files/analytics cho
      // thanh dung lượng ở Sidebar. Trước đây chỗ này window.location.reload() sau 1
      // giây — nạp lại cả app chỉ để đổi hai con số, và mất mọi trạng thái đang mở.
      await refreshUser();
      await refreshStorageInfo?.();
      toast.success('Đã đồng bộ lại dung lượng');
    } catch (err) {
      toast.error(err.message || 'Lỗi đồng bộ dung lượng');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreatePaymentLink = async () => {
    if (!selectedPlan) return;

    try {
      setIsCreatingLink(true);
      // Chỉ gửi planId + billingCycle. Số tiền do server tra từ storage_plans — gửi kèm
      // `amount` sẽ bị AppValidationPipe (whitelist: true) trả 400.
      const link = await billingApi.createPaymentLink({
        planId: selectedPlan.id,
        billingCycle,
      });

      if (!link?.checkoutUrl) {
        throw new Error('Cổng thanh toán không trả về link thanh toán');
      }

      // Rời hẳn SPA: checkoutUrl thuộc domain payOS. Dùng location.href thay vì
      // navigate() của react-router — đây không phải route nội bộ.
      window.location.href = link.checkoutUrl;
      // CỐ Ý không có finally reset `isCreatingLink`: trang đang trong lúc chuyển đi,
      // bật lại nút chỉ tạo cảm giác bấm được rồi bấm lần hai sinh thêm một giao dịch.
    } catch (err) {
      toast.error(err.message || 'Không tạo được link thanh toán');
      setIsCreatingLink(false);
    }
  };

  const closePaymentModal = () => {
    if (isCreatingLink) return; // đang chờ payOS trả link, đóng giữa dòng là redirect vào mặt
    setSelectedPlan(null);
  };

  const getProgressColor = (percent) => {
    if (percent > 90) return 'bg-rose-500';
    if (percent > 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 custom-scrollbar bg-gray-50/30 dark:bg-white/5">
      <div className="max-w-7xl mx-auto w-full pt-6 sm:pt-10 space-y-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 truncate tracking-tight">Quản lý dung lượng lưu trữ</h1>
            </div>
          </div>

          {/* Section Switcher */}
          <div className="flex bg-white dark:bg-[#282a2c] p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setActiveSection('pricing')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'pricing' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Gói Dịch Vụ
            </button>
            <button
              onClick={() => setActiveSection('history')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'history' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <History className="w-4 h-4" /> Lịch Sử Giao Dịch
            </button>
          </div>
        </div>

        {/* Modern Storage Summary Card */}
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 md:p-10 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8 border border-slate-800 relative overflow-hidden">
          {/* Soft background glows - purely decorative and absolute */}
          <div className="absolute right-0 top-0 translate-x-1/3 -translate-y-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-0 bottom-0 -translate-x-1/3 translate-y-1/3 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex-1 w-full min-w-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 dark:bg-white/5 rounded-lg text-blue-200 text-xs font-bold uppercase tracking-wide border border-white/10 backdrop-blur-md">
                <HardDrive className="w-4 h-4" /> Tổng quan lưu trữ
              </div>
              <button
                onClick={handleRecalculateQuota}
                disabled={isSyncing}
                title="Đồng bộ lại dung lượng"
                className={`p-1.5 rounded-lg bg-white/10 dark:bg-white/5 text-blue-200 hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md cursor-pointer ${isSyncing ? 'animate-spin opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <h2 className="text-4xl md:text-5xl font-black tracking-tight">{formatBytes(usedBytes)}</h2>
              <span className="text-slate-400 text-lg md:text-xl font-medium">/ {formatStorage(limitBytes)} đã dùng</span>
            </div>
          </div>

          <div className="relative z-10 w-full md:w-1/2 shrink-0">
            <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden shadow-inner border border-slate-700/50">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${getProgressColor(usedPercent)}`}
                style={{ width: `${Math.min(100, Math.max(1, usedPercent))}%` }}
              />
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-400">
              <span>Đã dùng {usedPercent}%</span>
              <span>Trống {formatBytes(freeBytes)}</span>
            </div>
          </div>
        </div>

        {/* SECTION 1: PRICING TIERS */}
        {activeSection === 'pricing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Nâng cấp trải nghiệm driveR
              </h2>

              <div className="flex items-center gap-1 bg-white dark:bg-[#282a2c] p-1 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm w-full sm:w-auto">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 sm:py-2 rounded-lg text-[15px] font-bold transition-all cursor-pointer ${
                    billingCycle === 'monthly' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Gói Tháng
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`flex-1 sm:flex-none px-5 py-2.5 sm:py-2 rounded-lg text-[15px] font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    billingCycle === 'yearly' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
                  }`}
                >
                  Gói Năm
                  {yearlyDiscountPercent > 0 && (
                    <span className="px-2 py-0.5 bg-gray-900 dark:bg-blue-600 text-white text-[10px] rounded-md tracking-wide uppercase whitespace-nowrap">
                      -{yearlyDiscountPercent}%
                    </span>
                  )}
                </button>
              </div>
            </div>

            {plansLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400 dark:text-gray-500">
                <Loader2 className="w-7 h-7 animate-spin" />
                <span className="text-[15px] font-semibold">Đang tải bảng giá…</span>
              </div>
            ) : plansError ? (
              <div className="bg-white dark:bg-[#282a2c] border border-rose-100 dark:border-rose-500/30 rounded-2xl p-8 text-center shadow-sm">
                <XCircle className="w-8 h-8 mx-auto mb-3 text-rose-500" />
                <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-1">Không tải được bảng giá</p>
                <p className="text-[14px] text-gray-500 dark:text-gray-400 mb-5">{plansError}</p>
                <button
                  onClick={() => setPlansToken((n) => n + 1)}
                  className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 text-white font-bold text-[14px] transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" /> Thử lại
                </button>
              </div>
            ) : decoratedPlans.length === 0 ? (
              <div className="bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center shadow-sm">
                <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Chưa có gói nào đang được bán</p>
                <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                  Bảng giá trống hoặc mọi gói đã ngừng bán. Vui lòng thử lại sau.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8 items-stretch">
                {decoratedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex flex-col bg-white dark:bg-[#282a2c] rounded-2xl p-6 sm:p-8 border transition-all duration-300 h-full ${
                      plan.isPopular
                        ? 'border-gray-900 dark:border-blue-500 shadow-xl ring-1 ring-gray-900 dark:ring-blue-500 hover:-translate-y-1'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg shadow-sm hover:-translate-y-1'
                    }`}
                  >
                    <div className="mb-8">
                      {plan.isPopular ? (
                        <div className="inline-block px-3 py-1 bg-gray-900 dark:bg-blue-600 text-white text-xs font-bold rounded-lg mb-4 tracking-wide uppercase">Lựa Chọn Phổ Biến</div>
                      ) : (
                        <div className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-lg mb-4 tracking-wide uppercase">
                          {plan.isFree ? 'Cơ bản' : plan.isTop ? 'Khuyên dùng' : 'Tiêu chuẩn'}
                        </div>
                      )}
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 break-words">{plan.name}</h3>

                      <div className="flex flex-col justify-start min-h-[96px]">
                        <div className="flex items-baseline gap-1 mt-2 flex-wrap">
                          <span className="text-4xl lg:text-5xl font-black text-gray-900 dark:text-gray-100 tracking-tight break-words">{formatVnd(plan.price)}</span>
                        </div>
                        <div className="text-[15px] font-medium text-gray-500 dark:text-gray-400 mt-1">
                          / {plan.isFree ? 'vĩnh viễn' : CYCLE_UNIT[billingCycle]}
                        </div>
                      </div>
                    </div>

                    <ul className="space-y-4 mb-8 flex-1">
                      {plan.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-3">
                          <Check className="w-5 h-5 text-gray-900 dark:text-gray-100 shrink-0" />
                          <span className="text-[15px] text-gray-600 dark:text-gray-300 leading-snug break-words">{feat}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => setSelectedPlan(plan)}
                      disabled={plan.isCurrent || plan.isFree}
                      className={`mt-auto w-full py-3 px-4 rounded-xl text-[15px] font-bold transition-all shrink-0 ${
                        plan.isCurrent || plan.isFree
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-transparent'
                          : plan.isPopular
                          ? 'bg-gray-900 dark:bg-blue-600 text-white hover:bg-gray-800 dark:hover:bg-blue-500 shadow-md cursor-pointer'
                          : 'bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm cursor-pointer'
                      }`}
                    >
                      {plan.isCurrent
                        ? 'Đang sử dụng'
                        : plan.isFree
                        ? 'Gói miễn phí'
                        : plan.planBytes > limitBytes
                        ? `Nâng cấp ${plan.storageLabel}`
                        : 'Chuyển sang gói này'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: BILLING HISTORY */}
        {activeSection === 'history' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[14px] text-gray-500 dark:text-gray-400">
                50 giao dịch gần nhất của bạn, mới nhất trước.
              </p>
              <button
                onClick={reloadTransactions}
                disabled={txLoading}
                className="px-4 py-2 rounded-xl bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 font-bold text-[14px] transition-all inline-flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${txLoading ? 'animate-spin' : ''}`} /> Làm mới
              </button>
            </div>

            <div className="bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
              {txLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400 dark:text-gray-500">
                  <Loader2 className="w-7 h-7 animate-spin" />
                  <span className="text-[15px] font-semibold">Đang tải lịch sử giao dịch…</span>
                </div>
              ) : txError ? (
                <div className="py-16 px-8 text-center">
                  <XCircle className="w-8 h-8 mx-auto mb-3 text-rose-500" />
                  <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-1">Không tải được lịch sử giao dịch</p>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 mb-5">{txError}</p>
                  <button
                    onClick={reloadTransactions}
                    className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 text-white font-bold text-[14px] transition-all inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" /> Thử lại
                  </button>
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-16 px-8 text-center">
                  <History className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Chưa có giao dịch nào</p>
                  <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                    Các lần nâng cấp gói của bạn sẽ xuất hiện ở đây.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-700 text-[13px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <th className="py-4 px-6 whitespace-nowrap">Mã giao dịch</th>
                        <th className="py-4 px-6 whitespace-nowrap">Chi tiết gói</th>
                        <th className="py-4 px-6 whitespace-nowrap">Tổng tiền</th>
                        <th className="py-4 px-6 whitespace-nowrap">Phương thức</th>
                        <th className="py-4 px-6 whitespace-nowrap">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-[15px]">
                      {transactions.map((row) => {
                        const status = TX_STATUS[row.status] || {
                          label: row.status,
                          Icon: AlertTriangle,
                          tone: 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
                        };
                        const StatusIcon = status.Icon;

                        return (
                          <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                            <td className="py-4 px-6">
                              <div className="font-mono font-bold text-gray-900 dark:text-gray-100">{row.orderCode}</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                                {row.createdAt ? new Date(row.createdAt).toLocaleString('vi-VN') : '—'}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-semibold text-gray-800 dark:text-gray-200">{row.planName || 'Gói đã bị xoá'}</div>
                              <div className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                                {CYCLE_LABEL[row.billingCycle] || '—'}
                              </div>
                            </td>
                            <td className="py-4 px-6 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{formatVnd(row.amount)}</td>
                            <td className="py-4 px-6">
                              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[13px] font-semibold whitespace-nowrap">
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                                {PAYMENT_METHOD_LABEL[row.paymentMethod] || row.paymentMethod || '—'}
                              </span>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col items-start gap-1.5">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-bold rounded-full border whitespace-nowrap ${status.tone}`}>
                                  <StatusIcon className="w-3.5 h-3.5" /> {status.label}
                                </span>
                                {/* Giao dịch còn dở: mở trang đối soát để hỏi lại payOS. Hiện
                                    chưa có cron đóng các đơn PENDING quá hạn nên đây là cách
                                    duy nhất để người dùng tự chốt một dòng đang treo. */}
                                {PENDING_STATUSES.includes(row.status) && (
                                  <Link
                                    to={`/billing/success?orderCode=${row.orderCode}`}
                                    className="text-[13px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Kiểm tra lại
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAYMENT MODAL — xác nhận rồi chuyển sang trang thanh toán payOS */}
        {selectedPlan && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#282a2c] rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
              <button
                onClick={closePaymentModal}
                disabled={isCreatingLink}
                className="absolute right-5 top-5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/5 p-2 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 mb-4 ring-1 ring-gray-900/5 dark:ring-white/10 shadow-sm">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 tracking-tight">Xác nhận nâng cấp</h3>
                <p className="text-gray-500 dark:text-gray-400 text-[15px]">
                  Gói <span className="font-bold text-gray-900 dark:text-gray-100">{selectedPlan.name}</span> — {selectedPlan.storageLabel},
                  chu kỳ {CYCLE_LABEL[billingCycle]}.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-white/5 divide-y divide-gray-100 dark:divide-gray-700 mb-6">
                <div className="flex items-baseline justify-between gap-4 px-5 py-4">
                  <span className="text-[14px] font-semibold text-gray-500 dark:text-gray-400">Số tiền cần trả</span>
                  <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{formatVnd(selectedPlan.price)}</span>
                </div>
                <div className="flex items-center gap-3 px-5 py-4">
                  <QrCode className="w-8 h-8 text-gray-900 dark:text-gray-100 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-gray-900 dark:text-gray-100">Chuyển khoản / quét VietQR qua payOS</div>
                    <div className="text-[13px] text-gray-500 dark:text-gray-400">
                      Mở được bằng app của mọi ngân hàng Việt Nam. Link thanh toán có hiệu lực 15 phút.
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreatePaymentLink}
                disabled={isCreatingLink}
                className="w-full py-4 rounded-xl bg-gray-900 hover:bg-black dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-bold text-[15px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {isCreatingLink ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Đang tạo link thanh toán…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" /> Tiếp tục tới trang thanh toán
                  </>
                )}
              </button>

              <p className="mt-4 text-[13px] text-center text-gray-400 dark:text-gray-500">
                Bạn sẽ được chuyển sang trang thanh toán của payOS.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

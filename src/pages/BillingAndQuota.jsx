import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  Check,
  ChevronRight,
  CreditCard,
  HardDrive,
  History,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { billingApi, userApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../context/FileContext';
import { formatBytes } from '../utils/formatFileSize';
import TransactionDetailModal from '../components/modals/TransactionDetailModal';
import {
  CYCLES,
  CYCLE_DISCOUNT,
  CYCLE_LABEL,
  CYCLE_MONTHS,
  CYCLE_UNIT,
  PAYMENT_METHOD_LABEL,
  PENDING_STATUSES,
  formatPlanDate,
  formatStorage,
  formatVnd,
  resolvePlanGridCols,
  resolvePlanUi,
  resolveStorageBytes,
  resolveTxStatus,
} from '../constants/billing';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * Trang Gói dịch vụ & Dung lượng (Billing & Quota)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * NGUYÊN TẮC: trang này KHÔNG giữ bảng giá của riêng nó.
 *
 * - Dữ liệu (tên gói, dung lượng, giá) đến từ `GET /billing/plans` → `billingApi.getPlans()`,
 *   trả về `[{ id, name, storageBytes, storageGB, priceMonthly, priceYearly }]` đã sắp xếp
 *   theo `priceMonthly` tăng dần. Bảng giá render bằng cách loop `plans` — DB trả bao nhiêu
 *   gói thì có bấy nhiêu cột, không có mảng gói cứng nào ở đây nữa.
 * - Giao diện (badge, icon, danh sách quyền lợi) nằm ở `PLAN_UI_CONFIG` trong
 *   `constants/billing.js`, ghép vào dữ liệu API theo tên gói, dự phòng theo index.
 *
 * Trước đây trang render một mảng 3 gói hard-code nên khi DB lên 5 gói thì giá 199.000 đ của
 * gói cuối bị lặp lại cho mọi gói phía sau. Mọi con số hiển thị bây giờ đều tính từ dữ liệu API.
 */

export default function BillingAndQuota() {
  const { user, refreshUser } = useAuth();
  const { refreshStorageInfo } = useFiles();

  const [activeSection, setActiveSection] = useState('pricing'); // 'pricing' | 'history'
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | '3_months' | '6_months' | 'yearly'

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(null);

  const [transactions, setTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState(null);

  // Gói đang chạy, từ `GET /billing/subscription`. `null` = chưa từng mua (hạn mức mặc định).
  const [subscription, setSubscription] = useState(null);

  // Báo giá thật của gói đang chọn trong modal xác nhận — gồm cả tiền bù trừ gói cũ.
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Hai bước cho lệnh tắt tự động gia hạn: bấm lần một mở dòng xác nhận ngay trong dải thông
  // tin gói, bấm lần hai mới gọi API. Đây là thao tác dễ bấm nhầm mà đường bật lại phải đi qua
  // thanh toán, nên không cho một cú click là xong.
  const [confirmCancelRenewal, setConfirmCancelRenewal] = useState(false);
  const [isCancellingRenewal, setIsCancellingRenewal] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [plansToken, setPlansToken] = useState(0);

  /**
   * Lịch sử giao dịch được nạp bằng một hàm gọi trực tiếp chứ không qua token + useEffect:
   * `TransactionDetailModal` phải `await` được lần tải lại này rồi mới đóng, nếu không bảng
   * phía sau còn hiện "Đang chờ" trong khoảnh khắc modal vừa biến mất.
   */
  /**
   * Gói đang chạy. Hỏng thì KHÔNG chặn cả trang: bảng giá vẫn dùng được, chỉ là mất dấu
   * "Đang sử dụng" (rơi về so sánh dung lượng như cũ).
   */
  const fetchSubscription = useCallback(async () => {
    try {
      const data = await billingApi.getMySubscription();
      setSubscription(data || null);
    } catch {
      setSubscription(null);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const data = await billingApi.getTransactions();
      setTransactions(Array.isArray(data) ? data : []);
      setTxError(null);
    } catch (err) {
      setTxError(err.message || 'Không tải được lịch sử giao dịch');
    } finally {
      setTxLoading(false);
    }
  }, []);

  // ───────────────────────────── Nạp dữ liệu ─────────────────────────────

  // Bảng giá là dữ liệu API thuần: hỏng thì báo lỗi + cho thử lại, KHÔNG vẽ giá dự phòng
  // ở client — một bảng giá bịa ra trông y như thật là cách nhanh nhất để khách trả sai tiền.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPlansLoading(true);
      try {
        const data = await billingApi.getPlans();
        if (cancelled) return;
        setPlans(Array.isArray(data) ? data : []);
        setPlansError(null);
      } catch (err) {
        if (cancelled) return;
        setPlans([]);
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
    // Bọc trong IIFE async cho khớp effect nạp bảng giá ở trên: gọi thẳng một hàm setState
    // trong thân effect bị `react-hooks/set-state-in-effect` chặn.
    (async () => {
      await fetchTransactions();
    })();
  }, [fetchTransactions]);

  useEffect(() => {
    (async () => {
      await fetchSubscription();
    })();
  }, [fetchSubscription]);

  // ─────────────────────────── Dung lượng hiện tại ───────────────────────────

  const usedBytes = Number(user?.storageInfo?.usedBytes) || 0;
  const limitBytes = Number(user?.storageInfo?.limitBytes) || 0;
  const usedPercent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;
  const freeBytes = Math.max(0, limitBytes - usedBytes);

  // ──────────────────────────── Tính giá hiển thị ────────────────────────────

  /**
   * Số tiền phải trả cho TRỌN chu kỳ `cycle` của `plan`.
   *
   * Bản sao đúng từng dòng của `BillingService.calculateAmountForCycle`. Server mới là nơi
   * chốt số tiền thật khi tạo link payOS (client không gửi `amount` lên), nên hàm này chỉ
   * để hiển thị — nhưng lệch công thức là khách thấy một giá, bị trừ một giá khác.
   */
  const calculateDisplayPrice = useCallback((plan, cycle) => {
    const monthly = Number(plan?.priceMonthly) || 0;
    if (monthly <= 0) return 0;
    if (cycle === 'monthly') return monthly;

    // Giá năm chốt sẵn trong DB được ưu tiên hơn công thức -20%: một gói có thể được
    // niêm yết giá năm riêng, và backend cũng ưu tiên đúng như vậy.
    if (cycle === 'yearly') {
      const yearly = Number(plan?.priceYearly) || 0;
      if (yearly > 0) return yearly;
    }

    const months = CYCLE_MONTHS[cycle];
    const factor = CYCLE_DISCOUNT[cycle];
    // Chu kỳ lạ (DB/backend thêm kỳ mới mà UI chưa biết) → trả giá 1 tháng thay vì NaN.
    if (!months || !factor) return monthly;

    // Làm tròn tới 1.000 đ — payOS nhận `amount` là số nguyên VND và backend làm tròn
    // đúng như vậy; lệch cách làm tròn là khách thấy một giá, bị trừ một giá khác.
    return Math.round((monthly * months * factor) / 1000) * 1000;
  }, []);

  /**
   * Bọc quanh `calculateDisplayPrice` để có thêm phần "tương đương mỗi tháng" và số tiền
   * tiết kiệm. `discountPercent` suy ngược từ hai con số thật, không lấy hằng số -20%: gói
   * đặt `priceYearly` thủ công trong DB có thể giảm nhiều/ít hơn mức mặc định.
   */
  const buildPriceInfo = useCallback(
    (plan, cycle) => {
      const monthly = Number(plan?.priceMonthly) || 0;
      const months = CYCLE_MONTHS[cycle] || 1;
      const totalPrice = calculateDisplayPrice(plan, cycle);
      const rawTotal = monthly * months;

      return {
        totalPrice,
        rawTotal,
        months,
        savings: Math.max(0, rawTotal - totalPrice),
        monthlyEquivalent: Math.round(totalPrice / months),
        discountPercent: rawTotal > 0 ? Math.round(((rawTotal - totalPrice) / rawTotal) * 100) : 0,
      };
    },
    [calculateDisplayPrice],
  );

  // ──────────────── Bảng giá: dữ liệu API + config giao diện ────────────────

  const decoratedPlans = useMemo(() => {
    if (!Array.isArray(plans)) return [];

    return plans.map((plan, index) => {
      const ui = resolvePlanUi(plan, index);
      const planBytes = resolveStorageBytes(plan);
      const storageLabel = formatStorage(planBytes);
      const priceInfo = buildPriceInfo(plan, billingCycle);

      return {
        ...plan,
        ui,
        priceInfo,
        price: priceInfo.totalPrice,
        planBytes,
        storageLabel,
        isFree: Number(plan.priceMonthly) <= 0,
        // Gói đang dùng nhận diện bằng ID của subscription. Chỉ khi chưa có subscription
        // (chưa mua bao giờ, hoặc endpoint lỗi) mới rơi về so dung lượng như cũ — cách so đó
        // đánh dấu nhầm mọi gói trùng dung lượng.
        isCurrent: subscription?.planId
          ? subscription.planId === plan.id
          : limitBytes > 0 && planBytes === limitBytes,
        // Gói đang dùng nhưng ĐÃ hẹn dừng: nút phải MỞ trở lại. Đường duy nhất để bật lại tự
        // động gia hạn là trả tiền mua tiếp chính gói đó (webhook xoá cờ và cộng chu kỳ vào
        // `endDate` cũ nên không mất ngày nào) — khoá nút vì `isCurrent` là khoá luôn đường
        // quay lại, khách chỉ còn cách đợi gói hết hạn rồi mua từ đầu.
        isResumable: Boolean(
          subscription?.planId === plan.id && subscription?.cancelAtPeriodEnd,
        ),
        // Backend chặn hạ cấp bằng 400. Biết trước ở đây để khoá nút kèm lý do, thay vì mời
        // khách bấm một nút chắc chắn hỏng. Toast 400 vẫn giữ làm lưới an toàn cho ca lệch
        // dữ liệu giữa client và server.
        isDowngrade: limitBytes > 0 && planBytes < limitBytes,
        isPopular: Boolean(ui.highlight),
        // Gạch đầu dòng dung lượng sinh từ API, phần còn lại lấy ở PLAN_UI_CONFIG.
        features: [`${storageLabel} lưu trữ Multi-Cloud`, ...ui.features],
      };
    });
  }, [plans, billingCycle, limitBytes, subscription, buildPriceInfo]);

  // ─────────────────────────────── Thao tác ───────────────────────────────

  const handleRecalculateQuota = async () => {
    try {
      setIsSyncing(true);
      await userApi.recalculateQuota();
      await refreshUser();
      await refreshStorageInfo?.();
      toast.success('Đã đồng bộ lại dung lượng');
    } catch (err) {
      toast.error(err.message || 'Lỗi đồng bộ dung lượng');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Tắt tự động gia hạn gói đang chạy.
   *
   * KHÔNG đóng gói ngay: backend chỉ bật `cancel_at_period_end`, dung lượng giữ nguyên tới hết
   * `endDate`. Vì vậy KHÔNG gọi `refreshStorageInfo()` ở đây — hạn mức không đổi, nạp lại chỉ
   * làm dải dung lượng nhảy số vô cớ.
   *
   * Hiển thị NGUYÊN VĂN `message` của backend: câu đó chứa ngày kết thúc đã format theo giờ VN.
   * Tự dựng câu ở client là mở đường cho ca lệch một ngày (client ở múi giờ khác).
   */
  const handleCancelRenewal = async () => {
    try {
      setIsCancellingRenewal(true);
      const result = await billingApi.cancelSubscriptionRenewal();

      // `alreadyCancelled` = lệnh huỷ trước đó đã có hiệu lực (hai tab, hoặc bấm lại sau khi
      // reload). Backend trả 200 nên đây không phải lỗi — nhưng cũng không phải việc vừa làm,
      // nên nói đúng như vậy thay vì chúc mừng lần hai.
      if (result?.alreadyCancelled) {
        toast(result.message || 'Gói cước này đã được hẹn dừng từ trước.', { icon: 'ℹ️' });
      } else {
        toast.success(result?.message || 'Đã tắt tự động gia hạn cho gói hiện tại.', { duration: 6000 });
      }

      // Nạp lại từ server chứ không tự sửa state: dải thông tin và nút trên thẻ gói đều đọc
      // `subscription`, và response có thể mang cả `endDate` vừa bị webhook gia hạn đẩy xa.
      await fetchSubscription();
      setConfirmCancelRenewal(false);
    } catch (err) {
      // 404 (không có gói ACTIVE) và 400 (gói đã qua hạn) đều nghĩa là state ở client đã cũ —
      // nạp lại để dải thông tin biến mất thay vì mời khách bấm tiếp một nút chắc chắn hỏng.
      toast.error(err?.message || 'Không tắt được tự động gia hạn');
      if (err?.status === 404 || err?.status === 400) {
        setConfirmCancelRenewal(false);
        await fetchSubscription();
      }
    } finally {
      setIsCancellingRenewal(false);
    }
  };

  const handleCreatePaymentLink = async () => {
    if (!selectedPlan) return;

    try {
      setIsCreatingLink(true);
      const link = await billingApi.createPaymentLink({
        planId: selectedPlan.id,
        billingCycle,
      });

      if (!link?.checkoutUrl) {
        throw new Error('Cổng thanh toán không trả về link thanh toán');
      }

      window.location.href = link.checkoutUrl;
    } catch (err) {
      // Backend chặn hạ cấp bằng 400 kèm câu tiếng Việt đầy đủ ("Bạn đang sử dụng gói cao
      // hơn…") — hiển thị NGUYÊN VĂN message đó thay vì một câu chung chung, vì đó là thứ
      // duy nhất cho khách biết vì sao nút không ăn. 400 cũng là mã của "gói không có giá
      // cho kỳ này", nên không đoán lý do thay backend.
      const message =
        err?.message ||
        (err?.status === 400
          ? 'Không thể thanh toán gói này với chu kỳ đã chọn'
          : 'Không tạo được link thanh toán');

      toast.error(message, { duration: err?.status === 400 ? 6000 : 4000 });

      // Lỗi 400 là lỗi "vĩnh viễn" với lựa chọn hiện tại: bấm lại cũng vẫn 400. Đóng modal để
      // khách quay ra chọn gói/chu kỳ khác, đồng thời nạp lại gói đang chạy — 400 chống hạ cấp
      // thường có nghĩa là state ở client đã lệch so với server.
      if (err?.status === 400) {
        setSelectedPlan(null);
        await fetchSubscription();
      }
      setIsCreatingLink(false);
    }
  };

  const selectedPriceInfo = useMemo(() => {
    if (!selectedPlan) {
      return { totalPrice: 0, rawTotal: 0, months: 1, savings: 0, monthlyEquivalent: 0, discountPercent: 0 };
    }
    return buildPriceInfo(selectedPlan, billingCycle);
  }, [selectedPlan, billingCycle, buildPriceInfo]);

  /**
   * Báo giá THẬT cho gói đang chọn. Chạy lại khi đổi chu kỳ ngay trong lúc modal đang mở.
   *
   * Toàn bộ setState nằm trong IIFE async — gọi thẳng trong thân effect bị
   * `react-hooks/set-state-in-effect` chặn.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!selectedPlan) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      try {
        const data = await billingApi.getQuote({ planId: selectedPlan.id, billingCycle });
        if (!cancelled) setQuote(data || null);
      } catch {
        // Báo giá hỏng KHÔNG chặn việc mua: modal rơi về giá niêm yết tính ở client và nói rõ
        // rằng số cuối cùng sẽ chốt ở bước thanh toán. Server vẫn là nơi quyết định số tiền.
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlan, billingCycle]);

  // Con số hiển thị trong modal: ưu tiên báo giá của server (đã trừ bù gói cũ), không có thì
  // dùng giá niêm yết tính ở client.
  const listAmount = quote ? quote.listAmount : selectedPriceInfo.totalPrice;
  const payableAmount = quote ? quote.amountToPay : selectedPriceInfo.totalPrice;
  const creditAmount = Number(quote?.creditAmount) || 0;
  const canPurchase = quote ? quote.canPurchase !== false : true;

  const closePaymentModal = () => {
    if (isCreatingLink) return;
    setSelectedPlan(null);
  };

  const getProgressColor = (percent) => {
    if (percent > 90) return 'bg-rose-500';
    if (percent > 70) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 custom-scrollbar bg-gray-50/30 dark:bg-white/5">
      <div className="max-w-[1440px] mx-auto w-full pt-6 sm:pt-10 space-y-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0 flex flex-col justify-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-gray-100 truncate tracking-tight">
                Quản lý dung lượng & Gói cước
              </h1>
            </div>
          </div>

          {/* Section Switcher */}
          <div className="flex bg-white dark:bg-[#282a2c] p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setActiveSection('pricing')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'pricing'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-4 h-4" /> Bảng Giá Gói Cước
            </button>
            <button
              onClick={() => setActiveSection('history')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 sm:py-2 text-[15px] font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeSection === 'history'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-gray-900/5 dark:ring-white/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
            >
              <History className="w-4 h-4" /> Lịch Sử Giao Dịch
            </button>
          </div>
        </div>

        {/* Storage Summary Card */}
        <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 md:p-10 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-8 border border-slate-800 relative overflow-hidden">
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
                className={`p-1.5 rounded-lg bg-white/10 dark:bg-white/5 text-blue-200 hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md cursor-pointer ${
                  isSyncing ? 'animate-spin opacity-50 cursor-not-allowed' : ''
                }`}
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

        {/* Dải thông tin gói đang chạy + tắt tự động gia hạn.
            Chỉ hiện khi CÓ subscription: khách chưa mua gói thì không có gì để gia hạn, và
            `fetchSubscription` cũng đặt `null` khi endpoint lỗi — thà không hiện còn hơn hiện
            một trạng thái gia hạn bịa ra. */}
        {subscription && (
          <div
            className={`rounded-2xl border p-5 sm:p-6 shadow-sm flex flex-col gap-4 ${
              subscription.cancelAtPeriodEnd
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30'
                : 'bg-white dark:bg-[#282a2c] border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    subscription.cancelAtPeriodEnd
                      ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {subscription.cancelAtPeriodEnd ? (
                    <CalendarX className="w-5 h-5" />
                  ) : (
                    <CalendarClock className="w-5 h-5" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-gray-900 dark:text-gray-100">
                    {subscription.planName || 'Gói đang sử dụng'}
                    {subscription.billingCycle && (
                      <span className="ml-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400">
                        {/* CYCLE_UNIT, không phải CYCLE_LABEL: nhãn kia mang sẵn phần
                            chiết khấu ("3 tháng (-5%)") — đúng cho thanh chọn chu kỳ lúc mua,
                            nhưng ở đây là gói ĐÃ mua nên một con số giảm giá không còn nghĩa. */}
                        · chu kỳ {CYCLE_UNIT[subscription.billingCycle] || subscription.billingCycle}
                      </span>
                    )}
                  </p>

                  {/* Cùng một `endDate`, hai câu khác nhau: "gia hạn tiếp theo" và "kết thúc"
                      là hai điều hoàn toàn khác với khách, nên không dùng chung một câu chung
                      chung kiểu "hiệu lực đến". */}
                  <p className="text-[14px] text-gray-600 dark:text-gray-400 mt-0.5">
                    {subscription.cancelAtPeriodEnd
                      ? `Sẽ không tự động gia hạn. Gói kết thúc vào ngày ${formatPlanDate(subscription.endDate)}`
                      : `Tự động gia hạn vào ngày ${formatPlanDate(subscription.endDate)}`}
                    {subscription.remainingDays > 0 && (
                      <span className="text-gray-400 dark:text-gray-500"> (còn {subscription.remainingDays} ngày)</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Đã hẹn dừng thì KHÔNG có nút "bật lại" ở đây: bật lại phải đi qua thanh toán
                  (mua tiếp chính gói đó), nên đường đó nằm ở nút trên thẻ gói — một nút ở đây
                  sẽ hứa một thao tác một-click không tồn tại. */}
              {!subscription.cancelAtPeriodEnd && !confirmCancelRenewal && (
                <button
                  onClick={() => setConfirmCancelRenewal(true)}
                  className="shrink-0 self-start sm:self-auto px-4 py-2.5 rounded-xl text-[14px] font-bold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-500/40 transition-all cursor-pointer"
                >
                  Hủy tự động gia hạn
                </button>
              )}

              {subscription.cancelAtPeriodEnd && (
                <p className="shrink-0 text-[13px] font-semibold text-amber-700 dark:text-amber-400 sm:text-right max-w-xs">
                  Muốn dùng tiếp? Mua lại chính gói này — số ngày còn lại được cộng dồn, không
                  mất ngày nào.
                </p>
              )}
            </div>

            {/* Bước xác nhận, mở ngay tại chỗ thay vì một modal riêng. Nói rõ HAI điều khách
                hay hiểu sai: gói KHÔNG bị cắt ngay, và đường bật lại đi qua thanh toán. */}
            {confirmCancelRenewal && !subscription.cancelAtPeriodEnd && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-[14px] text-gray-600 dark:text-gray-400 flex items-start gap-2 min-w-0">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    Bạn vẫn dùng đủ dung lượng đến hết ngày{' '}
                    <strong className="text-gray-900 dark:text-gray-100">{formatPlanDate(subscription.endDate)}</strong>.
                    Sau đó hạn mức trở về mức mặc định. Để dùng tiếp, bạn cần mua lại gói.
                  </span>
                </p>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setConfirmCancelRenewal(false)}
                    disabled={isCancellingRenewal}
                    className="px-4 py-2.5 rounded-xl text-[14px] font-bold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Giữ lại
                  </button>
                  <button
                    onClick={handleCancelRenewal}
                    disabled={isCancellingRenewal}
                    className="px-4 py-2.5 rounded-xl text-[14px] font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCancellingRenewal ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang hủy…
                      </>
                    ) : (
                      'Xác nhận hủy gia hạn'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 1: PRICING TIERS */}
        {activeSection === 'pricing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* Tiêu đề & Thanh chọn chu kỳ thanh toán */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                  Chọn gói lưu trữ phù hợp với bạn
                </h2>
                <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                  Đăng ký chu kỳ dài hạn để nhận ưu đãi giảm giá lên tới 17%.
                </p>
              </div>

              {/* Billing Cycle Selector Tabs */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#282a2c] p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm w-full lg:w-auto overflow-x-auto">
                {CYCLES.map((cycle) => {
                  const isSelected = billingCycle === cycle.id;
                  return (
                    <button
                      key={cycle.id}
                      onClick={() => setBillingCycle(cycle.id)}
                      className={`px-4 py-2.5 rounded-xl text-[14px] font-bold transition-all whitespace-nowrap cursor-pointer flex items-center justify-center gap-2 ${
                        isSelected
                          ? 'bg-gray-900 text-white dark:bg-blue-600 shadow-md'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/5'
                      }`}
                    >
                      <span>{cycle.label}</span>
                      {cycle.badge && (
                        <span
                          className={`px-1.5 py-0.5 text-[11px] rounded-md font-extrabold ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {cycle.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
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
              <div className="bg-white dark:bg-[#282a2c] border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center shadow-sm">
                <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Chưa có gói cước nào đang mở bán</p>
                <p className="text-[14px] text-gray-500 dark:text-gray-400 mt-1">
                  Vui lòng quay lại sau hoặc liên hệ quản trị viên.
                </p>
              </div>
            ) : (
              /* Grid thẻ gói giá — render thẳng từ dữ liệu API, mỗi dòng căn đều nhau */
              <div
                className={`grid grid-cols-1 ${resolvePlanGridCols(decoratedPlans.length)} gap-4 lg:gap-5 w-full items-stretch`}
              >
                {decoratedPlans.map((plan) => {
                  const PlanIcon = plan.ui.Icon;
                  const badge = plan.ui.badge;
                  const BadgeIcon = badge?.Icon;

                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col bg-white dark:bg-[#282a2c] rounded-3xl p-5 sm:p-6 border transition-all duration-300 h-full relative ${
                        plan.isPopular
                          ? 'border-blue-600 dark:border-blue-500 shadow-xl ring-2 ring-blue-600/20 dark:ring-blue-500/30 hover:-translate-y-1'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg shadow-sm hover:-translate-y-1'
                      }`}
                    >
                      {/* 1. Huy hiệu phân cấp (PLAN_UI_CONFIG) - h-8 giữ chỗ kể cả khi gói
                          không có huy hiệu, để các thẻ cùng hàng không xô lệch */}
                      <div className="h-8 mb-3 flex items-center">
                        {badge && (
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-extrabold rounded-lg tracking-wider uppercase ${badge.tone}`}
                          >
                            {BadgeIcon && <BadgeIcon className="w-3.5 h-3.5 fill-current" />}
                            {badge.label}
                          </span>
                        )}
                      </div>

                      {/* 2. Tên gói (API) + icon (PLAN_UI_CONFIG) - Cố định h-14 để căn đều dù 1 hay 2 dòng */}
                      <div className="h-14 flex items-center gap-2.5 mb-3">
                        {PlanIcon && <PlanIcon className={`w-5 h-5 shrink-0 ${plan.ui.iconTone}`} />}
                        <h3 className="text-lg lg:text-[19px] font-black text-gray-900 dark:text-gray-100 leading-tight">
                          {plan.name}
                        </h3>
                      </div>

                      {/* 3. Khối giá tiền tính động theo chu kỳ - Cố định h-24 để đường kẻ ngang thẳng hàng */}
                      <div className="h-24 flex flex-col justify-start mb-5">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl lg:text-[26px] xl:text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight whitespace-nowrap">
                            {formatVnd(calculateDisplayPrice(plan, billingCycle))}
                          </span>
                        </div>
                        <div className="text-[13px] font-medium text-gray-500 dark:text-gray-400 mt-1">
                          / {plan.isFree ? 'vĩnh viễn' : CYCLE_UNIT[billingCycle]}
                        </div>

                        {/* Chi tiết tương đương & tiết kiệm */}
                        {!plan.isFree && billingCycle !== 'monthly' ? (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400">
                              ~{formatVnd(plan.priceInfo.monthlyEquivalent)}/tháng
                            </span>
                            {plan.priceInfo.savings > 0 && (
                              <span className="inline-flex items-center text-[10.5px] font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                                Tiết kiệm {formatVnd(plan.priceInfo.savings)}
                              </span>
                            )}
                          </div>
                        ) : (
                          /* Placeholder giữ đúng độ cao để các thẻ không bị xô lệch */
                          <div className="mt-2 h-5 invisible select-none pointer-events-none" aria-hidden="true">
                            Spacer
                          </div>
                        )}
                      </div>

                      {/* 4. Danh sách tính năng - Mỗi dòng cố định min-h-[42px] để các gạch đầu dòng thẳng hàng */}
                      <div className="border-t border-gray-100 dark:border-gray-800 pt-5 mb-6 flex-1 flex flex-col justify-start">
                        <ul className="space-y-2.5">
                          {plan.features.map((feat) => (
                            <li key={feat} className="min-h-[42px] flex items-start gap-2.5">
                              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                              <span className="text-[13.5px] text-gray-600 dark:text-gray-300 leading-snug break-words">
                                {feat}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* 5. Nút hành động - Cố định chiều cao h-12 ghim sát đáy */}
                      {/* `isResumable` (gói đang dùng nhưng đã hẹn dừng) là NGOẠI LỆ DUY NHẤT
                          của luật "gói đang dùng thì khoá nút": bật lại tự động gia hạn chỉ
                          làm được bằng cách mua tiếp chính gói đó, nên khoá ở đây là bít luôn
                          đường quay lại. Vẫn nhường cho `isFree`/`isDowngrade` — hai ca đó
                          khoá vì backend sẽ trả 400. */}
                      <button
                        onClick={() => setSelectedPlan(plan)}
                        disabled={(plan.isCurrent && !plan.isResumable) || plan.isFree || plan.isDowngrade}
                        title={
                          plan.isDowngrade
                            ? 'Không thể hạ cấp khi gói hiện tại còn hiệu lực — dữ liệu đang lưu trữ có thể vượt hạn mức gói nhỏ hơn.'
                            : plan.isResumable
                            ? 'Thanh toán để bật lại tự động gia hạn. Số ngày còn lại của gói hiện tại được cộng dồn, không mất ngày nào.'
                            : undefined
                        }
                        className={`mt-auto w-full h-12 rounded-2xl text-[14px] font-bold transition-all shrink-0 flex items-center justify-center gap-2 ${
                          (plan.isCurrent && !plan.isResumable) || plan.isFree || plan.isDowngrade
                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-transparent'
                            : plan.isResumable
                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md hover:shadow-lg cursor-pointer'
                            : plan.isPopular
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg cursor-pointer'
                            : 'bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm cursor-pointer'
                        }`}
                      >
                        {plan.isResumable ? (
                          <>
                            <RotateCcw className="w-4 h-4" /> Bật lại gia hạn
                          </>
                        ) : plan.isCurrent ? (
                          'Đang sử dụng'
                        ) : plan.isFree ? (
                          'Gói miễn phí'
                        ) : plan.isDowngrade ? (
                          'Không thể hạ cấp'
                        ) : plan.planBytes > limitBytes ? (
                          `Nâng cấp ${plan.storageLabel}`
                        ) : (
                          'Chọn gói này'
                        )}
                      </button>
                    </div>
                  );
                })}
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
                onClick={fetchTransactions}
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
                    onClick={fetchTransactions}
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
                        <th className="py-4 px-6 w-px" aria-label="Chi tiết" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-[15px]">
                      {transactions.map((row) => {
                        const status = resolveTxStatus(row.status);
                        const StatusIcon = status.Icon;

                        return (
                          <tr
                            key={row.id}
                            onClick={() => setSelectedTransaction(row)}
                            // Bàn phím cũng phải mở được chi tiết: <tr> không tự nhận focus
                            // nên role/tabIndex phải khai báo thủ công.
                            role="button"
                            tabIndex={0}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedTransaction(row);
                              }
                            }}
                            aria-label={`Xem chi tiết giao dịch ${row.orderCode}`}
                            className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                          >
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
                                {PENDING_STATUSES.includes(row.status) && (
                                  <Link
                                    to={`/billing/success?orderCode=${row.orderCode}`}
                                    // Không có stopPropagation thì một cú bấm vừa điều hướng
                                    // sang trang đối soát vừa bật modal chi tiết.
                                    onClick={(event) => event.stopPropagation()}
                                    className="text-[13px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Kiểm tra lại
                                  </Link>
                                )}
                              </div>
                            </td>
                            <td className="py-4 pr-6 text-right">
                              <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors inline-block" />
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

        {/* MODAL CHI TIẾT GIAO DỊCH — bấm vào một dòng lịch sử để mở */}
        <TransactionDetailModal
          // `key` theo id: mở một giao dịch khác thì modal remount, nên bước xác nhận huỷ
          // của giao dịch trước không dính sang giao dịch sau.
          key={selectedTransaction?.id}
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          onCancelled={fetchTransactions}
        />

        {/* PAYMENT MODAL — xác nhận rồi chuyển sang trang thanh toán payOS */}
        {selectedPlan && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-[#282a2c] rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-700">
              <button
                onClick={closePaymentModal}
                disabled={isCreatingLink}
                className="absolute right-5 top-5 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/5 p-2 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 mb-4 ring-1 ring-blue-500/20 shadow-sm">
                  <CreditCard className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
                  {quote?.isRenewal ? 'Xác nhận gia hạn' : 'Xác nhận nâng cấp'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-[14px]">
                  Gói <span className="font-bold text-gray-900 dark:text-gray-100">{selectedPlan.name}</span> — {selectedPlan.storageLabel},
                  chu kỳ <span className="font-semibold text-gray-800 dark:text-gray-200">{CYCLE_LABEL[billingCycle]}</span>.
                  {quote?.isRenewal && ' Chu kỳ mới được cộng tiếp vào ngày hết hạn hiện tại.'}
                </p>

                {/* `resumesAutoRenew` = khách đang hẹn dừng CHÍNH gói này, nên lần thanh toán
                    này rút lại lệnh huỷ (backend xoá `cancel_at_period_end` khi settle). Phải
                    nói trước ở đây: im lặng thì khách vừa bấm huỷ gia hạn xong lại thấy nó bật
                    lại và không hiểu vì đâu. */}
                {quote?.resumesAutoRenew && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
                    <RotateCcw className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-[13.5px] text-amber-800 dark:text-amber-200 leading-snug">
                      Bạn đang hẹn dừng gói này. Thanh toán thành công sẽ <strong>bật lại tự động gia hạn</strong>
                      {' '}và cộng chu kỳ mới vào ngày hết hạn hiện tại.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-white/5 divide-y divide-gray-100 dark:divide-gray-700 mb-6">
                <div className="flex flex-col gap-1 px-5 py-4">
                  {/* Giá niêm yết chỉ tách thành dòng riêng khi CÓ bù trừ — không thì hai
                      dòng cùng một con số trông như lỗi hiển thị. */}
                  {creditAmount > 0 && (
                    <>
                      <div className="flex items-baseline justify-between gap-4 text-[14px]">
                        <span className="font-semibold text-gray-500 dark:text-gray-400">Giá gói {CYCLE_LABEL[billingCycle]}</span>
                        <span className="font-bold text-gray-700 dark:text-gray-300">{formatVnd(listAmount)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 text-[14px] text-emerald-600 dark:text-emerald-400">
                        <span className="font-semibold min-w-0">
                          Bù trừ {quote?.previousPlanName ? `gói ${quote.previousPlanName}` : 'gói cũ'}
                          {quote?.creditedDays ? ` (còn ${quote.creditedDays} ngày)` : ''}
                        </span>
                        <span className="font-bold whitespace-nowrap">− {formatVnd(creditAmount)}</span>
                      </div>
                    </>
                  )}

                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] font-semibold text-gray-500 dark:text-gray-400">Số tiền thanh toán</span>
                    <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
                      {quoteLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
                      ) : (
                        formatVnd(payableAmount)
                      )}
                    </span>
                  </div>

                  {selectedPriceInfo.savings > 0 && (
                    <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                      <span>Đã áp dụng giảm {selectedPriceInfo.discountPercent}%</span>
                      <span>Tiết kiệm {formatVnd(selectedPriceInfo.savings)}</span>
                    </div>
                  )}

                  {quote?.flooredToMinimum && (
                    <p className="text-[12.5px] text-amber-600 dark:text-amber-400 font-semibold pt-1 leading-snug">
                      Phần chưa dùng của gói cũ lớn hơn giá gói mới nên hoá đơn được thu ở mức tối thiểu{' '}
                      {formatVnd(quote.minimumAmount)} của cổng thanh toán.
                    </p>
                  )}

                  {!quoteLoading && !quote && (
                    <p className="text-[12.5px] text-gray-500 dark:text-gray-400 pt-1 leading-snug">
                      Chưa lấy được báo giá chi tiết. Đây là giá niêm yết — số tiền cuối cùng sẽ hiển thị ở
                      trang thanh toán.
                    </p>
                  )}
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

              {!canPurchase && quote?.blockedReason && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-4">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[13.5px] text-rose-800 dark:text-rose-200 leading-snug">{quote.blockedReason}</p>
                </div>
              )}

              <button
                onClick={handleCreatePaymentLink}
                // Khoá luôn trong lúc chờ báo giá: bấm sớm là tạo hoá đơn cho một con số mà
                // khách chưa kịp nhìn thấy.
                disabled={isCreatingLink || quoteLoading || !canPurchase}
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
                Bạn sẽ được chuyển sang trang thanh toán bảo mật của payOS.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  Zap,
} from 'lucide-react';
import { billingApi, userApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../context/FileContext';
import { formatBytes } from '../utils/formatFileSize';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Trang Gói dịch vụ & Dung lượng (Billing & Quota)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 5 gói lưu trữ chuẩn hoá theo yêu cầu:
 * 1. Gói Miễn Phí (Free) - 15 GB (0 đ)
 * 2. Gói Cơ Bản (Lite) - 20 GB (40.000 đ/tháng)
 * 3. Gói Cá Nhân (Pro) - 50 GB (90.000 đ/tháng)
 * 4. Gói Cao Cấp (Storage Plus) - 300 GB (390.000 đ/tháng)
 * 5. Gói Tối Thượng (Ultra) - 1 TB (990.000 đ/tháng)
 *
 * 4 chu kỳ thanh toán với chiết khấu giảm giá theo bundle:
 * - 1 Tháng: Giá gốc
 * - 3 Tháng: Giảm 5%
 * - 6 Tháng: Giảm 15%
 * - 1 Năm (12 Tháng): Giảm 20%
 */

/** VND nguyên, không phần thập phân: `price_monthly` / `price_yearly` là numeric(12,0). */
const formatVnd = (amount) => `${new Intl.NumberFormat('vi-VN').format(Number(amount) || 0)} đ`;

/**
 * Nhãn dung lượng cho bảng giá.
 */
const formatStorage = (bytes) => {
  const num = Number(bytes) || 0;
  const inTB = num / 1024 ** 4;
  if (inTB >= 1) return `${Number(inTB.toFixed(2))} TB`;
  return `${Number((num / 1024 ** 3).toFixed(2))} GB`;
};

/** Các chu kỳ thanh toán hỗ trợ */
const CYCLES = [
  { id: 'monthly', label: '1 Tháng', months: 1, discount: 0, badge: null },
  { id: '3_months', label: '3 Tháng', months: 3, discount: 0.05, badge: '-5%' },
  { id: '6_months', label: '6 Tháng', months: 6, discount: 0.15, badge: '-15%' },
  { id: 'yearly', label: '1 Năm', months: 12, discount: 0.20, badge: '-20% 🔥' },
];

const CYCLE_UNIT = {
  monthly: 'tháng',
  '3_months': '3 tháng',
  '6_months': '6 tháng',
  yearly: 'năm',
};

const CYCLE_LABEL = {
  monthly: '1 tháng',
  '3_months': '3 tháng (-5%)',
  '6_months': '6 tháng (-15%)',
  yearly: '1 năm (-20%)',
};

/**
 * Danh sách 5 gói lưu trữ chuẩn (Lite 20GB, Pro 50GB, Plus 300GB, Ultra 1TB)
 * Giá gốc 1 tháng dao động từ 40k đến 990k
 */
const STANDARD_PLANS = [
  {
    id: 'plan-free',
    name: 'Gói Miễn Phí (Free)',
    storageBytes: 16106127360, // 15 GB
    priceMonthly: 0,
    priceYearly: 0,
    tierKey: 'free',
  },
  {
    id: 'plan-lite',
    name: 'Gói Cơ Bản (Lite)',
    storageBytes: 21474836480, // 20 GB
    priceMonthly: 40000,
    priceYearly: 384000,
    tierKey: 'lite',
  },
  {
    id: 'plan-pro',
    name: 'Gói Cá Nhân (Pro)',
    storageBytes: 53687091200, // 50 GB
    priceMonthly: 90000,
    priceYearly: 864000,
    tierKey: 'pro',
  },
  {
    id: 'plan-plus',
    name: 'Gói Cao Cấp (Storage Plus)',
    storageBytes: 322122547200, // 300 GB
    priceMonthly: 390000,
    priceYearly: 3744000,
    tierKey: 'plus',
  },
  {
    id: 'plan-ultra',
    name: 'Gói Tối Thượng (Ultra)',
    storageBytes: 1099511627776, // 1 TB
    priceMonthly: 990000,
    priceYearly: 9504000,
    tierKey: 'ultra',
  },
];

/**
 * Gạch đầu dòng quyền lợi theo từng phân khúc gói (chuẩn hoá đúng 4 mục mỗi gói)
 */
const PERKS_BY_TIER = {
  free: [
    'Xem & chia sẻ tệp trực tuyến',
    'Tải lên tối đa 1 GB / tệp',
    'Đồng bộ tệp tin đa nền tảng',
    'Tốc độ tải xuống tiêu chuẩn',
  ],
  lite: [
    '20 GB lưu trữ Multi-Cloud',
    'Tải lên tối đa 5 GB / tệp',
    'Tốc độ truyền tải nhanh',
    'Đồng bộ tức thì đa thiết bị',
  ],
  pro: [
    '50 GB lưu trữ Multi-Cloud',
    'Tải lên tối đa 15 GB / tệp',
    'Bảo vệ liên kết bằng mật khẩu',
    'Khôi phục tệp trong 30 ngày',
  ],
  plus: [
    '300 GB lưu trữ lớn',
    'Tải lên tối đa 50 GB / tệp',
    'Bộ nhớ dùng chung nhóm',
    'Khôi phục tệp trong 60 ngày',
  ],
  ultra: [
    '1.024 GB (1 TB) Multi-Cloud',
    'Không giới hạn cỡ tệp tải lên',
    'Mã hoá nâng cao E2EE',
    'Khôi phục tệp trong 90 ngày',
  ],
};

/**
 * Bảy trạng thái giao dịch bám nguyên PaymentLinkStatus của payOS
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

const PENDING_STATUSES = ['PENDING', 'PROCESSING'];
const PAYMENT_METHOD_LABEL = { PAYOS: 'payOS (VietQR)' };

/**
 * Tính toán tài chính chi tiết cho một gói theo chu kỳ thanh toán
 */
const calculatePriceInfo = (plan, cycleId) => {
  const monthly = Number(plan.priceMonthly) || 0;
  if (monthly <= 0) {
    return {
      totalPrice: 0,
      rawTotal: 0,
      savings: 0,
      monthlyEquivalent: 0,
      discountPercent: 0,
    };
  }

  const cycle = CYCLES.find((c) => c.id === cycleId) || CYCLES[0];
  const rawTotal = monthly * cycle.months;
  let totalPrice = rawTotal;

  if (cycle.id === 'yearly') {
    totalPrice = plan.priceYearly && Number(plan.priceYearly) > 0
      ? Number(plan.priceYearly)
      : Math.round((rawTotal * (1 - cycle.discount)) / 1000) * 1000;
  } else if (cycle.discount > 0) {
    totalPrice = Math.round((rawTotal * (1 - cycle.discount)) / 1000) * 1000;
  }

  const savings = Math.max(0, rawTotal - totalPrice);
  const monthlyEquivalent = Math.round(totalPrice / cycle.months);

  return {
    totalPrice,
    rawTotal,
    savings,
    monthlyEquivalent,
    discountPercent: Math.round(cycle.discount * 100),
  };
};

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

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [plansToken, setPlansToken] = useState(0);
  const [txToken, setTxToken] = useState(0);
  const reloadTransactions = useCallback(() => setTxToken((n) => n + 1), []);

  // ───────────────────────────── Nạp dữ liệu ─────────────────────────────

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
        setPlans([]);
        setPlansError(null);
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

  const usedBytes = Number(user?.storageInfo?.usedBytes) || 0;
  const limitBytes = Number(user?.storageInfo?.limitBytes) || 0;
  const usedPercent = limitBytes > 0 ? Math.min(100, Math.round((usedBytes / limitBytes) * 100)) : 0;
  const freeBytes = Math.max(0, limitBytes - usedBytes);

  // ──────────────────────── Bảng giá 5 gói dàn đều ────────────────────────

  const decoratedPlans = useMemo(() => {
    return STANDARD_PLANS.map((std) => {
      const dbMatch = Array.isArray(plans)
        ? plans.find((p) => {
            const name = (p.name || '').toLowerCase();
            if (std.tierKey === 'free' && (Number(p.priceMonthly) === 0 || name.includes('free') || name.includes('miễn phí'))) return true;
            if (std.tierKey === 'lite' && (name.includes('lite') || name.includes('tiêu chuẩn') || name.includes('starter') || Number(p.storageBytes) === 21474836480)) return true;
            if (std.tierKey === 'pro' && (name.includes('pro') || name.includes('cá nhân') || Number(p.storageBytes) === 53687091200)) return true;
            if (std.tierKey === 'plus' && (name.includes('plus') || name.includes('cao cấp') || name.includes('premium') || Number(p.storageBytes) === 322122547200)) return true;
            if (std.tierKey === 'ultra' && (name.includes('ultra') || name.includes('tối thượng') || name.includes('enterprise') || Number(p.storageBytes) >= 1099511627776)) return true;
            return false;
          })
        : null;

      const basePlan = dbMatch ? { ...std, ...dbMatch, name: std.name } : std;
      const planBytes = Number(basePlan.storageBytes) || 0;
      const isFree = std.tierKey === 'free' || Number(basePlan.priceMonthly) <= 0;
      const priceInfo = calculatePriceInfo(basePlan, billingCycle);

      return {
        ...basePlan,
        price: priceInfo.totalPrice,
        priceInfo,
        planBytes,
        storageLabel: formatStorage(planBytes),
        isCurrent: limitBytes > 0 && planBytes === limitBytes,
        isFree,
        isPopular: std.tierKey === 'pro',
        tierKey: std.tierKey,
        features: PERKS_BY_TIER[std.tierKey] || PERKS_BY_TIER.free,
      };
    });
  }, [plans, billingCycle, limitBytes]);

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
      toast.error(err.message || 'Không tạo được link thanh toán');
      setIsCreatingLink(false);
    }
  };

  const selectedPriceInfo = useMemo(() => {
    if (!selectedPlan) return { totalPrice: 0, savings: 0, rawTotal: 0, discountPercent: 0 };
    return calculatePriceInfo(selectedPlan, billingCycle);
  }, [selectedPlan, billingCycle]);

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
                  Đăng ký chu kỳ dài hạn để nhận ưu đãi giảm giá lên tới 20%.
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
            ) : (
              /* Grid 5 Thẻ Gói Giá: Căn Chỉnh Đều Từng Dòng, Dàn Đều Không Lệch */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-5 w-full items-stretch">
                {decoratedPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`flex flex-col bg-white dark:bg-[#282a2c] rounded-3xl p-5 sm:p-6 border transition-all duration-300 h-full relative ${
                      plan.isPopular
                        ? 'border-blue-600 dark:border-blue-500 shadow-xl ring-2 ring-blue-600/20 dark:ring-blue-500/30 hover:-translate-y-1'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-lg shadow-sm hover:-translate-y-1'
                    }`}
                  >
                    {/* 1. Huy hiệu phân cấp - Cố định chiều cao h-8 */}
                    <div className="h-8 mb-3 flex items-center">
                      {plan.tierKey === 'pro' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white text-[11px] font-extrabold rounded-lg tracking-wider uppercase shadow-sm">
                          <Zap className="w-3.5 h-3.5 fill-current" /> Phổ Biến Nhất
                        </span>
                      ) : plan.tierKey === 'ultra' ? (
                        <span className="inline-flex items-center px-3 py-1 bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-[11px] font-extrabold rounded-lg tracking-wider uppercase">
                          Tối Thượng
                        </span>
                      ) : plan.tierKey === 'plus' ? (
                        <span className="inline-flex items-center px-3 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-extrabold rounded-lg tracking-wider uppercase">
                          Khuyên Dùng
                        </span>
                      ) : plan.tierKey === 'lite' ? (
                        <span className="inline-flex items-center px-3 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold rounded-lg tracking-wider uppercase">
                          Tiết Kiệm
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-extrabold rounded-lg tracking-wider uppercase">
                          Cơ Bản
                        </span>
                      )}
                    </div>

                    {/* 2. Tiêu đề tên gói - Cố định h-14 để căn đều hoàn hảo dù 1 hay 2 dòng */}
                    <div className="h-14 flex items-center mb-3">
                      <h3 className="text-lg lg:text-[19px] font-black text-gray-900 dark:text-gray-100 leading-tight">
                        {plan.name}
                      </h3>
                    </div>

                    {/* 3. Khối giá tiền - Cố định h-24 để đường kẻ ngang luôn thẳng hàng nhau */}
                    <div className="h-24 flex flex-col justify-start mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl lg:text-[26px] xl:text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight whitespace-nowrap">
                          {formatVnd(plan.price)}
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

                    {/* 4. Danh sách tính năng - Mỗi dòng cố định min-h-[42px] để các gạch đầu dòng đối xứng thẳng hàng */}
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
                    <button
                      onClick={() => setSelectedPlan(plan)}
                      disabled={plan.isCurrent || plan.isFree}
                      className={`mt-auto w-full h-12 rounded-2xl text-[14px] font-bold transition-all shrink-0 flex items-center justify-center ${
                        plan.isCurrent || plan.isFree
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-transparent'
                          : plan.isPopular
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg cursor-pointer'
                          : 'bg-white dark:bg-[#282a2c] text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm cursor-pointer'
                      }`}
                    >
                      {plan.isCurrent
                        ? 'Đang sử dụng'
                        : plan.isFree
                        ? 'Gói miễn phí'
                        : plan.planBytes > limitBytes
                        ? `Nâng cấp ${plan.storageLabel}`
                        : 'Chọn gói này'}
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
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100 mb-2 tracking-tight">Xác nhận nâng cấp</h3>
                <p className="text-gray-500 dark:text-gray-400 text-[14px]">
                  Gói <span className="font-bold text-gray-900 dark:text-gray-100">{selectedPlan.name}</span> — {selectedPlan.storageLabel},
                  chu kỳ <span className="font-semibold text-gray-800 dark:text-gray-200">{CYCLE_LABEL[billingCycle]}</span>.
                </p>
              </div>

              <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-white/5 divide-y divide-gray-100 dark:divide-gray-700 mb-6">
                <div className="flex flex-col gap-1 px-5 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[14px] font-semibold text-gray-500 dark:text-gray-400">Số tiền thanh toán</span>
                    <span className="text-2xl font-black text-gray-900 dark:text-gray-100">{formatVnd(selectedPriceInfo.totalPrice)}</span>
                  </div>
                  {selectedPriceInfo.savings > 0 && (
                    <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                      <span>Đã áp dụng giảm {selectedPriceInfo.discountPercent}%</span>
                      <span>Tiết kiệm {formatVnd(selectedPriceInfo.savings)}</span>
                    </div>
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
                Bạn sẽ được chuyển sang trang thanh toán bảo mật của payOS.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { billingApi } from '../services/api';
import { aiStatusCache } from '../utils/ttlCache';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { displayPlanName } from '../utils/planName';
import { localeTagOf } from '../utils/locale';
import tRich from '../utils/tRich';
// Dùng chung với trang Gói cước thay vì giữ bản copy cục bộ: bản copy cũ ghi mức
// giảm của chu kỳ năm là -20%, còn giá thật trong DB (và constants/billing.js) là -17%.
import { CYCLE_LABEL_KEY, formatVnd } from '../constants/billing';

/**
 * returnUrl mà backend gửi cho payOS (config/configuration.ts → payos.returnUrl):
 *   ${FRONTEND_URL}/billing/success?orderCode=<orderCode>
 *
 * Route nằm NGOÀI /app (không có MainLayout): payOS mở nó như một trang đích độc lập.
 * Các provider (Auth/File/Toaster) đều ở cấp App.jsx nên vẫn dùng được.
 *
 * TRANG NÀY KHÔNG PHẢI NGUỒN SỰ THẬT. Nó chỉ hỏi backend, còn việc cấp quota nằm ở
 * BillingService.settlePaidTransaction() — dùng chung cho cả webhook payOS và đường đối
 * soát mà GET /billing/transactions/:orderCode gọi vào. Khách trả tiền rồi tắt tab thì
 * webhook vẫn cộng quota, không phụ thuộc trang này có được mở hay không.
 *
 * Ngược lại, khi webhook URL chưa đăng ký (máy dev không có HTTPS public) thì endpoint
 * trên là đường DUY NHẤT ghi nhận tiền — nên vẫn phải poll cho tới khi có kết quả.
 */

/** payOS chuyển khoản xong mới đẩy về đây, thường PAID ngay lần hỏi đầu. 5s là để chờ
 *  trường hợp ngân hàng báo có chậm vài giây. */
const POLL_INTERVAL_MS = 5000;

/** 6 lượt ≈ 30 giây. Quá đó thì dừng và trao quyền quyết định cho người dùng: poll vô
 *  hạn vừa vô ích (đơn hết hạn sau 15 phút) vừa treo một trang đang "loading" mãi. */
const MAX_POLLS = 6;

/** Còn xử lý dở -> đáng để hỏi lại. Mọi status khác đều là trạng thái CUỐI. */
const PENDING_STATUSES = ['PENDING', 'PROCESSING'];

// formatVnd / CYCLE_LABEL_KEY nay import từ constants/billing.js — xem chú thích
// ở khối import phía trên.


export default function BillingSuccess() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const orderCode = searchParams.get('orderCode');
  const { refreshUser } = useAuth();

  const [transaction, setTransaction] = useState(null);
  const [error, setError] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  /** Hết MAX_POLLS mà vẫn PENDING — khác `error` (gọi API thất bại) và khác trạng thái cuối. */
  const [timedOut, setTimedOut] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  /**
   * `refreshUser` của AuthContext KHÔNG được memo hoá (hàm mới mỗi lần provider render).
   * Đưa nó vào deps của effect polling là mỗi render lại dựng lại cả vòng lặp poll từ
   * đầu. Giữ qua ref để effect chỉ phụ thuộc `orderCode` + `retryToken`.
   */
  const refreshUserRef = useRef(refreshUser);
  useEffect(() => {
    refreshUserRef.current = refreshUser;
  }, [refreshUser]);

  useEffect(() => {
    if (!orderCode) return;

    // Chặn setState của một vòng poll đã bị huỷ (unmount, hoặc bấm "Kiểm tra lại" khi
    // request cũ còn bay) ghi đè lên kết quả mới hơn.
    let cancelled = false;
    let timer = null;
    let attempt = 0;

    const poll = async () => {
      try {
        const tx = await billingApi.getTransactionStatus(orderCode);
        if (cancelled) return;

        setTransaction(tx);
        setError(null);

        if (tx.status === 'PAID') {
          setIsChecking(false);
          setTimedOut(false);
          // Backend đã ghi quota mới vào users.storage_limit_bytes trong cùng transaction
          // với việc đánh dấu PAID. Nạp lại /auth/me để user.storageInfo (và thanh dung
          // lượng ở trang Gói dịch vụ) hiện đúng hạn mức vừa mua, khỏi phải F5.
          refreshUserRef.current?.();
          // Hạn mức AI đổi theo gói vừa mua (##87: gói 6 tháng ⇒ hạn mức AI cả 6 tháng). Bộ đệm
          // `/ai/status` sống 5 phút — không bỏ đi thì khung AI mở ngay sau đó còn hiện gói cũ.
          aiStatusCache.invalidate('status');
          return;
        }

        if (!PENDING_STATUSES.includes(tx.status)) {
          setIsChecking(false);
          return;
        }

        attempt += 1;
        if (attempt >= MAX_POLLS) {
          setIsChecking(false);
          setTimedOut(true);
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || t('payResult.checkFailed'));
        setIsChecking(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderCode, retryToken, t]);

  const checkAgain = useCallback(() => {
    setIsChecking(true);
    setError(null);
    setTimedOut(false);
    setRetryToken((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-strong relative w-full max-w-md rounded-[28px] border p-8 text-center">
        {!orderCode ? (
          <MissingOrderCode />
        ) : isChecking ? (
          <Checking />
        ) : error ? (
          <RequestFailed message={error} onRetry={checkAgain} />
        ) : (
          <Result transaction={transaction} timedOut={timedOut} onRetry={checkAgain} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── Các trạng thái ───────────────────────────────

function Shell({ tone, icon, title, children }) {
  const tones = {
    success: 'bg-[var(--chip-fill)] text-[var(--ink)] ring-black/5 dark:ring-white/10',
    warning: 'bg-[var(--tone-warn-soft)] text-[var(--tone-warn)] ring-transparent',
    danger: 'bg-[var(--tone-danger-soft)] text-[var(--tone-danger)] ring-transparent',
    neutral: 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700',
  };

  return (
    <>
      <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center ring-1 ${tones[tone]}`}>
        {icon}
      </div>
      <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100 mb-2">{title}</h1>
      {children}
    </>
  );
}

function Checking() {
  const { t } = useLanguage();
  return (
    <Shell tone="neutral" icon={<Loader2 className="w-8 h-8 animate-spin" />} title={t('payResult.checking.title')}>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {tRich(t('payResult.checking.body'), {
          bold: (
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {t('payResult.checking.bold')}
            </span>
          ),
        })}
      </p>
    </Shell>
  );
}

function MissingOrderCode() {
  const { t } = useLanguage();
  return (
    <Shell tone="danger" icon={<XCircle className="w-8 h-8" />} title={t('payResult.missing.title')}>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {tRich(t('payResult.missing.body'), {
          code: <code className="font-mono text-[13px]">orderCode</code>,
        })}
      </p>
      <BackLinks />
    </Shell>
  );
}

function RequestFailed({ message, onRetry }) {
  const { t } = useLanguage();
  return (
    <Shell tone="danger" icon={<XCircle className="w-8 h-8" />} title={t('payResult.failed.title')}>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">{message}</p>
      <p className="mt-3 text-[13px] text-gray-400 dark:text-gray-500">
        {t('payResult.failed.note')}
      </p>
      <RetryButton onClick={onRetry} />
      <BackLinks />
    </Shell>
  );
}

function Result({ transaction, timedOut, onRetry }) {
  const { t, language } = useLanguage();
  const status = transaction?.status;

  if (status === 'PAID') {
    return (
      <Shell tone="success" icon={<CheckCircle2 className="w-8 h-8" />} title={t('payResult.paid.title')}>
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {tRich(t('payResult.paid.body'), {
            plan: (
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {displayPlanName(transaction.planName, language) || t('payResult.paid.planFallback')}
              </span>
            ),
          })}
        </p>
        <TransactionDetails transaction={transaction} />
        <BackLinks primaryLabel={t('payResult.paid.cta')} />
      </Shell>
    );
  }

  if (status === 'UNDERPAID') {
    return (
      <Shell tone="warning" icon={<AlertTriangle className="w-8 h-8" />} title={t('payResult.underpaid.title')}>
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {tRich(t('payResult.underpaid.body'), {
            bold: (
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {t('payResult.underpaid.bold')}
              </span>
            ),
          })}
        </p>
        <TransactionDetails transaction={transaction} />
        <BackLinks />
      </Shell>
    );
  }

  // Vẫn PENDING/PROCESSING sau MAX_POLLS lượt hỏi.
  if (timedOut || PENDING_STATUSES.includes(status)) {
    return (
      <Shell tone="warning" icon={<Clock className="w-8 h-8" />} title={t('payResult.pending.title')}>
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          {t('payResult.pending.body')}
        </p>
        <TransactionDetails transaction={transaction} />
        <RetryButton onClick={onRetry} />
        <BackLinks />
      </Shell>
    );
  }

  // CANCELLED / EXPIRED / FAILED
  const titleKeys = {
    CANCELLED: 'payResult.cancelled.title',
    EXPIRED: 'payResult.expired.title',
    FAILED: 'payResult.failedTx.title',
  };

  return (
    <Shell
      tone="danger"
      icon={<XCircle className="w-8 h-8" />}
      title={t(titleKeys[status] || 'payResult.generic.title')}
    >
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {t('payResult.generic.body')}
      </p>
      <TransactionDetails transaction={transaction} />
      <BackLinks primaryLabel={t('payResult.retryUpgrade')} />
    </Shell>
  );
}

// ──────────────────────────────── Mảnh dùng lại ────────────────────────────────

function TransactionDetails({ transaction }) {
  const { t, language } = useLanguage();
  const locale = localeTagOf(language);
  if (!transaction) return null;

  const rows = [
    [t('payResult.field.orderCode'), transaction.orderCode],
    [t('payResult.field.plan'), displayPlanName(transaction.planName, language)],
    [
      t('payResult.field.cycle'),
      CYCLE_LABEL_KEY[transaction.billingCycle] ? t(CYCLE_LABEL_KEY[transaction.billingCycle]) : null,
    ],
    [t('payResult.field.amount'), transaction.amount != null ? formatVnd(transaction.amount, locale) : null],
    [
      t('payResult.field.time'),
      transaction.createdAt ? new Date(transaction.createdAt).toLocaleString(locale) : null,
    ],
  ].filter(([, value]) => value);

  return (
    <dl className="mt-6 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-left">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt className="text-[13px] font-semibold text-gray-400 dark:text-gray-500 shrink-0">{label}</dt>
          <dd className="text-[14px] font-bold text-gray-800 dark:text-gray-200 text-right break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RetryButton({ onClick }) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      className="mt-6 w-full py-3 px-4 rounded-xl bg-white dark:bg-transparent text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 font-bold text-[15px] transition-all flex items-center justify-center gap-2 cursor-pointer"
    >
      <RefreshCw className="w-4 h-4" /> {t('payResult.recheck')}
    </button>
  );
}

function BackLinks({ primaryLabel }) {
  const { t } = useLanguage();
  return (
    <div className="mt-4 space-y-3">
      <Link
        to="/app/billing"
        className="w-full py-3.5 px-4 rounded-xl btn-accent hover:brightness-105 font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> {primaryLabel ?? t('payResult.backToBilling')}
      </Link>
      <Link
        to="/app"
        className="block w-full py-3 px-4 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 font-bold text-[15px] transition-colors"
      >
        {t('payResult.backToApp')}
      </Link>
    </div>
  );
}

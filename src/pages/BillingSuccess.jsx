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
import { useAuth } from '../context/AuthContext';

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

const formatVnd = (amount) => `${new Intl.NumberFormat('vi-VN').format(Number(amount) || 0)} đ`;

const CYCLE_LABEL = { monthly: '1 tháng', yearly: '1 năm' };

export default function BillingSuccess() {
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
        setError(err.message || 'Không kiểm tra được trạng thái giao dịch');
        setIsChecking(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderCode, retryToken]);

  const checkAgain = useCallback(() => {
    setIsChecking(true);
    setError(null);
    setTimedOut(false);
    setRetryToken((n) => n + 1);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-[#1b1c1d]">
      <div className="w-full max-w-md bg-white dark:bg-[#282a2c] rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl p-8 text-center">
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
    success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-200 dark:ring-emerald-500/30',
    warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 ring-amber-200 dark:ring-amber-500/30',
    danger: 'bg-rose-50 dark:bg-rose-500/10 text-rose-500 ring-rose-200 dark:ring-rose-500/30',
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
  return (
    <Shell tone="neutral" icon={<Loader2 className="w-8 h-8 animate-spin" />} title="Đang xác nhận thanh toán">
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Đang đối soát với cổng thanh toán payOS. Việc này thường mất vài giây —
        <span className="font-semibold text-gray-700 dark:text-gray-300"> vui lòng không đóng trang này</span>.
      </p>
    </Shell>
  );
}

function MissingOrderCode() {
  return (
    <Shell tone="danger" icon={<XCircle className="w-8 h-8" />} title="Thiếu mã giao dịch">
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Đường dẫn không có tham số <code className="font-mono text-[13px]">orderCode</code> nên không biết cần kiểm tra
        giao dịch nào. Hãy mở lại trang Gói dịch vụ và xem Lịch Sử Giao Dịch.
      </p>
      <BackLinks />
    </Shell>
  );
}

function RequestFailed({ message, onRetry }) {
  return (
    <Shell tone="danger" icon={<XCircle className="w-8 h-8" />} title="Không kiểm tra được giao dịch">
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">{message}</p>
      <p className="mt-3 text-[13px] text-gray-400 dark:text-gray-500">
        Nếu bạn đã chuyển khoản thành công, tiền KHÔNG mất: hệ thống vẫn nhận được thông báo từ payOS và sẽ cộng dung
        lượng cho bạn.
      </p>
      <RetryButton onClick={onRetry} />
      <BackLinks />
    </Shell>
  );
}

function Result({ transaction, timedOut, onRetry }) {
  const status = transaction?.status;

  if (status === 'PAID') {
    return (
      <Shell tone="success" icon={<CheckCircle2 className="w-8 h-8" />} title="Thanh toán thành công">
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Gói <span className="font-bold text-gray-900 dark:text-gray-100">{transaction.planName || 'lưu trữ'}</span> đã
          được kích hoạt và dung lượng mới có hiệu lực ngay.
        </p>
        <TransactionDetails transaction={transaction} />
        <BackLinks primaryLabel="Xem gói dịch vụ của tôi" />
      </Shell>
    );
  }

  if (status === 'UNDERPAID') {
    return (
      <Shell tone="warning" icon={<AlertTriangle className="w-8 h-8" />} title="Số tiền chuyển bị thiếu">
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Cổng thanh toán ghi nhận số tiền nhỏ hơn giá gói, nên gói{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">chưa được kích hoạt</span>. Vui lòng liên hệ
          hỗ trợ kèm mã giao dịch bên dưới để được đối soát.
        </p>
        <TransactionDetails transaction={transaction} />
        <BackLinks />
      </Shell>
    );
  }

  // Vẫn PENDING/PROCESSING sau MAX_POLLS lượt hỏi.
  if (timedOut || PENDING_STATUSES.includes(status)) {
    return (
      <Shell tone="warning" icon={<Clock className="w-8 h-8" />} title="Chưa nhận được xác nhận">
        <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Cổng thanh toán chưa báo tiền về. Nếu bạn vừa chuyển khoản, hãy đợi thêm một lát rồi bấm kiểm tra lại — dung
          lượng sẽ được cộng ngay khi payOS xác nhận.
        </p>
        <TransactionDetails transaction={transaction} />
        <RetryButton onClick={onRetry} />
        <BackLinks />
      </Shell>
    );
  }

  // CANCELLED / EXPIRED / FAILED
  const titles = {
    CANCELLED: 'Giao dịch đã bị huỷ',
    EXPIRED: 'Link thanh toán đã hết hạn',
    FAILED: 'Thanh toán thất bại',
  };

  return (
    <Shell tone="danger" icon={<XCircle className="w-8 h-8" />} title={titles[status] || 'Thanh toán không thành công'}>
      <p className="text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed">
        Gói lưu trữ của bạn giữ nguyên và bạn không bị trừ tiền. Hãy tạo lại một giao dịch mới nếu vẫn muốn nâng cấp.
      </p>
      <TransactionDetails transaction={transaction} />
      <BackLinks primaryLabel="Thử nâng cấp lại" />
    </Shell>
  );
}

// ──────────────────────────────── Mảnh dùng lại ────────────────────────────────

function TransactionDetails({ transaction }) {
  if (!transaction) return null;

  const rows = [
    ['Mã giao dịch', transaction.orderCode],
    ['Gói', transaction.planName],
    ['Kỳ thanh toán', CYCLE_LABEL[transaction.billingCycle]],
    ['Số tiền', transaction.amount != null ? formatVnd(transaction.amount) : null],
    ['Thời gian', transaction.createdAt ? new Date(transaction.createdAt).toLocaleString('vi-VN') : null],
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
  return (
    <button
      onClick={onClick}
      className="mt-6 w-full py-3 px-4 rounded-xl bg-white dark:bg-transparent text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 font-bold text-[15px] transition-all flex items-center justify-center gap-2 cursor-pointer"
    >
      <RefreshCw className="w-4 h-4" /> Kiểm tra lại
    </button>
  );
}

function BackLinks({ primaryLabel = 'Quay lại trang Gói dịch vụ' }) {
  return (
    <div className="mt-4 space-y-3">
      <Link
        to="/app/billing"
        className="w-full py-3.5 px-4 rounded-xl bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 text-white font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> {primaryLabel}
      </Link>
      <Link
        to="/app"
        className="block w-full py-3 px-4 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 font-bold text-[15px] transition-colors"
      >
        Về driveR
      </Link>
    </div>
  );
}

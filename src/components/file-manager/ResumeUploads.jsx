import { useState, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useFiles } from '../../context/FileContext';
import { useLanguage } from '../../context/LanguageContext';
import { RotateCcw, X, FileUp, AlertTriangle } from 'lucide-react';
import { formatBytes } from '../../utils/formatFileSize';

/**
 * ResumeUploads — "Tải tiếp" cho những tệp lớn đang dở khi tab bị đóng / F5 /
 * mất điện.
 *
 * Vì sao phải chọn lại tệp: trình duyệt KHÔNG cho giữ nội dung một `File` qua
 * lần tải lại trang — đối tượng đó chết theo tab, không có cách nào lưu nó vào
 * localStorage. Thứ sống sót là phiên tải lên trên Google Cloud Storage (còn
 * hiệu lực 7 ngày) cùng số byte đã nhận. Nên chọn lại đúng tệp là đủ để đẩy nốt
 * phần còn thiếu, không phải tải lại từ đầu.
 *
 * Chỉ áp dụng cho tệp > 10MB (luồng chunked). Tệp nhỏ hơn đi thẳng một phát nên
 * không có gì để tiếp tục.
 */
export default function ResumeUploads() {
  const { listResumableSessions, resumeUpload, discardResumableSession } = useFiles();
  const { t } = useLanguage();

  // Danh sách đọc thẳng từ localStorage (thuần đọc, không đổi gì) — tính lại khi
  // đổi tài khoản. Những phiên người dùng vừa xử lý thì lọc ra bằng `handled`,
  // như vậy không cần đồng bộ state với storage bằng effect.
  const storedSessions = useMemo(() => listResumableSessions(), [listResumableSessions]);
  const [handled, setHandled] = useState(() => new Set());
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);

  const sessions = storedSessions.filter((session) => !handled.has(session.jobId));

  // input file dùng chung, gắn với phiên đang chờ người dùng chọn lại tệp
  const fileInputRef = useRef(null);
  const pendingSessionRef = useRef(null);

  const openPicker = useCallback((session) => {
    setError(null);
    pendingSessionRef.current = session;
    fileInputRef.current?.click();
  }, []);

  const handlePicked = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      const session = pendingSessionRef.current;
      pendingSessionRef.current = null;
      if (!file || !session) return;

      const result = resumeUpload(session, file);
      if (!result.ok) {
        // Nối nhầm tệp vào một phiên đang dở sẽ tạo ra tệp hỏng mà không báo lỗi
        // ở đâu cả — nên thà từ chối và nói rõ vì sao.
        const reasons = {
          name: t('resume.reason.name', { name: session.fileName }),
          size: t('resume.reason.size'),
          modified: t('resume.reason.modified'),
          missing: t('resume.reason.missing'),
        };
        setError(reasons[result.reason] || t('resume.reason.generic'));
        return;
      }

      setError(null);
      setHandled((prev) => new Set(prev).add(session.jobId));
    },
    [resumeUpload, t],
  );

  const handleDiscard = useCallback(
    async (session) => {
      // Ẩn dòng này ngay, không chờ mạng: người dùng đã quyết định bỏ, và bản ghi
      // cục bộ chắc chắn bị xoá dù bước dọn cloud có hỏng hay không — nên phiên
      // này sẽ không quay lại sau khi tải lại trang.
      setHandled((prev) => new Set(prev).add(session.jobId));
      setError(null);

      const result = await discardResumableSession(session);
      if (result && result.cloudCleaned === false) {
        // Dùng toast chứ không phải ô lỗi trong bảng: bỏ phiên cuối cùng là bảng
        // biến mất luôn, thông báo đặt trong đó sẽ không ai đọc được.
        toast.error(t('resume.cleanupFailed'));
      }
    },
    [discardResumableSession, t],
  );

  if (dismissed || sessions.length === 0) return null;

  return (
    <div className="glass-strong fixed bottom-6 left-6 z-40 w-[360px] max-w-[calc(100vw-3rem)] rounded-[20px] border border-amber-200 dark:border-amber-500/30 overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePicked}
        className="hidden"
        aria-label={t('resume.pickAgainAria')}
      />

      <div className="flex items-center justify-between px-4 py-3 bg-amber-500/95 text-white">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <RotateCcw className="w-4 h-4" />
          <span>{t('resume.pending', { count: sessions.length })}</span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-white/20 rounded transition-colors cursor-pointer"
          title={t('resume.hidePanel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="px-4 pt-3 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        {t('resume.hint')}
      </p>

      {error && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-[11px] text-rose-600 dark:text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700 mt-2">
        {sessions.map((session) => (
          <div key={session.jobId} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate"
                title={session.fileName}
              >
                {session.fileName}
              </span>
              <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 shrink-0">
                {session.percent}%
              </span>
            </div>

            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${session.percent}%` }} />
            </div>

            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {formatBytes(session.uploadedBytes)} / {formatBytes(session.totalSizeBytes || 0)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openPicker(session)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition-colors cursor-pointer"
                >
                  <FileUp className="w-3 h-3" />
                  {t('resume.pickAgain')}
                </button>
                <button
                  onClick={() => handleDiscard(session)}
                  className="px-2 py-1 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                  title={t('resume.dropSession')}
                >
                  {t('resume.drop')}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

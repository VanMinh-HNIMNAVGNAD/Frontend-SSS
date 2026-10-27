import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../context/LanguageContext';
import { formatRelativeTime } from '../../utils/relativeTime';

/** Khớp `MAX_COMMENT_LENGTH` ở `backend/src/comments/dto/comment-content.dto.ts`. */
const MAX_LENGTH = 2000;

/** Bấm "Xoá" lần hai trong khoảng này mới xoá thật. */
const CONFIRM_DELETE_MS = 3000;

function Avatar({ author }) {
  const name = author?.fullName || '?';
  if (author?.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        className="w-8 h-8 rounded-full object-cover shrink-0 bg-white/10"
      />
    );
  }
  return (
    <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-zinc-400 to-zinc-600 text-white text-sm font-semibold uppercase">
      {name.trim().charAt(0)}
    </span>
  );
}

/**
 * Cột "Nhận xét" của cửa sổ xem trước — kiểu Google Drive.
 *
 * Dữ liệu và thao tác đến từ `useFileComments` (cửa sổ xem trước giữ nó để nút "Nhận xét"
 * hiện được số lượng cả khi cột đang đóng). Nội dung hiển thị dạng CHỮ TRẦN
 * (`whitespace-pre-wrap`), không bao giờ dựng HTML từ nó.
 *
 * Gửi: nút "Bình luận" hoặc Ctrl/⌘ + Enter. Enter thường xuống dòng, như ô nhận xét của Google.
 */
export default function CommentsPanel({ comments, onClose, className = '' }) {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const listRef = useRef(null);
  const composerRef = useRef(null);

  // Có nhận xét mới (của mình hay lượt nạp đầu) thì cuộn xuống cuối, như khung chat.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.items.length]);

  // Máy có chuột thì đặt sẵn con trỏ vào ô gõ. Màn hình cảm ứng thì KHÔNG: focus là bàn
  // phím ảo bật lên che nửa màn hình ngay khi người dùng chỉ muốn đọc nhận xét.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) composerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!confirmDelete) return undefined;
    const timer = setTimeout(() => setConfirmDelete(null), CONFIRM_DELETE_MS);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await comments.create(content);
      setDraft('');
    } catch (err) {
      toast.error(err?.message || t('preview.comments.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const saveEdit = async () => {
    const content = editing?.text.trim();
    if (!content) return;
    try {
      await comments.update(editing.id, content);
      setEditing(null);
    } catch (err) {
      toast.error(err?.message || t('preview.comments.sendFailed'));
    }
  };

  const remove = async (id) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    try {
      await comments.remove(id);
    } catch (err) {
      toast.error(err?.message || t('preview.comments.deleteFailed'));
    }
  };

  const sendOnShortcut = (e, action) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      action();
    }
  };

  return (
    <aside
      // Kính tối nổi trên "phòng tối" của trình xem (`glass-dark`, index.css). Chỗ gọi phải định
      // vị cột (absolute / relative) để lớp blur `::before` phủ đúng khung — xem FilePreviewModal.
      className={`flex flex-col glass-dark bg-[rgba(36,36,40,0.78)]! text-white border-white/10 ${className}`}
      aria-label={t('preview.comments.title')}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold">
          {t('preview.comments.title')}
          {comments.count > 0 && <span className="ml-2 text-white/50 font-normal">{comments.count}</span>}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full text-white/80 transition-colors cursor-pointer"
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 select-text">
        {comments.loading && (
          <div className="flex justify-center py-8 text-white/60">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}

        {!comments.loading && comments.error && (
          <div className="py-6 text-center text-sm text-white/70 space-y-3">
            <p>{t('preview.comments.loadFailed')}</p>
            <button
              type="button"
              onClick={comments.reload}
              className="px-3 py-1.5 rounded-full border border-white/25 text-xs cursor-pointer"
            >
              {t('preview.comments.retry')}
            </button>
          </div>
        )}

        {!comments.loading && !comments.error && comments.items.length === 0 && (
          <div className="py-10 flex flex-col items-center gap-3 text-center text-sm text-white/55">
            <MessageSquare className="w-8 h-8 text-white/30" />
            <p>{t('preview.comments.empty')}</p>
          </div>
        )}

        {comments.items.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar author={c.author} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium truncate max-w-[12rem]">
                  {c.author?.fullName || t('preview.comments.unknownUser')}
                </span>
                <span className="text-[11px] text-white/45">
                  {formatRelativeTime(c.createdAt, t, locale)}
                  {c.edited ? ` · ${t('preview.comments.edited')}` : ''}
                </span>
              </div>

              {editing?.id === c.id ? (
                <div className="mt-1.5 space-y-2">
                  <textarea
                    value={editing.text}
                    onChange={(e) => setEditing({ id: c.id, text: e.target.value.slice(0, MAX_LENGTH) })}
                    onKeyDown={(e) => sendOnShortcut(e, saveEdit)}
                    rows={3}
                    autoFocus
                    className="w-full resize-none rounded-lg bg-white/10 border border-white/20 focus:border-white/40 outline-none px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="px-3 py-1 rounded-full text-xs text-white/80 cursor-pointer"
                    >
                      {t('preview.comments.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!editing.text.trim()}
                      className="px-3 py-1 rounded-full text-xs font-medium btn-accent hover:brightness-110 disabled:opacity-40 cursor-pointer"
                    >
                      {t('preview.comments.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 text-sm text-white/90 whitespace-pre-wrap break-words">{c.content}</p>
              )}

              {editing?.id !== c.id && (c.canEdit || c.canDelete) && (
                <div className="mt-1 flex gap-3 text-[11px] text-white/50">
                  {c.canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: c.id, text: c.content })}
                      className="hover:text-white cursor-pointer"
                    >
                      {t('preview.comments.edit')}
                    </button>
                  )}
                  {c.canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className={`cursor-pointer ${confirmDelete === c.id ? 'text-[#f08a8a] font-medium' : 'hover:text-white'}`}
                    >
                      {confirmDelete === c.id ? t('preview.comments.confirmDelete') : t('preview.comments.delete')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3 space-y-2">
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={(e) => sendOnShortcut(e, send)}
          rows={2}
          disabled={Boolean(comments.error)}
          placeholder={t('preview.comments.placeholder')}
          className="w-full resize-none rounded-xl bg-white/10 border border-white/15 focus:border-white/40 outline-none px-3 py-2 text-sm placeholder:text-white/40 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-white/40">
            {draft.length > MAX_LENGTH - 200 ? (
              `${draft.length}/${MAX_LENGTH}`
            ) : (
              // Màn hình cảm ứng không có phím Ctrl — ẩn gợi ý phím tắt, chừa chỗ trống.
              <span className="pointer-coarse:invisible">{t('preview.comments.hint')}</span>
            )}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || sending || Boolean(comments.error)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium btn-accent hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('preview.comments.send')}
          </button>
        </div>
      </div>
    </aside>
  );
}

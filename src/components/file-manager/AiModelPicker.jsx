import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, MapPin } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { localeTagOf } from '../../utils/locale';

/**
 * Nút chọn model của khung Hỏi AI (##91).
 *
 * Từ khi có cả chục model (Gemini, Grok, Claude…) dãy nút cũ không
 * còn vừa chân khung chat, nên đây là một menu thả LÊN (nút nằm sát đáy panel), gom nhóm theo hãng.
 * Mỗi lựa chọn nói ba điều người dùng cần để chọn đúng — không nói "nhanh/chậm" vì số đo đổi theo
 * giờ trong ngày:
 *   • chạy ở đâu (`location`: Singapore, Tokyo… hay "Toàn cầu");
 *   • tốn hạn mức gấp mấy lần model gốc (`quotaWeight`, hạn mức quy đổi theo giá);
 *   • đọc được gì ngoài chữ (`reads`) — model chỉ đọc chữ không xem được ảnh, PDF, video.
 *
 * Backend cũ chưa có `provider`/`location` thì vẫn vẽ được: gom vào một nhóm, bỏ trống phần thiếu.
 */
const regionLabel = (t, location) => {
    if (!location) return null;
    const key = `ai.region.${location}`;
    const label = t(key);
    return label === key ? location : label;
};

export default function AiModelPicker({ models, value, onChange, disabled = false }) {
    const { t, language } = useLanguage();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const number = useMemo(
        () => new Intl.NumberFormat(localeTagOf(language), { maximumFractionDigits: 1 }),
        [language],
    );

    const selected = models.find((m) => m.id === value) ?? models[0];

    const groups = useMemo(() => {
        const byProvider = new Map();
        for (const m of models) {
            const key = m.provider || 'google';
            if (!byProvider.has(key)) byProvider.set(key, []);
            byProvider.get(key).push(m);
        }
        // Giữ thứ tự backend gửi (model mặc định đứng đầu, rồi theo `VERTEX_MODELS`): nhóm của
        // model mặc định luôn ở trên cùng.
        return [...byProvider.entries()];
    }, [models]);

    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    const readsText = (m) => {
        const r = m.reads;
        if (!r) return null;
        if (!r.image && !r.pdf && !r.video && !r.audio) return t('ai.model.textOnly');
        const kinds = [
            r.image && t('ai.model.reads.image'),
            r.pdf && t('ai.model.reads.pdf'),
            r.video && t('ai.model.reads.video'),
            r.audio && t('ai.model.reads.audio'),
        ].filter(Boolean);
        return t('ai.model.reads', { kinds: kinds.join(', ') });
    };

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t('ai.model.label')}
                title={t('ai.model.label')}
                className="flex items-center gap-1.5 max-w-[15rem] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <span className="truncate">{selected?.label ?? value}</span>
                {selected?.location && selected.location !== 'global' && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                        <MapPin className="w-3 h-3" />
                        {regionLabel(t, selected.location)}
                    </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role="listbox"
                    aria-label={t('ai.model.label')}
                    className="absolute bottom-full left-0 mb-2 z-30 w-[min(22rem,calc(100vw-2rem))] max-h-[min(60vh,28rem)] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f2023] shadow-2xl py-1.5 animate-fade-in"
                >
                    {groups.map(([provider, list]) => (
                        <div key={provider} className="py-0.5">
                            <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {t(`ai.provider.${provider}`)}
                            </div>
                            {list.map((m) => {
                                const active = m.id === selected?.id;
                                const weight = typeof m.quotaWeight === 'number' ? m.quotaWeight : null;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        role="option"
                                        aria-selected={active}
                                        onClick={() => {
                                            onChange(m.id);
                                            setOpen(false);
                                        }}
                                        className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                                            active ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <span className="w-4 shrink-0 pt-0.5">
                                            {active && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{m.label}</span>
                                                {m.preview && (
                                                    <span className="px-1 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                                        preview
                                                    </span>
                                                )}
                                            </span>
                                            {readsText(m) && (
                                                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{readsText(m)}</span>
                                            )}
                                        </span>
                                        <span className="shrink-0 flex flex-col items-end gap-0.5 text-[10px]">
                                            {m.location && (
                                                <span
                                                    className={`flex items-center gap-0.5 ${
                                                        m.location === 'global'
                                                            ? 'text-gray-500 dark:text-gray-400'
                                                            : 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                                    }`}
                                                >
                                                    <MapPin className="w-3 h-3" />
                                                    {regionLabel(t, m.location)}
                                                </span>
                                            )}
                                            {weight !== null && (
                                                <span
                                                    className={`font-mono font-semibold ${
                                                        weight > 1.05
                                                            ? 'text-rose-600 dark:text-rose-400'
                                                            : weight < 0.95
                                                              ? 'text-emerald-700 dark:text-emerald-400'
                                                              : 'text-gray-500 dark:text-gray-400'
                                                    }`}
                                                    title={t('ai.model.weightHint', { weight: number.format(weight) })}
                                                >
                                                    ×{number.format(weight)}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    <p className="px-3 pt-1.5 pb-1 text-[10px] leading-snug text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 mt-1">
                        {t('ai.model.footnote')}
                    </p>
                </div>
            )}
        </div>
    );
}

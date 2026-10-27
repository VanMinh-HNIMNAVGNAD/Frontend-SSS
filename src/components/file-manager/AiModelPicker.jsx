import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Lock, MapPin } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { localeTagOf } from '../../utils/locale';
import { TIER_LABEL, tierRank } from '../../constants/aiTiers';

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
 *
 * MODEL THEO GÓI (22/10/2026): model gói hiện tại chưa tới bậc (`locked` từ `GET /ai/status`) không
 * biến mất mà xuống nhóm "Mở khoá khi nâng cấp", có ổ khoá + "Gói Plus+". Bấm vào nó KHÔNG đổi model
 * (backend sẽ 403) mà gọi `onLockedPick` — khung chat hiện khối mời nâng cấp.
 */
const regionLabel = (t, location) => {
    if (!location) return null;
    const key = `ai.region.${location}`;
    const label = t(key);
    return label === key ? location : label;
};

export default function AiModelPicker({ models, value, onChange, onLockedPick, plan, disabled = false }) {
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
            if (m.locked) continue;
            const key = m.provider || 'google';
            if (!byProvider.has(key)) byProvider.set(key, []);
            byProvider.get(key).push(m);
        }
        // Giữ thứ tự backend gửi (model mặc định đứng đầu, rồi theo `VERTEX_MODELS`): nhóm của
        // model mặc định luôn ở trên cùng.
        return [...byProvider.entries()];
    }, [models]);

    // Model cần gói cao hơn — xếp theo bậc cần có (Pro trước Plus), cùng bậc giữ thứ tự backend.
    const lockedModels = useMemo(
        () =>
            models
                .map((m, index) => ({ m, index }))
                .filter(({ m }) => m.locked)
                .sort((a, b) => tierRank(a.m.minTier) - tierRank(b.m.minTier) || a.index - b.index)
                .map(({ m }) => m),
        [models],
    );

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
                className="flex items-center gap-1.5 max-w-[15rem] px-2.5 py-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] ring-1 ring-black/[0.04] dark:ring-white/10 text-gray-800 dark:text-gray-200 font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {selected?.locked && <Lock className="w-3 h-3 shrink-0 text-[var(--ink-muted)]" />}
                <span className="truncate">{selected?.label ?? value}</span>
                {selected?.location && selected.location !== 'global' && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-[var(--ink-muted)]">
                        <MapPin className="w-3 h-3" />
                        {regionLabel(t, selected.location)}
                    </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                // Khung kính KHÔNG cuộn, phần cuộn nằm trong: lớp blur `::before` của `glass-strong` là
                // phần tử absolute — đặt nó trong khung cuộn thì nó trôi theo nội dung và nửa dưới
                // danh sách mất blur.
                <div className="glass-strong absolute bottom-full left-0 mb-2 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-[20px] overflow-hidden animate-glass-in origin-bottom-left">
                    <div
                        role="listbox"
                        aria-label={t('ai.model.label')}
                        className="max-h-[min(60vh,30rem)] overflow-y-auto overscroll-contain p-1.5"
                    >
                        {groups.map(([provider, list]) => (
                            <div key={provider} className="py-0.5">
                                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    {t(`ai.provider.${provider}`)}
                                </div>
                                {list.map((m) => (
                                    <ModelRow
                                        key={m.id}
                                        m={m}
                                        active={m.id === selected?.id}
                                        onPick={() => {
                                            onChange(m.id);
                                            setOpen(false);
                                        }}
                                        readsText={readsText(m)}
                                        number={number}
                                        t={t}
                                    />
                                ))}
                            </div>
                        ))}

                        {/* Model cần gói cao hơn: vẫn liệt kê (người dùng biết nó tồn tại và cần gì
                            để dùng), bấm vào thì mời nâng cấp chứ không đổi model. */}
                        {lockedModels.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-glass-divider">
                                <div className="px-2.5 pt-1.5 pb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                    <span>{t('ai.model.lockedSection')}</span>
                                    {plan?.tier && (
                                        <span className="normal-case tracking-normal font-semibold">
                                            {t('ai.model.yourPlan', { plan: TIER_LABEL[plan.tier] ?? plan.tier })}
                                        </span>
                                    )}
                                </div>
                                {lockedModels.map((m) => (
                                    <ModelRow
                                        key={m.id}
                                        m={m}
                                        locked
                                        onPick={() => {
                                            setOpen(false);
                                            onLockedPick?.(m);
                                        }}
                                        readsText={readsText(m)}
                                        number={number}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )}

                        <p className="px-2.5 pt-1.5 pb-1 text-[10px] leading-snug text-gray-500 dark:text-gray-400 border-t mt-1 border-glass-divider">
                            {t('ai.model.footnote')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Một hàng trong danh sách model. `locked`: gói chưa tới bậc — mờ đi, ổ khoá + "Gói Plus+". */
function ModelRow({ m, active = false, locked = false, onPick, readsText, number, t }) {
    const weight = typeof m.quotaWeight === 'number' ? m.quotaWeight : null;
    return (
        <button
            type="button"
            role="option"
            aria-selected={active}
            // KHÔNG `aria-disabled`: hàng khoá vẫn bấm được (mở khối mời nâng cấp). Trạng thái khoá
            // đã nằm trong chính nội dung hàng (huy hiệu "Gói Plus+") nên trình đọc màn hình đọc ra.
            data-locked={locked || undefined}
            onClick={onPick}
            title={locked ? t('ai.model.lockedHint', { tier: TIER_LABEL[m.minTier] ?? m.minTier }) : undefined}
            className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-[12px] text-left transition-colors cursor-pointer ${
                active ? 'glass-active' : ''
            }`}
        >
            <span className="w-4 shrink-0 pt-0.5">
                {active && <Check className="w-3.5 h-3.5 text-[var(--ink)]" strokeWidth={2.5} />}
                {locked && <Lock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
            </span>
            <span className={`min-w-0 flex-1 ${locked ? 'opacity-60' : ''}`}>
                <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">{m.label}</span>
                    {m.preview && (
                        <span className="chip px-1.5 text-[9px] uppercase tracking-wide">
                            preview
                        </span>
                    )}
                </span>
                {readsText && (
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{readsText}</span>
                )}
            </span>
            <span className="shrink-0 flex flex-col items-end gap-0.5 text-[10px]">
                {locked ? (
                    <span className="chip px-1.5 py-0.5">
                        {t('ai.model.tierBadge', { tier: TIER_LABEL[m.minTier] ?? m.minTier })}
                    </span>
                ) : (
                    m.location && (
                        <span
                            className={`flex items-center gap-0.5 ${
                                m.location === 'global'
                                    ? 'text-gray-500 dark:text-gray-400'
                                    : 'text-[var(--ink)] font-semibold'
                            }`}
                        >
                            <MapPin className="w-3 h-3" />
                            {regionLabel(t, m.location)}
                        </span>
                    )
                )}
                {weight !== null && (
                    <span
                        className={`font-mono font-semibold ${locked ? 'opacity-60' : ''} ${
                            weight > 1.05
                                ? 'text-[var(--ink)]'
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
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Lock, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import { useTags } from '../../context/TagsContext';
import { useLanguage } from '../../context/LanguageContext';
import { DEFAULT_TAG_COLOR, TAG_COLORS, TAG_NAME_MAX } from '../../constants/tags';

/** Một ô chọn màu — vòng tròn, đánh dấu màu đang chọn. */
function ColorDots({ value, onChange, disabled }) {
    const { t } = useLanguage();
    return (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('tags.color')}>
            {TAG_COLORS.map((color) => {
                const active = (value || DEFAULT_TAG_COLOR).toLowerCase() === color.toLowerCase();
                return (
                    <button
                        key={color}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={color}
                        disabled={disabled}
                        onClick={() => onChange(color)}
                        className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform cursor-pointer disabled:cursor-not-allowed ${
                            active ? 'ring-2 ring-offset-2 ring-offset-[var(--app-surface)] scale-110' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: color, '--tw-ring-color': color }}
                    >
                        {active && <Check className="w-3 h-3 text-white" />}
                    </button>
                );
            })}
        </div>
    );
}

/** Một hàng nhãn: xem → sửa tại chỗ (tên + màu) → lưu; xoá có hỏi lại. */
function TagRow({ tag }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const { updateTag, deleteTag, closeManager } = useTags();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(tag.name);
    const [color, setColor] = useState(tag.colorHex);
    const [busy, setBusy] = useState(false);

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setBusy(true);
        const ok = await updateTag(tag.id, { name: trimmed, colorHex: color });
        setBusy(false);
        if (ok) setEditing(false);
    };

    const remove = async () => {
        if (!confirm(t('tags.confirmDelete', { name: tag.name, count: tag.fileCount || 0 }))) return;
        setBusy(true);
        await deleteTag(tag.id);
        setBusy(false);
    };

    if (editing) {
        return (
            <li className="px-3 py-2.5 space-y-2 bg-gray-50 dark:bg-white/5 rounded-xl">
                <input
                    autoFocus
                    value={name}
                    maxLength={TAG_NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') save();
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditing(false);
                        }
                    }}
                    aria-label={t('tags.name')}
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between gap-2">
                    <ColorDots value={color} onChange={setColor} disabled={busy} />
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 cursor-pointer"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={busy || !name.trim()}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 cursor-pointer flex items-center gap-1"
                        >
                            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                            {t('common.save')}
                        </button>
                    </div>
                </div>
            </li>
        );
    }

    return (
        <li className="group flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.colorHex || DEFAULT_TAG_COLOR }} />
            <button
                type="button"
                onClick={() => {
                    closeManager();
                    navigate(`/app/tags/${tag.id}`);
                }}
                title={t('tags.openTag', { name: tag.name })}
                className="flex-1 min-w-0 truncate text-left text-sm font-medium text-gray-900 dark:text-gray-100 hover:underline cursor-pointer"
            >
                {tag.name}
            </button>
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{t('tags.fileCount', { count: tag.fileCount || 0 })}</span>
            <button
                type="button"
                onClick={() => {
                    setName(tag.name);
                    setColor(tag.colorHex);
                    setEditing(true);
                }}
                title={t('tags.edit')}
                aria-label={t('tags.edit')}
                className="p-1.5 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-white/10 cursor-pointer"
            >
                <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
                type="button"
                onClick={remove}
                disabled={busy}
                title={t('tags.delete')}
                aria-label={t('tags.delete')}
                className="p-1.5 rounded-full text-gray-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 disabled:opacity-50 cursor-pointer"
            >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
        </li>
    );
}

/**
 * Hộp quản lý nhãn (##91): tạo, đổi tên, đổi màu, xoá. Mở từ menu chuột phải ("Quản lý nhãn…")
 * hoặc từ thanh bên; một bản duy nhất đặt ở MainLayout, đọc cờ mở từ `TagsContext`.
 */
export default function TagManagerModal() {
    const { t } = useLanguage();
    const ctx = useTags();
    const [name, setName] = useState('');
    const [color, setColor] = useState(TAG_COLORS[0]);
    const [creating, setCreating] = useState(false);

    if (!ctx) return null;
    const { tags, managerOpen, closeManager, createTag } = ctx;

    const submit = async (e) => {
        e.preventDefault();
        if (!name.trim() || creating) return;
        setCreating(true);
        const tag = await createTag({ name, colorHex: color });
        setCreating(false);
        if (tag) {
            setName('');
            setColor(TAG_COLORS[(tags.length + 1) % TAG_COLORS.length]);
        }
    };

    return (
        <Modal isOpen={managerOpen} onClose={closeManager} title={t('tags.manager.title')} maxWidth="max-w-lg">
            <div className="p-5 space-y-4">
                <form onSubmit={submit} className="space-y-2.5">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--app-border)] focus-within:border-blue-500 bg-[var(--app-surface)]">
                            <Tag className="w-4 h-4 shrink-0" style={{ color }} />
                            <input
                                value={name}
                                maxLength={TAG_NAME_MAX}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('tags.newPlaceholder')}
                                aria-label={t('tags.name')}
                                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!name.trim() || creating}
                            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
                        >
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            {t('tags.create')}
                        </button>
                    </div>
                    <ColorDots value={color} onChange={setColor} disabled={creating} />
                </form>

                {tags.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-gray-500 dark:text-gray-400">
                        <Tag className="w-8 h-8" />
                        <p className="text-sm">{t('tags.manager.empty')}</p>
                    </div>
                ) : (
                    <ul className="max-h-[50vh] overflow-y-auto space-y-0.5 -mx-1 px-1">
                        {tags.map((tag) => (
                            <TagRow key={`${tag.id}:${tag.name}:${tag.colorHex}`} tag={tag} />
                        ))}
                    </ul>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {t('tags.manager.privacy')}
                </p>
            </div>
        </Modal>
    );
}

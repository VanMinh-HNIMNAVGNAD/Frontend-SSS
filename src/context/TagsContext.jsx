import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { tagsApi } from '../services/api';
import { useAuth } from './AuthContext';
import { useFiles } from './FileContext';
import { useLanguage } from './LanguageContext';

/**
 * Nhãn RIÊNG của người dùng (##91) — danh sách nhãn, và gắn/gỡ nhãn trên các mục đang hiện.
 *
 * Context riêng chứ không nhét vào FileContext: danh sách nhãn chỉ menu chuột phải, thanh bên và
 * trang "Nhãn" cần; để chung `contextValue` khổng lồ kia thì mỗi lần đổi một nhãn là cả cây
 * danh sách tệp render lại.
 *
 * Gắn/gỡ là LẠC QUAN: chip trên hàng đổi ngay (`patchItemTags`), lỗi thì trả về như cũ kèm một
 * toast. Số tệp của từng nhãn cũng cộng/trừ tại chỗ — không gọi lại `GET /tags` sau mỗi cú bấm.
 */
const TagsContext = createContext(null);

export function TagsProvider({ children }) {
    const { isAuthenticated } = useAuth();
    const { patchItemTags } = useFiles();
    const { t } = useLanguage();
    const [tags, setTags] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [managerOpen, setManagerOpen] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const list = await tagsApi.list();
            setTags(Array.isArray(list) ? list : []);
            setLoaded(true);
        } catch {
            /* thanh bên chỉ không hiện nhãn — lần sau mở menu nhãn sẽ thử lại */
        }
    }, []);

    useEffect(() => {
        // Đổi tài khoản thì trang được tải lại (AuthContext), nên không cần dọn danh sách cũ.
        if (!isAuthenticated) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const list = await tagsApi.list();
                if (cancelled) return;
                setTags(Array.isArray(list) ? list : []);
                setLoaded(true);
            } catch {
                /* thanh bên chỉ không hiện nhãn — `refresh()` ở lần sau sẽ thử lại */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAuthenticated]);

    const adjustCount = useCallback((tagId, delta) => {
        if (!delta) return;
        setTags((prev) =>
            prev.map((tag) => (tag.id === tagId ? { ...tag, fileCount: Math.max(0, (tag.fileCount || 0) + delta) } : tag)),
        );
    }, []);

    const createTag = useCallback(async ({ name, colorHex }) => {
        try {
            const tag = await tagsApi.create({ name: name.trim(), ...(colorHex ? { colorHex } : {}) });
            const view = { id: tag.id, name: tag.name, colorHex: tag.colorHex, fileCount: 0, createdAt: tag.createdAt };
            setTags((prev) => [...prev, view].sort((a, b) => a.name.localeCompare(b.name)));
            return view;
        } catch (err) {
            toast.error(err?.message || t('tags.createFailed'));
            return null;
        }
    }, [t]);

    const updateTag = useCallback(async (id, patch) => {
        try {
            const tag = await tagsApi.update(id, patch);
            setTags((prev) =>
                prev
                    .map((x) => (x.id === id ? { ...x, name: tag.name, colorHex: tag.colorHex } : x))
                    .sort((a, b) => a.name.localeCompare(b.name)),
            );
            // Chip trên MỌI hàng đang hiện đổi theo — một nhãn có thể nằm trên nhiều tệp.
            patchItemTags(null, (list) =>
                list.some((x) => x.id === id)
                    ? list.map((x) => (x.id === id ? { ...x, name: tag.name, colorHex: tag.colorHex } : x))
                    : list,
            );
            return true;
        } catch (err) {
            toast.error(err?.message || t('tags.updateFailed'));
            return false;
        }
    }, [patchItemTags, t]);

    const deleteTag = useCallback(async (id) => {
        try {
            await tagsApi.remove(id);
            setTags((prev) => prev.filter((x) => x.id !== id));
            patchItemTags(null, (list) => (list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list));
            return true;
        } catch (err) {
            toast.error(err?.message || t('tags.deleteFailed'));
            return false;
        }
    }, [patchItemTags, t]);

    /**
     * Gắn (`attached = true`) hoặc gỡ một nhãn trên các mục `items` (đủ object, để biết nhãn
     * hiện có). Một mục: đường attach/detach; nhiều mục: một request `apply`.
     */
    const setTagOn = useCallback(async (items, tag, attached) => {
        const targets = items.filter(Boolean);
        if (targets.length === 0) return;
        const changed = targets.filter((item) => (item.tags ?? []).some((x) => x.id === tag.id) !== attached);
        if (changed.length === 0) return;
        const ids = changed.map((item) => item.id);
        const chip = { id: tag.id, name: tag.name, colorHex: tag.colorHex };

        const apply = (on) =>
            patchItemTags(ids, (list) => {
                const has = list.some((x) => x.id === tag.id);
                if (on === has) return list;
                return on
                    ? [...list, chip].sort((a, b) => a.name.localeCompare(b.name))
                    : list.filter((x) => x.id !== tag.id);
            });

        apply(attached);
        adjustCount(tag.id, attached ? ids.length : -ids.length);
        try {
            if (ids.length === 1) {
                if (attached) await tagsApi.attach(tag.id, ids[0]);
                else await tagsApi.detach(tag.id, ids[0]);
                return;
            }
            const res = await tagsApi.apply(tag.id, ids, attached);
            const failed = Array.isArray(res?.failed) ? res.failed : [];
            if (failed.length) {
                const failedIds = failed.map((f) => f.id);
                patchItemTags(failedIds, (list) => list.filter((x) => x.id !== tag.id));
                adjustCount(tag.id, -failed.length);
                toast.error(t('tags.partialFailed', { count: failed.length }));
            }
        } catch (err) {
            apply(!attached);
            adjustCount(tag.id, attached ? -ids.length : ids.length);
            toast.error(err?.message || t('tags.applyFailed'));
        }
    }, [adjustCount, patchItemTags, t]);

    const value = useMemo(() => ({
        tags,
        loaded,
        refresh,
        createTag,
        updateTag,
        deleteTag,
        setTagOn,
        managerOpen,
        openManager: () => setManagerOpen(true),
        closeManager: () => setManagerOpen(false),
    }), [tags, loaded, refresh, createTag, updateTag, deleteTag, setTagOn, managerOpen]);

    return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
}

export function useTags() {
    return useContext(TagsContext);
}

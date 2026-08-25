import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { storageApi } from '../services/api';

/**
 * Logic tạo thumbnail cho một tệp, tách ra khỏi FileCard để Trang chủ (và bất kỳ
 * view nào khác) dùng lại được — trước đây toàn bộ đoạn này nằm trong FileCard
 * nên chỉ chế độ Lưới của MyDrive mới có thumbnail, Trang chủ chỉ hiện icon.
 *
 * Hai biến thể:
 *  - 'full': đầy đủ (ảnh, video, PDF, bảng tính, DOCX, text/code) — dùng cho thẻ lớn.
 *  - 'mini': chỉ ảnh / video / PDF — dùng cho thumbnail nhỏ (Trang chủ) để không
 *    kéo cả SheetJS/mammoth chạy cho một ô 32px.
 */

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

// Giới hạn dung lượng để tải thumbnail: 10MB
export const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;

export function getFileTypeCategory(name = '') {
    const n = name.toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.xlsx') || n.endsWith('.csv') || n.endsWith('.xls')) return 'sheet';
    if (/\.(png|jpg|jpeg|svg|webp|gif|bmp|ico)$/i.test(n)) return 'image';
    if (/\.(mp4|mkv|mov|webm)$/i.test(n)) return 'video';
    if (/\.(mp3|wav|flac|ogg|m4a)$/i.test(n)) return 'audio';
    if (/\.(sql|db|sqlite)$/i.test(n)) return 'database';
    if (n.endsWith('.fig')) return 'figma';
    if (/\.(md|markdown)$/i.test(n)) return 'markdown';
    if (/\.(docx|doc|txt|pptx|log|env|conf|ini)$/i.test(n)) return 'doc';
    if (/\.(zip|rar|7z|tar|gz)$/i.test(n)) return 'archive';
    // Danh sách mở rộng toàn bộ các file code
    if (/\.(js|jsx|ts|tsx|py|java|c|cpp|h|hpp|cs|go|rb|php|sh|bash|zsh|json|xml|yaml|yml|toml|css|scss|sass|html|htm|vue|svelte|kt|swift|rs|dart|lua|prisma|graphql)$/i.test(n)) {
        return 'code';
    }
    return 'default';
}

const EMPTY = { thumbType: null, thumbUrl: null, textContent: null, sheetData: null };

// Trang chủ hiển thị cùng một tệp ở nhiều mục (My Drive / Gần đây / Được chia sẻ)
// nên nếu không cache thì mỗi thẻ lại gọi presigned URL một lần. Presigned URL
// sống 15 phút (backend storage.service.ts: expiresIn 900) → cache 10 phút cho
// chắc, hết hạn thì lấy lại URL mới.
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

function readCache(key) {
    if (!key) return null;
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

async function renderPdfFirstPage(previewUrl) {
    const pdfData = await fetch(previewUrl).then((r) => r.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.8);
}

async function loadThumbnail(file, cat, mini) {
    const n = (file.name || '').toLowerCase();

    // ── Image / Video: dùng presigned URL trực tiếp ──────────────
    if (cat === 'image' || cat === 'video') {
        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;
        return { thumbType: cat, thumbUrl: res.previewUrl };
    }

    // ── PDF: render Canvas qua pdfjsLib buffer (không dùng iframe) ──
    if (cat === 'pdf') {
        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;
        return { thumbType: 'image', thumbUrl: await renderPdfFirstPage(res.previewUrl) };
    }

    // Biến thể 'mini' dừng ở đây: các loại còn lại cần parse nặng, chỉ đáng làm
    // cho thẻ lớn.
    if (mini) return null;

    // ── XLSX / CSV: fetch binary → SheetJS parse → mini table ──
    if (cat === 'sheet') {
        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;
        const response = await fetch(res.previewUrl);
        if (!response.ok) return null;
        const wb = XLSX.read(await response.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length === 0) return null;
        return { thumbType: 'sheet', sheetData: rows.slice(0, 4) }; // tối đa 4 hàng đầu
    }

    // ── DOCX / DOC: fetch binary → mammoth → text ──
    if (cat === 'doc' && (n.endsWith('.docx') || n.endsWith('.doc'))) {
        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;
        const response = await fetch(res.previewUrl);
        if (!response.ok) return null;
        const result = await mammoth.extractRawText({ arrayBuffer: await response.arrayBuffer() });
        if (!result?.value?.trim()) return null;
        return { thumbType: 'text', textContent: result.value.slice(0, 150) };
    }

    // ── Markdown: nhãn riêng, không cần tải nội dung ──
    if (cat === 'markdown') {
        return { thumbType: 'markdown' };
    }

    // ── TXT / LOG / ENV / CONF / INI và Code / JSON / YAML / XML / Shell ──
    const isPlainText =
        cat === 'code' ||
        (cat === 'doc' &&
            (n.endsWith('.txt') || n.endsWith('.log') || n.endsWith('.env') || n.endsWith('.conf') || n.endsWith('.ini')));
    if (isPlainText) {
        const res = await storageApi.getFileTextContent(file.id);
        if (!res?.content) return null;
        return { thumbType: 'text', textContent: res.content.slice(0, 150) };
    }

    // archive, audio, database, figma, pptx, default → fallback icon, không gọi API
    return null;
}

export function useFileThumbnail(file, { variant = 'full' } = {}) {
    const mini = variant === 'mini';
    const cat = getFileTypeCategory(file?.name);
    const isFolder = file?.type === 'folder';
    const cacheKey = file?.id && !isFolder ? `${file.id}:${variant}` : null;

    // Chỉ giữ KẾT QUẢ TẢI VỀ trong state, kèm khoá của tệp nó thuộc về. Phần đọc
    // cache được tính ngay khi render (`resolved`) — nếu gọi setState trong thân
    // effect để đồng bộ cache thì vừa thêm một vòng render vừa vướng luật
    // `react-hooks/set-state-in-effect`.
    const [loaded, setLoaded] = useState(null); // { key, value }
    const cached = readCache(cacheKey);
    const resolved = loaded?.key === cacheKey ? loaded.value : cached || EMPTY;

    useEffect(() => {
        if (!cacheKey) return;

        // Đã có trong cache → render trên đã dùng, không cần gọi lại API
        if (readCache(cacheKey)) return;

        // Nếu file quá lớn (> 10MB) → fallback icon ngay, không gọi API, không hiện loading
        if (file.size && file.size > MAX_THUMBNAIL_SIZE) return;

        let isMounted = true;

        loadThumbnail(file, cat, mini)
            .then((res) => {
                const value = res ? { ...EMPTY, ...res } : EMPTY;
                cache.set(cacheKey, { ts: Date.now(), value });
                if (isMounted) setLoaded({ key: cacheKey, value });
            })
            .catch(() => {
                // Lỗi tải thumbnail không phải chuyện người dùng cần biết → im lặng
                // fallback về icon. Cache cả thất bại để không gọi lại liên tục.
                cache.set(cacheKey, { ts: Date.now(), value: EMPTY });
                if (isMounted) setLoaded({ key: cacheKey, value: EMPTY });
            });

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, cat, mini, file?.size]);

    return { ...resolved, category: cat };
}

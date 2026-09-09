import { useEffect, useState } from 'react';
import { storageApi } from '../services/api';
import {
    readThumbnail,
    writeThumbnail,
    thumbnailFingerprint,
} from '../utils/thumbnailStore';
import { recordThumbnailBytes } from '../utils/requestMetrics';
import { noteThumbnailPipelineEnabled, uploadThumbnails } from '../utils/thumbnailUploader';

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

/**
 * SheetJS, mammoth và pdf.js nạp theo yêu cầu, KHÔNG import tĩnh.
 *
 * Ba thư viện này cộng lại là phần lớn nhất của gói JavaScript, mà hook này lại
 * nằm trên đường đi chính: mỗi FileCard đều gọi nó. Import tĩnh nghĩa là ai mở
 * app cũng phải tải đủ bộ máy đọc Excel, đọc Word và render PDF trước khi thấy
 * được danh sách tệp — kể cả người chỉ có mấy tấm ảnh trong Drive.
 *
 * `import()` được ghi nhớ trong biến module nên mỗi thư viện chỉ tải một lần cho
 * cả phiên; lần gặp tệp .xlsx thứ hai không phải chờ lại.
 */
let xlsxPromise = null;
const loadXlsx = () => (xlsxPromise ??= import('xlsx'));

let mammothPromise = null;
const loadMammoth = () => (mammothPromise ??= import('mammoth').then((m) => m.default ?? m));

let pdfjsPromise = null;
const loadPdfjs = () =>
    (pdfjsPromise ??= import('pdfjs-dist').then((pdfjsLib) => {
        // Worker phải trỏ đúng bản đi kèm phiên bản pdf.js vừa nạp — đặt ngay sau
        // khi nạp xong thay vì lúc module này được import.
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url,
        ).toString();
        return pdfjsLib;
    }));

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

/**
 * HAI TẦNG ĐỆM.
 *
 * L1 — `cache` dưới đây, trong RAM. Trang chủ hiển thị cùng một tệp ở nhiều mục
 * (My Drive / Gần đây / Được chia sẻ) nên không có nó thì mỗi thẻ lại xin URL một
 * lần. Đọc được ngay trong lúc render, nên không kèm một lần render phụ nào.
 *
 * L2 — `utils/thumbnailStore.js`, trên IndexedDB. Sống qua việc tải lại trang và
 * qua việc chữ ký hết hạn, vì nó lưu THÀNH PHẨM đã thu nhỏ chứ không lưu URL.
 *
 * TTL của L1 gắn với vòng đời chữ ký (backend phát 15 phút → giữ 10 phút cho
 * chắc) vì với video, `thumbUrl` CHÍNH LÀ URL có chữ ký. L2 không cần TTL: những
 * gì nó lưu đều tự chứa, và hết hiệu lực theo dấu vân tay nội dung.
 */
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Chặn trên cho L1. Trước đây `Map` này không có giới hạn nào: cuộn qua vài nghìn
 * tệp trong một phiên là giữ lại vài nghìn data URL trong RAM của tab, mà không
 * bao giờ nhả ra.
 */
const L1_MAX_ENTRIES = 200;

const cache = new Map();

/**
 * Khoá đệm KHÔNG mang dấu vân tay (để bản mới ghi đè bản cũ thay vì bỏ lại rác),
 * nên vân tay được kiểm ở cả hai tầng lúc đọc. Thiếu bước này thì tải một phiên
 * bản mới đè lên tệp cũ sẽ vẫn thấy thumbnail cũ.
 */
function readCache(key, fingerprint) {
    if (!key) return null;
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.fingerprint !== fingerprint || Date.now() - hit.ts > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function writeCache(key, fingerprint, value) {
    // `Map` giữ đúng thứ tự chèn nên khoá đầu tiên là khoá cũ nhất — bỏ nó đi.
    // Xoá rồi chèn lại để mục vừa dùng nhảy về cuối hàng, tức L1 chạy theo LRU.
    cache.delete(key);
    cache.set(key, { ts: Date.now(), fingerprint, value });
    while (cache.size > L1_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
}

/**
 * Ô đệm của một tệp.
 *
 * ẢNH tách ô theo BIẾN THỂ (`:t160` / `:t384`) vì từ Giai đoạn 2 hai biến thể là
 * hai kích cỡ thật, không còn dùng chung một thành phẩm nữa.
 *
 * Nhưng tách ô KHÔNG có nghĩa là tải ảnh gốc hai lần: một lượt dựng ở tầng 2 sinh
 * MỌI biến thể từ cùng một bitmap, rồi hook ghi tất cả vào đệm cùng lúc (xem
 * `extraVariants`). Nên biến thể còn lại luôn có sẵn trước khi ai đó hỏi tới.
 *
 * VIDEO / PDF vẫn dùng chung một ô: chúng chỉ có một thành phẩm duy nhất.
 *
 * Các loại còn lại tách theo 'mini'/'full' vì 'mini' cố tình trả rỗng — không tách
 * thì ô rỗng của mini sẽ chặn luôn lượt dựng thật của full.
 */
function thumbCacheKey(file, cat, mini) {
    if (!file?.id) return null;
    if (cat === 'image') return `${file.id}:${VARIANT_FOR[mini ? 'mini' : 'full']}`;
    if (cat === 'video' || cat === 'pdf') return `${file.id}:media`;
    return `${file.id}:${mini ? 'mini' : 'full'}`;
}

/**
 * Các biến thể thumbnail — PHẢI khớp `THUMBNAIL_VARIANTS` ở
 * `backend/src/storage/thumbnail-url.ts`. Lệch tên là backend từ chối cấp URL ghi.
 *
 * `mini` (Trang chủ, hàng danh sách) dùng t160; `full` (thẻ Lưới) dùng t384.
 */
const VARIANT_SIZES = { t160: 160, t384: 384 };
const VARIANT_FOR = { mini: 't160', full: 't384' };

/**
 * Định dạng mã hoá thumbnail: WebP nếu trình duyệt biết mã hoá, ngược lại PNG.
 *
 * KHÔNG lùi về JPEG: nguồn hay là PNG/WebP có nền trong suốt, mà JPEG không có
 * kênh alpha nên phần trong suốt thành một khối đen. PNG to hơn nhưng đúng.
 * Dò một lần rồi ghi nhớ — `toDataURL` với định dạng lạ thì lặng lẽ trả về PNG,
 * nên phải kiểm bằng tiền tố của chuỗi kết quả chứ không có cờ nào để hỏi.
 */
let thumbMimePromise = null;
const resolveThumbMime = () =>
    (thumbMimePromise ??= Promise.resolve().then(() => {
        try {
            const probe = document.createElement('canvas');
            probe.width = 1;
            probe.height = 1;
            return probe.toDataURL('image/webp').startsWith('data:image/webp')
                ? 'image/webp'
                : 'image/png';
        } catch {
            return 'image/png';
        }
    }));

/**
 * Tải ảnh gốc về rồi vẽ lại ở kích thước thumbnail, trả về một data URL.
 *
 * Đây là chỗ đổi bản chất của thumbnail ảnh: trước đây hook trả thẳng URL có chữ
 * ký cho `<img src>`, nghĩa là (1) một tấm 4MB được tải nguyên bản về cho một ô
 * 200px, và (2) tải lại từ đầu MỖI LẦN thẻ được dựng lại, vì chữ ký đổi sau 10
 * phút nên bộ đệm của trình duyệt mất khoá. Thành phẩm data URL thì tự chứa, lưu
 * xuống IndexedDB được, và tải về đúng một lần cho cả đời tấm ảnh đó.
 *
 * Cái giá: lượt ĐẦU vẫn phải tải nguyên bản (không có API thumbnail phía server,
 * và GCS không thu nhỏ hộ). Nên đây là "một lần thay vì mỗi lần", chứ không phải
 * "nhẹ ngay từ lần đầu" — muốn thế thì phải sinh thumbnail phía backend.
 *
 * Vẽ được lên canvas là nhờ bucket đã mở CORS cho origin của app (cùng điều kiện
 * mà `renderPdfFirstPage` và nhánh XLSX bên dưới đang dựa vào). Nếu không, `fetch`
 * ném lỗi và phía gọi lùi về dùng URL trực tiếp như cũ.
 */
/** Vẽ một bitmap ra canvas ở cỡ yêu cầu. Trả về canvas để lấy ra cả blob và data URL. */
function drawScaled(bitmap, maxEdge) {
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(1, maxEdge / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
}

/** Canvas → Blob, bọc lại `toBlob` (callback) thành promise. */
function canvasToBlob(canvas, mime) {
    return new Promise((resolve) => canvas.toBlob(resolve, mime, 0.72));
}

/**
 * Tải ảnh gốc MỘT LẦN rồi dựng MỌI biến thể từ nó.
 *
 * "Một lần" là điểm chính. Trước đây mỗi biến thể tự đi tải ảnh gốc, nên mở Trang
 * chủ (cần bản nhỏ) rồi vào chế độ Lưới (cần bản lớn) là tải tấm ảnh 4MB đó hai
 * lần. Giờ một lần tải → một bitmap → hai canvas → hai blob, và cả hai được đẩy
 * lên R2 cùng lúc để không ai phải làm lại việc này nữa.
 *
 * Trả về `{ dataUrls, blobs }`: `dataUrls` để hiển thị và đệm ở IndexedDB (tự chứa),
 * `blobs` để đẩy lên R2 (cần biết `size` chính xác cho chữ ký).
 */
async function buildVariantsFromOriginal(previewUrl) {
    const response = await fetch(previewUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    // Con số đáng nhìn nhất trong toàn bộ phép đo: bao nhiêu byte ảnh GỐC đã phải
    // tải về. `fetch` này không đi qua axios nên bảng đếm endpoint không thấy nó.
    recordThumbnailBytes(blob.size);

    const bitmap = await createImageBitmap(blob);
    try {
        const mime = await resolveThumbMime();
        const dataUrls = {};
        const blobs = {};

        for (const [variant, maxEdge] of Object.entries(VARIANT_SIZES)) {
            const canvas = drawScaled(bitmap, maxEdge);
            dataUrls[variant] = canvas.toDataURL(mime, 0.72);
            // Chỉ đẩy lên R2 khi mã hoá được ĐÚNG webp: backend ký cứng
            // `content-type: image/webp`, gửi PNG lên là R2 trả 403.
            blobs[variant] = mime === 'image/webp' ? await canvasToBlob(canvas, mime) : null;
        }

        return { dataUrls, blobs };
    } finally {
        bitmap.close?.();
    }
}

/**
 * Thử lấy thumbnail ĐÃ CÓ trên R2 qua Cloudflare.
 *
 * Đây là đường đi nhanh của toàn bộ Giai đoạn 2: ~20KB từ biên CDN thay cho vài MB
 * ảnh gốc từ GCS, và không tốn lượt gọi backend nào vì URL đã nằm sẵn trong response
 * danh sách (capability URL — xem `backend/src/storage/thumbnail-url.ts`).
 *
 * `null` nghĩa là "chưa có, hãy tự dựng": có thể vì chưa ai từng mở tệp này, hoặc
 * `thumb_version` vừa bị tăng do thu hồi quyền. Không phân biệt, và không báo lỗi —
 * 404 ở đây là một trạng thái bình thường của pipeline, không phải sự cố.
 */
async function readFromCdn(url) {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        recordThumbnailBytes(blob.size);
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        // CORS chưa mở trên bucket, mạng lỗi, miền chưa cấu hình… — cứ coi như chưa có.
        return null;
    }
}

async function renderPdfFirstPage(previewUrl) {
    const pdfjsLib = await loadPdfjs();
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

    // ── Image: ba tầng, dừng ở tầng nào có kết quả ───────────────
    //
    //   1. R2 qua Cloudflare  — ~20KB, 0 lượt gọi backend  (Giai đoạn 2)
    //   2. ảnh gốc trên GCS   — tải một lần, dựng mọi biến thể, đẩy lên R2
    //   3. URL gốc trực tiếp  — khi không thu nhỏ được (GIF/SVG, CORS, canvas lỗi)
    if (cat === 'image') {
        const variant = VARIANT_FOR[mini ? 'mini' : 'full'];

        // GIF và SVG bỏ qua toàn bộ pipeline: vẽ GIF lên canvas là mất hoạt ảnh,
        // còn SVG thì `createImageBitmap` không phải trình duyệt nào cũng nhận (và
        // ảnh vector vốn đã nhẹ, thu nhỏ chẳng được gì).
        const isVectorOrAnimated = /\.(gif|svg)$/i.test(n);

        // ── Tầng 1 ──
        if (file.thumbUrls) {
            // Hàng này có URL R2 ⇒ tính năng đã cấu hình. Ghi nhớ ở phạm vi module để
            // tệp VỪA UPLOAD (không đi qua đường danh sách nên không có `thumbUrls`)
            // vẫn được đẩy thumbnail lên R2.
            noteThumbnailPipelineEnabled();
        }
        if (!isVectorOrAnimated) {
            const fromCdn = await readFromCdn(file.thumbUrls?.[variant]);
            if (fromCdn) return { thumbType: 'image', thumbUrl: fromCdn };
        }

        // ── Tầng 2/3: cần URL của ảnh gốc ──
        let res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) {
            // Đường gộp cố ý bỏ bước dò lại `storage_provider` (nó tốn một lượt
            // HEAD tới cloud CHO MỖI TỆP — xem `getPresignedPreviewUrlsBatch`).
            // Nên khi lô không trả về URL cho tệp này, thử đúng một lần bằng đường
            // lẻ: chỉ đường đó còn sửa được trường hợp provider lệch. Trả giá một
            // lượt gọi cho ca hiếm, thay vì 50 lượt cho ca thường.
            res = await storageApi.getPreviewUrlDirect(file.id).catch(() => null);
        }
        if (!res?.previewUrl) return null;

        if (isVectorOrAnimated) {
            return { thumbType: 'image', thumbUrl: res.previewUrl };
        }

        // ── Tầng 2 ──
        try {
            const built = await buildVariantsFromOriginal(res.previewUrl);
            if (built?.dataUrls?.[variant]) {
                // Các biến thể KHÁC cũng vừa được dựng xong từ cùng một bitmap — trả
                // kèm để hook ghi luôn vào đệm. Không có bước này thì việc tách ô
                // theo biến thể sẽ khiến lần hỏi biến thể kia phải tải lại ảnh gốc.
                const extraVariants = {};
                for (const [name, dataUrl] of Object.entries(built.dataUrls)) {
                    if (name !== variant && dataUrl) extraVariants[`${file.id}:${name}`] = dataUrl;
                }
                // Đẩy lên R2 để lần sau — và cho MỌI thiết bị, MỌI thành viên — không
                // ai phải tải lại ảnh gốc nữa. Chạy nền, không chờ, không quan tâm
                // thành/bại: người dùng đã có thumbnail trong tay rồi. Chỉ chủ tệp
                // được ghi nên người được chia sẻ luôn bị từ chối ở đây, và đó là
                // hành vi đúng, không phải lỗi.
                // Không gác theo `file.thumbUrls` nữa: `uploadThumbnails` tự biết
                // pipeline có bật hay không, và biết cả với tệp vừa upload.
                uploadThumbnails(file.id, built.blobs);
                return { thumbType: 'image', thumbUrl: built.dataUrls[variant], extraVariants };
            }
        } catch {
            // CORS chưa mở trên GCS, ảnh hỏng, hết bộ nhớ canvas… — còn tầng 3.
        }

        // ── Tầng 3 ── URL có chữ ký, dùng trực tiếp. Không đệm bền được
        // (`isPersistable` loại URL http) nên lần sau vẫn phải làm lại.
        return { thumbType: 'image', thumbUrl: res.previewUrl };
    }

    // ── Video: vẫn dùng URL có chữ ký trực tiếp ───────────────────
    //
    // Bắt một khung hình đòi dựng thẻ `<video>` rời, chờ seek, rồi vẽ lên canvas —
    // nhiều bước hỏng được hơn hẳn nhánh ảnh. Hệ quả: thumbnail video KHÔNG sống
    // qua lần tải lại trang (`isPersistable` loại URL http). Đây là phần còn lại
    // đáng làm tiếp nếu thư mục nhiều video vẫn thấy chậm.
    if (cat === 'video') {
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
        const XLSX = await loadXlsx();
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
        const mammoth = await loadMammoth();
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

/**
 * @param {object}  file
 * @param {object}  [options]
 * @param {'full'|'mini'} [options.variant='full']
 * @param {boolean} [options.enabled=true]
 *        `false` = HOÃN việc dựng thumbnail (thẻ còn nằm ngoài khung nhìn). Bản đã
 *        đệm vẫn được trả về ngay — hoãn chỉ áp cho việc gọi mạng, không áp cho
 *        việc đọc cache, nếu không thì cuộn tới đâu cũng thấy ô trống một nhịp dù
 *        dữ liệu đã có sẵn trong máy.
 */
export function useFileThumbnail(file, { variant = 'full', enabled = true } = {}) {
    const mini = variant === 'mini';
    const cat = getFileTypeCategory(file?.name);
    const isFolder = file?.type === 'folder';
    const cacheKey = !isFolder ? thumbCacheKey(file, cat, mini) : null;
    const fingerprint = thumbnailFingerprint(file);

    // Chỉ giữ KẾT QUẢ TẢI VỀ trong state, kèm khoá của tệp nó thuộc về. Phần đọc
    // cache được tính ngay khi render (`resolved`) — nếu gọi setState trong thân
    // effect để đồng bộ cache thì vừa thêm một vòng render vừa vướng luật
    // `react-hooks/set-state-in-effect`.
    // So khớp CẢ khoá VÀ dấu vân tay: cùng một tệp được tải lên phiên bản mới thì
    // khoá không đổi, chỉ vân tay đổi — chỉ so khoá thì thumbnail cũ đứng lại trong
    // state và không bao giờ bị thay.
    const [loaded, setLoaded] = useState(null); // { key, fingerprint, value }
    const isLoadedCurrent = loaded?.key === cacheKey && loaded?.fingerprint === fingerprint;
    const cached = readCache(cacheKey, fingerprint);
    const resolved = isLoadedCurrent ? loaded.value : cached || EMPTY;

    useEffect(() => {
        if (!cacheKey) return;

        // Đã có trong L1 → render trên đã dùng, không cần làm gì thêm
        if (readCache(cacheKey, fingerprint)) return;

        // Ngoài khung nhìn → chưa làm gì cả. Đặt SAU lần đọc L1 là có ý: thẻ đã có
        // sẵn thành phẩm thì hiện ngay, không cần chờ observer báo.
        if (!enabled) return;

        // Nếu file quá lớn (> 10MB) → fallback icon ngay, không gọi API, không hiện loading
        if (file.size && file.size > MAX_THUMBNAIL_SIZE) return;

        let isMounted = true;

        /** Chốt kết quả vào L1 + state. L2 do phía gọi tự quyết định có ghi không. */
        const settle = (value) => {
            writeCache(cacheKey, fingerprint, value);
            if (isMounted) setLoaded({ key: cacheKey, fingerprint, value });
        };

        // L2 trước, mạng sau. Đây là điểm khác biệt lớn nhất so với bản cũ: quay
        // lại một thư mục đã xem (đổi chế độ xem, đóng/mở modal, hay thậm chí F5)
        // không còn tốn một request nào cho thumbnail.
        readThumbnail(cacheKey, fingerprint)
            .then((stored) => {
                if (stored) {
                    settle(stored);
                    return null;
                }
                return loadThumbnail(file, cat, mini).then((res) => {
                    // `extraVariants` là các biến thể ĐÃ dựng xong từ cùng một lần
                    // tải ảnh gốc — ghi chúng vào đệm ngay, để lần hỏi biến thể kia
                    // không phải tải lại tấm ảnh đó. Tách nó ra khỏi `value` vì nó
                    // là dữ liệu của ô đệm KHÁC, không phải thuộc tính của thumbnail
                    // đang hỏi.
                    const { extraVariants, ...rest } = res ?? {};
                    const value = res ? { ...EMPTY, ...rest } : EMPTY;

                    settle(value);
                    // Không await: người dùng đã thấy ảnh rồi, việc ghi đĩa không
                    // được phép chen vào giữa. `writeThumbnail` tự lọc những giá
                    // trị không đáng lưu (rỗng, thất bại, URL có chữ ký).
                    void writeThumbnail(cacheKey, fingerprint, value);

                    for (const [siblingKey, dataUrl] of Object.entries(extraVariants ?? {})) {
                        const siblingValue = { ...EMPTY, thumbType: 'image', thumbUrl: dataUrl };
                        writeCache(siblingKey, fingerprint, siblingValue);
                        void writeThumbnail(siblingKey, fingerprint, siblingValue);
                    }
                    return null;
                });
            })
            .catch(() => {
                // Lỗi tải thumbnail không phải chuyện người dùng cần biết → im lặng
                // fallback về icon. Ghi thất bại vào L1 (có TTL 10 phút) để không
                // gọi lại liên tục, nhưng KHÔNG ghi xuống L2: một lần mất mạng
                // không được phép thành một ô icon vĩnh viễn.
                settle(EMPTY);
            });

        return () => {
            isMounted = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, fingerprint, cat, mini, enabled, file?.size]);

    return { ...resolved, category: cat };
}

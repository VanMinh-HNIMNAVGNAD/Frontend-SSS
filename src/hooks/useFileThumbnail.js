import { useEffect, useState } from 'react';
import { storageApi } from '../services/api';
import {
    readThumbnail,
    writeThumbnail,
    thumbnailFingerprint,
} from '../utils/thumbnailStore';
import { recordThumbnailBytes } from '../utils/requestMetrics';
import { noteThumbnailPipelineEnabled, uploadThumbnails } from '../utils/thumbnailUploader';
import {
    VARIANT_FOR,
    buildVariantsFromImageUrl,
    buildVariantsFromPdfUrl,
    buildVariantsFromVideoUrl,
} from '../utils/thumbnailBuilder';

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

// pdf.js nạp trong `utils/thumbnailBuilder.js` — nó đứng cạnh phần render trang đầu.

// Giới hạn dung lượng để tải thumbnail: 10MB
export const MAX_THUMBNAIL_SIZE = 10 * 1024 * 1024;

/**
 * Những loại KHÔNG bị `MAX_THUMBNAIL_SIZE` chặn, vì chúng không hề tải nguyên tệp.
 *
 * Cái trần 10MB có một lý do rất cụ thể: những nhánh phải kéo TRỌN tệp về RAM
 * (bảng tính, DOCX, text) chỉ để vẽ một ô xem trước.
 *
 * Video và PDF KHÔNG làm như vậy:
 *   • video — `<video preload="metadata">` rồi tua tới giây thứ 1. Trình duyệt đọc
 *     bằng HTTP Range: phần header + đúng đoạn quanh khung hình cần, thường vài
 *     trăm KB, và nó dừng ngay khi `seeked` bắn. Một video 200MB không vì thế mà
 *     tốn 200MB.
 *   • PDF — pdf.js cũng đọc theo Range (`disableAutoFetch`, xem `thumbnailBuilder`).
 *
 * Áp chung một cái trần theo BYTE CỦA TỆP GỐC cho cả ba là đo nhầm thứ, và hậu quả
 * thì đúng bằng triệu chứng đã gặp: mọi video trên 10MB vĩnh viễn không có thumbnail
 * trừ khi nó tình cờ được dựng sẵn lúc upload (`utils/thumbnailPrimer.js`) VÀ lượt
 * đẩy lên R2 lúc ấy thành công. Cùng một video 150MB, máy có máy không.
 */
const RANGE_READ_CATEGORIES = new Set(['video', 'pdf']);

/**
 * Ảnh cũng KHÔNG bị trần chặn nữa (28/09/2026, theo yêu cầu): ảnh lớn cỡ nào cũng
 * được tải gốc về để dựng thumbnail, rồi đẩy bản thu nhỏ lên R2 — chỉ tốn đúng một
 * lần cho mỗi ảnh. Trần 10MB giờ chỉ còn áp cho bảng tính / DOCX / text, những thứ
 * phải parse nguyên tệp trên main thread.
 */
const UNCAPPED_CATEGORIES = new Set([...RANGE_READ_CATEGORIES, 'image']);

/**
 * Tệp này có phải "quá lớn để tải nguồn gốc về" không?
 *
 * Trả `true` ⇒ chỉ được lấy thumbnail đã có sẵn trên CDN (`cdnOnly`).
 */
function needsFullDownload(file, cat) {
    if (UNCAPPED_CATEGORIES.has(cat)) return false;
    return Boolean(file?.size && file.size > MAX_THUMBNAIL_SIZE);
}

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
 * TTL của L1 gắn với vòng đời chữ ký (backend phát 1 tiếng cho ảnh/PDF, 4 giờ cho
 * media → giữ 55 phút cho chắc) vì với video, `thumbUrl` CHÍNH LÀ URL có chữ ký.
 * Cùng một con số, và cùng một lý do, với `previewUrlCache` trong `utils/ttlCache.js`:
 * vượt quá hạn chữ ký là giữ lại một link đã chết. L2 không cần TTL: những gì nó
 * lưu đều tự chứa, và hết hiệu lực theo dấu vân tay nội dung.
 */
const CACHE_TTL = 55 * 60 * 1000;

/**
 * TTL riêng cho ô THẤT BẠI (mạng chập, ảnh hỏng, API 5xx).
 *
 * Giữ nguyên 10 phút trong khi ô thành công lên 55 phút, vì hai ô này phục vụ hai
 * việc khác hẳn nhau: ô thành công tránh tải lại một thứ đã có, còn ô thất bại chỉ
 * để chặn việc gọi lại liên tục sau một lần hỏng. Dùng chung 55 phút cho cả hai là
 * biến một giây mất mạng thành một thẻ icon kẹt gần một tiếng — L1 nằm trong RAM
 * nên chỉ F5 mới gỡ được.
 */
const FAILURE_CACHE_TTL = 10 * 60 * 1000;

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
    if (hit.fingerprint !== fingerprint || Date.now() - hit.ts > (hit.ttl ?? CACHE_TTL)) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function writeCache(key, fingerprint, value, ttl = CACHE_TTL) {
    // `Map` giữ đúng thứ tự chèn nên khoá đầu tiên là khoá cũ nhất — bỏ nó đi.
    // Xoá rồi chèn lại để mục vừa dùng nhảy về cuối hàng, tức L1 chạy theo LRU.
    cache.delete(key);
    cache.set(key, { ts: Date.now(), fingerprint, value, ttl });
    while (cache.size > L1_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
}

/**
 * Ai đang chờ nghe một ô đệm thay đổi.
 *
 * Cần vì L1 không chỉ được ghi bởi chính hook nữa: `utils/thumbnailPrimer.js` dựng
 * thumbnail của tệp VỪA UPLOAD ở ngoài vòng đời React. Không có kênh báo này thì
 * thumbnail nằm sẵn trong đệm mà cái thẻ ngay trên màn hình vẫn hiện icon cho tới
 * lần render sau — và với tệp lớn thì "lần render sau" có thể là lần F5 tiếp theo.
 */
const listeners = new Map();

function subscribeThumbnail(key, fn) {
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(fn);
    return () => {
        set.delete(fn);
        if (set.size === 0) listeners.delete(key);
    };
}

/**
 * Ghi một thành phẩm vào L1 TỪ BÊN NGOÀI hook, rồi báo cho mọi thẻ đang hiển thị.
 *
 * @param {string} key          Khoá đệm, đúng dạng `thumbCacheKey` sinh ra:
 *                              `${fileId}:${variant}`.
 * @param {string} fingerprint  Dấu vân tay nội dung (`thumbnailFingerprint`).
 * @param {object} value        Thành phẩm, dạng `{ thumbType, thumbUrl, ... }`.
 */
export function publishThumbnail(key, fingerprint, value) {
    if (!key || !value) return;
    writeCache(key, fingerprint, value);
    for (const fn of listeners.get(key) ?? []) fn();
}

/**
 * Ô đệm của một tệp.
 *
 * ẢNH, VIDEO và PDF tách ô theo BIẾN THỂ (`:t160` / `:t384`): cả ba nay đều có hai
 * kích cỡ thật trên R2. Video và PDF trước đây dùng chung một ô `:media` vì thành
 * phẩm của chúng là một URL có chữ ký (video) hoặc một ảnh dựng tại chỗ rồi vứt đi
 * (PDF) — từ khi cả hai đi qua cùng pipeline với ảnh thì lý do đó không còn.
 *
 * Tách ô KHÔNG có nghĩa là tải nguồn hai lần: một lượt dựng sinh MỌI biến thể từ
 * cùng một lần giải mã, rồi hook ghi tất cả vào đệm cùng lúc (xem `extraVariants`).
 * Nên biến thể còn lại luôn có sẵn trước khi ai đó hỏi tới.
 *
 * Các loại còn lại tách theo 'mini'/'full' vì 'mini' cố tình trả rỗng — không tách
 * thì ô rỗng của mini sẽ chặn luôn lượt dựng thật của full.
 */
function thumbCacheKey(file, cat, mini) {
    if (!file?.id) return null;
    if (cat === 'image' || cat === 'video' || cat === 'pdf') {
        return `${file.id}:${VARIANT_FOR[mini ? 'mini' : 'full']}`;
    }
    return `${file.id}:${mini ? 'mini' : 'full'}`;
}

/**
 * Các biến thể ANH EM vừa được dựng kèm, theo đúng khoá đệm của chúng.
 *
 * Một lượt dựng cho ra cả `t160` lẫn `t384`; cái đang được hỏi thì trả thẳng cho
 * phía gọi, cái kia đi qua đây để hook ghi vào đệm. Không có bước này thì việc
 * tách ô theo biến thể sẽ khiến lần hỏi biến thể kia phải dựng lại từ đầu.
 */
function siblingVariants(fileId, dataUrls, current) {
    const siblings = {};
    for (const [name, dataUrl] of Object.entries(dataUrls ?? {})) {
        if (name !== current && dataUrl) siblings[`${fileId}:${name}`] = dataUrl;
    }
    return siblings;
}

/**
 * Thumbnail ĐÃ CÓ trên R2 chưa? Trả về chính URL đó nếu có.
 *
 * Đây là đường đi nhanh của toàn bộ Giai đoạn 2: ~20KB từ biên CDN thay cho vài MB
 * nguồn gốc từ GCS, và không tốn lượt gọi backend nào vì URL đã nằm sẵn trong
 * response danh sách (capability URL — xem `backend/src/storage/thumbnail-url.ts`).
 *
 * Trả về URL chứ KHÔNG trả về data URL, và đó là thay đổi có chủ ý. Bản cũ `fetch`
 * rồi `FileReader` thành `data:` để còn lưu xuống IndexedDB — cần thiết khi URL
 * thumbnail còn mang chữ ký có hạn. Từ khi nó là capability URL ổn định kèm
 * `immutable, max-age=1 năm`, bộ đệm HTTP của trình duyệt đã làm đúng việc ấy, rẻ
 * hơn hẳn: không base64 (+33% RAM), không một vòng FileReader cho mỗi thẻ, ảnh
 * được giải mã ngoài luồng chính, và `loading="lazy"` mới thật sự có tác dụng.
 *
 * `new Image()` ở đây KHÔNG phải một lượt tải thừa: `<img>` trong DOM nhận lại đúng
 * byte đó từ bộ đệm. Nó chỉ để phân biệt "đã có" với "chưa có" trước khi hook hứa
 * với giao diện là có ảnh — 404 là trạng thái bình thường của pipeline (chưa ai mở
 * tệp này, hoặc `thumb_version` vừa tăng do thu hồi quyền), không phải sự cố.
 *
 * Cố ý KHÔNG đặt `crossOrigin`: chỉ hiển thị chứ không vẽ lên canvas, nên không cần
 * CORS — và đặt vào là tự dựng thêm một cách để hỏng.
 */
async function probeCdnThumbnail(url) {
    if (!url) return null;
    try {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        await (img.decode
            ? img.decode()
            : new Promise((resolve, reject) => {
                  img.onload = resolve;
                  img.onerror = reject;
              }));
        recordThumbnailBytes(transferredBytes(url));
        return url;
    } catch {
        // 404 (chưa có), CORS/miền chưa cấu hình, mạng lỗi — cứ coi như chưa có.
        return null;
    }
}

/**
 * Bao nhiêu byte thật sự đi qua mạng cho một URL, theo Resource Timing.
 *
 * Cần vì nhánh CDN không còn `fetch` nên không có `blob.size` để đếm. Trả 0 khi
 * trình duyệt không cho đọc (thiếu `Timing-Allow-Origin` ở phía CDN) hoặc khi ảnh
 * đến từ bộ đệm — và 0 ở đây là câu trả lời ĐÚNG, không phải số liệu thiếu: mục
 * đích của phép đo là đếm byte đã đi qua mạng.
 */
function transferredBytes(url) {
    try {
        const entries = performance.getEntriesByName(url);
        return entries[entries.length - 1]?.transferSize || 0;
    } catch {
        return 0;
    }
}

/**
 * @param {object}  file
 * @param {string}  cat
 * @param {boolean} mini
 * @param {object}  [opts]
 * @param {boolean} [opts.cdnOnly]  Chỉ được lấy thumbnail ĐÃ CÓ trên R2, cấm mọi
 *   đường phải tải nguồn gốc về. Dùng cho tệp vượt trần `MAX_THUMBNAIL_SIZE` (ảnh,
 *   video, PDF không bao giờ vượt — xem `UNCAPPED_CATEGORIES`).
 */
async function loadThumbnail(file, cat, mini, { cdnOnly = false } = {}) {
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
            const fromCdn = await probeCdnThumbnail(file.thumbUrls?.[variant]);
            if (fromCdn) return { thumbType: 'image', thumbUrl: fromCdn };
        }
        if (cdnOnly) return null;

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
            const built = await buildVariantsFromImageUrl(res.previewUrl);
            if (built?.dataUrls?.[variant]) {
                // Đẩy lên R2 để lần sau — và cho MỌI thiết bị, MỌI thành viên — không
                // ai phải tải lại ảnh gốc nữa. Chạy nền, không chờ, không quan tâm
                // thành/bại: người dùng đã có thumbnail trong tay rồi. Chỉ chủ tệp
                // được ghi nên người được chia sẻ luôn bị từ chối ở đây, và đó là
                // hành vi đúng, không phải lỗi.
                // Không gác theo `file.thumbUrls` nữa: `uploadThumbnails` tự biết
                // pipeline có bật hay không, và biết cả với tệp vừa upload.
                uploadThumbnails(file.id, built.blobs);
                return {
                    thumbType: 'image',
                    thumbUrl: built.dataUrls[variant],
                    extraVariants: siblingVariants(file.id, built.dataUrls, variant),
                };
            }
        } catch {
            // CORS chưa mở trên GCS, ảnh hỏng, hết bộ nhớ canvas… — còn tầng 3.
        }

        // ── Tầng 3 ── URL có chữ ký, dùng trực tiếp. Không đệm bền được
        // (`isPersistable` loại URL http) nên lần sau vẫn phải làm lại.
        return { thumbType: 'image', thumbUrl: res.previewUrl };
    }

    // ── Video: ba tầng, y như ảnh ─────────────────────────────────
    //
    //   1. R2 qua Cloudflare — một tấm webp ~20KB
    //   2. bắt một khung hình từ URL có chữ ký, đẩy lên R2
    //   3. URL có chữ ký cho thẳng vào `<video>` như trước
    //
    // Tầng 3 là thứ TRƯỚC ĐÂY làm mọi lúc, và nó đắt hơn vẻ ngoài: mỗi thẻ mở một
    // kết nối tới kho để đọc metadata, và với tệp có `moov` nằm ở cuối thì trình
    // duyệt phải kéo cả phần đuôi. Không đệm bền được (`isPersistable` loại URL
    // http) nên nó lặp lại sau mỗi lần F5, cho mỗi thiết bị, cho mỗi thành viên.
    if (cat === 'video') {
        const variant = VARIANT_FOR[mini ? 'mini' : 'full'];
        if (file.thumbUrls) noteThumbnailPipelineEnabled();

        // ── Tầng 1 ──
        const fromCdn = await probeCdnThumbnail(file.thumbUrls?.[variant]);
        if (fromCdn) return { thumbType: 'image', thumbUrl: fromCdn };
        if (cdnOnly) return null;

        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;

        // ── Tầng 2 ──
        try {
            const built = await buildVariantsFromVideoUrl(res.previewUrl);
            if (built?.dataUrls?.[variant]) {
                uploadThumbnails(file.id, built.blobs);
                return {
                    thumbType: 'image',
                    thumbUrl: built.dataUrls[variant],
                    extraVariants: siblingVariants(file.id, built.dataUrls, variant),
                };
            }
        } catch {
            // Codec trình duyệt không giải được, CORS chưa mở, hoặc quá hạn chờ.
        }

        // ── Tầng 3 ── chỉ cho video NHỎ.
        //
        // Tầng 3 giao URL có chữ ký cho `FileThumbnail`/`FileCard` dựng một thẻ
        // `<video>` THẬT cho mỗi ô. Chromium chỉ cho 6 kết nối trên một tên miền,
        // nên một thư mục nhiều video lớn mà rơi hết xuống đây là chiếm sạch hạn
        // mức ấy, và cửa sổ xem trước phải xếp hàng phía sau (xem `.ai/error.md`,
        // mục "NGHI PHẠM PHỤ" ngày 04/09/2026).
        //
        // Với tệp lớn thì cái giá đó không đổi lại được gì: tới được đây nghĩa là
        // tầng 2 vừa thất bại khi đọc chính tệp đó, nên thẻ `<video>` cũng sẽ thất
        // bại y hệt — chỉ khác là thất bại 50 lần song song. Icon là câu trả lời
        // đúng. Video nhỏ giữ nguyên đường lùi cũ.
        if (file.size && file.size > MAX_THUMBNAIL_SIZE) return null;
        return { thumbType: cat, thumbUrl: res.previewUrl };
    }

    // ── PDF: cũng ba tầng, nhưng không có tầng 3 ──────────────────
    //
    // Không có đường lùi nào rẻ cho PDF: `<embed>` một tệp 80MB vào một ô 384px thì
    // còn tệ hơn nhiều so với hiện một icon. Nên hỏng ở tầng 2 là icon.
    if (cat === 'pdf') {
        const variant = VARIANT_FOR[mini ? 'mini' : 'full'];
        if (file.thumbUrls) noteThumbnailPipelineEnabled();

        const fromCdn = await probeCdnThumbnail(file.thumbUrls?.[variant]);
        if (fromCdn) return { thumbType: 'image', thumbUrl: fromCdn };
        if (cdnOnly) return null;

        const res = await storageApi.getPreviewUrl(file.id);
        if (!res?.previewUrl) return null;

        try {
            const built = await buildVariantsFromPdfUrl(res.previewUrl);
            if (built?.dataUrls?.[variant]) {
                // Bản cũ dựng xong rồi VỨT ĐI — không đẩy lên R2, nên người tiếp theo
                // (và chính người này sau khi F5) lại render lại từ đầu.
                uploadThumbnails(file.id, built.blobs);
                return {
                    thumbType: 'image',
                    thumbUrl: built.dataUrls[variant],
                    extraVariants: siblingVariants(file.id, built.dataUrls, variant),
                };
            }
        } catch {
            // PDF hỏng, có mật khẩu, hoặc pdf.js không dựng nổi trang đầu.
        }

        return null;
    }

    // Biến thể 'mini' dừng ở đây: các loại còn lại cần parse nặng, chỉ đáng làm
    // cho thẻ lớn. `cdnOnly` cũng dừng ở đây: bảng tính, DOCX và text đều bắt buộc
    // phải tải nội dung về mới dựng được xem trước, mà đó đúng là thứ nó cấm.
    if (mini || cdnOnly) return null;

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
    const cdnUrl = file?.thumbUrls?.[VARIANT_FOR[mini ? 'mini' : 'full']] ?? null;
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

    // Nghe ô đệm của CHÍNH tệp này bị ghi từ bên ngoài (primer lúc upload xong).
    // Effect riêng, và KHÔNG có điều kiện thoát sớm nào: effect dựng ở dưới thoát
    // sớm ở ba chỗ (đã có trong L1 / ngoài khung nhìn / quá lớn), nên gắn kèm vào
    // đó là đúng những thẻ cần nghe nhất lại không nghe.
    useEffect(() => {
        if (!cacheKey) return;
        return subscribeThumbnail(cacheKey, () => {
            const fresh = readCache(cacheKey, fingerprint);
            if (fresh) setLoaded({ key: cacheKey, fingerprint, value: fresh });
        });
    }, [cacheKey, fingerprint]);

    useEffect(() => {
        if (!cacheKey) return;

        // Đã có trong L1 → render trên đã dùng, không cần làm gì thêm
        if (readCache(cacheKey, fingerprint)) return;

        // Ngoài khung nhìn → chưa làm gì cả. Đặt SAU lần đọc L1 là có ý: thẻ đã có
        // sẵn thành phẩm thì hiện ngay, không cần chờ observer báo.
        if (!enabled) return;

        // Tệp quá lớn: KHÔNG tải nguồn gốc về để thu nhỏ — đó là ý nghĩa của trần
        // này. Nhưng nếu bản thu nhỏ đã nằm sẵn trên CDN (người upload đã dựng nó
        // từ bản trong máy — xem `utils/thumbnailPrimer.js`) thì vẫn lấy: 20KB từ
        // biên không dính dáng gì tới lý do dựng cái trần. Không có `thumbUrls` thì
        // thôi hẳn, không gọi API, không hiện loading.
        //
        // Video và PDF KHÔNG bao giờ rơi vào nhánh này, kể cả tệp 2GB: chúng đọc
        // theo HTTP Range chứ không tải nguyên tệp — xem `RANGE_READ_CATEGORIES`.
        const tooLarge = needsFullDownload(file, cat);
        if (tooLarge && !file.thumbUrls) return;

        let isMounted = true;

        /** Chốt kết quả vào L1 + state. L2 do phía gọi tự quyết định có ghi không. */
        const settle = (value, ttl) => {
            writeCache(cacheKey, fingerprint, value, ttl);
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
                return loadThumbnail(file, cat, mini, { cdnOnly: tooLarge }).then((res) => {
                    // `extraVariants` là các biến thể ĐÃ dựng xong từ cùng một lần
                    // tải ảnh gốc — ghi chúng vào đệm ngay, để lần hỏi biến thể kia
                    // không phải tải lại tấm ảnh đó. Tách nó ra khỏi `value` vì nó
                    // là dữ liệu của ô đệm KHÁC, không phải thuộc tính của thumbnail
                    // đang hỏi.
                    const { extraVariants, ...rest } = res ?? {};
                    const value = res ? { ...EMPTY, ...rest } : EMPTY;

                    // `res` rỗng = không dựng được thumbnail lần này (API không trả
                    // về URL ảnh gốc chẳng hạn) — cùng loại với nhánh `catch`, nên
                    // cũng chỉ giữ theo TTL ngắn.
                    settle(value, res ? undefined : FAILURE_CACHE_TTL);
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
                // fallback về icon. Ghi thất bại vào L1 (TTL ngắn hơn ô thành công,
                // xem `FAILURE_CACHE_TTL`) để không gọi lại liên tục, nhưng KHÔNG ghi
                // xuống L2: một lần mất mạng không được phép thành một ô icon vĩnh viễn.
                settle(EMPTY, FAILURE_CACHE_TTL);
            });

        return () => {
            isMounted = false;
        };
        // `cdnUrl` là một chuỗi, không phải object: đưa nó vào đây thì lượt dựng
        // được chạy lại khi tệp CÓ thumbnail trên CDN mà trước đó chưa có, nhưng
        // không chạy lại chỉ vì danh sách vừa được tải lại và `file` là object mới.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, fingerprint, cat, mini, enabled, file?.size, cdnUrl]);

    return { ...resolved, category: cat };
}

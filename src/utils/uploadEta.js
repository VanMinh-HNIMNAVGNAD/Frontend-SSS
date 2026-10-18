/**
 * Ước tính tốc độ và thời gian còn lại của một đợt tải lên (##89).
 *
 * Đo TIẾN ĐỘ THẬT theo thời gian thật, không đo băng thông mạng: giá trị đưa vào là số byte
 * đợt tải đã đẩy xong (tệp xong tính trọn kích thước, tệp đang chạy tính phần đã gửi), nên
 * những quãng chờ backend giữa các tệp (xin URL, xác nhận theo lô) tự nằm trong tốc độ đo
 * được. Với thư mục vài trăm ảnh nhỏ — nơi phần lớn thời gian là chờ chứ không phải đẩy byte —
 * đo băng thông sẽ hứa "còn 3 giây" trong khi còn cả phút.
 *
 * Trung bình trượt theo THỜI GIAN (không theo số mẫu): mẫu đến không đều (tab ẩn, máy bận),
 * và một mẫu cách mẫu trước 5 giây phải nặng ký hơn một mẫu cách 50ms.
 */

/** Hằng thời gian của trung bình trượt. Ngắn hơn thì số nhảy theo từng tệp; dài hơn thì chậm nhận ra mạng vừa đổi. */
export const RATE_TAU_MS = 5000;

/** Chưa đủ chừng này dữ liệu thì chưa đoán — vài trăm ms đầu toàn là độ trễ khởi động. */
export const RATE_WARMUP_MS = 1500;

/** Không có byte nào đi lâu chừng này (trong khi vẫn còn tệp đang chạy) thì báo "đang chờ mạng". */
export const STALL_AFTER_MS = 8000;

/**
 * Bộ đo tốc độ của MỘT đại lượng tích luỹ (byte đã đẩy của cả đợt, hoặc của một tệp).
 *
 * `sample(value)` nhận TỔNG tích luỹ, không phải phần tăng thêm. Giá trị giảm (tệp quay về
 * đường proxy và gửi lại từ đầu, phiên chunked hết hạn) được coi là mốc mới chứ không phải
 * tốc độ âm: phần gửi lại là byte thật sự đi trên mạng.
 */
export function createRateMeter({ tauMs = RATE_TAU_MS, warmupMs = RATE_WARMUP_MS } = {}) {
  let startValue = null;
  let startAt = 0;
  let lastValue = 0;
  let lastAt = 0;
  let lastProgressAt = 0;
  let rate = null; // đơn vị / giây

  return {
    sample(value, now = Date.now()) {
      if (startValue === null) {
        startValue = value;
        startAt = now;
        lastValue = value;
        lastAt = now;
        lastProgressAt = now;
        return;
      }
      const dt = now - lastAt;
      if (dt <= 0) return;

      if (value < lastValue) {
        // Gửi lại từ đầu: dời mốc, giữ nguyên tốc độ đang có.
        startValue -= lastValue - value;
      } else if (value > lastValue) {
        lastProgressAt = now;
      }

      const elapsed = now - startAt;
      if (elapsed < tauMs) {
        // Giai đoạn đầu: trung bình cộng từ lúc bắt đầu. Lấy mẫu tức thời đầu tiên làm gốc
        // cho trung bình trượt thì cả 5 giây sau số liệu bị kéo theo một mẫu nhiễu.
        rate = (Math.max(0, value - startValue) * 1000) / elapsed;
      } else {
        const instant = (Math.max(0, value - lastValue) * 1000) / dt;
        const alpha = 1 - Math.exp(-dt / tauMs);
        rate = rate === null ? instant : rate + alpha * (instant - rate);
      }
      lastValue = value;
      lastAt = now;
    },

    /** Tốc độ (đơn vị/giây), hoặc `null` khi chưa đủ dữ liệu để nói. */
    rate(now = Date.now()) {
      if (rate === null || startValue === null || now - startAt < warmupMs) return null;
      return rate;
    },

    /** Đã lâu không có tiến độ nào (mạng rớt, server treo) — chỉ có nghĩa khi còn việc đang chạy. */
    isStalled(now = Date.now()) {
      return startValue !== null && now - lastProgressAt > STALL_AFTER_MS;
    },
  };
}

/**
 * Số giây còn lại, đã làm dịu để con số đếm lùi đều thay vì nhảy 35 → 41 → 33 mỗi giây.
 *
 * Giữ ước tính đang hiện và cho nó TỰ ĐẾM LÙI theo đồng hồ; chỉ nhảy sang ước tính mới khi
 * hai số lệch nhau quá `tolerance` (mạng đổi thật, hay thêm tệp vào đợt). Trong biên độ đó
 * thì kéo dần về ước tính mới, nên sai số không tích luỹ.
 */
export function createEtaSmoother({ tolerance = 0.25, pull = 0.15 } = {}) {
  let shown = null;
  let shownAt = 0;

  return {
    next(estimateSeconds, now = Date.now()) {
      if (!Number.isFinite(estimateSeconds) || estimateSeconds < 0) {
        shown = null;
        return null;
      }
      if (shown === null) {
        shown = estimateSeconds;
        shownAt = now;
        return shown;
      }
      const projected = Math.max(0, shown - (now - shownAt) / 1000);
      const gap = Math.abs(estimateSeconds - projected) / Math.max(projected, 5);
      shown = gap > tolerance ? estimateSeconds : projected + pull * (estimateSeconds - projected);
      shownAt = now;
      return shown;
    },
    reset() {
      shown = null;
    },
  };
}

/**
 * Thời lượng dạng người đọc, làm tròn THÔ có chủ ý: "còn 37 giây" hứa một độ chính xác không
 * ai có. Dưới 5 giây là "vài giây"; dưới một phút làm tròn lên bội 5 giây; dưới một giờ tính
 * theo phút; còn lại giờ + phút.
 *
 * @param {number} seconds
 * @param {(key: string, params?: object) => string} t
 */
export function formatDuration(seconds, t) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return t('upload.eta.fewSeconds');
  if (s < 60) return t('upload.eta.s', { n: Math.min(55, Math.ceil(s / 5) * 5) });
  if (s < 3600) return t('upload.eta.m', { n: Math.max(1, Math.round(s / 60)) });
  let h = Math.floor(s / 3600);
  let m = Math.round((s % 3600) / 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return m === 0 ? t('upload.eta.h', { n: h }) : t('upload.eta.hm', { h, m });
}

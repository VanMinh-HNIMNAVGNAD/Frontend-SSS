import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Phần tử này đã từng vào gần khung nhìn chưa?"
 *
 * Vì sao cần: chế độ Lưới render `pageSize = 50` thẻ, nhưng người dùng chỉ thấy
 * khoảng 12 thẻ cùng lúc. Trước đây cả 50 thẻ đều dựng thumbnail ngay khi mount —
 * tức 50 lượt xin URL và 50 lượt tải ảnh gốc, cho 12 ô người ta đang xem.
 *
 * `loading="lazy"` trên thẻ `<img>` KHÔNG giải được việc này: lúc trình duyệt xét
 * tới thuộc tính đó thì JavaScript đã tải ảnh về và dựng xong data URL rồi. Việc
 * hoãn phải xảy ra ở tầng gọi API, tức ở đây.
 *
 * ## Vì sao "đã TỪNG vào" chứ không phải "đang ở trong"
 *
 * Cờ này CHỈ BẬT MỘT LẦN rồi giữ nguyên. Nếu tắt lại khi cuộn qua thì cuộn lên
 * cuộn xuống sẽ liên tục tháo/dựng lại thumbnail — vừa nháy hình, vừa biến một
 * lần cuộn thành hàng chục lượt gọi. Đã trả tiền để dựng rồi thì giữ lấy.
 *
 * @param {object} [options]
 * @param {string} [options.rootMargin='300px'] Nạp trước khi thật sự lọt vào màn
 *        hình, để người dùng cuộn tới là ảnh đã có sẵn thay vì thấy ô trống.
 * @returns {[(node: Element|null) => void, boolean]} `[ref, hasBeenVisible]`
 */
export function useInViewport({ rootMargin = '300px' } = {}) {
  const [hasBeenVisible, setHasBeenVisible] = useState(() =>
    // Trình duyệt không có IntersectionObserver (WebView cũ) thì coi như mọi thứ
    // đều đang hiện: quay về đúng hành vi trước đây, chậm nhưng không sai.
    typeof IntersectionObserver === 'undefined',
  );

  const observerRef = useRef(null);
  const nodeRef = useRef(null);

  // Ref dạng callback, không phải object ref: nó nhận được cả lúc node bị gắn và
  // lúc bị tháo, nên không cần một effect riêng chỉ để bắt đầu quan sát.
  const setRef = useCallback(
    (node) => {
      if (observerRef.current && nodeRef.current) {
        observerRef.current.unobserve(nodeRef.current);
      }
      nodeRef.current = node;
      if (node && observerRef.current) observerRef.current.observe(node);
    },
    [],
  );

  useEffect(() => {
    if (hasBeenVisible || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasBeenVisible(true);
        }
      },
      { rootMargin },
    );
    observerRef.current = observer;
    if (nodeRef.current) observer.observe(nodeRef.current);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [hasBeenVisible, rootMargin]);

  return [setRef, hasBeenVisible];
}

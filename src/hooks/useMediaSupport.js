import { useCallback, useRef, useState } from 'react';

/**
 * Chẩn đoán khả năng phát của MỘT thẻ <video>/<audio> ngay trên máy người xem.
 *
 * Vì sao cần: hai lỗi người dùng báo — "video mất tiếng" (#8) và "trên Edge chỉ có
 * tiếng, không có hình" (#12) — KHÔNG phải lỗi của app. Tệp lên cloud nguyên vẹn,
 * backend đã trả đúng Content-Type (`resolvePreviewContentType` ở
 * `backend/src/storage/storage.service.ts`), presigned URL đúng. Chuyện xảy ra là
 * trình duyệt không có bộ giải mã cho MỘT trong hai luồng bên trong tệp:
 *
 *   • Tệp tải từ YouTube (yt-dlp và mọi web "tải nhạc") thường là VP9/AV1 + Opus.
 *     Opus đóng trong .mp4 bị phần lớn trình duyệt bỏ qua → còn hình, mất tiếng.
 *   • Phim .mkv/.mp4 rip thường có tiếng AC3/E-AC3/DTS — không trình duyệt nào
 *     giải mã (bản quyền codec) → còn hình, mất tiếng.
 *   • Ngược lại, AV1 hoặc HEVC/H.265 thì Edge/Chrome tuỳ máy mà không dựng nổi
 *     hình trong khi tiếng AAC vẫn chạy → còn tiếng, mất hình.
 *
 * Không có cách nào sửa việc này ở phía web mà không transcode tệp trên máy chủ
 * (ffmpeg — không chạy được trên dyno Heroku free với tệp hàng trăm MB). Nên thứ
 * đáng làm là NÓI ĐÚNG chuyện gì đang xảy ra thay vì để người dùng ngồi đoán, và
 * mời họ tải về mở bằng VLC.
 *
 * Cách phát hiện, mỗi thứ một cơ chế riêng vì trình duyệt không cho API thống nhất:
 *   • Mất hình  → `videoWidth === 0` sau `loadedmetadata`: có luồng hình nhưng
 *                 không dựng được khung nào thì kích thước vẫn là 0.
 *   • Mất tiếng → phải CHỜ phát thật một đoạn mới biết, và mỗi nhà một thuộc tính:
 *                 `mozHasAudio` (Firefox), `audioTracks` (Safari),
 *                 `webkitAudioDecodedByteCount` (Chrome/Edge — chỉ tăng khi thực sự
 *                 giải mã được, nên còn 0 sau khi đã phát là bằng chứng đủ chắc).
 *   • Chết hẳn  → `el.error.code`: 4 = không nhận nguồn, 3 = giải mã thất bại.
 *
 * Điểm phải nhớ khi đọc kết quả: 'no-audio-track' cũng đúng với một video vốn dĩ
 * im lặng (ảnh động, video quay không tiếng). Câu thông báo vì thế phải nói cả hai
 * khả năng, đừng khẳng định là lỗi.
 *
 * @param {{ kind: 'video' | 'audio', resetKey: any }} options
 *   `resetKey` — đổi giá trị là xoá kết luận cũ (truyền `item.id`).
 * @returns {{ mediaRef: object, diagnosis: string|null, handlers: object, reset: Function }}
 *   `diagnosis`: null | 'no-video-track' | 'no-audio-track' | 'decode-error' | 'src-unsupported'
 */

// Phải phát được ít nhất bấy nhiêu giây thì phép thử "có giải mã được tiếng không"
// mới có nghĩa. Thử sớm hơn là kết luận "mất tiếng" trong lúc bộ giải mã còn đang
// mồi đệm — báo động giả ngay giây đầu của mọi video.
const AUDIO_PROBE_AFTER_SECONDS = 0.6;

export default function useMediaSupport({ kind = 'video', resetKey = null } = {}) {
  const mediaRef = useRef(null);

  // Kết luận được LƯU KÈM tệp mà nó nói về, rồi khi đọc mới đối chiếu với `resetKey`
  // hiện tại. Cách này thay cho một useEffect chỉ để gọi setState(null) mỗi lần đổi
  // tệp — effect đó là một lượt render thừa, và trong khoảng giữa hai lượt render thì
  // cảnh báo của tệp CŨ vẫn còn treo trên tệp MỚI.
  const [finding, setFinding] = useState({ key: resetKey, diagnosis: null });
  const diagnosis = finding.key === resetKey ? finding.diagnosis : null;

  // Chỉ chẩn đoán tiếng MỘT lần cho mỗi tệp: `timeupdate` bắn 4 lần/giây suốt thời
  // gian phát, để nó set state mỗi lần là ép render lại cả cửa sổ xem trước liên tục.
  const audioProbedKeyRef = useRef(null);

  const setDiagnosis = useCallback(
    (code) => {
      // Kết luận ĐẦU TIÊN thắng: một tệp AV1 + Opus vừa mất hình vừa mất tiếng, đổi
      // nhãn giữa hai lỗi chỉ làm khối cảnh báo nhảy qua nhảy lại trước mắt người xem.
      setFinding((prev) =>
        prev.key === resetKey && prev.diagnosis ? prev : { key: resetKey, diagnosis: code },
      );
    },
    [resetKey],
  );

  const reset = useCallback(() => {
    audioProbedKeyRef.current = null;
    setFinding({ key: resetKey, diagnosis: null });
  }, [resetKey]);

  const onLoadedMetadata = useCallback(() => {
    const el = mediaRef.current;
    if (!el || kind !== 'video') return;

    // `videoHeight` cũng phải là 0: một số bản dựng báo width mà không báo height.
    if (el.videoWidth === 0 && el.videoHeight === 0) {
      setDiagnosis('no-video-track');
    }
  }, [kind, setDiagnosis]);

  const onTimeUpdate = useCallback(() => {
    const el = mediaRef.current;
    if (!el || audioProbedKeyRef.current === resetKey) return;
    if (el.currentTime < AUDIO_PROBE_AFTER_SECONDS) return;

    audioProbedKeyRef.current = resetKey;

    // Firefox — thuộc tính duy nhất trả lời thẳng câu hỏi.
    if (typeof el.mozHasAudio === 'boolean') {
      if (!el.mozHasAudio) setDiagnosis('no-audio-track');
      return;
    }

    // Safari (và Chrome nếu bật cờ) — danh sách luồng tiếng ĐÃ NHẬN DẠNG được.
    if (el.audioTracks && typeof el.audioTracks.length === 'number') {
      if (el.audioTracks.length === 0) setDiagnosis('no-audio-track');
      return;
    }

    // Chrome / Edge — đếm byte tiếng đã giải mã. Đây là phép thử ĐÚNG cho lỗi #8:
    // tệp có luồng Opus/AC3 nhưng không có bộ giải mã thì bộ đếm nằm ở 0 mãi.
    if (typeof el.webkitAudioDecodedByteCount === 'number') {
      if (el.webkitAudioDecodedByteCount === 0) {
        setDiagnosis('no-audio-track');
      }
    }
  }, [resetKey, setDiagnosis]);

  const onError = useCallback(() => {
    const el = mediaRef.current;
    const code = el?.error?.code;
    // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, 3 = MEDIA_ERR_DECODE. Hai mã còn lại (1 huỷ,
    // 2 mạng) là chuyện đường truyền, không phải codec — để nhánh lỗi chung của
    // cửa sổ xem trước xử lý, đừng báo sai thành lỗi định dạng.
    if (code === 4) setDiagnosis('src-unsupported');
    else if (code === 3) setDiagnosis('decode-error');
  }, [setDiagnosis]);

  return {
    mediaRef,
    diagnosis,
    reset,
    handlers: {
      onLoadedMetadata,
      onTimeUpdate,
      onError,
    },
  };
}

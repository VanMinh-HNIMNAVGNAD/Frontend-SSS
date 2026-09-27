import { useEffect, useState } from 'react';

/**
 * Phát một MP4 PHÂN MẢNH (fragmented MP4) bằng Media Source Extensions.
 *
 * Vì sao phải có: nhóm tệp này Chromium (Edge/Chrome, cả bản mobile) không phát
 * nổi qua thẻ `<video src>` thường. `moov` của chúng rỗng mục lục, mọi thông tin
 * mẫu nằm rải trong từng `moof`, mà tệp lại không khai `mehd`/`sidx` — nên trình
 * duyệt phải dựng chỉ mục trước khi phát được. Đo trên Edge 153 (27/09/2026): nó
 * đọc đầu từng `moof` bằng MỘT request `Range` nối tiếp cho mỗi mảnh, nên thời gian
 * chờ tỉ lệ với số mảnh × độ trễ mạng — video 8 phút mảnh 2s là ~240 request, hơn
 * 20 giây ở 1.6 MB/s + RTT 60ms. Firefox không lộ ra lỗi này vì demuxer của nó đọc
 * tới `moof` nào thì phát `moof` đó. Chi tiết trong `.ai/error.md` mục #13.
 *
 * Mà trớ trêu là fMP4 lại ĐÚNG là định dạng MSE sinh ra để nhận: nạp `ftyp`+`moov`
 * làm init segment rồi đổ tiếp byte của tệp vào `SourceBuffer` là phát gần như
 * tức thì, không cần chỉ mục nào.
 *
 * Điểm cốt lõi làm việc này khả thi mà không phải tự phân tích box ở client:
 * `SourceBuffer` của ISO-BMFF phân tích theo DÒNG, nên chỉ cần các khối byte
 * LIÊN TIẾP và ĐÚNG THỨ TỰ; nó tự ghép box bị cắt ngang giữa hai khối. Nghĩa là
 * cứ đọc `Range` từng 2MB rồi `appendBuffer` là đủ, không phải cắt đúng ranh giới
 * `moof`. Chỉ lúc TUA mới cần tìm ranh giới thật, vì lúc đó dòng byte bị đứt.
 *
 * Thất bại thì báo ra `failed` để khung xem trước lùi về `<video src>` thường
 * kèm cảnh báo — thà chậm còn hơn màn hình đen.
 *
 * @param {object}  options
 * @param {object}  options.videoRef   ref tới thẻ <video>
 * @param {string}  options.url        presigned URL của tệp
 * @param {object}  options.manifest   `{ initSegmentBytes, mimeCodecs, durationSeconds }` từ backend
 * @param {number}  options.totalBytes dung lượng tệp
 * @param {boolean} options.enabled    bật/tắt (bên gọi tự quyết định điều kiện)
 * @param {any}     options.resetKey   đổi giá trị là dựng lại từ đầu
 * @returns {{ failed: boolean }}
 */

/** Mỗi lượt đọc bấy nhiêu byte. 2MB ở 1.6 MB/s là khoảng một giây rưỡi mỗi request. */
const CHUNK_BYTES = 2 * 1024 * 1024;

/** Đệm trước đầu phát bấy nhiêu giây thì ngừng đọc, để không tải cả tệp về vô ích. */
const TARGET_AHEAD_SECONDS = 30;

/** Giữ lại bấy nhiêu giây phía sau đầu phát khi phải dọn đệm. */
const KEEP_BEHIND_SECONDS = 15;

/** Vượt ngưỡng này thì dọn phần đã xem — `SourceBuffer` có hạn bộ nhớ. */
const MAX_BUFFER_SECONDS = 120;

/** Cửa sổ đọc để tìm ranh giới `moof` khi tua. */
const RESYNC_WINDOW_BYTES = 4 * 1024 * 1024;

/** `moof` lớn hơn mức này thì chắc chắn là nhận dạng nhầm. */
const MAX_PLAUSIBLE_MOOF_BYTES = 8 * 1024 * 1024;

const canUseMse = () => typeof window !== 'undefined' && typeof window.MediaSource !== 'undefined';

/** `true` nếu trình duyệt nhận dựng luồng với đúng bộ codec này. */
export function supportsFragmentedMp4(mimeCodecs) {
  if (!canUseMse() || !mimeCodecs) return false;
  try {
    return window.MediaSource.isTypeSupported(mimeCodecs);
  } catch {
    return false;
  }
}

/** Chờ `SourceBuffer` xong việc — mọi thao tác đều phải xếp hàng sau nhau. */
function waitForIdle(sourceBuffer) {
  if (!sourceBuffer.updating) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      sourceBuffer.removeEventListener('updateend', done);
      sourceBuffer.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      sourceBuffer.removeEventListener('updateend', done);
      sourceBuffer.removeEventListener('error', fail);
      reject(new Error('SourceBuffer lỗi'));
    };
    sourceBuffer.addEventListener('updateend', done);
    sourceBuffer.addEventListener('error', fail);
  });
}

/** Số giây đã đệm TÍNH TỪ đầu phát trở đi. */
function bufferedAhead(video) {
  const at = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= at + 0.25 && video.buffered.end(i) >= at) {
      return video.buffered.end(i) - at;
    }
  }
  return 0;
}

function isTimeBuffered(video, time) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= time && video.buffered.end(i) > time + 0.1) return true;
  }
  return false;
}

/**
 * Vị trí `moof` đầu tiên kể từ `buf[0]`.
 *
 * Nhận dạng bằng bốn chữ `moof` cộng một kích thước hợp lý ở 4 byte ngay trước —
 * chỉ so chữ thôi thì trúng cả chuỗi `moof` nằm trong dữ liệu hình.
 */
function findMoofOffset(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 4; i + 8 <= buf.length; i++) {
    if (buf[i] !== 0x6d || buf[i + 1] !== 0x6f || buf[i + 2] !== 0x6f || buf[i + 3] !== 0x66) continue;
    const size = view.getUint32(i - 4);
    if (size >= 8 && size <= MAX_PLAUSIBLE_MOOF_BYTES) return i - 4;
  }
  return -1;
}

export default function useFragmentedMp4({
  videoRef,
  url,
  manifest,
  totalBytes,
  enabled,
  resetKey = null,
}) {
  // Thất bại LƯU KÈM tệp mà nó nói về, để đổi tệp là tự hết — cùng lối với
  // `useMediaSupport`, khỏi cần một effect chỉ để dọn state.
  const [failure, setFailure] = useState({ key: resetKey, failed: false });
  const failed = failure.key === resetKey && failure.failed;

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video || !url || !manifest || !totalBytes) return;
    // `failed` nằm trong deps nên effect chạy lại khi thất bại, và cửa này chặn
    // nó dựng lại — không thành vòng lặp vì `failed` chỉ đi một chiều false→true
    // trong đời một tệp, và đổi tệp thì `resetKey` đưa nó về false.
    if (failed) return;
    if (!supportsFragmentedMp4(manifest.mimeCodecs)) return;

    const { initSegmentBytes, mimeCodecs, durationSeconds } = manifest;

    let cancelled = false;
    let controller = new AbortController();

    const ms = new window.MediaSource();
    const src = URL.createObjectURL(ms);
    let sourceBuffer = null;

    const die = (reason) => {
      if (cancelled) return;
      console.warn('[fMP4] lùi về <video src> thường:', reason);
      setFailure({ key: resetKey, failed: true });
    };

    const fetchRange = async (start, end) => {
      const res = await fetch(url, {
        headers: { Range: `bytes=${start}-${end}` },
        signal: controller.signal,
      });
      // 206 là mong đợi; 200 nghĩa là server bỏ qua Range và trả cả tệp — nhận
      // thì sẽ append sai chỗ, nên coi là lỗi.
      if (res.status !== 206) throw new Error(`Range trả HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    };

    const append = async (bytes) => {
      await waitForIdle(sourceBuffer);
      if (cancelled) return;
      try {
        sourceBuffer.appendBuffer(bytes);
      } catch (err) {
        if (err?.name !== 'QuotaExceededError') throw err;
        // Hết chỗ: dọn phần đã xem rồi thử lại đúng một lần.
        await evict(true);
        await waitForIdle(sourceBuffer);
        if (cancelled) return;
        sourceBuffer.appendBuffer(bytes);
      }
      await waitForIdle(sourceBuffer);
    };

    const evict = async (aggressive = false) => {
      if (!sourceBuffer || sourceBuffer.buffered.length === 0) return;
      const keepFrom = Math.max(0, video.currentTime - (aggressive ? 2 : KEEP_BEHIND_SECONDS));
      const start = sourceBuffer.buffered.start(0);
      if (keepFrom <= start + 1) return;
      await waitForIdle(sourceBuffer);
      if (cancelled) return;
      sourceBuffer.remove(start, keepFrom);
      await waitForIdle(sourceBuffer);
    };

    /** Tổng số giây đang giữ trong đệm. */
    const bufferedSpan = () => {
      const b = sourceBuffer?.buffered;
      if (!b || b.length === 0) return 0;
      return b.end(b.length - 1) - b.start(0);
    };

    const sleep = (ms_) => new Promise((r) => setTimeout(r, ms_));

    /** Đọc tuần tự từ `cursor` tới hết tệp, tự ghìm theo mức đệm. */
    const pump = async (fromByte) => {
      let cursor = fromByte;

      while (!cancelled && cursor < totalBytes) {
        // Đã đệm đủ xa thì nghỉ — không tải cả tệp về khi người xem mới xem 2 phút.
        if (bufferedAhead(video) > TARGET_AHEAD_SECONDS) {
          if (bufferedSpan() > MAX_BUFFER_SECONDS) await evict();
          await sleep(500);
          continue;
        }

        const end = Math.min(cursor + CHUNK_BYTES, totalBytes) - 1;
        const bytes = await fetchRange(cursor, end);
        if (cancelled) return;
        await append(bytes);
        cursor = end + 1;
      }

      if (!cancelled && cursor >= totalBytes && ms.readyState === 'open') {
        try {
          ms.endOfStream();
        } catch {
          // Đóng luồng thất bại không ảnh hưởng phần đã phát được.
        }
      }
    };

    // Chỉ một vòng `pump` được chạy tại một thời điểm; tua thì huỷ vòng cũ.
    let pumpToken = 0;
    const startPump = (fromByte) => {
      const token = ++pumpToken;
      pump(fromByte).catch((err) => {
        if (cancelled || token !== pumpToken || err?.name === 'AbortError') return;
        die(err?.message || 'đọc dữ liệu thất bại');
      });
    };

    /**
     * Tua ra ngoài vùng đã đệm.
     *
     * Không có `sidx`/chỉ mục nào để tra byte theo thời gian, nên suy theo TỈ LỆ
     * rồi lùi về ranh giới `moof` gần nhất phía sau vị trí đoán. Mốc thời gian
     * thật nằm trong `tfdt` của chính mảnh đó, và MSE tự đặt dữ liệu vào đúng chỗ
     * trên trục thời gian — nên đoán lệch một chút thì đầu phát nhảy tới mảnh gần
     * đó chứ không sai tiếng sai hình.
     */
    const seekTo = async (time) => {
      if (!durationSeconds || !sourceBuffer) return;

      const ratio = Math.min(Math.max(time / durationSeconds, 0), 0.999);
      const mediaBytes = totalBytes - initSegmentBytes;
      const guess = initSegmentBytes + Math.floor(ratio * mediaBytes);
      const windowEnd = Math.min(guess + RESYNC_WINDOW_BYTES, totalBytes) - 1;

      const probe = await fetchRange(guess, windowEnd);
      const offset = findMoofOffset(probe);
      if (offset < 0) throw new Error('không tìm được ranh giới mảnh để tua');

      // Dòng byte bị đứt nên phải dọn sạch và nạp lại init segment: `SourceBuffer`
      // đang chờ phần tiếp của mảnh cũ, đổ mảnh mới vào giữa là nó nghẹn.
      await waitForIdle(sourceBuffer);
      if (cancelled) return;
      if (sourceBuffer.buffered.length > 0) {
        sourceBuffer.remove(sourceBuffer.buffered.start(0), sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1));
        await waitForIdle(sourceBuffer);
      }
      if (cancelled) return;

      await append(await fetchRange(0, initSegmentBytes - 1));
      startPump(guess + offset);
    };

    const onSeeking = () => {
      const target = video.currentTime;
      if (isTimeBuffered(video, target)) return;

      // Huỷ mọi request đang bay: chúng thuộc vị trí cũ, để chạy tiếp thì vừa
      // tốn băng thông vừa append sai thứ tự.
      pumpToken++;
      controller.abort();
      controller = new AbortController();

      seekTo(target).catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        die(err?.message || 'tua thất bại');
      });
    };

    const onSourceOpen = async () => {
      try {
        sourceBuffer = ms.addSourceBuffer(mimeCodecs);
        sourceBuffer.mode = 'segments';

        // Không suy ra được thời lượng thì khai vô hạn: vẫn phát được, chỉ là
        // thanh thời gian không có điểm cuối.
        ms.duration = durationSeconds ?? Infinity;

        await append(await fetchRange(0, initSegmentBytes - 1));
        if (cancelled) return;

        video.addEventListener('seeking', onSeeking);
        startPump(initSegmentBytes);
      } catch (err) {
        if (cancelled || err?.name === 'AbortError') return;
        die(err?.message || 'khởi tạo MSE thất bại');
      }
    };

    ms.addEventListener('sourceopen', onSourceOpen, { once: true });
    video.src = src;

    return () => {
      cancelled = true;
      pumpToken++;
      controller.abort();
      video.removeEventListener('seeking', onSeeking);
      try {
        if (ms.readyState === 'open') ms.endOfStream();
      } catch {
        // Đang dọn dẹp, lỗi ở đây không còn ý nghĩa gì.
      }
      URL.revokeObjectURL(src);
    };
  }, [enabled, url, manifest, totalBytes, resetKey, videoRef, failed]);

  return { failed };
}

import { searchPowRange } from './pow.js';

/**
 * Giải bài toán proof-of-work mà backend trả về trong lỗi `AUTH_2015_POW_REQUIRED`.
 *
 * Chia khoảng `0..max` cho nhiều Web Worker, mỗi worker một đoạn liền nhau. Số bí mật
 * nằm ngẫu nhiên đều trong khoảng, nên với k worker thời gian chờ trung bình giảm k lần.
 * Chuyện này quan trọng trên điện thoại, nơi mỗi nhân chậm hơn máy tính 3–4 lần nhưng
 * thường có 4–8 nhân.
 *
 * ĐƯỜNG LÙI: trình duyệt không tạo được worker (Safari < 15 không có module worker, CSP
 * chặn, WebView lạ) thì giải trên luồng chính, chia đoạn nhỏ và nhường nhịp giữa các đoạn
 * để trang không bị treo. Chậm hơn nhưng vẫn qua. Không giải được thì người dùng bị kẹt ở
 * đúng cái cửa mà cơ chế này sinh ra để mở.
 */

/** Không bật quá số này: thêm worker thì phải chia sẻ nhân với chính giao diện. */
const MAX_WORKERS = 4;
/** Trần thời gian cho cả bài. Bậc khó nhất trên máy yếu nhất cũng chỉ cỡ chục giây. */
const TIMEOUT_MS = 60_000;
/** Cỡ một đoạn khi giải trên luồng chính: ~30 ms trên điện thoại, đủ nhỏ để không giật. */
const MAIN_THREAD_CHUNK = 20_000;

export async function solvePow({ salt, hash, max }) {
  if (typeof Worker !== 'undefined') {
    try {
      return await solveWithWorkers(salt, hash, max);
    } catch (err) {
      console.warn('[pow] Không dùng được Web Worker, giải trên luồng chính:', err?.message);
    }
  }
  return solveOnMainThread(salt, hash, max);
}

function solveWithWorkers(salt, hash, max) {
  const cores = globalThis.navigator?.hardwareConcurrency || 2;
  const count = Math.max(1, Math.min(MAX_WORKERS, cores));
  const size = Math.ceil((max + 1) / count);

  return new Promise((resolve, reject) => {
    const workers = [];
    let exhausted = 0;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      workers.forEach((w) => w.terminate());
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('hết thời gian')), TIMEOUT_MS);

    for (let i = 0; i < count; i += 1) {
      const from = i * size;
      const to = Math.min(max, from + size - 1);
      let worker;
      try {
        worker = new Worker(new URL('../workers/pow.worker.js', import.meta.url), {
          type: 'module',
        });
      } catch (err) {
        finish(reject, err);
        return;
      }
      workers.push(worker);
      worker.onmessage = (event) => {
        if (event.data.n >= 0) {
          finish(resolve, event.data.n);
        } else {
          exhausted += 1;
          if (exhausted === count) finish(reject, new Error('không có đáp án trong khoảng'));
        }
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        finish(reject, new Error(event.message || 'worker lỗi'));
      };
      worker.postMessage({ salt, hash, from, to });
    }
  });
}

async function solveOnMainThread(salt, hash, max) {
  for (let from = 0; from <= max; from += MAIN_THREAD_CHUNK) {
    const n = searchPowRange(salt, hash, from, Math.min(max, from + MAIN_THREAD_CHUNK - 1));
    if (n >= 0) return n;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('pow: không có đáp án trong khoảng');
}

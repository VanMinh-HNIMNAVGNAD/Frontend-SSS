/**
 * Web Worker giải một ĐOẠN của bài toán proof-of-work (xem `utils/pow.js`).
 *
 * Chạy ngoài luồng chính để giao diện không đứng hình trong vài giây giải bài.
 * `utils/powSolver.js` bật nhiều worker cùng lúc, mỗi worker một đoạn `[from, to]`.
 */
import { searchPowRange } from '../utils/pow.js';

self.onmessage = (event) => {
  const { salt, hash, from, to } = event.data;
  self.postMessage({ n: searchPowRange(salt, hash, from, to) });
};

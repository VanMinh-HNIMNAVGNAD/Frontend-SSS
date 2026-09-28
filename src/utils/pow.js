/**
 * Giải bài toán proof-of-work (PoW) mà backend đưa ra khi mạng của người dùng đang quá tải
 * lượt gửi OTP / đăng nhập (xem `PowChallengeService` ở backend).
 *
 * Bài toán: backend giữ bí mật một số `n` trong khoảng `0..max` và chỉ công bố
 * `SHA-256(salt + n)`. Trình duyệt thử lần lượt 0, 1, 2… tới khi khớp. Trung bình mất
 * `max / 2` lần băm, và TỆ NHẤT cũng chỉ `max` lần. Chính cái trần này là lý do chọn kiểu
 * bài toán này thay vì "tìm hash có N số 0 ở đầu": kiểu kia đôi khi xui mà chạy lâu gấp
 * mấy lần trung bình, trên một chiếc điện thoại yếu thì thành chờ cả phút.
 *
 * SHA-256 tự viết thay vì `crypto.subtle.digest`: mỗi lượt `digest` là một Promise, và
 * cái giá của một triệu Promise lớn hơn cả cái giá của một triệu lần băm. Đầu vào luôn
 * ngắn (salt 24 ký tự + tối đa 9 chữ số) nên vừa trong MỘT khối 64 byte, và vòng lặp dưới
 * đây chỉ làm đúng một lần nén cho mỗi lần thử, không cấp phát gì.
 *
 * File thuần JS, không import gì của React/Vite: chạy được trong Web Worker, trên luồng
 * chính (đường lùi), và trong Node (test đối chiếu với `crypto` của backend).
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const H = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Int32Array(64);

/** Nén một khối: đọc 16 từ đầu của `W` (đã đệm sẵn), ghi 8 từ kết quả vào `out`. */
function compress(out) {
  for (let i = 16; i < 64; i += 1) {
    const w15 = W[i - 15];
    const w2 = W[i - 2];
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }

  let a = H[0];
  let b = H[1];
  let c = H[2];
  let d = H[3];
  let e = H[4];
  let f = H[5];
  let g = H[6];
  let h = H[7];
  for (let i = 0; i < 64; i += 1) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  out[0] = (H[0] + a) | 0;
  out[1] = (H[1] + b) | 0;
  out[2] = (H[2] + c) | 0;
  out[3] = (H[3] + d) | 0;
  out[4] = (H[4] + e) | 0;
  out[5] = (H[5] + f) | 0;
  out[6] = (H[6] + g) | 0;
  out[7] = (H[7] + h) | 0;
}

/** Ghi byte `code` vào vị trí `i` của khối (big-endian trong từng từ 32 bit). */
function putByte(i, code) {
  W[i >> 2] |= code << (24 - (i & 3) * 8);
}

/** Đệm khối cho một thông điệp dài `len` byte (≤ 55): byte 0x80 rồi độ dài tính bằng bit. */
function pad(len) {
  putByte(len, 0x80);
  W[15] = len * 8;
}

/** Dành cho test: SHA-256 dạng hex của một chuỗi ASCII ngắn (≤ 55 ký tự). */
export function sha256Hex(str) {
  if (str.length > 55) throw new Error('pow: đầu vào quá dài cho một khối SHA-256');
  W.fill(0, 0, 16);
  for (let i = 0; i < str.length; i += 1) putByte(i, str.charCodeAt(i));
  pad(str.length);
  const out = new Int32Array(8);
  compress(out);
  return Array.from(out, (w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
}

function parseHexWords(hex) {
  const words = new Int32Array(8);
  for (let i = 0; i < 8; i += 1) words[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16) | 0;
  return words;
}

/**
 * Thử các số trong `[from, to]`. Trả về số khớp, hoặc -1 nếu đoạn này không có.
 *
 * Nhận một ĐOẠN chứ không phải cả khoảng để đường lùi trên luồng chính chia nhỏ được việc
 * mà không đóng băng giao diện.
 */
export function searchPowRange(salt, hashHex, from, to) {
  const saltLen = salt.length;
  if (saltLen + String(to).length > 55) return -1;
  const target = parseHexWords(hashHex);
  const out = new Int32Array(8);

  // Phần salt không đổi giữa các lượt thử: dựng một lần, mỗi lượt chỉ chép lại 16 từ.
  W.fill(0, 0, 16);
  for (let i = 0; i < saltLen; i += 1) putByte(i, salt.charCodeAt(i));
  const saltBlock = W.slice(0, 16);
  const digits = new Uint8Array(10);

  for (let n = from; n <= to; n += 1) {
    // Chữ số thập phân của n, ghi thẳng vào khối — không dựng chuỗi `salt + n`.
    let count = 0;
    let x = n;
    do {
      digits[count] = 48 + (x % 10);
      count += 1;
      x = Math.floor(x / 10);
    } while (x > 0);

    W.set(saltBlock);
    for (let k = 0; k < count; k += 1) putByte(saltLen + k, digits[count - 1 - k]);
    pad(saltLen + count);
    compress(out);

    if (
      out[0] === target[0] &&
      out[1] === target[1] &&
      out[2] === target[2] &&
      out[3] === target[3] &&
      out[4] === target[4] &&
      out[5] === target[5] &&
      out[6] === target[6] &&
      out[7] === target[7]
    ) {
      return n;
    }
  }
  return -1;
}

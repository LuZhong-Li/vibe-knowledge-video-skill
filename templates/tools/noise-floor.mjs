// 噪声底量测（§6.9 判据）：汉宁窗逐帧频谱，186ms 帧、50% 重叠，取帧间中位数
// ---------------------------------------------------------------
// 为什么不用"整段 FFT 高通后算 RMS"：底噪的 40–80Hz 强音会在整段 FFT 里向高频泄漏，
// 把一条本来 −132dBFS 的干净音轨量成 −72dBFS（v7 排查时踩过）。加窗分帧后泄漏被压到 −130dB 以下。
// 用法: node noise-floor.mjs <文件> [<文件> ...]      # wav / mp3 / mp4 都行（走 ffmpeg 解码）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SR = 44100;
const N = 8192;
const HOP = N / 2;
const BANDS = [
  ['20–200Hz   ', 20, 200],
  ['200Hz–1kHz ', 200, 1000],
  ['1–4kHz     ', 1000, 4000],
  ['4–8kHz     ', 4000, 8000],
  ['8–16kHz    ', 8000, 16000],
  ['1–16kHz    ', 1000, 16000]
];
const LIMITS = { '1–4kHz     ': -95, '4–8kHz     ': -100, '8–16kHz    ': -100, '1–16kHz    ': -95 };
const DB = (v) => 20 * Math.log10(Math.max(Math.abs(v), 1e-12));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        const ur = re[a], ui = im[a];
        re[a] = ur + vr; im[a] = ui + vi;
        re[b] = ur - vr; im[b] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function read(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'],
    { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / 4);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readFloatLE(i * 4);      // 逐样本读，避免对齐/缓冲池陷阱
  return x;
}

function frames(x) {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));   // Hann
  const out = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= x.length; s += HOP) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float64Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    out.push(p);
  }
  return out;
}

const CAL = 20 * Math.log10(N / 4);      // 汉宁窗相干增益 0.5 → 幅度 A 的正弦 |X| = A·N/4
function bandLevels(ps, lo, hi) {
  const k0 = Math.ceil(lo * N / SR), k1 = Math.floor(hi * N / SR);
  const lv = [];
  for (const p of ps) {
    let s = 0;
    for (let k = k0; k < k1; k++) s += p[k];
    lv.push(10 * Math.log10(s / Math.max(1, k1 - k0) + 1e-30) - CAL);
  }
  lv.sort((a, b) => a - b);
  const q = (r) => lv[Math.min(lv.length - 1, Math.floor(r * lv.length))];
  return { p10: q(0.10), med: q(0.50), p90: q(0.90) };
}

let fail = 0;
for (const file of process.argv.slice(2)) {
  const x = read(file);
  let sum = 0; for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const ps = frames(x);
  console.log(`\n${file}`);
  console.log(`  时长 ${(x.length / SR).toFixed(3)}s ｜ 总 RMS ${DB(Math.sqrt(sum / x.length)).toFixed(2)} dBFS ｜ 帧数 ${ps.length}`);
  console.log('  频段            安静段P10 / 帧中位 / 密集段P90（dBFS）');
  for (const [name, lo, hi] of BANDS) {
    const r = bandLevels(ps, lo, hi);
    const lim = LIMITS[name];
    const verdict = lim === undefined ? '' : (r.med <= lim ? `  ✅ ≤${lim}` : `  ❌ 高于 ${lim}`);
    if (lim !== undefined && r.med > lim) fail++;
    console.log(`  ${name}  ${r.p10.toFixed(2).padStart(9)} / ${r.med.toFixed(2).padStart(9)} / ${r.p90.toFixed(2).padStart(9)}${verdict}`);
  }
}
if (process.argv.length > 2) {
  console.log(fail ? `\n❌ ${fail} 个频段未过 §6.9 阈值` : '\n✅ §6.9 噪检通过（1–4kHz ≤ −95dBFS，4–8kHz ≤ −100dBFS）');
  process.exitCode = fail ? 1 : 0;
}

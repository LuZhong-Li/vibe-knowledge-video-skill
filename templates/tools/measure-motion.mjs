// 动帧占比 · 两套口径同测（同一部片子，同一段解码）
//   样片口径：scale 160x90 (flags=area) + 灰度，逐帧平均绝对差 > 0.012
//   本片口径：scale 320x180 + 灰度，逐帧平均绝对差 > 0.0015
// 用法: node measure-motion.mjs <mp4 或 --seq <帧目录>> [--fps 30]
//   ffmpeg 走 PATH，可用环境变量 FFMPEG 覆盖
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const fi = process.argv.indexOf('--fps');
const FPS = fi >= 0 ? parseFloat(process.argv[fi + 1]) : 30;
const seqIdx = process.argv.indexOf('--seq');
const seqDir = seqIdx >= 0 ? path.resolve(process.argv[seqIdx + 1]) : null;
const file = path.resolve(process.argv[2] || 'qa/v21/成片-v21.mp4');
if (seqDir ? !fs.existsSync(seqDir) : !fs.existsSync(file)) throw new Error('not found: ' + (seqDir || file));
/* 帧序列（未压缩的 PNG/JPG）与成片（H.264）必须分开测：
   编码器会把近黑背景里的极小区间差量化掉，两份数据的动帧数不可互换 */
const INPUT = seqDir ? ['-framerate', '30', '-i', path.join(seqDir, 'f%05d.jpg')] : ['-i', file];
const TAG = seqDir ? '帧序列 ' + path.basename(seqDir) : '成片 ' + path.basename(file);

function raw(W, H) {
  const tmp = path.join(os.tmpdir(), 'mm-' + W + '-' + Date.now() + '.raw');
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...INPUT,
    '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', tmp]);
  const buf = fs.readFileSync(tmp);
  fs.unlinkSync(tmp);
  return buf;
}

function ratios(W, H, thr) {
  const buf = raw(W, H), px = W * H;
  const n = Math.floor(buf.length / px);
  const diffs = new Float64Array(n);
  let prev = null, over = 0;
  for (let f = 0; f < n; f++) {
    const cur = buf.subarray(f * px, f * px + px);
    if (prev) {
      let s = 0;
      for (let p = 0; p < px; p++) s += Math.abs(cur[p] - prev[p]);
      const d = s / px / 255;
      diffs[f] = d;
      if (d > thr) over++;
    }
    prev = cur;
  }
  const sorted = Array.from(diffs).slice(1).sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(4);
  const top = Array.from(diffs).map((d, i) => ({ t: +(i / FPS).toFixed(2), d }))
    .sort((a, b) => b.d - a.d).slice(0, 6)
    .map((o) => o.t + 's=' + o.d.toFixed(4)).join('  ');
  return { W, H, thr, n, over, ratio: +(over / n * 100).toFixed(2),
           max: pick(1) , p99: pick(0.99), p95: pick(0.95), median: pick(0.5), top };
}

for (const [W, H, thr, tag] of [[160, 90, 0.012, '样片口径'], [320, 180, 0.0015, '本片口径']]) {
  const r = ratios(W, H, thr);
  console.log(`[${TAG}] [${tag}] scale ${r.W}x${r.H}  阈值 >${r.thr}  帧 ${r.n}`);
  console.log(`  动帧 ${r.over} 帧 → 占比 ${r.ratio}%`);
  console.log(`  差值分布  max ${r.max} ｜ p99 ${r.p99} ｜ p95 ${r.p95} ｜ 中位 ${r.median}`);
  console.log(`  差值最高 6 帧：${r.top}`);
}

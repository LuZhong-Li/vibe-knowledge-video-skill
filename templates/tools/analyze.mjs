// 像素体检：把静帧缩放成灰度图，统计亮度分布，确认没有黑帧/整片过曝、文字确实可见
// 用法: node analyze.mjs <图片目录>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = path.resolve(process.argv[2] || '../qa');
const W = 135, H = 240;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();

for (const f of files) {
  const raw = execFileSync('ffmpeg', [
    '-v', 'error', '-i', path.join(dir, f),
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'
  ], { maxBuffer: 1 << 26 });

  let sum = 0, ink = 0, max = 0;
  const bands = [0, 0, 0, 0, 0];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = raw[y * W + x];
      sum += v; if (v > 90) ink++;
      if (v > max) max = v;
      bands[Math.min(4, Math.floor(y / (H / 5)))] += v;
    }
  }
  const mean = sum / (W * H);
  const inkPct = (ink / (W * H) * 100).toFixed(2);
  const b = bands.map((s) => (s / (W * (H / 5))).toFixed(1)).join(' / ');
  console.log(`${f.padEnd(10)} 平均亮度=${mean.toFixed(1).padStart(5)} 最亮=${String(max).padStart(3)} 文字像素占比=${inkPct.padStart(5)}%  五分带亮度(B1..B5)= ${b}`);
}

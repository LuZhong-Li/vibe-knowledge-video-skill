// 缺字/丢填充检测：把一片文字的盒横向切成 N 条带，逐带算"墨量"（亮度超阈值的像素占比）。
// 用途：金属字是 background-clip:text —— 盒外没有渐变可裁，末字会整块丢填充；
//       这种"缺字"在字符带墨量上会体现为某一带显著低于中位数。
// 用法: node tools/ink-bands.mjs <图片> <x0,y0,x1,y1> <条带数=字数> [--thr 0.10]
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const file = path.resolve(process.argv[2] || '');
const box = (process.argv[3] || '').split(',').map(Number);
const n = parseInt(process.argv[4] || '5', 10);
const ti = process.argv.indexOf('--thr');
const thr = ti >= 0 ? parseFloat(process.argv[ti + 1]) : 0.10;
if (box.length !== 4 || box.some(function(v){ return !isFinite(v); })) throw new Error('box 用法: x0,y0,x1,y1');

const b = await launch({ width: 900, height: 700, extraArgs: ['--allow-file-access-from-files'] });
try {
  await b.goto(fileUrl(file), { settleFrames: 3 });
  const out = await b.page.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const img = new Image(); img.src = ${JSON.stringify(fileUrl(file))}; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const [x0, y0, x1, y1] = ${JSON.stringify(box)};
    const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const W = x1 - x0, H = y1 - y0;
    const LUT = (function(){ const t = new Float64Array(256);
      for (let v = 0; v < 256; v++){ const q = v / 255;
        t[v] = q <= 0.04045 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4); } return t; })();
    const bands = [];
    for (let k = 0; k < ${n}; k++) {
      const bx0 = Math.floor(W * k / ${n}), bx1 = Math.floor(W * (k + 1) / ${n});
      let ink = 0, tot = 0, peak = 0;
      for (let y = 0; y < H; y++) for (let x = bx0; x < bx1; x++) {
        const i = (y * W + x) * 4;
        const Y = 0.2126 * LUT[d[i]] + 0.7152 * LUT[d[i + 1]] + 0.0722 * LUT[d[i + 2]];
        tot++; if (Y > ${thr}) ink++;
        if (Y > peak) peak = Y;
      }
      bands.push({ k: k, ink: +(ink / tot).toFixed(4), peak: +peak.toFixed(3) });
    }
    return { bands, W, H };
  })()` });
  const { bands, W, H } = out.result.value;
  const med = bands.map(function(b2){ return b2.ink; }).sort(function(a, b2){ return a - b2; })[Math.floor(n / 2)];
  console.log(`# ${path.basename(file)}  盒 ${box.join(',')}  ${W}×${H}  阈值 Y>${thr}  条带 ${n}`);
  bands.forEach(function(b2){
    const rel = med > 0 ? b2.ink / med : 0;
    console.log(`  带 ${b2.k + 1}  墨量 ${(b2.ink * 100).toFixed(2)}%  峰值 ${b2.peak}` +
                `  相对中位 ${(rel * 100).toFixed(0)}%  ${rel < 0.5 ? '❌ 疑似丢填充' : '✅'}`);
  });
  const weak = bands.filter(function(b2){ return med > 0 && b2.ink / med < 0.5; });
  console.log(weak.length ? `❌ ${weak.length} 条带墨量不足中位的一半` : '✅ 各带墨量均匀（没有整字丢填充）');
} finally {
  await b.close();
}

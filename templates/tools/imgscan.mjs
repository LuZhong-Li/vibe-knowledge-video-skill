// 把一张图缩成字符图打印出来（终端里「看」版面 / 找元素位置用；无 npm 依赖）
// 用法: node imgscan.mjs <图片> [列数=100] [模式=lum|gold|white]
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const file = path.resolve(process.argv[2]);
const cols = parseInt(process.argv[3] || '100', 10);
const mode = process.argv[4] || 'lum';
const portIdx = process.argv.indexOf('--port');
const port = portIdx >= 0 ? parseInt(process.argv[portIdx + 1], 10) : 9346;
const cropIdx = process.argv.indexOf('--crop');
const crop = cropIdx >= 0 ? process.argv[cropIdx + 1].split(',').map(Number) : null;
if (!fs.existsSync(file)) throw new Error('找不到图片: ' + file);

const b = await launch({ width: 900, height: 700, port, extraArgs: ['--allow-file-access-from-files'] });
try {
  await b.goto(fileUrl(file), { settleFrames: 3 });
  const out = await b.page.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(fileUrl(file))};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    let d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    if (${JSON.stringify(crop)}) {
      const [cx0, cy0, cw, ch] = ${JSON.stringify(crop)};
      d = g.getImageData(cx0, cy0, cw, ch).data; W = cw; H = ch;
    }
    const COLS = ${cols}, ROWS = Math.max(8, Math.round(COLS * c.height / c.width * 0.5));
    const cellW = W / COLS, cellH = H / ROWS;
    const grid = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let q = 0; q < COLS; q++) {
        let sum = 0, n = 0, gold = 0;
        const x0 = Math.floor(q * cellW), x1 = Math.min(W, Math.ceil((q + 1) * cellW));
        const y0 = Math.floor(r * cellH), y1 = Math.min(H, Math.ceil((r + 1) * cellH));
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * W + x) * 4;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          sum += (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255; n++;
          if (R - B > 22 && R > 90) gold++;
        }
        row.push({ lum: sum / Math.max(1, n), gold: gold / Math.max(1, n) });
      }
      grid.push(row);
    }
    return { w: W, h: H, rows: ROWS, grid };
  })()` });
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || 'eval failed');
  const { grid, w, h } = out.result.value;
  const lumRamp = ' .:-=+*#%@';
  const goldRamp = ' .:-=+*#%@';
  console.log(`# ${path.basename(file)}  ${w}×${h}  mode=${mode}`);
  const hi = grid.flat().reduce((m, c) => Math.max(m, mode === 'gold' ? c.gold : c.lum), 0);
  console.log(`# 峰值: ${hi.toFixed(3)}`);
  for (const row of grid) {
    console.log('|' + row.map((c) => {
      const v = Math.max(0, Math.min(1, (mode === 'gold' ? c.gold : c.lum) / Math.max(0.0001, hi)));
      return lumRamp[Math.round(v * (goldRamp.length - 1))];
    }).join('') + '|');
  }
} finally {
  await b.close();
}

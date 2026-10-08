// 逐帧渲染：把 HTML 按固定帧率导出成一串图片，交给 ffmpeg 合成视频
// 用法: node render.mjs --html <路径> --out <帧目录> --fps 30 [--start 0 --end 150 --limit 60]
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const htmlPath = path.resolve(arg('html', '../control-illusion.html'));
const outDir = path.resolve(arg('out', '../frames'));
const fps = parseFloat(arg('fps', '30'));
const start = parseFloat(arg('start', '0'));
const end = parseFloat(arg('end', '150'));
const limit = parseInt(arg('limit', '0'), 10);
const shard = parseInt(arg('shard', '0'), 10);
const shards = parseInt(arg('shards', '1'), 10);   // 分片并行：每片只渲染 gi % shards == shard 的帧

fs.mkdirSync(outDir, { recursive: true });
const totalFrames = Math.round((end - start) * fps);
const n = limit > 0 ? Math.min(limit, totalFrames) : totalFrames;

const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9333 + shard });
const t0 = Date.now();
let written = 0, skipped = 0;

try {
  await b.goto(fileUrl(htmlPath) + '?t=0&autoplay=0', { settleFrames: 6 });

  for (let i = shard; i < n; i += shards) {
    const t = start + i / fps;
    const file = path.join(outDir, 'f' + String(i).padStart(5, '0') + '.jpg');
    if (fs.existsSync(file)) { skipped++; continue; }
    await b.page.send('Runtime.evaluate', { expression: `window.__seek(${t.toFixed(4)})` });
    const res = await b.page.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 94, captureBeyondViewport: false
    });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    written++;

    if (written % 100 === 0) {
      const el = (Date.now() - t0) / 1000;
      const mine = Math.ceil((n - shard) / shards);
      const rate = written / el;
      const eta = (mine - written) / Math.max(rate, 0.01);
      console.log(
        `[片${shard}] 已渲染 ${written}/${mine}  t=${t.toFixed(2)}s  ` +
        `速度 ${rate.toFixed(1)} 帧/秒  剩余约 ${(eta / 60).toFixed(1)} 分钟`
      );
    }
  }
  console.log(`[片${shard}] 完成：新写入 ${written} 帧，跳过 ${skipped} 帧，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} finally {
  await b.close();
}

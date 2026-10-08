// 用法: node shots.mjs <html路径> <输出目录> <秒,秒,秒...>
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || 'control-illusion.html');
const outDir = path.resolve(process.argv[3] || 'qa');
const times = (process.argv[4] || '2,12,20,40,50,70,85,110,120,140,148').split(',').map(Number);
const extraQuery = process.argv[5] ? '&' + process.argv[5] : '';

fs.mkdirSync(outDir, { recursive: true });
const base = fileUrl(htmlPath);
const b = await launch({ width: 1920, height: 1080 });

try {
  for (const t of times) {
    await b.goto(`${base}?t=${t}${extraQuery}`, { settleFrames: 4 });
    const file = path.join(outDir, `t${String(t).padStart(3, '0')}.png`);
    await b.shot(file);
    const kb = (fs.statSync(file).size / 1024).toFixed(0);
    console.log(`t=${t}s -> ${path.basename(file)} (${kb} KB)`);
  }
} finally {
  await b.close();
}

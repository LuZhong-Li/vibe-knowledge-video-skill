// 七屏静帧：每屏取「文字全部出场后、开始淡出前」的那一刻（与 film-check.mjs 同一口径），
// 导出 成片-S1..S7.jpg；再用 ffmpeg 拼一张 4×2 的七屏总览。
// 用法: node film-stills.mjs <html路径> <输出目录>
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const outDir = path.resolve(process.argv[3] || '../qa/v2/v7');
fs.mkdirSync(outDir, { recursive: true });

const b = await launch({ width: 1920, height: 1080, port: 9900 + Math.floor(Math.random() * 90) });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  /* 与 film-check.mjs 完全同一条探测口径：probe = min(t1-1.3, 最后一片出场 +1.05) */
  const probes = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var P = window.__pieces(), S = window.__screens(), out = [];
      for (var i = 0; i < S.length; i++) {
        var ps = P.filter(function(p){ return p.s === i; });
        var last = Math.max.apply(null, ps.map(function(p){ return p.start; }));
        out.push(+Math.min(S[i].t1 - 1.3, last + 1.05).toFixed(2));
      }
      return out;
    })())`, returnByValue: true
  })).result.value);

  for (let i = 0; i < probes.length; i++) {
    await b.page.send('Runtime.evaluate', { expression: `window.__seek(${probes[i]})` });
    const res = await b.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
    const file = path.join(outDir, `成片-S${i + 1}.jpg`);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    console.log(`S${i + 1}  t=${probes[i]}s  → ${path.basename(file)}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
} finally { await b.close(); }

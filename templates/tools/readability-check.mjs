// 文字可读性体检：逐片算「文字与底色的最差分帧对比度」——量"图形高光/扫光扫过文字的瞬间，字还认不认得出"
// 口径：取该片所在盒内**线性化相对亮度**的分位 p97（文字笔画）与 p50（底色），
//       对比度比 = (Y97 + 0.05) / (Y50 + 0.05)（WCAG 式，Y 为 0..1），
//       并给出该片在其可见时段内的**最小**对比度与发生时刻（= 最差可读帧）。
//       p97 而不是 p90：中文细笔画只占文字盒像素的 3–6%，p90 会落在底色上。
// 用法: node tools/readability-check.mjs <html> <帧目录> [--stride 2] [--fps 30] [--md 输出.md]
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const htmlPath = path.resolve(process.argv[2] || 'survivorship-bias.html');
const framesDir = path.resolve(process.argv[3] || 'qa/v21/f');
const stride = parseInt(arg('stride', '2'), 10);
const mdOut = arg('md', '');
const FPS = parseFloat(arg('fps', '30'));

const b = await launch({ width: 1920, height: 1080, extraArgs: ['--allow-file-access-from-files'] });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0&autoplay=0', { settleFrames: 6 });
  const screens = JSON.parse((await b.page.send('Runtime.evaluate', {
    returnByValue: true, expression: 'JSON.stringify(window.__screens())'
  })).result.value);
  /* 画布尺寸一律从 __canvas() 读（模板 §7.4：体检脚本里不得写死画布） */
  const CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    returnByValue: true, expression: 'JSON.stringify(window.__canvas())'
  })).result.value);
  const pieces = JSON.parse((await b.page.send('Runtime.evaluate', {
    returnByValue: true, expression: 'JSON.stringify(window.__pieces())'
  })).result.value);

  /* 一次性收集每片的实测盒（位置与可见性无关，取每屏中点测得，再留 18px 余量覆盖漂浮位移） */
  const boxes = {};
  for (let si = 0; si < screens.length; si++) {
    const mid = (screens[si].t0 + screens[si].t1) / 2;
    await b.page.send('Runtime.evaluate', { expression: 'window.__seek(' + mid.toFixed(3) + ')' });
    const rects = JSON.parse((await b.page.send('Runtime.evaluate', { returnByValue: true,
      expression: `JSON.stringify([].map.call(document.querySelectorAll('.piece'), function(e){
        var r = e.getBoundingClientRect();
        return { i:+e.getAttribute('data-index'), s:+e.getAttribute('data-screen'),
                 x:r.left, y:r.top, w:r.width, h:r.height };
      }))` })).result.value);
    rects.forEach(function(r){ if (r.s === si) boxes[r.i] = r; });
  }

  const PAD = 4;
  const jobs = [];
  pieces.forEach(function(p, i){
    const bx = boxes[i];
    if (!bx || !bx.w || !bx.h) return;
    if (!p.t || !p.t.trim()) return;
    const sc = screens[p.s] || { t1: 0 };
    /* 只测「阅读阶段」：跳过入场淡入（非附着 0.85s / 附着 0.20s）与换屏前的屏尾淡出 1.0s。
       入场半透明帧不是可读性问题，把 min 反而会永远落在淡入的头两帧上。 */
    const fadeDur = p.attach ? 0.20 : 0.85;
    const start = p.start + fadeDur + 0.15;
    const end = Math.max(start + 0.4, sc.t1 - 1.0);
    if (end <= start + 0.25) return;
    jobs.push({ i:i, s:p.s, lv:p.lv, text:p.t, metal:!!p.metal, start:start, end:end,
                x0:Math.max(0, Math.floor(bx.x - PAD)), y0:Math.max(0, Math.floor(bx.y - PAD)),
                x1:Math.min(CV.w - 1, Math.ceil(bx.x + bx.w + PAD)),
                y1:Math.min(CV.h - 1, Math.ceil(bx.y + bx.h + PAD)),
                minRatio: Infinity, minDy: Infinity, at:null });
  });

  const nFrames = fs.readdirSync(framesDir).filter(function(f){ return /^f\d+\.jpg$/.test(f); }).length;
  await b.page.send('Runtime.evaluate', { expression:
    'window.__mkcanvas = function(){ var c=document.createElement("canvas");' +
    ' c.width=' + CV.w + '; c.height=' + CV.h + ';' +
    ' var g=c.getContext("2d",{willReadFrequently:true}); window.__c=c; window.__g=g; return 1; }' });
  await b.page.send('Runtime.evaluate', { expression: 'window.__mkcanvas()' });

  for (let f = 0; f < nFrames; f += stride) {
    const t = f / FPS;
    const active = jobs.filter(function(j){ return t >= j.start && t <= j.end; });
    if (!active.length) continue;
    const file = fileUrl(path.join(framesDir, 'f' + String(f).padStart(5, '0') + '.jpg'));
    const res = await b.page.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true,
      expression: `(async () => {
        if (!window.__img) window.__img = new Image();
        window.__img.src = ${JSON.stringify(file)};
        await window.__img.decode();
        window.__g.drawImage(window.__img, 0, 0);
        return 1;
      })()` });
    if (!res || res.exceptionDetails) throw new Error('decode failed at frame ' + f);
    for (const j of active) {
      const q = JSON.parse((await b.page.send('Runtime.evaluate', { returnByValue: true,
        expression: `JSON.stringify((function(){
          var d = window.__g.getImageData(${j.x0}, ${j.y0}, ${j.x1 - j.x0}, ${j.y1 - j.y0}).data;
          var LUT = window.__lut || (window.__lut = (function(){
            var t = new Float64Array(256);
            for (var v = 0; v < 256; v++){ var c = v / 255;
              t[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
            return t;
          })());
          var lum = [];
          for (var k = 0; k < d.length; k += 4){
            lum.push(0.2126*LUT[d[k]] + 0.7152*LUT[d[k+1]] + 0.0722*LUT[d[k+2]]);
          }
          lum.sort(function(a,b){ return a-b; });
          var p50 = lum[Math.floor(lum.length*0.50)], p97 = lum[Math.min(lum.length-1, Math.floor(lum.length*0.97))];
          return { p10:p50, p90:p97, ratio:(p97+0.05)/(p50+0.05) };
        })())` })).result.value);
      if (q.ratio < j.minRatio) { j.minRatio = q.ratio; j.minDy = q.p90 - q.p10; j.at = +t.toFixed(2); }
    }
    if (f % (stride * 100) === 0) console.log(`  … ${f}/${nFrames} 帧`);
  }

  const rows = jobs.map(function(j){
    return { s:j.s + 1, lv:j.lv || '-', text:j.text.slice(0, 14), start:j.start,
             ratio:+j.minRatio.toFixed(2), dy:+(j.minDy * 255).toFixed(1), at:j.at };
  }).sort(function(a, b2){ return a.ratio - b2.ratio; });

  const bad = rows.filter(function(r){ return r.ratio < 3.0; });
  const warn = rows.filter(function(r){ return r.ratio >= 3.0 && r.ratio < 4.5; });
  console.log(`【${path.basename(htmlPath)}】帧目录 ${path.basename(framesDir)}  stride=${stride}  片数 ${rows.length}`);
  console.log(`对比度（线性亮度：文字笔画 p97 / 底色 p50，越差越小）：<3.0 有 ${bad.length} 片 ｜ 3.0–4.5 有 ${warn.length} 片`);
  console.log('\n最差的 12 片：');
  rows.slice(0, 12).forEach(function(r){
    console.log(`  S${r.s} ${String(r.lv).padEnd(3)} ${String(r.ratio).padStart(6)}  ΔY ${String(r.dy).padStart(5)}  ` +
                `最差帧 ${String(r.at).padStart(6)}s  ${r.text}`);
  });
  const mean = rows.reduce(function(a, r){ return a + r.ratio; }, 0) / Math.max(1, rows.length);
  const med = rows[Math.floor(rows.length / 2)];
  console.log(`\n中位对比度 ${med.ratio} ｜ 均值 ${mean.toFixed(2)}`);
  if (mdOut) {
    const lines = ['# 文字可读性体检 · 最差分帧对比度', '',
      '> 口径：片盒内**线性化相对亮度** p97（文字笔画）/ p50（底色），对比度比 = (Y97+0.05)/(Y50+0.05)，取该片可见时段内的最小值（WCAG 式）。',
      '> 生成：`node tools/readability-check.mjs survivorship-bias.html ' + path.relative(process.cwd(), framesDir).replace(/\\/g, '/') + ' --md ' + mdOut + '`', '',
      '| 幕 | 层级 | 最差对比度 | ΔY | 最差帧 | 文案 |', '| --- | --- | --- | --- | --- | --- |'];
    rows.forEach(function(r){
      lines.push(`| S${r.s} | ${r.lv} | ${r.ratio} | ${r.dy} | ${r.at}s | ${r.text} |`);
    });
    fs.writeFileSync(path.resolve(mdOut), lines.join('\n') + '\n');
    console.log('写入 → ' + path.resolve(mdOut));
  }
} finally {
  await b.close();
}

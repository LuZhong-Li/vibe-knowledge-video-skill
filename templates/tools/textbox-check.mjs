// 文字盒体检：找「文字被容器裁掉 / 换行 / 超出安全框」的片
// 判据（DOM 级，可复现）：
//   ① 内容溢出容器：scrollWidth > clientWidth + 1 或 scrollHeight > clientHeight + 1
//      —— background-clip:text 的金属字在溢出区没有 background 可裁，会直接"缺笔/被切"
//   ② 换行：片内行数 > 1（非竖排、非显式多行的片不允许）
//   ③ 越界：盒（含溢出量）超出安全框 x96–1824 / y54–1026
// 用法: node tools/textbox-check.mjs <html>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || 'survivorship-bias.html');
const b = await launch({ width: 1920, height: 1080 });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0&autoplay=0', { settleFrames: 6 });
  const screens = JSON.parse((await b.page.send('Runtime.evaluate', {
    returnByValue: true, expression: 'JSON.stringify(window.__screens())'
  })).result.value);
  const cv = JSON.parse((await b.page.send('Runtime.evaluate', {
    returnByValue: true, expression: 'JSON.stringify(window.__canvas())'
  })).result.value);
  const SAFE = cv.safe;

  const rows = [];
  for (let si = 0; si < screens.length; si++) {
    const mid = Math.min(screens[si].t1 - 0.5, Math.max(screens[si].t0 + 0.5,
      (screens[si].t0 + screens[si].t1) / 2));
    await b.page.send('Runtime.evaluate', { expression: 'window.__seek(' + mid.toFixed(3) + ')' });
    const list = JSON.parse((await b.page.send('Runtime.evaluate', { returnByValue: true,
      expression: `JSON.stringify([].map.call(document.querySelectorAll('.piece'), function(e){
        var r = e.getBoundingClientRect();
        var sc = e.querySelector('.sc');
        var rects = [];
        if (sc) [].forEach.call(sc.children, function(ch){
          var cr = ch.getBoundingClientRect();
          rects.push({ l:cr.left, r:cr.right, t:cr.top, b:cr.bottom });
        });
        var inkL = rects.length ? Math.min.apply(null, rects.map(function(q){return q.l;})) : r.left;
        var inkR = rects.length ? Math.max.apply(null, rects.map(function(q){return q.r;})) : r.right;
        var inkT = rects.length ? Math.min.apply(null, rects.map(function(q){return q.t;})) : r.top;
        var inkB = rects.length ? Math.max.apply(null, rects.map(function(q){return q.b;})) : r.bottom;
        return { i:+e.getAttribute('data-index'), s:+e.getAttribute('data-screen'),
                 lv:e.getAttribute('data-lv'), cls:e.className, text:(e.textContent||''),
                 left:r.left, top:r.top, right:r.right, bottom:r.bottom,
                 inkL:inkL, inkR:inkR, inkT:inkT, inkB:inkB,
                 cw:e.clientWidth, ch:e.clientHeight, sw:e.scrollWidth, sh:e.scrollHeight,
                 ow:e.offsetWidth, oh:e.offsetHeight };
      }))` })).result.value);
    list.filter(function(r2){ return r2.s === si; }).forEach(function(r2){ rows.push(r2); });
  }

  /* 安全框字段是 {left,right,top,bottom}（本片 __canvas() 的契约）——写成 .l/.r 会得到 undefined，
     越界判定会变成 NaN 比较恒 false（这个坑已在 2026-10-09 踩过一次，留注释防复发） */
  const sx0 = SAFE.left, sx1 = SAFE.right, sy0 = SAFE.top, sy1 = SAFE.bottom;
  console.log(`【${path.basename(htmlPath)}】安全框 x${sx0}–${sx1} / y${sy0}–${sy1}`);
  let nOver = 0, nWrap = 0, nOut = 0;
  rows.forEach(function(r){
    r.ovX = r.sw - r.cw; r.ovY = r.sh - r.ch;
    r.outRight = Math.max(r.inkR, r.left + r.sw) - sx1;
    r.outLeft = sx0 - Math.min(r.inkL, r.left);
    r.outBottom = Math.max(r.inkB, r.top + r.sh) - sy1;
    r.outTop = sy0 - Math.min(r.inkT, r.top);
    r.bad = []; r.note = [];
    /* 横向溢出 = 阻断项：background-clip:text 的金属字在盒外没有 background 可裁 → 末字丢填充；
       非金属字也会越出盒外、让所有"按盒"的体检（film/attach）量错 */
    if (r.ovX > 1) { r.bad.push('横向溢出 ' + r.ovX.toFixed(0) + 'px'); nOver++; }
    /* 竖向溢出 = 提示项：L0 的 line-height 1.10 < em 盒 1.245，字身不会真的被切 */
    else if (r.ovY > 1) { r.note.push('竖向溢出 ' + r.ovY.toFixed(0) + 'px（em 盒 > 行盒，非重音字无截断风险）'); }
    if (r.cls.indexOf('vert') < 0 && r.oh > Math.round(r.ch * 1.55) + 2) { r.bad.push('疑似换行'); nWrap++; }
    var m = Math.max(r.outRight, r.outLeft, r.outBottom, r.outTop);
    if (m > 0.5) { r.bad.push('越界 ' + m.toFixed(0) + 'px'); nOut++; }
    r.maxOut = m;
  });
  const bad = rows.filter(function(r){ return r.bad.length; })
    .sort(function(a, b2){ return b2.maxOut - a.maxOut; });
  const notes = rows.filter(function(r){ return !r.bad.length && r.note.length; });
  console.log(`片数 ${rows.length} ｜ 横向溢出（阻断项）${nOver} 片 ｜ 疑似换行 ${nWrap} 片 ｜ 越界 ${nOut} 片 ` +
              `｜ 竖向溢出（提示）${notes.length} 片\n`);
  bad.forEach(function(r){
    console.log(`S${r.s + 1} ${r.lv} 「${r.text.slice(0, 16)}」`);
    console.log(`   ❌ 盒 ${r.left.toFixed(0)}–${r.right.toFixed(0)} (宽 ${r.cw.toFixed(0)}, 内容 ${r.sw}) ` +
                `字形 ${r.inkL.toFixed(0)}–${r.inkR.toFixed(0)} ｜ ${r.bad.join('；')}`);
  });
  notes.forEach(function(r){
    console.log(`S${r.s + 1} ${r.lv} 「${r.text.slice(0, 16)}」 ⚠ ${r.note.join('；')}`);
  });
  if (!bad.length) console.log('✅ 没有横向溢出、没有换行、没有越界（竖向提示项见上）');
} finally {
  await b.close();
}

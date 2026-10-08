// 元素间碰撞体检（A1 加强版）：不只比文字块，连环绕文字、环上金点、球簇一起比，
// 并按 0.2s 扫整屏（浮游位移会让"静态不撞"变成"某帧撞"）。
// 用法: node clash-check.mjs <html路径> [屏号=1] [步长=0.2]
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const SCREEN = parseInt(process.argv[3] || '1', 10);
const STEP = parseFloat(process.argv[4] || '0.2');

const b = await launch({ width: 1920, height: 1080, port: 9700 + Math.floor(Math.random() * 200) });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const S = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__screens()[${SCREEN}])`, returnByValue: true
  })).result.value);
  const CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);

  let total = 0;
  let infoBall = 0;
  const seen = new Map();
  for (let t = S.t0 + 0.6; t <= S.t1 - 0.6; t += STEP) {
    const res = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${t.toFixed(2)});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var k = stage.width / ${CV.w};
        function bx(el){ var r = el.getBoundingClientRect();
          return { x:(r.left-stage.left)/k, y:(r.top-stage.top)/k, w:r.width/k, h:r.height/k }; }
        var items = [];
        [].forEach.call(document.querySelectorAll('.piece[data-screen="${SCREEN}"]'), function(el){
          if ((+el.style.opacity || 0) < 0.05) return;
          var b = bx(el); b.kind = '文字'; b.t = el.textContent.slice(0, 10);
          b.lv = el.getAttribute('data-lv'); items.push(b); });
        [].forEach.call(document.querySelectorAll('.ringtext span'), function(el){
          if ((+el.style.opacity || 0) < 0.06) return;
          var b = bx(el); b.kind = '环字'; b.t = el.textContent; items.push(b); });
        [].forEach.call(document.querySelectorAll('.ring-dot'), function(el){
          if ((+el.style.opacity || 0) < 0.08) return;
          var b = bx(el); b.kind = '金点'; b.t = '·'; items.push(b); });
        [].forEach.call(document.querySelectorAll('.mball'), function(el){
          if ((+el.style.opacity || 0) < 0.08) return;
          var b = bx(el); b.kind = el.classList.contains('mball-gold') ? '金球' : '灰球'; b.t = '○'; items.push(b); });
        var hits = [];
        for (var i = 0; i < items.length; i++) for (var j = i + 1; j < items.length; j++) {
          var A = items[i], B = items[j];
          /* 球簇内部 / 金点之间的相切属于图形语言（弹珠挨着），只记不判 */
          const soft = (A.kind === '金球' || A.kind === '灰球') && (B.kind === '金球' || B.kind === '灰球');
          if (A.kind === '金点' && B.kind === '金点') continue;
          var ox = Math.min(A.x+A.w, B.x+B.w) - Math.max(A.x, B.x);
          var oy = Math.min(A.y+A.h, B.y+B.h) - Math.max(A.y, B.y);
          if (ox > 0.5 && oy > 0.5) hits.push({ a: A.kind + '「' + A.t + '」', c: B.kind + '「' + B.t + '」',
                                                ox: Math.round(ox), oy: Math.round(oy), soft: soft });
        }
        return hits;
      })())`, returnByValue: true
    })).result.value);
    if (res.length) {
      total += res.filter((h) => !h.soft).length;
      infoBall += res.filter((h) => h.soft).length;
      res.filter((h) => !h.soft).forEach((h) => {
        const key = h.a + ' × ' + h.c;
        const prev = seen.get(key);
        if (!prev) seen.set(key, { first: +t.toFixed(1), maxOx: h.ox, maxOy: h.oy, n: 1 });
        else { prev.n++; prev.maxOx = Math.max(prev.maxOx, h.ox); prev.maxOy = Math.max(prev.maxOy, h.oy); }
      });
    }
  }
  if (infoBall) console.log(`（另有 ${infoBall} 个采样点存在球簇内相切/叠压，属图形语言，不计为碰撞）`);
  if (!total) {
    console.log(`S${SCREEN + 1} ${S.label} ${S.t0}–${S.t1}s：0 处碰撞 ✅（文字 / 环字 / 金点 / 球簇 两两比对）`);
  } else {
    console.log(`S${SCREEN + 1} ${S.label}：${seen.size} 组元素在 ${total} 个采样点上发生叠压 ❌`);
    [...seen.entries()].forEach(([k, v]) =>
      console.log(`  ${k}  首次 t=${v.first}s 共 ${v.n} 帧  最大叠压 ${v.maxOx}×${v.maxOy}px`));
  }
  process.exitCode = total ? 1 : 0;
} finally {
  await b.close();
}

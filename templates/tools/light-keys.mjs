// 从节拍表 + DOM 实测位置自动生成柔光关键帧（A17：元素出场 +0.6s 时，光要落在它 / 它所属物品的 640px 内）
// ---------------------------------------------------------------------------
// 用法: node light-keys.mjs <html路径> [屏号]        → 打印该屏的 LIGHT_KEYS 片段
//       node light-keys.mjs <html路径> all            → 打印全片（七屏拼接，可直接替换页面里的数组）
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const arg = process.argv[3] || 'all';
const screens = arg === 'all' ? [0,1,2,3,4,5,6] : [parseInt(arg, 10)];

const b = await launch({ width: 1920, height: 1080, port: 9488 });
const out = [];
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);
  for (const si of screens) {
    const meta = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        var S = window.__screens()[${si}];
        return { screen:S, pieces: window.__pieces().filter(function(p){ return p.s === ${si}; }),
                 items: window.__screenItems(${si}) };
      })())`, returnByValue: true
    })).result.value);
    /* 目标点：每条文字分片在「出场 +0.6s」时的位置 + 每个物品事件时刻的中心 */
    const targets = [];
    for (let pi = 0; pi < meta.pieces.length; pi++) {
      const p = meta.pieces[pi];
      const at = Math.min(p.start + 1.20, meta.screen.t1 - 0.25);
      const r = JSON.parse((await b.page.send('Runtime.evaluate', {
        expression: `JSON.stringify((function(){
          window.__seek(${at.toFixed(2)});
          var st = document.getElementById('stage').getBoundingClientRect();
          var k = st.width / ${CV.w};
          var el = [].filter.call(document.querySelectorAll('.piece[data-screen="${si}"]'), function(e){
            return e.textContent === ${JSON.stringify(p.t)}; })[0];
          if (!el) return null;
          var b2 = el.getBoundingClientRect();
          return { x:(b2.left-st.left)/k + b2.width/k/2, y:(b2.top-st.top)/k + b2.height/k/2 };
        })())`, returnByValue: true
      })).result.value);
      if (!r) continue;
      /* 实测：文字 opacity 首次过 0.5 大约在 start+0.5s，检查点是再 +0.6s → start+1.1s */
      targets.push({ t: +(p.start + 1.10).toFixed(2), x: Math.round(r.x), y: Math.round(r.y), why: p.t.slice(0, 6) });
    }
    const items = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify(window.__items())`, returnByValue: true
    })).result.value);
    const itemKeys = meta.items.filter((k) => items[k]);
    itemKeys.forEach((k) => {
      const it = items[k];
      targets.push({ t: it.ev + 0.5, x: it.cx, y: it.cy, why: 'item:' + k });
    });
    const anchor = itemKeys.length
      ? { x: items[itemKeys[0]].cx, y: items[itemKeys[0]].cy }
      : { x: Math.round(CV.w / 2), y: Math.round(CV.h / 2) };
    /* 屏首必须有关键帧，否则整段光会冻在第一个关键帧上 */
    targets.push({ t: meta.screen.t0 + 0.4, x: anchor.x, y: anchor.y, why: 'start' });
    targets.sort((a, z) => a.t - z.t);
    /* 合并 0.45s 内的相邻目标（取平均），再把 >4.5s 的空档补中点，保证光全程缓慢移动 */
    const merged = [];
    targets.forEach((o) => {
      const last = merged[merged.length - 1];
      /* 只有「几乎同时 + 位置也近」才合并成一帧。曾经把 0.45s 内、分处画面两端的两个元素
         取中点合并 —— 结果光落在两者之间，谁都只擦到 0.84 的亮度（A31 的「被点亮」直接挂掉）。
         宁可让光在 0.1s 内快速掠过，也不要牺牲「扫到谁谁亮」。 */
      if (last && o.t - last.t < 0.15 && Math.hypot(o.x - last.x, o.y - last.y) < 400) {
        last.x = Math.round((last.x + o.x) / 2); last.y = Math.round((last.y + o.y) / 2);
        last.t = +(last.t + (o.t - last.t) / 2).toFixed(2); last.why += '+' + o.why;
      } else merged.push({ ...o });
    });
    const keys = [];
    merged.forEach((o) => {
      const prev = keys[keys.length - 1];
      /* 长空档补中点：偏一点（±140px 交替）让光在空档里也在缓慢移动 */
      let sign = 1;
      while (prev && o.t - keys[keys.length - 1].t > 3.5) {
        const p2 = keys[keys.length - 1];
        const nt = +(p2.t + Math.min(3.2, (o.t - p2.t) / 2)).toFixed(2);
        keys.push({ t: nt, x: Math.round((p2.x + o.x) / 2) + sign * 140,
                    y: Math.round((p2.y + o.y) / 2) - sign * 90, why: 'pad' });
        sign = -sign;
      }
      keys.push(o);
    });
    out.push({ si, keys });
  }
} finally { await b.close(); }

const RX = (px) => 'rx(' + (px / 1920).toFixed(3) + ')';
const RY = (px) => 'ry(' + (px / 1080).toFixed(3) + ')';
out.forEach((s, si) => {
  console.log(`    /* S${s.si + 1}（${s.keys.length} 个关键帧） */`);
  const line = [];
  s.keys.forEach((k, i) => {
    line.push(`[${k.t.toFixed(2).padStart(5)}, ${RX(k.x)}, ${RY(k.y)}]`);
    if (line.length === 3 || i === s.keys.length - 1) {
      /* 每屏最后一行也要带逗号：否则下一屏开头的 [...] 会被解析成上一行的下标访问，
         整段变成 undefined（v6 踩过的坑） */
      const last = (i === s.keys.length - 1);
      const tail = (!last || si < out.length - 1) ? ',' : '';
      console.log('    ' + line.join(', ') + tail);
      line.length = 0;
    }
  });
});

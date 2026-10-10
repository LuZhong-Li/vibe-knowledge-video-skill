// DOM 级探针：逐时刻列「可见文字盒 / 距边距离 / 引导线是否穿字 / 图形件是否越界」。
// 用途：几何重叠、文字贴边、引导线端点戳进字盒 —— 这三类"仪器测不出、人一眼看出来"的问题，
//       在这里是一次线段-矩形相交判定就能给数的。
// 用法: node box-probe.mjs <html> t1,t2,t3...        # 例：6,8.6,26.4,47.4
//       SHAPES=1 node box-probe.mjs <html> 47.4     # 另外列出 #items 下所有可见图形件的盒
// 判据：① 引导线穿字应为 0 处（盒内缩 2px 判：端点正好停在盒边不算）
//       ② 文字盒距画面边 min 值应 ≥ 安全框（1920×1080 是 96/54/1824/1026 减去自己的盒高宽）
//       ③ 图形件不得越安全框
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || 'shot-template.html');
const times = (process.argv[3] || '0').split(',').map(Number).filter((v) => isFinite(v));
const port = 9710 + Math.floor(Math.random() * 80);   // 端口随机：避免与其它脚本抢

const b = await launch({ width: 1920, height: 1080, port });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  for (const t of times) {
    const out = JSON.parse((await b.page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `JSON.stringify((function(){
        window.__seek(${t});
        var cv = window.__canvas(), stage = document.getElementById('stage').getBoundingClientRect();
        var k = stage.width / cv.w;
        function box(el){ var r = el.getBoundingClientRect();
          return { x:(r.left-stage.left)/k, y:(r.top-stage.top)/k, w:r.width/k, h:r.height/k }; }
        var pieces = [].map.call(document.querySelectorAll('.piece'), function(el){
          var bb = box(el);
          return { t:(el.textContent||'').slice(0,26), s:+el.getAttribute('data-screen'),
                   lv:el.getAttribute('data-lv'), op:+(el.style.opacity||0),
                   x:Math.round(bb.x), y:Math.round(bb.y), w:Math.round(bb.w), h:Math.round(bb.h) };
        }).filter(function(p){ return p.op > 0.25; });
        var lines = [].map.call(document.querySelectorAll('svg line'), function(el){
          return { cls:(el.getAttribute('class')||''), op:+(el.style.opacity||0),
                   x1:+el.getAttribute('x1'), y1:+el.getAttribute('y1'),
                   x2:+el.getAttribute('x2'), y2:+el.getAttribute('y2') };
        }).filter(function(l){ return l.op > 0.25 && (Math.abs(l.x2-l.x1)+Math.abs(l.y2-l.y1)) > 2; });
        var shapes = [].filter.call(document.querySelectorAll('#items *'), function(el){
          return el.children.length === 0;
        }).map(function(el){
          var bb = box(el);
          return { tag:el.tagName, cls:(el.getAttribute('class')||''), op:+(el.style.opacity||0),
                   x:Math.round(bb.x), y:Math.round(bb.y), w:Math.round(bb.w), h:Math.round(bb.h) };
        }).filter(function(s){ return s.op > 0.2 && s.w > 1 && s.h > 1; });
        return { canvas: cv, pieces: pieces, lines: lines, shapes: shapes };
      })())`,
    })).result.value);
    console.log(`\n=== t=${t}s  可见文字片 ${out.pieces.length}  可见线段 ${out.lines.length}  画布 ${out.canvas.w}×${out.canvas.h} ===`);
    for (const p of out.pieces) {
      const m = { l: p.x, r: out.canvas.w - (p.x + p.w), t: p.y, b: out.canvas.h - (p.y + p.h) };
      console.log(`  S${p.s + 1} ${p.lv} op=${p.op.toFixed(2)} x[${p.x}..${p.x + p.w}] y[${p.y}..${p.y + p.h}]` +
        `  距边 min=${Math.round(Math.min(m.l, m.r, m.t, m.b))}px (L${Math.round(m.l)}/R${Math.round(m.r)}/T${Math.round(m.t)}/B${Math.round(m.b)})  「${p.t}」`);
    }
    let hits = 0;
    for (const l of out.lines) {
      for (const p of out.pieces) {
        /* 盒内缩 2px 再判：线端点正好停在盒边上不算穿字（字形墨迹离盒边还有几 px） */
        const P = [[p.x + 2, p.y + 2], [p.x + p.w - 2, p.y + 2],
                   [p.x + p.w - 2, p.y + p.h - 2], [p.x + 2, p.y + p.h - 2]];
        for (let i = 0; i < 4; i++) {
          const A = P[i], B = P[(i + 1) % 4];
          const d = (B[0] - A[0]) * (l.y2 - l.y1) - (B[1] - A[1]) * (l.x2 - l.x1);
          if (!d) continue;
          const s = ((l.x2 - l.x1) * (A[1] - l.y1) - (l.y2 - l.y1) * (A[0] - l.x1)) / d;
          const u = ((B[0] - A[0]) * (A[1] - l.y1) - (B[1] - A[1]) * (A[0] - l.x1)) / d;
          if (s >= 0 && s <= 1 && u >= 0 && u <= 1) {
            hits++;
            console.log(`  ✗ 线段${l.cls ? '[' + l.cls + ']' : '(引导线)'} (${l.x1.toFixed(0)},${l.y1.toFixed(0)})→` +
              `(${l.x2.toFixed(0)},${l.y2.toFixed(0)}) 穿过文字盒「${p.t}」`);
            break;
          }
        }
      }
    }
    console.log(hits ? `  ⇒ 共 ${hits} 处线段穿字` : '  ⇒ 线段穿字 0 处');
    const lens = out.lines.map((l) => Math.round(Math.hypot(l.x2 - l.x1, l.y2 - l.y1)));
    if (lens.length) {
      console.log(`  -- 线段长度 ${lens.join('/')}px  最短 ${Math.min(...lens)}px` +
        (Math.min(...lens) < 30 ? '  ⚠ 有线段过短（<30px，注意别成孤立小点）' : ''));
    }
    if (process.env.SHAPES) {
      console.log(`  -- 可见图形件 ${out.shapes.length} --`);
      for (const s of out.shapes) {
        const over = (s.x < 96 || s.y < 54 || s.x + s.w > 1824 || s.y + s.h > 1026)
          ? `  ⚠ 越安全框(右下 ${s.x + s.w},${s.y + s.h})` : '';
        console.log(`  ${s.tag} ${s.cls} op=${s.op.toFixed(2)} x[${s.x}..${s.x + s.w}] y[${s.y}..${s.y + s.h}]` +
          ` w${s.w}×h${s.h}${over}`);
      }
    }
  }
} finally { await b.close(); }

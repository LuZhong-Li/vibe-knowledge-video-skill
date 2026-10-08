// §7 画幅验收：切换 1920×1080 ↔ 2560×1440，元素相对位置/比例不得变形，文字不得越界。
// 做法：同一个页面分别以 ?cw=&ch= 两套画布渲染，把每个元素的包围盒归一化成 0~1 相对坐标后比对。
// 用法: node aspect-check.mjs <html路径> [基准W=1920] [基准H=1080] [对比W=2560] [对比H=1440]
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const CONFIGS = [
  { w: parseInt(process.argv[3] || '1920', 10), h: parseInt(process.argv[4] || '1080', 10) },
  { w: parseInt(process.argv[5] || '2560', 10), h: parseInt(process.argv[6] || '1440', 10) }
];
const problems = [];

async function sample(cfg) {
  const b = await launch({ width: cfg.w, height: cfg.h, port: 9490 + (cfg.w === 1920 ? 0 : 1), gpu: true });
  try {
    await b.goto(fileUrl(htmlPath) + `?cw=${cfg.w}&ch=${cfg.h}&t=0`, { settleFrames: 4 });
    const meta = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ cv: window.__canvas(), sc: window.__screens(), pc: window.__pieces() })',
      returnByValue: true
    })).result.value);
    const probes = meta.sc.map((s) => {
      const ps = meta.pc.filter((p) => p.s === meta.sc.indexOf(s));
      const last = Math.max.apply(null, ps.map((p) => p.start));
      return Math.min(s.t1 - 1.3, last + 1.05);
    });
    const rows = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        var out = [];
        ${JSON.stringify(probes)}.forEach(function(at, si){
          window.__seek(at);
          var stage = document.getElementById('stage').getBoundingClientRect();
          var k = stage.width / ${cfg.w};
          [].forEach.call(document.querySelectorAll('.piece[data-screen="' + si + '"]'), function(el){
            var r = el.getBoundingClientRect();
            if ((+el.style.opacity || 0) < 0.05) return;
            out.push({ s: si, t: el.textContent.slice(0, 8), at: at,
                       x: +((r.left - stage.left) / k / ${cfg.w}).toFixed(4),
                       y: +((r.top - stage.top) / k / ${cfg.h}).toFixed(4),
                       w: +(r.width / k / ${cfg.w}).toFixed(4),
                       h: +(r.height / k / ${cfg.h}).toFixed(4) });
          });
        });
        return out;
      })())`, returnByValue: true
    })).result.value);
    return { meta, rows };
  } finally { await b.close(); }
}

const A = await sample(CONFIGS[0]);
const B = await sample(CONFIGS[1]);
console.log(`基准 ${CONFIGS[0].w}×${CONFIGS[0].h}：${A.meta.cv.w}×${A.meta.cv.h} ` +
            `安全框 ${JSON.stringify(A.meta.cv.safe)}  文本块 ${A.rows.length}`);
console.log(`对比 ${CONFIGS[1].w}×${CONFIGS[1].h}：${B.meta.cv.w}×${B.meta.cv.h} ` +
            `安全框 ${JSON.stringify(B.meta.cv.safe)}  文本块 ${B.rows.length}`);
if (A.rows.length !== B.rows.length) problems.push('两套画布下可见文本块数量不一致');

let maxDelta = 0, worst = null;
for (let i = 0; i < Math.min(A.rows.length, B.rows.length); i++) {
  const a = A.rows[i], c = B.rows[i];
  const d = Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y), Math.abs(a.w - c.w), Math.abs(a.h - c.h));
  if (d > maxDelta) { maxDelta = d; worst = `${a.t}@${a.at}s`; }
}
console.log(`相对坐标最大偏差 ${(maxDelta * 100).toFixed(2)}%（${worst || '—'}）` +
            `　要求 < 1%（0.01）${maxDelta < 0.01 ? '✅' : '❌'}`);
if (maxDelta >= 0.01) problems.push(`两套画布下相对位置偏差 ${(maxDelta * 100).toFixed(2)}% ≥ 1%`);

[['基准', A], ['对比', B]].forEach(([tag, R]) => {
  const S = R.meta.cv.safe;
  let over = 0, ex = null;
  R.rows.forEach((r) => {
    const x = r.x * R.meta.cv.w, y = r.y * R.meta.cv.h;
    const w = r.w * R.meta.cv.w, h = r.h * R.meta.cv.h;
    if (x < S.left - 1 || y < S.top - 1 || x + w > S.right + 1 || y + h > S.bottom + 1) {
      over++; if (!ex) ex = `${r.t} x${Math.round(x)}..${Math.round(x + w)} y${Math.round(y)}..${Math.round(y + h)}`;
    }
  });
  console.log(`${tag}画布越界文本块 ${over} 个 ${over ? '❌ ' + ex : '✅'}`);
  if (over) problems.push(`${tag}画布有 ${over} 个文本块越出安全框`);
});

console.log('\n' + (problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ 画幅验收通过：两套分辨率相对位置/比例一致，无越界'));
process.exitCode = problems.length ? 1 : 0;

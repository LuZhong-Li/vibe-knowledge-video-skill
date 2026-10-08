// 节奏体检：按固定步长扫完整条时间轴，统计“屏幕上的文字总量”，
// 找出换页时是否出现过长空场（黑场），以及每页实际停留时间。
// 用法: node timeline.mjs <html路径> [步长秒]
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../control-illusion.html');
const step = parseFloat(process.argv[3] || '0.1');
const b = await launch({ width: 1920, height: 1080 });

try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const res = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var out = [];
      var bounds = (window.__screens ? window.__screens() : []).map(function(s){ return [s.t0, s.t1]; });
      var TOTAL = window.__state ? window.__state().total : 150;
      for (var t = 0; t <= TOTAL + 0.0001; t += ${step}) {
        window.__seek(t);
        var sum = 0, mx = 0;
        var els = document.querySelectorAll('.piece');
        for (var i = 0; i < els.length; i++) {
          var o = +els[i].style.opacity || 0;
          sum += o; if (o > mx) mx = o;
        }
        var cap = +document.getElementById('caption').style.opacity || 0;
        out.push([+t.toFixed(2), +sum.toFixed(3), +mx.toFixed(3), +cap.toFixed(3)]);
      }
      out.bounds = bounds;
      return out;
    })())`,
    returnByValue: true
  });
  const rows = JSON.parse(res.result.value);

  // 逐页打印：文字总量曲线的最低点 / 平均
  const bounds = (rows.bounds && rows.bounds.length)
    ? (() => { const a = [rows.bounds[0][0]]; rows.bounds.forEach((b) => a.push(b[1])); return a; })()
    : [0, 8, 35, 68, 100, 130, 150];
  console.log('每页文字信号（行不透明度之和，反映屏幕上“有多少字亮着”）');
  for (let i = 0; i < bounds.length - 1; i++) {
    const seg = rows.filter((r) => r[0] >= bounds[i] && r[0] < bounds[i + 1]);
    const mn = Math.min(...seg.map((r) => r[1]));
    const mxv = Math.max(...seg.map((r) => r[1]));
    const avg = seg.reduce((a, r) => a + r[1], 0) / seg.length;
    const lowTime = seg.filter((r) => r[1] + r[3] < 0.12).map((r) => r[0]);
    console.log(
      `第${i + 1}页 ${String(bounds[i]).padStart(3)}~${String(bounds[i + 1]).padStart(3)}s  ` +
      `信号 最低=${mn.toFixed(2).padStart(5)} 最高=${mxv.toFixed(2).padStart(5)} 均值=${avg.toFixed(2).padStart(5)}  ` +
      (lowTime.length ? `接近空场 ${lowTime[0]}~${lowTime[lowTime.length - 1]}s（${lowTime.length} 个采样点）` : '无空场')
    );
  }

  // 全局最长“空场”
  let best = 0, cur = 0, start = 0, bestStart = 0;
  for (const r of rows) {
    if (r[1] + r[3] < 0.12) { if (cur === 0) start = r[0]; cur += step; }
    else { if (cur > best) { best = cur; bestStart = start; } cur = 0; }
  }
  if (cur > best) { best = cur; bestStart = start; }
  console.log(`\n全程最长空场：${best.toFixed(1)}s（起于 ${bestStart.toFixed(1)}s）`);

  // 换页边界附近打印曲线，便于微调
  console.log('\n换页边界附近曲线（t / 信号）：');
  for (const bnd of [8, 35, 68, 100, 130]) {
    const seg = rows.filter((r) => Math.abs(r[0] - bnd) <= 1.5 && Math.abs((r[0] * 10) % (step * 10)) < 1e-6);
    console.log(
      `  ${bnd}s: ` + seg.map((r) => `${r[0]}+${r[1]}`).join('  ')
    );
  }
} finally {
  await b.close();
}

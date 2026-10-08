// 起步模板通用体检（A5 不适用：原稿清单在项目里）。
// 检查：JS 异常 / NaN 帧 / 空场帧 / 量测钩子齐全 / 末屏停住 / 抽帧出图。
// 用法: node smoke-check.mjs [html路径=./shot-template.html] [--shots <目录>]
import path from 'node:path';
import fs from 'node:fs';
import { launch, fileUrl } from './cdp.mjs';

const args = process.argv.slice(2);
const htmlPath = path.resolve(args.find((a) => !a.startsWith('--')) || './shot-template.html');
const shotIdx = args.indexOf('--shots');
const shotDir = shotIdx >= 0 ? path.resolve(args[shotIdx + 1]) : null;

const problems = [];
const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9500 });
try {
  const errors = [], warns = [];
  b.page.on('Runtime.exceptionThrown', (p) =>
    errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  b.page.on('Runtime.consoleAPICalled', (p) => {
    const txt = JSON.stringify(p.args);
    if (p.type === 'error') errors.push('console.error: ' + txt);
    if (p.type === 'warning') warns.push(txt);
  });

  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });

  /* 量测钩子是否齐全 */
  const hooks = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify(['__seek','__state','__canvas','__screens','__pieces','__items',
      '__light','__narrative','__structStarts','__audioEvents'].filter(function(k){
        return typeof window[k] !== 'function'; }))`,
    returnByValue: true
  })).result.value);
  console.log(`量测钩子缺失 ${hooks.length} 个 ${hooks.length ? '❌ ' + hooks.join(',') : '✅'}`);
  if (hooks.length) problems.push('量测钩子缺失');

  /* 全片扫描：NaN / 空场 / 每屏可见文字量 */
  const scan = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var bad = [], empty = [], perScreen = {};
      var TOTAL = window.__state().total;
      for (var t = 0; t <= TOTAL + 0.0001; t += 0.25) {
        window.__seek(t);
        var sum = 0, nan = 0, els = document.querySelectorAll('.piece');
        for (var i = 0; i < els.length; i++) {
          var o = +els[i].style.opacity;
          if (!isFinite(o)) nan++; else sum += o;
        }
        var cap = +document.getElementById('caption').style.opacity || 0;
        var kick = +document.getElementById('kicker').style.opacity || 0;
        if (nan) bad.push(+t.toFixed(2));
        if (t >= 0.5 && sum + cap + kick < 0.12) empty.push(+t.toFixed(2));
        var si = window.__screens().findIndex(function(s){ return t >= s.t0 && t < s.t1; });
        perScreen[si] = Math.max(perScreen[si] || 0, +sum.toFixed(3));
      }
      return { bad: bad.slice(0, 10), badCount: bad.length,
               empty: empty.slice(0, 10), emptyCount: empty.length, perScreen: perScreen,
               total: TOTAL };
    })())`, returnByValue: true
  })).result.value);
  console.log(`总时长 ${scan.total}s ｜ NaN 帧 ${scan.badCount} ${scan.badCount ? '❌ ' + scan.bad.join(',') : '✅'}` +
              ` ｜ 空场帧 ${scan.emptyCount} ${scan.emptyCount ? '❌ ' + scan.empty.join(',') : '✅'}`);
  console.log('每屏最大文字信号 ' + JSON.stringify(scan.perScreen));
  if (scan.badCount) problems.push('存在 NaN 帧');
  if (scan.emptyCount) problems.push('存在空场帧');

  /* 物件与附着层状态 */
  const state = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      window.__seek(window.__state().total);
      var s = window.__state(), items = window.__items();
      var last = {}; Object.keys(items).forEach(function(k){ if (k !== 't') last[k] = +items[k].on.toFixed(3); });
      return { t:s.t, playing:s.playing, total:s.total, canvas:window.__canvas(),
               items:last, radii:window.__clusterRadii(), narration:window.__narrative().ring };
    })())`, returnByValue: true
  })).result.value);
  console.log(`末态 t=${state.t}/${state.total} playing=${state.playing}`);
  console.log(`画布 ${state.canvas.w}×${state.canvas.h} 安全框 left=${state.canvas.safe.left} right=${state.canvas.safe.right}`);
  console.log('物品在场权重 ' + JSON.stringify(state.items));
  console.log('球簇平均半径 ' + JSON.stringify(state.radii));
  if (state.playing !== false) problems.push('播完后仍在播放');

  /* 抽帧出图（人眼复核用） */
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    const TOTAL = scan.total;
    for (const f of [0.15, 0.35, 0.5, 0.75, 0.98]) {
      const at = +(TOTAL * f).toFixed(2);
      await b.page.send('Runtime.evaluate', { expression: `window.__seek(${at})` });
      const shot = path.join(shotDir, 't' + String(at).replace('.', '_') + '.png');
      await b.shot(shot);
      console.log('抽帧 ' + shot);
    }
  }

  console.log(`console.error ${errors.length} ｜ console.warn ${warns.length} ${errors.length || warns.length ? '❌' : '✅'}`);
  errors.slice(0, 5).forEach((e) => console.log('   error: ' + e));
  warns.slice(0, 5).forEach((w) => console.log('   warn : ' + w));
  if (errors.length) problems.push('运行期脚本错误');
  if (warns.length) problems.push('console.warn 不为 0（A8/A14）');
} finally {
  await b.close();
}

console.log('\n' + (problems.length ? '❌ ' + problems.join('；') : '✅ 模板自检通过'));
process.exitCode = problems.length ? 1 : 0;

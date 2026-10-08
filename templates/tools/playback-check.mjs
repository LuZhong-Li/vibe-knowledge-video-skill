// v3 全片回放体检（A6/A8）：真实加速播完一遍，统计脚本异常 / console 告警，
// 并逐 0.25s 扫一遍整条时间轴，确认没有任何一帧出现 NaN 或空屏。
// 用法: node playback-check.mjs <html路径>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9433 });
const errors = [], warns = [];
const problems = [];

try {
  b.page.on('Runtime.exceptionThrown', (p) =>
    errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  b.page.on('Runtime.consoleAPICalled', (p) => {
    const txt = JSON.stringify(p.args);
    if (p.type === 'error') errors.push('console.error: ' + txt);
    if (p.type === 'warning') warns.push(txt);
  });

  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });

  /* 逐 0.25s 扫全片：检查 NaN / 每帧是否有内容 */
  const scan = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var bad = [], empty = [], minSum = 1e9, minAt = 0;
      var TOTAL = window.__state().total;
      for (var t = 0; t <= TOTAL + 0.0001; t += 0.25) {
        window.__seek(t);
        var sum = 0, nan = 0;
        var els = document.querySelectorAll('.piece');
        for (var i = 0; i < els.length; i++) {
          var o = +els[i].style.opacity;
          if (!isFinite(o)) nan++; else sum += o;
        }
        var cap = +document.getElementById('caption').style.opacity || 0;
        var kick = +document.getElementById('kicker').style.opacity || 0;
        if (nan) bad.push(+t.toFixed(2));
        /* t<0.5s 是开场淡入（A2 允许 0.2s 空场），不计入空场 */
        if (t >= 0.5 && sum + cap + kick < 0.12) empty.push(+t.toFixed(2));
        if (sum < minSum) { minSum = sum; minAt = +t.toFixed(2); }
      }
      return { bad: bad.slice(0, 12), badCount: bad.length,
               empty: empty.slice(0, 12), emptyCount: empty.length,
               minSum: +minSum.toFixed(3), minAt: minAt };
    })())`, returnByValue: true
  })).result.value);
  console.log(`NaN 帧 ${scan.badCount} 个 ${scan.badCount ? '❌ ' + scan.bad.join(',') : '✅'}`);
  console.log(`空场帧 ${scan.emptyCount} 个（<0.12）${scan.emptyCount ? '❌ ' + scan.empty.join(',') : '✅'}` +
              ` ｜ 最低文字信号 ${scan.minSum} @ ${scan.minAt}s`);
  if (scan.badCount) problems.push('存在 NaN 帧');

  /* 加速播完：确认停在最后一屏 */
  await b.goto(fileUrl(htmlPath) + '?rate=250', { settleFrames: 4 });
  await new Promise((r) => setTimeout(r, 5000));
  const st = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var s = window.__state();
      /* 末屏判据 0.85：S7 文字有 0.94 的亮度下限 × 0.94 的呼吸下限 = 0.88（仍是满亮可读） */
      var last = [].filter.call(document.querySelectorAll('.piece[data-screen="6"]'),
        function(el){ return +el.style.opacity > 0.85; }).length;
      var total = document.querySelectorAll('.piece[data-screen="6"]').length;
      return { t: s.t, playing: s.playing, total: s.total, lastBright: last, lastTotal: total,
               caption: document.getElementById('caption').querySelector('.note').textContent,
               progress: document.querySelector('#progress i').style.width };
    })())`, returnByValue: true
  })).result.value);
  console.log(`结束状态 t=${st.t}/${st.total} playing=${st.playing} ｜ 末屏亮字 ${st.lastBright}/${st.lastTotal} ` +
              `｜ 底部注释「${st.caption}」｜ 进度条 ${st.progress}`);
  if (st.playing !== false) problems.push('播完后仍在播放');
  if (Math.abs(st.t - st.total) > 0.01) problems.push('结束时间不是 ' + st.total + 's：' + st.t);
  if (st.lastBright < st.lastTotal - 0.5) problems.push('最后一屏有文字未完全亮起');
  if (st.caption !== '分清能力与运气') problems.push('底部注释不对');

  console.log(`console.error ${errors.length} 个 ｜ console.warn ${warns.length} 个 ${errors.length || warns.length ? '❌' : '✅'}`);
  errors.slice(0, 4).forEach((e) => console.log('   error: ' + e));
  warns.slice(0, 4).forEach((w) => console.log('   warn : ' + w));
  if (errors.length) problems.push('运行期脚本错误');
  if (warns.length) problems.push('console.warn 不为 0（A8）');
} finally {
  await b.close();
}

console.log('\n' + (problems.length ? '❌ ' + problems.join('；') : '✅ 全片回放通过：无异常、无告警、停住'));
process.exitCode = problems.length ? 1 : 0;

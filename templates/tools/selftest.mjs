// 端到端自检：真实播放一遍（加速），检查是否有脚本报错、是否停在最后一页、缩放是否正常
// 用法: node selftest.mjs <html路径>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../control-illusion.html');
const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9360 });
const problems = [];
const errors = [];

try {
  b.page.on('Runtime.exceptionThrown', (p) => {
    errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
  });
  b.page.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') errors.push('console.error: ' + JSON.stringify(p.args));
  });

  // 1) 静态：六个分镜的关键文案都要找得到
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const txt = await b.page.send('Runtime.evaluate', {
    expression: `(function(){
      var s = document.getElementById('scenes').innerText.replace(/\\s+/g,'');
      var need = ['你有没有发现一件很奇怪的事','控制错觉','高出四倍','扔骰子前','大脑讨厌不确定性','不要被虚假的掌控感困住'];
      return JSON.stringify(need.map(function(n){ return n + '=' + (s.indexOf(n) >= 0); }));
    })()`,
    returnByValue: true
  });
  const found = JSON.parse(txt.result.value);
  console.log('文案完整性:', found.join('  '));
  if (found.some((f) => f.endsWith('false'))) problems.push('有文案缺失');

  // 2) 加速播完，确认停在最后一页
  await b.goto(fileUrl(htmlPath) + '?rate=250', { settleFrames: 4 });
  await new Promise((r) => setTimeout(r, 4000));
  const st = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var secs = document.querySelectorAll('.scene');
      var last = secs[secs.length - 1];
      return {
        state: window.__state(),
        lastOpacity: +last.style.opacity,
        caption: document.getElementById('cap-note').textContent,
        progress: document.querySelector('#progress i').style.width,
        kickerOpacity: +document.getElementById('kicker').style.opacity,
        brightText: Array.prototype.filter.call(last.querySelectorAll('.line'),
          function(el){ return +el.style.opacity > 0.9; }).length,
        visibleText: Array.prototype.filter.call(last.querySelectorAll('.line'),
          function(el){ return +el.style.opacity > 0.4; }).length,
        lastParaBright: Array.prototype.filter.call(last.querySelectorAll('.line'),
          function(el){ return el.__para === 2 ? +el.style.opacity > 0.99 : true; }).length,
        totalLines: last.querySelectorAll('.line').length
      };
    })())`,
    returnByValue: true
  });
  const s = JSON.parse(st.result.value);
  console.log('播放结束状态:', JSON.stringify(s));
  if (s.state.playing !== false) problems.push('播完后仍在播放');
  if (Math.abs(s.state.t - 150) > 0.01) problems.push('结束时间不是 150s：' + s.state.t);
  if (s.lastOpacity < 0.999) problems.push('最后一页没有完全显示');
  if (s.visibleText !== s.totalLines) problems.push('最后一页有文字不可见');
  if (s.brightText !== 1) problems.push('最后一页应只有收尾那一句最亮，实际 ' + s.brightText + ' 句');
  if (s.caption !== '分清能力与运气') problems.push('底部小字不对：' + s.caption);

  // 3) 非 9:16 窗口下的等比缩放
  await b.page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 300));
  const fit = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var r = document.getElementById('stage').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), scale: +(r.width / 1080).toFixed(4) };
    })())`,
    returnByValue: true
  });
  const f = JSON.parse(fit.result.value);
  console.log('1280x800 窗口下的画布:', JSON.stringify(f), '（高度受限，等比缩放到 450x800）');
  if (Math.abs(f.h / f.w - 16 / 9) > 0.01) problems.push('缩放不是 9:16 等比');
  if (f.h > 800) problems.push('画布超出窗口高度');

  if (errors.length) problems.push('运行期脚本错误: ' + errors.join(' | '));

  console.log('\n' + (problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ 全部自检通过：无脚本报错、150s 停在最后一页、缩放正常'));
} finally {
  await b.close();
}

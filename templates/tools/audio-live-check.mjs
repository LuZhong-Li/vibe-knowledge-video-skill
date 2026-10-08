// §6.3 音画同步在线体检：真实播放若干秒，读页面里实际触发的音效日志，
// 对比「应有事件表」与「实际触发」，算出相对抖动（漂移）。
// 说明：离线混音（audio-render.mjs）是成片音轨的唯一来源，误差按定义 = 0；
//       本脚本体检的是「浏览器里实时预览」这条路径。
// 用法: node audio-live-check.mjs [html路径] [秒数=14]
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const seconds = parseFloat(process.argv[3] || '14');
const b = await launch({ width: 1920, height: 1080, port: 9466, gpu: true,
                         extraArgs: ['--autoplay-policy=no-user-gesture-required'] });
const problems = [];
try {
  await b.goto(fileUrl(htmlPath) + '?t=0&sfx=1', { settleFrames: 4 });

  /* 静态帧（?t=）绝不能发声 */
  const before = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__audioStatus())', returnByValue: true })).result.value);

  await b.goto(fileUrl(htmlPath) + '?sfx=1', { settleFrames: 4 });
  await b.page.send('Runtime.evaluate', { expression: 'window.__audioEnable()' });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const out = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ s: window.__audioStatus(), st: window.__state(), log: window.__audioLog(), ev: window.__audioEvents() })',
    returnByValue: true })).result.value);

  console.log(`素材状态：${out.s.sounds.join('  ')}（${out.s.ctx}）`);
  if (before.played !== 0) problems.push('静态帧模式下也触发了音效');
  const log = out.log;
  console.log(`播放到 ${out.st.t.toFixed(2)}s，实际触发 ${log.length} 条 / 事件表前 ${log.length} 条应为：`);
  const want = out.ev.events.slice(0, log.length);
  let maxJitter = 0;
  log.forEach((e, i) => {
    const w = want[i];
    if (!w || Math.abs(w.t - e.t) > 0.001 || w.s !== e.s) {
      problems.push(`第 ${i + 1} 条与事件表不符：实际 ${e.t}s ${e.s} / 应为 ${w ? w.t + 's ' + w.s : '—'}`);
    }
  });
  if (log.length >= 2) {
    const errs = [];
    log.forEach((e) => {
      /* 真正影响音画同步的是「实际发起播放的时刻」与「计划触发时刻」之差 */
      const err = (e.call - e.plan) * 1000;
      errs.push(err);
      maxJitter = Math.max(maxJitter, Math.abs(err));
      console.log(`  ${e.t.toFixed(2).padStart(6)}s  ${e.s.padEnd(11)} ${String(e.g).padStart(4)}dB  ` +
                  `[${(e.path || '').padEnd(9)}] 触发偏差 ${err >= 0 ? '+' : ''}${err.toFixed(1)}ms`);
    });
    const spread = Math.max(...errs) - Math.min(...errs);
    console.log(`  → 偏差区间 ${Math.min(...errs).toFixed(1)}…${Math.max(...errs).toFixed(1)}ms，抖动带宽 ${spread.toFixed(1)}ms`);
  }
  console.log(`\n触发偏差峰值 ${maxJitter.toFixed(1)}ms（要求 < 30ms）${maxJitter < 30 ? '✅' : '❌'}`);
  console.log('注：webaudio 路径按计划时刻采样级触发（偏差 0）；element 路径（file:// 退路）另有固定的' +
              '起播延迟，已按 ELEM_LEAD 补偿 —— 固定延迟不产生音画不同步，只有偏差带宽才是误差。');
  if (maxJitter >= 30) problems.push(`触发偏差 ${maxJitter.toFixed(1)}ms ≥ 30ms`);

  /* 关闭音效（?sfx=0）时画面叙事必须完整 —— 只验证不触发音频 */
  await b.goto(fileUrl(htmlPath) + '?sfx=0', { settleFrames: 4 });
  await new Promise((r) => setTimeout(r, 1500));
  const off = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ s: window.__audioStatus(), t: window.__state().t })', returnByValue: true })).result.value);
  console.log(`?sfx=0 时：音频 ${off.s.on ? '仍开启 ❌' : '关闭 ✅'}，画面继续播放到 ${off.t.toFixed(1)}s`);
  if (off.s.on) problems.push('?sfx=0 未关闭音频');
} finally { await b.close(); }

console.log('\n' + (problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ 音效触发与事件表逐条一致，抖动达标'));
process.exitCode = problems.length ? 1 : 0;

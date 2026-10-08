// 版面体检：在每个分镜“文字全部出场后”的时刻，量一遍所有文本块的实际几何
// 用法: node check.mjs <html路径>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../control-illusion.html');
const b = await launch({ width: 1920, height: 1080 });

const PROBE = `(function(){
  var out = { scenes: [], scenes_meta: [] };
  var secs = document.querySelectorAll('.scene');
  for (var i = 0; i < secs.length; i++) {
    var sec = secs[i];
    var body = sec.querySelector('.body');
    var lines = sec.querySelectorAll('.line');
    out.scenes_meta.push({ i: i, lines: lines.length });
  }
  return out.scenes_meta;
})()`;

try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });

  // 每个分镜的“全部出场”时刻由页面自身的排布决定，这里直接问页面
  const meta = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var res = [];
      var secs = document.querySelectorAll('.scene');
      for (var i = 0; i < secs.length; i++) {
        var lines = secs[i].querySelectorAll('.line');
        var last = lines[lines.length - 1];
        res.push({ lines: lines.length, lastStart: last.__start, lastEnd: last.__start + last.__fade });
      }
      return res;
    })())`,
    returnByValue: true
  });
  const scenes = JSON.parse(meta.result.value);

  const report = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const probeAt = (s.lastEnd + 0.15).toFixed(2);
    const r = await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${probeAt});
        var sec = document.querySelectorAll('.scene')[${i}];
        var lines = sec.querySelectorAll('.line');
        var rects = [];
        var minTop = 1e9, maxBottom = -1e9, minLeft = 1e9, maxRight = -1e9;
        var minOpacity = 1, minActive = 1, lastPara = -1;
        for (var m = 0; m < lines.length; m++) lastPara = Math.max(lastPara, lines[m].__para);
        for (var j = 0; j < lines.length; j++) {
          var el = lines[j];
          var rc = el.getBoundingClientRect();
          var scale = ${1920} / window.innerHeight;
          // 换算回 1080x1920 画布坐标
          var stage = document.getElementById('stage').getBoundingClientRect();
          var k = stage.width / 1080;
          var x = (rc.left - stage.left) / k, y = (rc.top - stage.top) / k;
          var w = rc.width / k, h = rc.height / k;
          rects.push({ i: j, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
                       fs: parseFloat(getComputedStyle(el).fontSize), op: +el.style.opacity });
          minTop = Math.min(minTop, y); maxBottom = Math.max(maxBottom, y + h);
          minLeft = Math.min(minLeft, x); maxRight = Math.max(maxRight, x + w);
          minOpacity = Math.min(minOpacity, +el.style.opacity);
          if (el.__para === lastPara) minActive = Math.min(minActive, +el.style.opacity);
        }
        return { t: ${probeAt}, scene: ${i}, lines: lines.length,
                 minTop: Math.round(minTop), maxBottom: Math.round(maxBottom),
                 minLeft: Math.round(minLeft), maxRight: Math.round(maxRight),
                 minOpacity: minOpacity, minActive: minActive, rects: rects,
                 sceneOpacity: +sec.style.opacity, secTransform: sec.style.transform };
      })())`,
      returnByValue: true
    });
    report.push(JSON.parse(r.result.value));
  }

  const SAFE = { top: 108, bottom: 1920 - 190, left: 82, right: 1080 - 82 };
  let problems = 0;
  for (const r of report) {
    const overflow = [];
    if (r.minTop < SAFE.top) overflow.push('top');
    if (r.maxBottom > SAFE.bottom) overflow.push('bottom');
    if (r.minLeft < SAFE.left) overflow.push('left');
    if (r.maxRight > SAFE.right) overflow.push('right');
    const flags = [];
    if (overflow.length) flags.push('溢出:' + overflow.join(','));
    if (r.minActive < 0.999) flags.push('当前段落未完全显示 op=' + r.minActive);
    if (r.sceneOpacity < 0.999) flags.push('分镜未完全显示 op=' + r.sceneOpacity);
    if (flags.length) problems++;
    console.log(
      `分镜${r.scene + 1} t=${r.t}s 行数=${r.lines} ` +
      `内容区 y=${r.minTop}..${r.maxBottom} x=${r.minLeft}..${r.maxRight} ` +
      `当前段op=${r.minActive} 最暗行op=${r.minOpacity} 分镜op=${r.sceneOpacity} ` +
      (flags.length ? '  ❌ ' + flags.join(' | ') : '  ✅')
    );
    console.log('    ' + r.rects.map((q) => `#${q.i + 1} ${q.fs}px h${q.h}`).join('  '));
  }
  console.log(problems ? `\n共 ${problems} 个分镜存在问题` : '\n全部 6 个分镜版面正常');
} finally {
  await b.close();
}

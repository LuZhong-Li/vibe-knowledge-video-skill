// 全片逐屏体检：每屏在「文字全部出场后、开始淡出前」的时刻量一遍
// 用法: node film-check.mjs <html路径>
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const b = await launch({ width: 1920, height: 1080, port: 9390 });
/* 画布与安全框从页面读（v3.3 起支持 16:9 / 2K 切换，脚本不再写死尺寸） */
let SAFE = null, CW = 1920, CH = 1080, CV = null;
/* 每屏的图形结构（与 control-illusion-v2.html 的构建代码一致），用于版式签名 */
const STRUCT_FEATURES = {
  1: ['圆环生长', '金球聚拢', '灰球弥散'],
  2: ['球阵列', '中缝VS'],
  3: ['数据框', '数量条'],
  4: ['线描图标'],
  5: ['大脑图形'],
  6: []
};

try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);
  SAFE = CV.safe; CW = CV.w; CH = CV.h;
  const meta = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var P = window.__pieces(), S = window.__screens(), out = [];
      for (var i = 0; i < S.length; i++) {
        var ps = P.filter(function(p){ return p.s === i; });
        var last = Math.max.apply(null, ps.map(function(p){ return p.start; }));
        out.push({ i:i, label:S[i].label, t0:S[i].t0, t1:S[i].t1,
                   probe: Math.min(S[i].t1 - 1.3, last + 1.05), count: ps.length,
                   metal: ps.filter(function(p){ return p.metal; }).length });
      }
      return out;
    })())`,
    returnByValue: true
  });
  const screens = JSON.parse(meta.result.value);

  let problems = 0;
  const signatures = [];
  for (const s of screens) {
    const r = await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${s.probe});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var k = stage.width / ${CW};
        function box(el){ var r = el.getBoundingClientRect();
          return { x:(r.left-stage.left)/k, y:(r.top-stage.top)/k, w:r.width/k, h:r.height/k }; }
        var pieces = [].slice.call(document.querySelectorAll('.piece[data-screen="${s.i}"]'));
        var res = { items: [], vis: 0, minTop: 1e9, maxBottom: -1e9, minLeft: 1e9, maxRight: -1e9 };
        pieces.forEach(function(el){
          var b = box(el), op = +el.style.opacity || 0;
          if (op <= 0.02) return;
          res.items.push({ lv: el.getAttribute('data-lv'), fs: parseFloat(getComputedStyle(el).fontSize),
                           kai: el.classList.contains('kai'), vert: el.classList.contains('vert'),
                           tag: el.classList.contains('tag'),
                           rot: (el.style.transform || '').indexOf('rotate') >= 0,
                           op: op, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h),
                           t: el.textContent.slice(0, 6), metal: el.classList.contains('metal') });
          res.minTop = Math.min(res.minTop, b.y); res.maxBottom = Math.max(res.maxBottom, b.y + b.h);
          res.minLeft = Math.min(res.minLeft, b.x); res.maxRight = Math.max(res.maxRight, b.x + b.w);
          res.vis++;
        });
        var cap = document.getElementById('caption').getBoundingClientRect();
        res.capX = Math.round((cap.left - stage.left)/k);
        res.capRight = Math.round((cap.right - stage.left)/k);
        res.capTop = Math.round((cap.top - stage.top)/k);
        res.capBottom = Math.round((cap.bottom - stage.top)/k);
        res.capText = document.getElementById('caption').querySelector('.note').textContent;
        /* 环绕文字只在本屏可见时才算（按首字不透明度判定，而不是按元素存在） */
        res.rings = [].some.call(document.querySelectorAll('.ringtext'), function(box){
          var s = box.querySelector('span');
          return !!s && (+s.style.opacity || 0) > 0.05;
        }) ? 1 : 0;
        return res;
      })())`,
      returnByValue: true
    });
    const d = JSON.parse(r.result.value);
    const sizes = d.items.map((i) => i.fs);
    const minFs = sizes.length ? Math.min.apply(null, sizes) : 0;
    const maxFs = sizes.length ? Math.max.apply(null, sizes) : 0;
    const capFs = 28;
    const ratio = minFs ? (maxFs / capFs) : 0;
    const over = [];
    if (d.minTop < SAFE.top - 0.5) over.push('top' + Math.round(d.minTop));
    if (d.maxBottom > SAFE.bottom + 0.5) over.push('bottom' + Math.round(d.maxBottom));
    if (d.minLeft < SAFE.left - 0.5) over.push('left' + Math.round(d.minLeft));
    if (d.maxRight > SAFE.right + 0.5) over.push('right' + Math.round(d.maxRight));
    if (d.capBottom > CH - 24) over.push('captionB' + Math.round(d.capBottom));
    if (d.capRight > CW - CW * 0.03) over.push('captionR' + Math.round(d.capRight));
    const flag = over.length ? '❌ ' + over.join(',') : '✅';
    if (over.length) problems++;
    /* 版式签名：文字形态（DOM 实测） + 图形结构（本片固定，写在 STRUCT_FEATURES 里） */
    const sig = [];
    if (d.items.some((i) => i.vert)) sig.push('竖排');
    if (d.items.some((i) => i.rot)) sig.push('斜排');
    if (d.items.some((i) => i.tag)) sig.push('标签');
    if (d.items.some((i) => i.kai)) sig.push('楷体');
    if (d.items.some((i) => i.fs >= 140)) sig.push('超大数字');
    if (d.items.filter((i) => i.fs >= 88).length >= 3) sig.push('大字群');
    if (d.rings > 0) sig.push('环绕文字');
    const structural = STRUCT_FEATURES[s.i] || [];
    structural.forEach((f) => sig.push(f));
    signatures.push({ s: s.i + 1, label: s.label, sig: sig.join('+') });
    /* 文字块两两重叠检测（同一屏内，可见的才算） */
    const clash = [];
    for (let a = 0; a < d.items.length; a++) {
      for (let c = a + 1; c < d.items.length; c++) {
        const A = d.items[a], B = d.items[c];
        const hit = !(A.x + A.w <= B.x || B.x + B.w <= A.x || A.y + A.h <= B.y || B.y + B.h <= A.y);
        if (hit) clash.push(`${A.t}×${B.t}`);
      }
    }
    if (clash.length) problems++;
    console.log(
      `S${s.i + 1} ${s.label}  t=${s.probe.toFixed(1)}s  可见${d.vis}块  ` +
      `y ${Math.round(d.minTop)}..${Math.round(d.maxBottom)}  x ${Math.round(d.minLeft)}..${Math.round(d.maxRight)}  ` +
      `字号 ${minFs}–${maxFs}  层级比 ${ratio.toFixed(1)}×  ${flag}` +
      (clash.length ? `  重叠 ${clash.length}处: ${clash.slice(0, 4).join(' ')}` : '')
    );
    if (s.metal) {
      const m = d.items.filter((i) => i.metal).map((i) => `${i.t}(${i.fs}px)`).join(' ');
      console.log(`     金属字: ${m}`);
    }
  }
  console.log(problems ? `\n${problems} 个分镜存在问题` : '\n七屏版面全部通过');
  /* 放行条件 2：相邻两屏版式不得撞车 */
  console.log('\n版式签名（相邻两屏至少要有 2 项差异）：');
  let clash = 0;
  for (let i = 0; i < signatures.length; i++) {
    const a = signatures[i];
    let line = `S${a.s} ${a.label}  ${a.sig}`;
    if (i > 0) {
      const prev = signatures[i - 1].sig.split('+');
      const cur = a.sig.split('+');
      const diff =
        prev.filter((x) => !cur.includes(x)).length + cur.filter((x) => !prev.includes(x)).length;
      line += `   （与 S${signatures[i - 1].s} 差异 ${diff} 项${diff < 2 ? ' ❌ 撞车' : ' ✅'}）`;
      if (diff < 2) clash++;
    }
    console.log('  ' + line);
  }
  if (clash) console.log(`❌ 有 ${clash} 对相邻分镜版式过于接近`);
} finally {
  await b.close();
}

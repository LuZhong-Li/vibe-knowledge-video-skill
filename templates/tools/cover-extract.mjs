// 封面素材抽取：把 v7 成片里「已经有」的图形导出成静态素材，封面只做静态缩放，不重画。
//
// 用法: node cover-extract.mjs [--film ../v2/control-illusion-v2.html]
//                              [--cover ../v2/cover-C-A.html]
//                              [--out ../qa/v2/v7/cover/assets]
//
// 产物：
//   plate-bg.png         1920×1080  S1 静帧背景板（t=5.20s，S1 读字静止段）
//                                    粒子亮度 ×0.35，且「核心区不画粒子」（直接改绘制，不是事后擦）
//   bar-gold.png         左柱（自己选择 · 实验组）transparent，2× 抓取
//   bar-gray.png         右柱（随机分配 · 对照组）transparent，2× 抓取
//   num4x-ref.png        4× 金属字 transparent（归档参照；封面里 4× 用同一份 .metal 材质现渲染）
//   ref-s1-5.20s.png     成片 S1 原帧（对照用，未压缩未改）
//   ref-s4-53.50s.png    成片 S4 原帧（柱体素材的出处）
//   assets.json          抽取参数 + 实测数据（柱体原始像素、粒子统计、时间码）
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const filmPath = path.resolve(arg('film', '../v2/control-illusion-v2.html'));
const coverPath = path.resolve(arg('cover', '../qa/v2/v7/cover/cover-C-A.html'));
const outDir = path.resolve(arg('out', '../qa/v2/v7/cover/assets'));
const PLATE_T = parseFloat(arg('plate-t', '5.20'));    // S1 读字静止段 4.5–6.0s 的中点
const S4_T = parseFloat(arg('s4-t', '53.50'));         // S4：柱体生长完成 + 4× 已落地
fs.mkdirSync(outDir, { recursive: true });

/* 版面表从封面源里读：抽帧脚本与封面共用同一份 JSON（单一事实来源） */
const coverHtml = fs.readFileSync(coverPath, 'utf8');
const layoutMatch = coverHtml.match(/<script id="coverLayout" type="application\/json">([\s\S]*?)<\/script>/);
if (!layoutMatch) throw new Error('封面里找不到 <script id="coverLayout"> 版面表');
const LAYOUT = JSON.parse(layoutMatch[1]);
/* 封面源里的素材路径是相对 asset 目录写的；这里换算成「相对成片 html」，
   这样抽帧脚本里用到的 coreBoxes / barSource 与封面完全同源，路径各自独立。 */
const relToFilm = (p) => path.posix.join(
  path.relative(path.dirname(filmPath), outDir).replace(/\\/g, '/'), p);

const b = await launch({ width: 1920, height: 1080, gpu: true, extraArgs: ['--allow-file-access-from-files'] });
const shot = async (file, clip) => {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 };
  const res = await b.page.send('Page.captureScreenshot', params);
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  return file;
};
const evaluate = async (expr) => {
  const r = await b.page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
  return r.result.value;
};

/* ---------- 注入粒子补丁：①录下每次粒子绘制 ②亮度 ×dim ③核心区不画粒子 ----------
   背景画布上只有「粒子」用字符串 rgba fillStyle + arc + fill 画（BLOBS/光带/射线用 CanvasGradient，
   射线与曲线走 stroke），所以这个判别式是精确的，不会误伤底噪或光晕。 */
const PATCH = `(function(){
  var P = CanvasRenderingContext2D.prototype;
  if (P.__coverPatched) return 'already';
  var _arc = P.arc, _fill = P.fill;
  P.arc = function(x, y, r){ this.__lastArc = [x, y, r]; return _arc.apply(this, arguments); };
  P.fill = function(){
    var st = this.fillStyle, C = window.__cov;
    if (C && typeof st === 'string' && st.indexOf('rgba') === 0) {
      var m = st.replace(/\\s+/g, '').match(/^rgba\\(([\\d.]+),([\\d.]+),([\\d.]+),([\\d.]+)\\)$/);
      var a = this.__lastArc;
      if (m && a) {
        var rec = { x:+a[0].toFixed(2), y:+a[1].toFixed(2), r:+a[2].toFixed(2), a:+m[4] };
        rec.inCore = C.core.some(function(bx){
          return rec.x >= bx.x - rec.r && rec.x <= bx.x + bx.w + rec.r &&
                 rec.y >= bx.y - rec.r && rec.y <= bx.y + bx.h + rec.r;
        });
        C.drawn.push(rec);
        if (rec.inCore && C.skipCore) return;                    // 核心区：这颗粒子不画
        this.fillStyle = 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + (+m[4] * C.dim).toFixed(5) + ')';
      }
    }
    return _fill.apply(this, arguments);
  };
  P.__coverPatched = true;
  return 'patched';
})()`;

await b.goto(fileUrl(filmPath) + '?t=' + PLATE_T, { settleFrames: 4 });
console.log('粒子补丁:', await evaluate(PATCH));

const setCov = async (dim, skipCore) => evaluate(
  `window.__cov = { dim:${dim}, skipCore:${skipCore}, core:${JSON.stringify(LAYOUT.coreBoxes)}, drawn: [] }; 'ok'`);

/* 各层显示开关（每次显式设一遍，避免残留） */
const VIEW = `(function(mode, keep){
  var q = function(s){ return document.querySelector(s); };
  var show = function(s, on){ document.querySelectorAll(s).forEach(function(e){
    e.style.display = on ? '' : 'none'; }); };
  var stage = q('#stage');
  var frame = mode === 'frame';
  show('#bg,#grain,#vignette', mode === 'plate' || frame);
  show('#balls,#kicker,#caption,#progress,#ringS2', frame);
  show('#structures .vbar, #structures .mball, #structures .hline, #structures .vaxis, #structures .b7ghost, #structures .brainWrap, #structures .brainDot, #structures .pnote', frame);
  show('#texts .piece', frame);
  if (mode === 'asset') {
    document.querySelectorAll('#structures *').forEach(function(e){ e.style.display = 'none'; });
    document.querySelectorAll('#texts .piece').forEach(function(e){ e.style.display = 'none'; });
    document.querySelectorAll('#balls *').forEach(function(e){ e.style.display = 'none'; });
    if (keep && keep.struct != null) {
      var bars = document.querySelectorAll('#structures .vbar');
      if (bars[keep.struct]) { bars[keep.struct].style.display = ''; }
    }
    if (keep && keep.pieceText) {
      document.querySelectorAll('#texts .piece').forEach(function(e){
        if (e.textContent === keep.pieceText) e.style.display = ''; });
    }
    stage.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    q('#viewport').style.background = 'transparent';
  } else {
    stage.style.background = '';
    document.documentElement.style.background = '';
    document.body.style.background = '';
    q('#viewport').style.background = '';
  }
  return mode;
})`;
const setView = (mode, keep) => evaluate(`${VIEW}(${JSON.stringify(mode)}, ${JSON.stringify(keep || null)})`);

const setTransparent = (on) => b.page.send('Emulation.setDefaultBackgroundColorOverride',
  on ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});

const report = {
  generatedAt: new Date().toISOString(),
  film: path.relative(path.resolve('..'), filmPath).replace(/\\/g, '/'),
  cover: path.relative(path.resolve('..'), coverPath).replace(/\\/g, '/'),
  urlsFromCover: { plate: relToFilm('plate-bg.png'), barGold: relToFilm('bar-gold.png'), barGray: relToFilm('bar-gray.png') },
  plate: { t: PLATE_T, particleDim: LAYOUT.particleDim, core: LAYOUT.coreBoxes },
  bars: { t: S4_T, scale: LAYOUT.assets.capture.scale, pad: LAYOUT.assets.capture.pad }
};

/* ---------- ① 背景板：S1 静帧 + 粒子 ×0.35 + 核心区无粒子 ---------- */
await setTransparent(false);
await setCov(LAYOUT.particleDim, true);
await evaluate(`window.__seek(${PLATE_T})`);
await setView('plate');
await evaluate(`window.__seek(${PLATE_T})`);              // 隐藏图层后再渲一帧，粒子统计同步刷新
report.plate.light = await evaluate('window.__light()');
report.plate.particles = await evaluate(`(function(){
  var d = window.__cov.drawn, inC = d.filter(function(p){ return p.inCore; });
  var drawn = d.filter(function(p){ return !p.inCore; });
  return { total: d.length, skippedInCore: inC.length, drawnOutside: drawn.length,
           maxAlphaDrawn: drawn.reduce(function(m,p){ return Math.max(m, p.a); }, 0),
           maxAlphaInCoreIfDrawn: inC.reduce(function(m,p){ return Math.max(m, p.a); }, 0) };
})()`);
const stageRect = await evaluate(`(function(){ var r = document.getElementById('stage').getBoundingClientRect();
  return { x:r.left, y:r.top, width:r.width, height:r.height }; })()`);
await shot(path.join(outDir, 'plate-bg.png'), stageRect);
report.plate.file = 'plate-bg.png';
report.plate.px = [Math.round(stageRect.width), Math.round(stageRect.height)];
report.plate.bytes = fs.statSync(path.join(outDir, 'plate-bg.png')).size;
console.log('✓ plate-bg.png  粒子', JSON.stringify(report.plate.particles));

/* ---------- ② 成片原帧（对照 / 出处留档） ---------- */
await setView('frame');
await evaluate(`window.__seek(${PLATE_T})`);
await shot(path.join(outDir, 'ref-s1-5.20s.png'), stageRect);
await setCov(1, false);
await evaluate(`window.__seek(${S4_T})`);
await setView('frame');
await evaluate(`window.__seek(${S4_T})`);
await shot(path.join(outDir, 'ref-s4-53.50s.png'), stageRect);
console.log('✓ ref-s1 / ref-s4 原帧');

/* ---------- ③ S4 两根柱子：量原始像素 → 透明底 2× 抓取 ---------- */
const barsInfo = await evaluate(`(function(){
  var st = document.getElementById('stage').getBoundingClientRect();
  return [].map.call(document.querySelectorAll('#structures .vbar'), function(el){
    var r = el.getBoundingClientRect();
    return { cls: el.className, x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height,
             opacity: el.style.opacity, transform: el.style.transform };
  });
})()`);
console.log('S4 柱体实测:', JSON.stringify(barsInfo));
if (barsInfo.length !== 2) throw new Error('S4 里没量到两根柱子，检查时间码 ' + S4_T);

await b.page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
await setTransparent(true);
report.bars.measured = [];
report.bars.geometryFix = {
  note: '正片 bar() 把柱体 top 设成 ry(0.885)（= 柱底），柱身高度没减掉，475px 金柱有 88% 落在画外（成片 S4 只剩 124px 柱头）。' +
        '音效事件名是「对比柱从底部生长」，说明本意是「柱底对齐 y=956、向上长」。封面按本意把柱底锚到 baseline，' +
        '柱体材质仍取正片 .vbar-gold / .vbar-gray 同一份 CSS，不重画图形。',
  filmNative: barsInfo.map(function (b) { return [b.x, b.y, b.w, b.h]; }),
  filmAnchorY: 956
};
for (let i = 0; i < 2; i++) {
  await setCov(1, false);
  await evaluate(`window.__seek(${S4_T})`);
  await setView('asset', { struct: i });
  /* 按封面尺寸重渲柱体（只是改 CSS 尺寸，材质/渐变/圆角/外发光仍是正片那一份），
     并把柱底锚到 y=956（正片漏掉的 -h），避免把「掉出画外的柱头」当成素材。 */
  const target = LAYOUT.bars[i];
  await evaluate(`(function(){
    var el = document.querySelectorAll('#structures .vbar')[${i}];
    var filmTop = el.offsetTop;
    el.style.left = '400px';
    el.style.top = (filmTop - ${target.h}) + 'px';
    el.style.width = '${target.w}px';
    el.style.height = '${target.h}px';
    el.style.transform = 'scaleY(1)';
    el.__coverFilmTop = filmTop;
    return true;
  })()`);
  await evaluate(`window.__seek(${S4_T})`);
  const pad = LAYOUT.assets.capture.pad;
  const clip = { x: stageRect.x + 400 - pad, y: stageRect.y + (956 - target.h) - pad,
                 width: target.w + pad * 2, height: target.h + pad * 2 };
  const file = i === 0 ? 'bar-gold.png' : 'bar-gray.png';
  await shot(path.join(outDir, file), clip);
  report.bars.measured.push({ file, cls: barsInfo[i].cls, filmClass: target.filmClass,
    source: { cssRect: [barsInfo[i].x, barsInfo[i].y, barsInfo[i].w, barsInfo[i].h], opacity: barsInfo[i].opacity },
    rendered: { w: target.w, h: target.h, bottom: target.baseline, top: 956 - target.h },
    pad, devicePx: [(target.w + pad * 2) * 2, (target.h + pad * 2) * 2] });
  console.log(`✓ ${file}  按封面尺寸重渲 ${target.w}×${target.h} @2x（柱底 y=956）`);
}

/* 4× 金属字：透明底归档参照（封面里用同一份 .metal 材质现渲染，不走这张图） */
await setCov(1, false);
await evaluate(`window.__seek(${S4_T})`);
await setView('asset', { pieceText: '4×' });
await evaluate(`window.__seek(${S4_T})`);
const numRect = await evaluate(`(function(){
  var st = document.getElementById('stage').getBoundingClientRect();
  var el = [].filter.call(document.querySelectorAll('#texts .piece'), function(e){ return e.textContent === '4×'; })[0];
  var r = el.getBoundingClientRect();
  return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height, fs: el.style.fontSize };
})()`);
await shot(path.join(outDir, 'num4x-ref.png'),
  { x: stageRect.x + numRect.x - 40, y: stageRect.y + numRect.y - 40, width: numRect.w + 80, height: numRect.h + 80 });
report.num4x = numRect;
console.log('✓ num4x-ref.png 透明底', JSON.stringify(numRect));

await setTransparent(false);
await b.page.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await b.close();

fs.writeFileSync(path.join(outDir, 'assets.json'), JSON.stringify(report, null, 2) + '\n');
console.log('✓ assets.json →', path.relative(process.cwd(), path.join(outDir, 'assets.json')));

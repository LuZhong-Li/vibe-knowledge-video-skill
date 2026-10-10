// 封面素材抽取（数字「0」款）：从成片抽「背景引擎层」当封面底图，不重画任何图形。
// 本项目的封面方案没有柱体素材，所以用这个脚本替代样例里按柱体抽取的 cover-extract.mjs。
// 用法: node cover-plate.mjs [--film survivorship-bias.html] [--cover cover/cover-0.html]
//                            [--out cover] [--t 49.5] [--dim 0.35]
// 产物: plate-bg.png（1920×1080 背景板）· ref-s3-49.5s.png（成片原帧，对照用）· assets.json（出处）
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const filmPath = path.resolve(arg('film', 'survivorship-bias.html'));
const coverPath = path.resolve(arg('cover', 'cover/cover-0.html'));
const outDir = path.resolve(arg('out', 'cover'));
const t = parseFloat(arg('t', '49.5'));
const dim = parseFloat(arg('dim', '0.35'));
fs.mkdirSync(outDir, { recursive: true });

/* 版面表从封面源里读：抽板脚本与封面共用同一份 JSON（单一事实来源） */
const coverHtml = fs.readFileSync(coverPath, 'utf8');
const m = coverHtml.match(/<script id="coverLayout" type="application\/json">([\s\S]*?)<\/script>/);
if (!m) throw new Error('封面里找不到 <script id="coverLayout"> 版面表');
const L = JSON.parse(m[1]);
/* 归一化核心区（页面里的 __plate 收归一化矩形） */
const boxes = (L.coreBoxes || []).map(function(b){
  return [b.x / L.stage.w, (b.y + b.h) / L.stage.h, (b.x + b.w) / L.stage.w, b.y / L.stage.h];
}).map(function(b){ return [Math.min(b[0], b[2]), Math.max(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[1], b[3])]; });

const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9371,
                         extraArgs: ['--allow-file-access-from-files'] });
const info = { film: path.basename(filmPath), t: t, dim: dim, coreBoxes: L.coreBoxes, coreNorm: boxes };
try {
  const stageClip = async () => {
    const st = (await b.page.send('Runtime.evaluate', { returnByValue: true,
      expression: `(function(){ var r = document.getElementById('stage').getBoundingClientRect();
        return { x:Math.round(r.left), y:Math.round(r.top), width:Math.round(r.width), height:Math.round(r.height), scale:1 }; })()`
    })).result.value;
    return st;
  };
  /* ① 成片原帧（对照用，未做任何处理） */
  await b.goto(`${fileUrl(filmPath)}?t=${t}`, { settleFrames: 6 });
  let res = await b.page.send('Page.captureScreenshot', { format: 'png', clip: await stageClip(), captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, `ref-s3-${t}s.png`), Buffer.from(res.data, 'base64'));
  info.refFrame = `ref-s3-${t}s.png`;

  /* ② 背景板：只画背景引擎层 + 粒子 ×dim + 核心区不画粒子 */
  const plateInfo = (await b.page.send('Runtime.evaluate', { returnByValue: true,
    expression: `JSON.stringify(window.__plate(${dim}, ${JSON.stringify(boxes)}))` })).result.value;
  info.plateHook = JSON.parse(plateInfo);
  await new Promise((r) => setTimeout(r, 300));
  res = await b.page.send('Page.captureScreenshot', { format: 'png', clip: await stageClip(), captureBeyondViewport: false });
  const platePath = path.join(outDir, 'plate-bg.png');
  fs.writeFileSync(platePath, Buffer.from(res.data, 'base64'));
  info.plate = { file:'plate-bg.png', size:fs.statSync(platePath).size, note:'背景引擎层：射线 / 光晕 / 粒子(×'+dim+') / 颗粒，核心区无粒子' };
  fs.writeFileSync(path.join(outDir, 'assets.json'), JSON.stringify(info, null, 2) + '\n');
  console.log('✓ plate-bg.png ' + (info.plate.size / 1024).toFixed(0) + ' KB ｜ ' +
              info.refFrame + ' ' + (fs.statSync(path.join(outDir, info.refFrame)).size / 1024).toFixed(0) + ' KB');
  console.log('  粒子 dim=' + dim + ' ｜ 核心区 ' + L.coreBoxes.length + ' 块 ｜ 出处 assets.json');
} finally { await b.close(); }

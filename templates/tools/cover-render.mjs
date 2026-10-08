// 封面出图：1920×1080 JPG(q90) + 缩略测试图（540×960 / 540×304），并打印版面实测。
// 用法: node cover-render.mjs [--cover ../qa/v2/v7/cover/cover-C-A.html]
//                             [--out ../qa/v2/v7/cover] [--name cover-C-A] [--no-thumb]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const coverPath = path.resolve(arg('cover', '../qa/v2/v7/cover/cover-C-A.html'));
const outDir = path.resolve(arg('out', '../qa/v2/v7/cover'));
const name = arg('name', 'cover-C-A');
const ffmpeg = arg('ffmpeg', 'ffmpeg');
fs.mkdirSync(outDir, { recursive: true });

const b = await launch({ width: 1920, height: 1080, gpu: true, port: 9360,
                         extraArgs: ['--allow-file-access-from-files'] });
try {
  await b.goto(fileUrl(coverPath), { settleFrames: 6 });
  await b.page.send('Runtime.evaluate', { expression: 'window.__ready', awaitPromise: true });
  const geo = (await b.page.send('Runtime.evaluate', { expression: 'window.__cover()', returnByValue: true })).result.value;

  const stage = (await b.page.send('Runtime.evaluate', {
    expression: `(function(){ var r = document.getElementById('stage').getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; })()`,
    returnByValue: true })).result.value;

  const clip = { x: stage.x, y: stage.y, width: stage.width, height: stage.height, scale: 1 };
  const png = path.join(outDir, `${name}-1920x1080.png`);
  const jpg = path.join(outDir, `${name}-1920x1080.jpg`);
  let res = await b.page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  fs.writeFileSync(png, Buffer.from(res.data, 'base64'));
  res = await b.page.send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip, captureBeyondViewport: false });
  fs.writeFileSync(jpg, Buffer.from(res.data, 'base64'));
  console.log(`✓ ${name}-1920x1080.jpg  q90  ${(fs.statSync(jpg).size / 1024).toFixed(0)} KB  (master png ${(fs.statSync(png).size / 1024).toFixed(0)} KB)`);

  console.log('--- 版面实测（CSS px @1920×1080）---');
  console.log(JSON.stringify(geo, null, 1));

  if (process.argv.indexOf('--no-thumb') < 0) {
    const t1 = path.join(outDir, `缩略测试-540x960.jpg`);
    const t2 = path.join(outDir, `缩略测试-540x304.jpg`);
    let r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', png, '-vf',
      'scale=540:304:flags=lanczos,pad=540:960:0:328:color=0x0A0A0C', '-q:v', '3', t1], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('ffmpeg 540×960 失败: ' + r.stderr);
    r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', png, '-vf',
      'scale=540:304:flags=lanczos', '-q:v', '3', t2], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('ffmpeg 540×304 失败: ' + r.stderr);
    console.log(`✓ 缩略测试-540x960.jpg ${(fs.statSync(t1).size / 1024).toFixed(0)} KB   ` +
                `缩略测试-540x304.jpg ${(fs.statSync(t2).size / 1024).toFixed(0)} KB`);
  }
  fs.writeFileSync(path.join(outDir, `${name}-layout.json`), JSON.stringify(geo, null, 2) + '\n');
} finally {
  await b.close();
}

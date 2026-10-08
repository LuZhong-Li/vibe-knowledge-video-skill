// 验收 A10：每个金属关键词的亮度峰值必须高于同屏任何白字
// 用法: node keyword-check.mjs <html路径>
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-'));
const b = await launch({ width: 1920, height: 1080, port: 9398 });

function stats(file) {
  const raw = execFileSync('ffmpeg', ['-v','error','-i',file,'-f','rawvideo','-pix_fmt','gray','-'], { maxBuffer: 1 << 28 });
  let sum = 0, max = 0, b140 = 0;
  for (const v of raw) { sum += v; if (v > max) max = v; if (v > 140) b140++; }
  return { max, bright: b140 * 100 / raw.length, mean: sum / raw.length };
}

try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const probe = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var P = window.__pieces(), S = window.__screens(), list = [];
      for (var i = 0; i < S.length; i++) {
        var ps = P.filter(function(p){ return p.s === i; });
        var metal = ps.filter(function(p){ return p.metal; })[0];
        if (!metal) continue;
        var white = ps.filter(function(p){ return !p.metal && (p.lv === 'L3' || p.lv === 'L2') })
                      .sort(function(a,b){ return b.fs - a.fs; })[0];
        var last = Math.max.apply(null, ps.map(function(p){ return p.start; }));
        /* 探针时刻：文字全部出场之后、且离切页还有 0.6s（旧值 1.3 会在 4s 的钩子幕上落到文字出场之前） */
        list.push({ i:i, label:S[i].label, probe: Math.min(S[i].t1 - 0.6, last + 1.05),
                    metal:{ t:metal.t, x:metal.x, y:metal.y }, white:{ t:white.t, x:white.x, y:white.y } });
      }
      return list;
    })())`,
    returnByValue: true
  });
  for (const s of JSON.parse(probe.result.value)) {
    await b.page.send('Runtime.evaluate', { expression: `window.__seek(${s.probe})` });
    const shot = await b.page.send('Page.captureScreenshot', { format: 'png' });
    const full = path.join(tmp, `s${s.i}.png`);
    fs.writeFileSync(full, Buffer.from(shot.data, 'base64'));
    /* 量测窗口 = 该分片自己的包围盒（+6px 余量）。
       固定大小的窗口会串到别的分片上（v4 里标签离标题很近，700px 窗口把标题也框进去了）。 */
    const boxes = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        function box(t){
          var el = [].filter.call(document.querySelectorAll('.piece[data-screen="${s.i}"]'), function(e){
            return e.textContent === t; })[0];
          if (!el) return null;
          var r = el.getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect();
          var k = st.width / 1920;
          return { x: Math.round((r.left-st.left)/k), y: Math.round((r.top-st.top)/k),
                   w: Math.round(r.width/k), h: Math.round(r.height/k) };
        }
        return { m: box(${JSON.stringify(s.metal.t)}), w: box(${JSON.stringify(s.white.t)}) };
      })())`, returnByValue: true
    })).result.value);
    const crop = (b2) => ({ x: Math.max(0, b2.x - 6), y: Math.max(0, b2.y - 6),
                            w: Math.min(1920 - Math.max(0, b2.x - 6), b2.w + 12),
                            h: Math.min(1080 - Math.max(0, b2.y - 6), b2.h + 12) });
    const cm = crop(boxes.m), cw = crop(boxes.w);
    const kw = path.join(tmp, `s${s.i}-kw.png`);
    execFileSync('ffmpeg', ['-v','error','-y','-i',full,'-vf',`crop=${cm.w}:${cm.h}:${cm.x}:${cm.y}`,kw]);
    const wf = path.join(tmp, `s${s.i}-w.png`);
    execFileSync('ffmpeg', ['-v','error','-y','-i',full,'-vf',`crop=${cw.w}:${cw.h}:${cw.x}:${cw.y}`,wf]);
    const a = stats(kw), c = stats(wf);
    const ok = a.max > c.max;
    console.log(
      `S${s.i + 1} ${s.label.padEnd(4)} 关键词「${s.metal.t}」峰值 ${String(a.max).padStart(3)} 亮部 ${a.bright.toFixed(1)}%  ` +
      `| 同屏白字「${s.white.t}」峰值 ${String(c.max).padStart(3)} 亮部 ${c.bright.toFixed(1)}%  ${ok ? '✅' : '❌ 重心反转'}`
    );
  }
} finally {
  await b.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

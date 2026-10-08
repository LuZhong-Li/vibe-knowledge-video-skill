// 层级比 / 安全区 体检
// 用法: node levels.mjs <html路径> <秒>
//   输出：该时刻屏幕上每个文字块的级别、字号、位置；并给出
//   「最大字号 ÷ 注释字号」的层级比、同屏正文行数、是否越出安全区。
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/shot-01.html');
const at = parseFloat(process.argv[3] || '7.5');

const b = await launch({ width: 1920, height: 1080 });
let CV = null;

try {
  await b.goto(fileUrl(htmlPath) + '?t=' + at, { settleFrames: 6 });
  CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);
  const res = await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      window.__seek(${at});
      var stage = document.getElementById('stage').getBoundingClientRect();
      var k = stage.width / ${CV.w};
      var out = [];
      var nodes = document.querySelectorAll('[data-lv]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var cs = getComputedStyle(el);
        var rc = el.getBoundingClientRect();
        out.push({
          lv: el.getAttribute('data-lv'),
          text: (el.textContent || '').slice(0, 14),
          fs: parseFloat(cs.fontSize),
          color: cs.color,
          op: +(el.style.opacity || cs.opacity),
          x: Math.round((rc.left - stage.left) / k),
          y: Math.round((rc.top - stage.top) / k),
          w: Math.round(rc.width / k),
          h: Math.round(rc.height / k),
          rows: Math.round(rc.height / (parseFloat(cs.fontSize) * parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)))
        });
      }
      return out;
    })())`,
    returnByValue: true
  });
  const items = JSON.parse(res.result.value);

  const SAFE = CV.safe;
  console.log(`\n【${path.basename(htmlPath)}】t = ${at}s\n`);
  console.log('级别  字号   透明度  位置(x,y)        尺寸(w×h)     文案');
  let max = 0, min = 1e9, over = 0;
  for (const it of items) {
    max = Math.max(max, it.fs);
    min = Math.min(min, it.fs);
    const bad = it.x < SAFE.left - 1 || it.y < SAFE.top - 1 ||
                (it.y + it.h) > SAFE.bottom + 1 || (it.x + it.w) > SAFE.right + 1;
    if (bad) over++;
    console.log(
      `${it.lv.padEnd(5)} ${String(it.fs).padStart(4)}px  ${String(it.op).padStart(5)}  ` +
      `(${String(it.x).padStart(4)},${String(it.y).padStart(4)})  ` +
      `${String(it.w).padStart(4)}×${String(it.h).padStart(4)}  ${it.text}` +
      (bad ? '   ❌越界' : '')
    );
  }
  const note = items.filter((i) => i.lv === 'L4');
  const noteFs = note.length ? Math.min(...note.map((i) => i.fs)) : min;
  console.log('\n最大字号 ' + max + 'px / 注释 ' + noteFs + 'px  =>  层级比 ' + (max / noteFs).toFixed(1) + '×');
  console.log('越界文字块: ' + over + (over ? ' ❌' : ' ✅'));
} finally {
  await b.close();
}

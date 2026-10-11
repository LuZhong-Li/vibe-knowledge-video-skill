// 项目自查探针：按时刻/按范围取光源位置、逐片文字盒、比例自证。
// 用法（cd templates/tools）:
//   node probe.mjs <html> --keys 14,26              光源关键帧（起止秒）
//   node probe.mjs <html> --light 14,26,0.5         这段里每 0.5s 的光源位置
//   node probe.mjs <html> --pieces 51               某一时刻每片文字的盒与亮度
//   node probe.mjs <html> --field                   比例自证（页面的 __field()）
// 约定：页面按 README §7.4 暴露 __seek / __light / __lightKeys / __canvas / __pieces；--field 需要页面自带 __field()。
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || 'survivorship-bias.html');
const argv = process.argv.slice(3);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] || '') : null; };

/* 端口随机化：写死端口会撞上上一次没退干净的调试实例（§12.2 坑 21 实测过一次） */
const PORT = 9500 + Math.floor(Math.random() * 300);
const b = await launch({ width: 1920, height: 1080, port: PORT });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });

  const light = opt('--light');
  if (light) {
    const [from, to, step] = light.split(',');
    const r = await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        var out = [];
        for (var t = ${from}; t <= ${to} + 0.001; t = +(t + ${step || 0.5}).toFixed(3)) {
          window.__seek(t); var L = window.__light();
          out.push(t.toFixed(2) + 's (' + Math.round(L.x) + ',' + Math.round(L.y) + ')');
        }
        return out; })())`, returnByValue: true,
    });
    console.log(JSON.parse(r.result.value).join('  '));
  }

  const keys = opt('--keys');
  if (keys) {
    const [from, to] = keys.split(',');
    const r = await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify(window.__lightKeys().filter(function(k){ return k.t >= ${from} && k.t <= ${to}; }))`,
      returnByValue: true,
    });
    console.log(JSON.parse(r.result.value).map((k) => `${k.t.toFixed(2)}s(${k.x},${k.y})`).join(' '));
  }

  const pieces = opt('--pieces');
  if (pieces) {
    const r = await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${pieces});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var cv = window.__canvas(), k = stage.width / cv.w;
        return [].map.call(document.querySelectorAll('.piece'), function(el){
          var box = el.getBoundingClientRect();
          return { t: el.textContent.slice(0, 12), s: el.getAttribute('data-screen'),
                   lv: el.getAttribute('data-lv'), op: +el.style.opacity || 0,
                   lf: el.getAttribute('data-lf'),
                   x: Math.round((box.left - stage.left) / k), y: Math.round((box.top - stage.top) / k),
                   w: Math.round(box.width / k), h: Math.round(box.height / k) };
        }).filter(function(p){ return p.op > 0.05; }); })())`, returnByValue: true,
    });
    JSON.parse(r.result.value).forEach((p) => console.log(
      `S${(+p.s) + 1} ${p.lv} op=${p.op.toFixed(2)} lf=${p.lf} 盒 ${p.x},${p.y} ${p.w}×${p.h}  ${p.t}`));
  }

  if (opt('--field') !== null) {
    const r = await b.page.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__field ? window.__field() : { error: "页面没有 __field() 钩子" })',
      returnByValue: true,
    });
    console.log(JSON.parse(r.result.value));
  }
} finally {
  await b.close();
}

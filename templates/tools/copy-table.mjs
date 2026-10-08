// 文案表导出：把页面里每一片文字按「屏 · 时间码 · 文案 · 角色 · 附着物品」导出成 markdown
// 用途：① 核对成片实际文案 ② 生成"纯脚本版"文案表（时间码 + 标签文字，可直接导入文案表）
// 用法: node copy-table.mjs <html路径> [--md <输出路径>] [--rects <秒>]
//       --rects 额外打印该时刻每一片可见文字的实测包围盒（排查间距/贴边用）
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const mdIdx = process.argv.indexOf('--md');
const mdOut = mdIdx > 0 ? path.resolve(process.argv[mdIdx + 1]) : null;
const rectIdx = process.argv.indexOf('--rects');
const rectAt = rectIdx > 0 ? parseFloat(process.argv[rectIdx + 1]) : null;

const b = await launch({ width: 1920, height: 1080, port: 9700 + Math.floor(Math.random() * 200) });
let screens, pieces, items, structs, total;
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const dump = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      screens: window.__screens(),
      pieces: window.__pieces(),
      items: window.__items(),
      structStarts: window.__screens().map(function(s,i){ return window.__structStarts(i); }),
      total: window.__state().total
    })`,
    returnByValue: true
  })).result.value);
  screens = dump.screens; pieces = dump.pieces; items = dump.items; structs = dump.structStarts; total = dump.total;
  if (rectAt != null) {
    const rects = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${rectAt});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var CV = window.__canvas();
        var k = stage.width / CV.w;
        return [].map.call(document.querySelectorAll('.piece'), function(el){
          var r = el.getBoundingClientRect();
          return { t: el.textContent.slice(0,14), s: +el.getAttribute('data-screen'), op: +el.style.opacity || 0,
                   x: Math.round((r.left-stage.left)/k), y: Math.round((r.top-stage.top)/k),
                   w: Math.round(r.width/k), h: Math.round(r.height/k) };
        }).filter(function(o){ return o.op > 0.05; });
      })())`, returnByValue: true
    })).result.value);
    console.log(`\n== t=${rectAt}s 可见文字包围盒（实测） ==`);
    rects.sort((a, z) => a.s - z.s || a.y - z.y).forEach((o) => {
      console.log(`  S${o.s + 1}  x ${String(o.x).padStart(4)}..${String(o.x + o.w).padStart(4)}  ` +
                  `y ${String(o.y).padStart(4)}..${String(o.y + o.h).padStart(4)}  (${o.w}×${o.h})  ` +
                  `α${o.op.toFixed(2)}  ${o.t}`);
    });
  }
} finally { await b.close(); }

const f2 = (v) => (v == null ? ' — ' : (+v).toFixed(2) + 's');
const role = (p) => {
  if (p.attach || p.tag) return p.tag ? '附着标签' : '附着注释';
  if (p.lv === 'L0' || p.lv === 'L1') return '主标题/关键词';
  if (p.vert) return '竖排边注';
  if (p.lv === 'L3' || p.lv === 'L4') return '散落注释';
  return '正文';
};

const lines = [];
lines.push(`# 成片文案表 · ${path.basename(htmlPath)}`);
lines.push('');
lines.push(`> 由 \`tools/copy-table.mjs\` 从页面实测导出：每片文字的**实际出场时刻**（= 动画事件同源的时间码）。`);
lines.push(`> 角色口径：主标题/关键词（L0/L1）· 附着标签（贴物品）· 散落注释（L3，低透明度短句）· 竖排边注。`);
lines.push(`> 画面动效与音效不在本表内 —— 本表只描述"观众读到什么、什么时候读到"。`);
lines.push('');
lines.push(`总时长：**${(+total).toFixed(3)}s** ｜ 画布 16:9 ｜ 幕数 ${screens.length} ｜ 文字片 ${pieces.length} 条`);
lines.push('');

screens.forEach((S, i) => {
  const ps = pieces.map((p, idx) => ({ ...p, idx })).filter((p) => p.s === i)
    .sort((a, z) => (a.start - z.start) || (a.idx - z.idx));
  lines.push(`## S${i + 1} · ${S.label}  ${S.t0}–${S.t1}s  ｜ 幕内字幕 ${S.note}`);
  lines.push('');
  lines.push('| 出场 | 文案 | 角色 | 贴在 | 层级 |');
  lines.push('| --- | --- | --- | --- | --- |');
  ps.forEach((p) => {
    const item = p.attach ? p.attach.item : (p.bind || '—');
    const txt = p.t.replace(/\|/g, '\\|');
    lines.push(`| ${f2(p.start)} | ${txt} | ${role(p)} | ${item} | ${p.lv} |`);
  });
  const gfx = (structs[i] || []).sort((a, z) => a - z);
  lines.push('');
  lines.push(`> 本屏图形事件（对照用）：${gfx.map((v) => f2(v)).join(' · ')}`);
  lines.push('');
});

const out = lines.join('\n');
console.log(out);
if (mdOut) {
  fs.mkdirSync(path.dirname(mdOut), { recursive: true });
  fs.writeFileSync(mdOut, out, 'utf8');
  console.log('\n写入 → ' + mdOut);
}

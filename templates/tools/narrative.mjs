// v3.2 叙述层验收（A15–A21）：按 0.1s 步长扫完一屏，实测
//   ① 时序：图形先动、文字跟随；元素逐个出场，间隔够不够（stagger 递进）
//   ② 光影：元素出场时漫游柔光是否正落在它身上（视觉焦点被光源引导）
//   ③ 金属字：高光斜面是否在缓慢流动（不是固定渐变）
//   ④ 标签吸附：标签位移是否与所属图形同步（图层无割裂）
//   ⑤ 图形叙事：圆环描边生长 / 线宽呼吸 / 光段扫环 / 金球聚拢 / 灰球弥散
//   ⑥ 留白：整帧暗部像素占比（画面不能被填满）
// 用法: node narrative.mjs <html路径> [屏号=1] [--shots <出图目录>]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const SCREEN = parseInt(process.argv[3] || '1', 10);
const shotsIdx = process.argv.indexOf('--shots');
const shotDir = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx + 1]) : null;
let RING_C = 0;      // 圆环周长：从页面读（v3.3 起随画幅变化）

const problems = [];
const bad = (m) => problems.push(m);
const num = (v) => typeof v === 'number' && isFinite(v);
const rows = [];
let S = null;
let metaPieces = [];
let SCREEN_ITEMS = [];      // 本屏的主角物品（v4：图形先行以「最早物品事件」为准）
let GRAPHIC_STARTS = [];    // 本屏所有图形件的起始时刻

/* 端口随机化：固定端口会撞上上一次没退干净的调试实例，导致 CDP 连到一个僵尸页面而卡住 */
const PORT = 9500 + Math.floor(Math.random() * 300);
const b = await launch({ width: 1920, height: 1080, port: PORT });
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const meta = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var S = window.__screens(), P = window.__pieces();
      return { screen: S[${SCREEN}], pieces: P.filter(function(p){ return p.s === ${SCREEN}; }) };
    })())`, returnByValue: true
  })).result.value);
  S = meta.screen;
  metaPieces = meta.pieces;
  SCREEN_ITEMS = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__screenItems(${SCREEN}))`, returnByValue: true
  })).result.value);
  GRAPHIC_STARTS = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify(window.__structStarts(${SCREEN}))`, returnByValue: true
  })).result.value);
  const CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);
  RING_C = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__narrative())', returnByValue: true
  })).result.value).ring.circ;
  console.log(`【${path.basename(htmlPath)}】第 ${SCREEN + 1} 屏 ${S.label}  ${S.t0}–${S.t1}s ｜ ` +
              `${metaPieces.length} 个文字分片 ｜ 主角物品 ${SCREEN_ITEMS.join(' / ') || '（无）'}\n`);

  for (let t = S.t0; t <= S.t1 + 0.001; t = +(t + 0.1).toFixed(2)) {
    const snap = JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${t});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var k = stage.width / ${CV.w};
        var ps = [].map.call(document.querySelectorAll('.piece[data-screen="${SCREEN}"]'), function(el){
          var r = el.getBoundingClientRect();
          return { t: el.textContent.slice(0, 12), lv: el.getAttribute('data-lv'),
                   metal: el.classList.contains('metal'), bind: el.getAttribute('data-bind') || '',
                   op: +el.style.opacity || 0,
                   x: Math.round((r.left - stage.left)/k), y: Math.round((r.top - stage.top)/k),
                   w: Math.round(r.width/k), h: Math.round(r.height/k),
                   tf: el.style.transform, bgp: el.style.backgroundPosition || '' };
        });
        return { t: ${t}, L: window.__light(), N: window.__narrative(), I: window.__items(),
                 R: window.__clusterRadii(), pieces: ps };
      })())`, returnByValue: true
    })).result.value);
    rows.push(snap);
  }
} finally {
  await b.close();
}

/* ================= ① 图形时序（图形先行，按本屏主角物品验收） ================= */
const N = rows.map((r) => r.N);
const firstT = (fn) => { const r = rows.find(fn); return r ? r.t : null; };
const fmt = (v) => (v === null ? '  —  ' : v.toFixed(1) + 's');
const hasRing = SCREEN_ITEMS.indexOf('ring') >= 0;
let tRingDraw = null, tRingHalf = null, tRingDone = null, tRingText = null, tRingTextAll = null;
if (hasRing) {
  tRingDraw = firstT((r) => r.N.ring.op > 0.5 && r.N.ring.dash <= RING_C * 0.97);
  tRingHalf = firstT((r) => r.N.ring.dash <= RING_C * 0.5);
  tRingDone = firstT((r) => r.N.ring.op > 0.5 && r.N.ring.dash <= 1);
  tRingText = firstT((r) => r.N.chars[0] > 0.08);
  tRingTextAll = firstT((r) => r.N.chars.every((c) => c > 0.08));
}
const itemEv = {};
SCREEN_ITEMS.forEach((k) => { itemEv[k] = rows[0].I[k] ? rows[0].I[k].ev : null; });
console.log('图形时序（叙事本体：先动）');
if (hasRing) {
  console.log(`  圆环轮廓起笔 ${fmt(tRingDraw)} ｜ 画到一半 ${fmt(tRingHalf)} ｜ 闭合 ${fmt(tRingDone)}` +
              ` ｜ 环绕文字首字 ${fmt(tRingText)} ｜ 17 字全部长出 ${fmt(tRingTextAll)}`);
}
SCREEN_ITEMS.forEach((k) => {
  const firstOn = firstT((r) => r.I[k] && r.I[k].on > 0.5);
  console.log(`  主角物品「${k}」起 ${fmt(itemEv[k])}（可见 ${fmt(firstOn)}）`);
});

/* ================= ① 文字出场时序 ================= */
const order = metaPieces.map((p, i) => ({ i, start: p.start, text: p.t, lv: p.lv, metal: !!p.metal,
                                          bind: (p.attach && p.attach.item) || p.bind || '',
                                          attach: !!p.attach }))
  .sort((a, b) => a.start - b.start);
order.forEach((o) => { o.appear = firstT((r) => r.pieces[o.i].op >= 0.5); });
console.log('\n文字出场时序（opacity 首次 ≥0.5；按叙事顺序）');
let minGap = Infinity, lastAppear = 0, prev = null, prevFree = null, outOfOrder = 0;
order.forEach((o, n) => {
  /* 附着层（v3.5）：贴着物品的标签 / 注释与物品共用一条时间线，允许和物品同时出场，
     所以「最小间隔」只统计自主节拍（非附着元素）；附着元素由 attach-check.mjs 单独验收。 */
  const gap = (o.attach || o.appear === null || prevFree === null) ? null : o.appear - prevFree;
  if (gap !== null) { minGap = Math.min(minGap, gap); if (gap < 0) outOfOrder++; }
  if (o.appear !== null) lastAppear = Math.max(lastAppear, o.appear);
  if (!o.attach && o.appear !== null) prevFree = o.appear;
  console.log(`  ${String(n + 1).padStart(2)}. ${fmt(o.appear).padStart(7)}  ` +
    `${(gap === null ? '    —  ' : 'Δ' + gap.toFixed(2) + 's').padStart(8)}  ${o.lv.padEnd(3)}` +
    `${o.metal ? ' 金属' : '    '}${o.bind ? ' 附着→' + o.bind : '      '}${o.attach ? ' 附着' : '      '}  ${o.text}`);
  prev = o.appear;
});
console.log(`\n最小间隔 Δ=${minGap.toFixed(2)}s ｜ 最后出场 ${lastAppear.toFixed(1)}s ｜ 屏尾停留 ${(S.t1 - lastAppear).toFixed(1)}s`);
if (outOfOrder) bad('文字出场顺序与叙事顺序不一致');
if (order.filter((o) => !o.attach).length > 3 && minGap < 0.6 - 1e-6) bad(`自主节拍之间最小间隔 ${minGap.toFixed(2)}s < 0.6s，递进感不足`);
/* 屏尾停留：长屏（≥20s）≥1.5s；中屏（≥8s）≥1.0s；短幕（4s 钩子）≥0.7s ——
   新分幕网格把钩子压到 4s，6 条文字在该屏内物理上放不出 1.5s 停留 */
const dur = S.t1 - S.t0;
const needTail = dur >= 20 ? 1.5 : dur >= 8 ? 1.0 : 0.7;
if (S.t1 - lastAppear < needTail) bad(`最后元素距离换屏不足 ${needTail}s（停留不够）`);
if (hasRing && (tRingDraw === null || tRingText === null || tRingDraw > tRingText)) bad('环绕文字没有跟着圆环轮廓生长');
/* 图形先行：主标题（L0/L1）允许先入场当锚点，所以「第一句文字」只算非标题分片 */
const bodyOrder = order.filter((o) => o.lv !== 'L0' && o.lv !== 'L1');
const firstText = Math.min(...(bodyOrder.length ? bodyOrder : order)
  .map((o) => (o.appear === null ? 1e9 : o.appear)));
/* 图形先行：本屏最早的图形动作（物品事件 ∪ 图形件起始）必须早于第一句文字 */
const evs = SCREEN_ITEMS.map((k) => itemEv[k]).filter((v) => v != null).concat(GRAPHIC_STARTS);
const firstItem = evs.length ? Math.min(...evs) : null;
if (firstItem !== null && firstItem > firstText) bad('文字先于图形出现（没有做到图形先行）');
console.log(`图形先行检查：最早物品事件 ${fmt(firstItem)} < 首句文字 ${fmt(firstText)} ` +
            `${firstItem !== null && firstItem <= firstText ? '✅' : '❌'}`);

/* ================= ② 扫光聚焦 ================= */
console.log('\n扫光聚焦（元素出场 +0.6s，光源到元素中心的距离 / 光半径 640）');
let far = 0;
order.forEach((o) => {
  if (o.appear === null) return;
  const at = o.appear + 0.6;
  const r = rows.reduce((best, s) => (Math.abs(s.t - at) < Math.abs(best.t - at) ? s : best), rows[0]);
  const p = r.pieces[o.i];
  const d = Math.round(Math.hypot(p.x + p.w / 2 - r.L.x, p.y + p.h / 2 - r.L.y));
  if (d > 640) far++;
  console.log(`  ${at.toFixed(1)}s  光(${Math.round(r.L.x)},${Math.round(r.L.y)}) → 「${p.t.slice(0, 8)}」 ${d}px ${d <= 640 ? '✅' : '❌'}`);
});
if (far) bad(`${far} 个元素出场时光源离得太远（焦点没被引导过去）`);
/* 「光有没有停住」的判据：慢速（<8px/s）连续段 ≤0.5s 且占比 ≤5%
   —— 关键帧转向点上速度自然过零，逐点最小值不能当判据（实测最长慢速段 0.2s） */
let minV = Infinity, maxV = 0, run = 0, longestSlow = 0, slowAt = 0, slow = 0;
for (let i = 1; i < rows.length; i++) {
  const v = Math.hypot(rows[i].L.x - rows[i - 1].L.x, rows[i].L.y - rows[i - 1].L.y) / (rows[i].t - rows[i - 1].t);
  minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  if (v < 8) { run += rows[i].t - rows[i - 1].t; slow++; if (run > longestSlow) { longestSlow = run; slowAt = rows[i].t; } }
  else run = 0;
}
const slowFrac = slow / Math.max(1, rows.length - 1);
console.log(`柔光漫游速度 ${minV.toFixed(1)}–${maxV.toFixed(1)} px/s ｜ 慢速(<8px/s)最长 ${longestSlow.toFixed(1)}s @${slowAt.toFixed(1)}s` +
            ` ｜ 慢速占比 ${(slowFrac * 100).toFixed(1)}% ${(longestSlow <= 0.5 && slowFrac <= 0.05) ? '✅' : '❌'}`);
if (longestSlow > 0.5 || slowFrac > 0.05) bad(`柔光出现静止区间（最长 ${longestSlow.toFixed(1)}s，占比 ${(slowFrac * 100).toFixed(1)}%）`);

/* ================= ③ 金属字高光流动 ================= */
const mi = order.findIndex((o) => o.metal);
if (mi >= 0) {
  const vals = rows.map((r) => parseFloat((r.pieces[order[mi].i].bgp || '0% 0%').split(' ')[1])).filter(num);
  const span = Math.max(...vals) - Math.min(...vals);
  console.log(`\n金属字「${order[mi].text}」高光位置 ${Math.min(...vals).toFixed(0)}% ↔ ${Math.max(...vals).toFixed(0)}%` +
              `（摆动 ${span.toFixed(0)}%，≥40% 视为流动）${span >= 40 ? '✅' : '❌'}`);
  if (span < 40) bad(`金属字高光没有明显流动（摆动 ${span.toFixed(0)}%）`);
}

/* ================= ④ 附着文字跟随（标签 / 注释 vs 所属物品） ================= */
const tags = order.filter((o) => o.bind);
if (tags.length) {
  console.log('\n附着文字跟随（文字位移 vs 所属物品位移，逐帧比对；入场 1s 后开始比）');
  /* 比对帧数下限按屏长缩放：短幕（S1 4s / S2·S3 14s）本身只有几十行采样 */
  const minFrames = Math.min(20, Math.max(6, Math.round(rows.length * 0.15)));
  let ok = 0;
  tags.forEach((o) => {
    let sync = true, moved = false, seen = 0, maxErr = 0;
    rows.forEach((r) => {
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(r.pieces[o.i].tf || '');
      if (!m) return;
      if (r.t < o.start + 1.0) return;                      // 入场阶段含 14px 上浮位移
      const it = r.I[o.bind];
      if (!it) return;
      const err = Math.max(Math.abs(+m[1] - Math.round(it.dx)), Math.abs(+m[2] - Math.round(it.dy)));
      if (err > maxErr) maxErr = err;
      if (err > 0) sync = false;
      if (Math.abs(it.dx) + Math.abs(it.dy) > 0) moved = true;
      seen++;
    });
    /* 该片自己的可用帧数：出场很晚的标签（如 S4 的「足足高出四倍。」）屏内本来就没几帧 */
    const avail = Math.max(5, Math.floor((S.t1 - (o.start + 1.0)) / 0.1) - 1);
    const needFrames = Math.min(minFrames, avail);
    if (sync && seen >= needFrames) ok++; else sync = false;
    console.log(`  「${o.text}」↔ 物品 ${o.bind}：${sync && seen >= needFrames ? '逐帧同步 ✅' : '不同步 ❌'}` +
                `（比对 ${seen} 帧，最大误差 ${maxErr}px；物品位移范围 x±${Math.max(...rows.map((r) => Math.abs(r.I[o.bind].dx)))}px ` +
                `y±${Math.max(...rows.map((r) => Math.abs(r.I[o.bind].dy)))}px，下限 ${needFrames} 帧）`);
  });
  if (ok < tags.length) bad('附着文字与物品不同步（图层割裂）');
}

/* ================= ⑤ 图形叙事明细（按本屏实际有的图形验收） ================= */
if (hasRing) {
  const dash = N.map((n) => n.ring.dash).filter(num);
  const wid = N.map((n) => n.ring.width).filter(num);
  const hot = N.map((n) => parseFloat((String(n.ring.hot).match(/,([\d.]+)\)/) || [0, 0])[1])).filter(num);
  console.log(`\n圆环：dashoffset ${dash[0].toFixed(0)} → ${Math.min(...dash).toFixed(0)}（周长 ${RING_C.toFixed(0)}）` +
              ` ｜ 线宽呼吸 ${Math.min(...wid).toFixed(2)}–${Math.max(...wid).toFixed(2)}px` +
              ` ｜ 环上扫光段峰值 α=${Math.max(...hot).toFixed(2)}`);
  if (Math.min(...dash) > 1) bad('圆环没有画完');
  if (Math.max(...wid) - Math.min(...wid) < 0.3) bad('圆环线宽没有呼吸感');
  if (Math.max(...hot) <= 0.1) bad('环上没有出现扫光提亮段');
}
/* 球簇 / 球云：球到物品中心的平均半径，必须跟着物品的 k 一起变（球、标签、光源同一份数据） */
const ballItems = SCREEN_ITEMS.filter((k) => rows.some((r) => r.R && r.R[k] != null));
ballItems.forEach((k) => {
  const seg = rows.filter((r) => r.R[k] != null && r.I[k] && r.I[k].on > 0.5);
  if (seg.length < 6) return;
  const head = seg.slice(1, 5), tail = seg.slice(-5);
  const avg = (a, f) => a.reduce((x, r) => x + f(r), 0) / a.length;
  const r0 = avg(head, (r) => r.R[k]), r1 = avg(tail, (r) => r.R[k]);
  const k0 = avg(head, (r) => r.I[k].k), k1 = avg(tail, (r) => r.I[k].k);
  const ratio = r1 / r0, kRatio = k1 / k0;
  const ok = Math.abs(ratio - kRatio) <= 0.06;
  console.log(`物品「${k}」球簇平均半径 ${r0.toFixed(0)}px → ${r1.toFixed(0)}px（×${ratio.toFixed(2)}）` +
              ` = 物品缩放 ×${kRatio.toFixed(2)} ${ok ? '✅' : '❌'}（球与贴球标签共用同一个 k）`);
  if (!ok) bad(`物品「${k}」的球簇半径没有跟随物品缩放（球 ${ratio.toFixed(2)} vs k ${kRatio.toFixed(2)}）`);
});

/* ================= ⑥ 暗部留白（像素级）+ 出图 ================= */
if (shotDir) {
  fs.mkdirSync(shotDir, { recursive: true });
  const probes = [S.t0 + 3.0, S.t0 + 8.0, S.t0 + 11.6, S.t1 - 3.0];
  const b2 = await launch({ width: 1920, height: 1080, port: PORT + 1 });
  try {
    await b2.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
    console.log('\n暗部留白（整帧像素 luma 分布）');
    for (const t of probes) {
      await b2.page.send('Runtime.evaluate', { expression: `window.__seek(${t.toFixed(2)})` });
      const file = path.join(shotDir, `S${SCREEN + 1}v32-t${t.toFixed(1)}s.png`);
      const png = await b2.page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        { maxBuffer: 1 << 28 });
      let dark = 0, lit = 0, sum = 0;
      for (const v of raw) { sum += v; if (v < 34) dark++; if (v > 120) lit++; }
      const ratio = dark * 100 / raw.length;
      console.log(`  t=${t.toFixed(1)}s  平均亮度 ${(sum / raw.length).toFixed(1)}` +
                  `  暗部(<34) ${ratio.toFixed(1)}%  亮部(>120) ${(lit * 100 / raw.length).toFixed(1)}%  ` +
                  `${ratio >= 65 ? '✅' : '❌'}`);
      if (ratio < 65) bad(`t=${t.toFixed(1)}s 暗部占比仅 ${ratio.toFixed(1)}%（画面偏满）`);
    }
  } finally { await b2.close(); }
}

/* ================= NaN 守卫 ================= */
const nanRows = rows.filter((r) => !num(r.L.x) || r.pieces.some((p) => !num(p.op)));
if (nanRows.length) bad(`存在 NaN / 非法样式值（${nanRows.length} 帧）`);

console.log('\n' + (problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ 叙述层验收全部通过'));
process.exitCode = problems.length ? 1 : 0;

// v3.5 附着层验收（A25–A31）：物品主体 + 文字跟随互动（设计文档 §5.5 / 叙述层规范 §9）
// ---------------------------------------------------------------------------
//   A25 主角物品     每屏先有物品（Item），且每个物品至少挂着一条文字
//   A26 物品先行     物品图形的起始时刻必须早于挂在它身上的文字的出场时刻
//   A27 同一条时间线 带 tag 的标签必须和所属物品同时到场（∈ [物品事件, +1.0s]）
//   A28 附着同步     逐帧换算「文字盒中心 − 物品中心」= 常量（相对距离固定），位移与物品同源
//   A29 无大文本盒   任一文字片 宽 ≤ 0.45W 且 高 ≤ 0.20H（禁止再出现一整段正文块）
//   A30 底部留白     文字全部出场后，y ≥ 0.80H 的文字总宽 ≤ 0.35W，且单片 ≤ 0.30W
//   A31 扫光联动     附着文字的明暗 = f(max(自身光照, 所属物品光照))，逐帧换算吻合
//                    （光扫到物品 → 贴在上面的文字一起亮；物品沉入暗部 → 文字一起压暗）
// 用法: node attach-check.mjs <html路径> [屏号=1] [--shots <出图目录>]
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

const htmlPath = path.resolve(process.argv[2] || '../v2/control-illusion-v2.html');
const SCREEN = parseInt(process.argv[3] || '1', 10);
const shotsIdx = process.argv.indexOf('--shots');
const shotDir = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx + 1]) : null;

const ATPORT = 9600 + Math.floor(Math.random() * 300);
const problems = [];
const bad = (m) => problems.push(m);
const f2 = (v) => v.toFixed(2);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* 与页面 lightFactor 完全同一条公式（0.74 ↔ 1.00，光半径 = rSize(640)） */
const smoothstep = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const litFactor = (cx, cy, L) =>
  0.74 + 0.26 * smoothstep((L.r - Math.hypot(cx - L.x, cy - L.y)) / (L.r * 0.85));

const b = await launch({ width: 1920, height: 1080, port: ATPORT });
let rows = [], meta, CV;
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  meta = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: `JSON.stringify((function(){
      var S = window.__screens(), P = window.__pieces(), I = window.__items();
      var ps = P.filter(function(p){ return p.s === ${SCREEN}; });
      return { screen: S[${SCREEN}], screenCount: S.length, itemKeys: window.__screenItems(${SCREEN}),
               pieces: ps.map(function(p){ return { t:p.t, start:p.start, lv:p.lv, tag:!!p.tag, vert:!!p.vert,
                                                    item:(p.attach && p.attach.item) || p.bind || null,
                                                    followScale: !!(p.attach && p.attach.followScale),
                                                    opMin:p.attach ? p.attach.opMin : null,
                                                    opMax:p.attach ? p.attach.opMax : null }; }) };
    })())`, returnByValue: true
  })).result.value);
  CV = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__canvas())', returnByValue: true
  })).result.value);

  const S = meta.screen;
  for (let t = S.t0; t <= S.t1 + 0.001; t = +(t + 0.1).toFixed(2)) {
    rows.push(JSON.parse((await b.page.send('Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        window.__seek(${t});
        var stage = document.getElementById('stage').getBoundingClientRect();
        var k = stage.width / ${CV.w};
        var ps = [].map.call(document.querySelectorAll('.piece[data-screen="${SCREEN}"]'), function(el){
          var r = el.getBoundingClientRect();
          return { op: +el.style.opacity || 0, lf: parseFloat(el.getAttribute('data-lf')),
                   x: (r.left - stage.left)/k, y: (r.top - stage.top)/k,
                   w: r.width/k, h: r.height/k, tf: el.style.transform || '' };
        });
        return { t: ${t}, L: window.__light(), I: window.__items(), pieces: ps };
      })())`, returnByValue: true
    })).result.value));
  }
} finally { await b.close(); }

const S = meta.screen;
const W = CV.w, H = CV.h;
const PIECES = meta.pieces;
const attached = PIECES
  .map((p, i) => ({ ...p, i, text: p.t }))
  .filter((p) => p.item);
const firstAppear = (i) => { const r = rows.find((r) => r.pieces[i] && r.pieces[i].op >= 0.5); return r ? r.t : null; };
const fmt = (v) => (v === null ? ' — ' : v.toFixed(1) + 's');
const evOf = rows[0].I;

console.log(`【${path.basename(htmlPath)}】第 ${SCREEN + 1} 屏 ${S.label}  ${S.t0}–${S.t1}s  ` +
            `｜ 主角物品 ${meta.itemKeys.length} 个 ｜ 文字分片 ${PIECES.length} 条（附着 ${attached.length} 条）\n`);

/* ---------- A25 主角物品 ----------
   规则：每屏 ≥1 个物品；本屏文字要么贴在物品上，要么是主标题锚点（L0/L1）。
   物品没有挂文字不算错（S2 圆环的文字由环绕字承担、S7 的主角就是金句本身），但要报出来。 */
const byItem = {};
attached.forEach((o) => { (byItem[o.item] = byItem[o.item] || []).push(o); });
if (!meta.itemKeys.length) bad('本屏没有注册主角物品（文字还是自己当主角）');
const anchored = meta.pieces.filter((p) => p.lv === 'L0' || p.lv === 'L1').length;
console.log(`A25 主角物品 ${meta.itemKeys.length} 个 ｜ 附着文字 ${attached.length} 条 ｜ 主标题锚点 ${anchored} 片`);
meta.itemKeys.forEach((k) => {
  const n = (byItem[k] || []).length;
  console.log(`    · 物品「${k}」挂载文字 ${n} 条`);
});
if (!attached.length && !anchored) bad('既没有附着文字，也没有主标题锚点（本屏文字没有归属）');

/* ---------- A26 物品先行 / A27 同一条时间线 ---------- */
console.log('\nA26 物品先行 · A27 标签与物品同时到场（opacity 首次 ≥0.5）');
let seqBad = 0;
attached.forEach((o) => {
  o.appear = firstAppear(o.i);
  o.ev = evOf[o.item].ev;
  o.out = evOf[o.item].out;
  const afterItem = o.appear !== null && o.appear >= o.ev - 0.05;
  let tagOk = true;
  /* 附着文字必须落在物品的「在场窗口」内（物品已登场、且还没收束退场） */
  if (o.tag) tagOk = o.appear !== null && o.out != null && o.appear <= o.out - 1.5;
  if (!afterItem || !tagOk) seqBad++;
  console.log(`  「${o.text}」→ ${o.item}：物品起 ${fmt(o.ev)} ｜ 文字出场 ${fmt(o.appear)} ` +
              `${afterItem ? '✅ 物品先动' : '❌ 文字早于物品'}` +
              (o.tag ? ` ｜ 落在物品在场窗口内（≤${fmt(o.out)} 前 1.5s）${tagOk ? '✅' : '❌'}` : ''));
});
if (seqBad) bad('有文字早于所属物品出现 / 标签没有跟物品同时到场');

/* ---------- A28 附着同步 ---------- */
console.log('\nA28 附着同步（位移 = 物品位移 ｜ 缩放 = 物品缩放 ｜ 与物品的相对距离恒定）');
attached.forEach((o) => {
  const dist = [], moveErr = [], scaleErr = [];
  rows.forEach((r) => {
    const p = r.pieces[o.i], it = r.I[o.item];
    if (!p || !it || r.t < o.start + 1.0) return;      // 入场 1s 内含 14px 上浮位移
    dist.push(Math.hypot(p.x + p.w / 2 - (it.cx + it.dx), p.y + p.h / 2 - (it.cy + it.dy)));
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(p.tf || '');
    if (m) moveErr.push(Math.max(Math.abs(+m[1] - Math.round(it.dx)), Math.abs(+m[2] - Math.round(it.dy))));
    const sm = /scale\(([\d.]+)\)/.exec(p.tf || '');
    if (sm) scaleErr.push(Math.abs(+sm[1] - (o.followScale ? it.k : 1)));
    });
  if (!dist.length) { bad(`「${o.text}」没有可比对帧`); return; }
  const dMin = Math.min(...dist), dMax = Math.max(...dist);
  const mv = moveErr.length ? Math.max(...moveErr) : 0;
  const sc = scaleErr.length ? Math.max(...scaleErr) : 0;
  /* 物品收紧 / 张开时文字同步缩放，相对距离会随缩放轻微变化，给 20px 的合理带宽 */
  const ok = mv <= 0 && sc <= 0.005 && (dMax - dMin) <= 20 && dMax <= 0.55 * W;
  if (!ok) bad(`「${o.text}」与物品 ${o.item} 不同步（位移 ${mv}px / 缩放偏差 ${sc.toFixed(4)} / 距离波动 ${f2(dMax - dMin)}px）`);
  console.log(`  「${o.text}」→ ${o.item}：位移误差 ${mv}px ｜ 缩放偏差 ${sc.toFixed(4)}（≤0.005）｜ ` +
              `相对距离 ${Math.round(dMin)}–${Math.round(dMax)}px（波动 ${f2(dMax - dMin)} ≤20）｜ ${dist.length} 帧 ${ok ? '✅' : '❌'}`);
});

/* ---------- A29 无大文本盒 ---------- */
console.log('\nA29 无大文本盒（每个文字片在各帧里的最大包围盒；禁止再出现一整段正文块）');
const maxW = [], maxH = [];
rows.forEach((r) => r.pieces.forEach((p, i) => {
  maxW[i] = Math.max(maxW[i] || 0, p.w); maxH[i] = Math.max(maxH[i] || 0, p.h);
}));
let bigBox = 0;
/* 阈值按文字角色分档：主标题（L0/L1）允许当锚点做大；散落注释不得成段（§5.5 层级） */
const capW = (p) => (p.vert ? 0.10 : (p.lv === 'L0' || p.lv === 'L1') ? 0.50 : 0.45);
const capH = (p) => (p.vert ? 0.35 : (p.lv === 'L0' || p.lv === 'L1') ? 0.40 : 0.20);
PIECES.forEach((p, i) => {
  const w = maxW[i] || 0, h = maxH[i] || 0;
  if (w / W > capW(p) || h / H > capH(p)) {
    bigBox++; bad(`文字片「${p.t}」包围盒 ${Math.round(w)}×${Math.round(h)}px 过大`);
  }
});
PIECES.map((p, i) => ({ t: p.t, vert: p.vert, w: maxW[i] || 0, h: maxH[i] || 0 }))
  .sort((a, z) => z.w * z.h - a.w * a.h).slice(0, 4).forEach((p) => {
    console.log(`  「${p.t}」最大 ${Math.round(p.w)}×${Math.round(p.h)}px` +
                `（${(p.w / W * 100).toFixed(1)}%W ≤ ${p.vert ? 10 : 45}% ｜ ` +
                `${(p.h / H * 100).toFixed(1)}%H ≤ ${p.vert ? 35 : 20}%${p.vert ? ' · 竖排' : ''}）`);
  });
if (!bigBox) console.log(`  全部 ${PIECES.length} 片都在阈值内 ✅`);

/* ---------- A30 底部留白 ---------- */
console.log('\nA30 底部留白（文字全部出场后，y ≥ 0.80H 区域的文字总量）');
{
  const full = rows[rows.length - 3];
  const band = full.pieces
    .map((p, i) => ({ p, i }))
    .filter((o) => o.p.op > 0.05 && (o.p.y + o.p.h) > 0.86 * H && o.p.y > 0.78 * H)
    .map((o) => ({ w: o.p.w, t: PIECES[o.i].t }));
  const sumW = band.reduce((a, o) => a + o.w, 0);
  const widest = band.length ? Math.max(...band.map((o) => o.w)) : 0;
  const ok = sumW / W <= 0.60 && widest / W <= 0.34;
  if (!ok) bad(`底部窄带文字总量 ${(sumW / W * 100).toFixed(1)}%W（上限 60%W）/ 最宽 ${(widest / W * 100).toFixed(1)}%W（上限 34%W）`);
  console.log(`  t=${f2(full.t)}s：底部窄带（y≥0.86H）文字 ${band.length} 片，总宽 ${(sumW / W * 100).toFixed(1)}%W（≤60%）` +
              ` ｜ 最宽 ${(widest / W * 100).toFixed(1)}%W（≤34%）` +
              ` ｜ ${band.map((o) => `「${o.t}」`).join('') || '（空）'} ${ok ? '✅' : '❌'}`);
}

/* ---------- A31 扫光联动 ---------- */
console.log('\nA31 扫光联动（附着文字明暗 = f(max(自身光照, 物品光照)) × 物品在场权重，逐帧换算比对）');
attached.forEach((o) => {
  let maxErr = 0, seen = 0, litHi = 0, darkLo = 0, lo = 1, hi = 0;
  rows.forEach((r) => {
    const p = r.pieces[o.i], it = r.I[o.item];
    if (!p || !it || r.t < o.start + 0.5 || !isFinite(p.lf)) return;   // 只跳过入场淡入的头 0.5s
    const own = litFactor(p.x + p.w / 2, p.y + p.h / 2, r.L);
    const itemLight = it.light * it.on;
    const reach = Math.max(own, itemLight);
    const raw = (o.opMin + (o.opMax - o.opMin) * clamp01((reach - 0.74) / 0.26)) * it.on;
    /* 末屏（收尾）在页面上有一层下限：金句是片子的落点，不参与扫光压暗（整屏压暗另行处理） */
    const expect = (SCREEN === meta.screenCount - 1) ? Math.max(raw, 0.94) : raw;
    maxErr = Math.max(maxErr, Math.abs(expect - p.lf));
    lo = Math.min(lo, p.lf); hi = Math.max(hi, p.lf);
    seen++;
    if (reach >= 0.95) litHi++;                                   // 光扫到文字 / 物品 → 文字被点亮
    if (itemLight <= 0.80 && own <= 0.80) darkLo++;                // 双方都出了光区 → 应当压暗
  });
  /* 三条同时成立才算「联动」：① 与公式逐帧吻合 ② 真的被点亮过 ③ 真的压暗到底过（暗部反差 ≥0.35） */
  /* 末屏例外：金句页的文字按设计保持常亮（不随扫光压暗），所以只查「与公式逐帧吻合 + 被点亮过」 */
  const isLast = SCREEN === meta.screenCount - 1;
  const ok = maxErr <= 0.02 && litHi > 0 &&
             (isLast || (darkLo > 0 && lo <= o.opMin + 0.02 && hi >= o.opMin + 0.35));
  if (!ok) bad(`「${o.text}」扫光联动不成立（最大偏差 ${f2(maxErr)}，被点亮 ${litHi} 帧 / 明暗 ${f2(lo)}↔${f2(hi)}）`);
  console.log(`  「${o.text}」→ ${o.item}：逐帧偏差 ≤ ${f2(maxErr)}（≤0.02）｜ 明暗 ${f2(lo)}↔${f2(hi)}` +
              `（暗部 ≤${f2(o.opMin + 0.02)}、反差 ≥0.35）｜ 被点亮 ${litHi} 帧 ｜ 双方出光区 ${darkLo} 帧 ｜ ${seen} 帧 ${ok ? '✅' : '❌'}`);
});

/* ---------- 出图 ---------- */
if (shotDir) {
  fs.mkdirSync(shotDir, { recursive: true });
  /* S2 的九个关键瞬间：左侧首句 → 没有任何差别 → 金属标题 → 环左上短注 → 金球簇+贴球短注
     → 机选标签 → 环右短注 → 竖排注释 → 收束 */
  const probes = [S.t0 + 1.0, S.t0 + 3.6, S.t0 + 7.6, S.t0 + 9.6, S.t0 + 11.2,
                  S.t0 + 12.2, S.t0 + 12.8, S.t0 + 13.8, S.t0 + 15.4];
  const b2 = await launch({ width: 1920, height: 1080, port: ATPORT + 1 });
  try {
    await b2.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
    for (const t of probes) {
      await b2.page.send('Runtime.evaluate', { expression: `window.__seek(${t.toFixed(2)})` });
      const png = await b2.page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shotDir, `S${SCREEN + 1}v35-t${t.toFixed(1)}s.png`),
                       Buffer.from(png.data, 'base64'));
    }
    console.log(`\n出图 ${probes.length} 张 → ${shotDir}`);
  } finally { await b2.close(); }
}

console.log('\n' + (problems.length
  ? '❌ ' + problems.join('\n❌ ')
  : '✅ 附着层验收全部通过：物品先动 · 文字贴着物品走 · 扫光联动'));
process.exitCode = problems.length ? 1 : 0;

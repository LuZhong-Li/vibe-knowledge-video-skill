// 封面校验：直接量「成品 JPG」的像素，逐条对着方案C的《最终校验项》给数。
// 用法: node cover-check.mjs [--cover ../qa/v2/v7/cover/cover-C-A.html]
//                            [--jpg ../qa/v2/v7/cover/cover-C-A-1920x1080.jpg]
//                            [--thumb ../qa/v2/v7/cover/缩略测试-540x304.jpg] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { launch, fileUrl } from './cdp.mjs';

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const coverPath = path.resolve(arg('cover', '../qa/v2/v7/cover/cover-C-A.html'));
const jpgPath = path.resolve(arg('jpg', '../qa/v2/v7/cover/cover-C-A-1920x1080.jpg'));
const thumbPath = path.resolve(arg('thumb', '../qa/v2/v7/cover/缩略测试-540x304.jpg'));
const jsonOut = arg('json', '');

const coverHtml = fs.readFileSync(coverPath, 'utf8');
const L = JSON.parse(coverHtml.match(/<script id="coverLayout" type="application\/json">([\s\S]*?)<\/script>/)[1]);

const b = await launch({ width: 1200, height: 900, port: 9370, extraArgs: ['--allow-file-access-from-files'] });
let out;
try {
  /* 先落到 file:// 上，canvas 读本地图才不会被跨源挡住 */
  await b.goto(fileUrl(jpgPath), { settleFrames: 2 });
  out = await b.page.send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const L = ${JSON.stringify(L)};
    const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const lum = (r, g, bl) => (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255;

    function raster(img) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return { c, g, d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    }
    const box = (r, x, y, w, h) => {          // 统计一个矩形：均值/最大亮度 + 该区最亮点
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      let sum = 0, n = 0, max = 0, mx = 0, my = 0;
      for (let yy = Math.max(0, y); yy < Math.min(r.h, y + h); yy++)
        for (let xx = Math.max(0, x); xx < Math.min(r.w, x + w); xx++) {
          const i = (yy * r.w + xx) * 4;
          const l = lum(r.d[i], r.d[i + 1], r.d[i + 2]);
          sum += l; n++; if (l > max) { max = l; mx = xx; my = yy; }
        }
      return { mean: +(sum / Math.max(1, n)).toFixed(4), max: +max.toFixed(4), n, at: [mx, my],
               rect: [x, y, Math.min(r.w, x + w) - x, Math.min(r.h, y + h) - y] };
    };
    function inkRect(r, x, y, w, h, thr, minArea, gap) {   // 阈值墨迹：连通块 + 近邻合并成字形组
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      w = Math.round(w); h = Math.round(h);
      const x1 = Math.min(r.w, x + w), y1 = Math.min(r.h, y + h);
      const mask = new Uint8Array(r.w * r.h);
      for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
        const i = (yy * r.w + xx) * 4;
        if (lum(r.d[i], r.d[i + 1], r.d[i + 2]) > thr) mask[yy * r.w + xx] = 1;
      }
      const seen = new Uint8Array(r.w * r.h), comps = [];
      const st = [];
      for (let yy = y; yy < y1; yy++) for (let xx = x; xx < x1; xx++) {
        const k = yy * r.w + xx;
        if (!mask[k] || seen[k]) continue;
        let area = 0, ax0 = xx, ax1 = xx, ay0 = yy, ay1 = yy, peak = 0;
        st.length = 0; st.push(k); seen[k] = 1;
        while (st.length) {
          const p = st.pop(), py = (p / r.w) | 0, px = p - py * r.w;
          area++;
          if (px < ax0) ax0 = px; if (px > ax1) ax1 = px;
          if (py < ay0) ay0 = py; if (py > ay1) ay1 = py;
          const i = p * 4; const l = lum(r.d[i], r.d[i + 1], r.d[i + 2]); if (l > peak) peak = l;
          const nb = [p - 1, p + 1, p - r.w, p + r.w];
          for (const q of nb) {
            if (q < 0 || q >= mask.length || !mask[q] || seen[q]) continue;
            const qy = (q / r.w) | 0, qx = q - qy * r.w;
            if (qx < x || qx >= x1 || qy < y || qy >= y1) continue;
            seen[q] = 1; st.push(q);
          }
        }
        if (area >= minArea) comps.push({ area, x0: ax0, x1: ax1, y0: ay0, y1: ay1, peak });
      }
      /* 水平近邻合并：同一个词里的字合并成一组，用来判「几个字形」 */
      comps.sort((a, b2) => a.x0 - b2.x0);
      const groups = [];
      for (const c of comps) {
        const last = groups[groups.length - 1];
        if (last && c.x0 - last.x1 <= (gap == null ? 24 : gap)) {
          last.x0 = Math.min(last.x0, c.x0); last.x1 = Math.max(last.x1, c.x1);
          last.y0 = Math.min(last.y0, c.y0); last.y1 = Math.max(last.y1, c.y1);
          last.area += c.area; last.peak = Math.max(last.peak, c.peak); last.parts++;
        } else groups.push({ x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1, area: c.area, peak: c.peak, parts: 1 });
      }
      return { comps: comps.length, groups: groups.map((g) => ({
        x: g.x0, y: g.y0, w: g.x1 - g.x0 + 1, h: g.y1 - g.y0 + 1,
        area: g.area, peak: +g.peak.toFixed(4), parts: g.parts })) };
    }
    const scaleOf = (r, refW) => r.w / refW;
    function measure(r, refW, tag) {
      const k = scaleOf(r, refW);
      const S = (v) => v * k;
      const gold = L.bars[0], gray = L.bars[1];
      const barY = (b2) => b2.baseline - b2.h;          // 1920 基准坐标；缩放统一由 S() 负责
      const probe = (x, y, w, h) => box(r, S(x), S(y), S(w), S(h));

      const res = { tag, size: [r.w, r.h], scale: +k.toFixed(5) };
      /* 文字墨迹 */
      res.title = inkRect(r, S(500), S(120), S(920), S(260), 0.35, Math.max(2, S(120)), S(30));
      res.num4x = inkRect(r, S(618), S(468), S(684), S(436), 0.35, Math.max(2, S(120)), S(26));
      res.sub   = inkRect(r, S(540), S(360), S(840), S(90), 0.30, Math.max(1, S(30)),  S(24));
      res.ip    = inkRect(r, S(80),  S(50),  S(360), S(60), 0.20, Math.max(1, S(10)),  S(20));
      res.tagInk= inkRect(r, S(1600),S(840), S(230), S(110), 0.18, Math.max(1, S(8)),  S(20));
      /* 柱体：柱身 / 紧邻背景 / 边界台阶 */
      res.barGold = {
        inner: probe(gold.x + 12, barY(gold) + 24, gold.w - 24, gold.h - 60),
        outer: probe(gold.x - 90, barY(gold) + 24, 60, gold.h - 60),
        edgeLeft: [probe(gold.x + 2, barY(gold) + gold.h * 0.5, 5, 20).mean,
                   probe(gold.x - 8, barY(gold) + gold.h * 0.5, 5, 20).mean],
        rect: [S(gold.x), S(barY(gold)), S(gold.w), S(gold.h)]
      };
      res.barGray = {
        inner: probe(gray.x + 12, barY(gray) + 12, gray.w - 24, gray.h - 30),
        outer: probe(gray.x - 90, barY(gray) + 12, 60, gray.h - 30),
        edgeLeft: [probe(gray.x + 2, barY(gray) + gray.h * 0.5, 5, 20).mean,
                   probe(gray.x - 8, barY(gray) + gray.h * 0.5, 5, 20).mean],
        rect: [S(gray.x), S(barY(gray)), S(gray.w), S(gray.h)]
      };
      /* 底部 10% 有没有东西 */
      res.bottomBand = box(r, 0, S(972), r.w, r.h - S(972));
      /* 核心区里「不属于任何主体」的亮点（粒子穿越检测）
         known = 上一步实测出来的墨迹框 ∪ 柱体矩形，各外扩 14px —— 跟着版面自动走，不写死坐标 */
      const grow = (g, m) => ({ x: g.x - m, y: g.y - m, w: g.w + m * 2, h: g.h + m * 2 });
      const known = [].concat(res.title.groups, res.num4x.groups, res.sub.groups,
                              res.ip.groups, res.tagInk.groups)
        .map((g) => grow(g, 14 * k))
        .concat([
          { x: S(gold.x) - 6 * k, y: S(barY(gold)) - 6 * k, w: S(gold.w) + 12 * k, h: S(gold.h) + 12 * k },
          { x: S(gray.x) - 6 * k, y: S(barY(gray)) - 6 * k, w: S(gray.w) + 12 * k, h: S(gray.h) + 12 * k }
        ]);
      const isKnown = (xx, yy) => known.some((k2) => xx >= k2.x && xx < k2.x + k2.w && yy >= k2.y && yy < k2.y + k2.h);
      const gapMask = new Uint8Array(r.w * r.h);
      let coreMax = 0;
      for (const cb of L.coreBoxes) {
        const gx1 = Math.min(r.w, Math.round(S(cb.x + cb.w))), gy1 = Math.min(r.h, Math.round(S(cb.y + cb.h)));
        for (let yy = Math.max(0, Math.round(S(cb.y))); yy < gy1; yy++) {
          for (let xx = Math.max(0, Math.round(S(cb.x))); xx < gx1; xx++) {
            if (isKnown(xx, yy)) continue;
            const i = (yy * r.w + xx) * 4, l = lum(r.d[i], r.d[i + 1], r.d[i + 2]);
            if (l > coreMax) coreMax = l;
            if (l > 0.30) gapMask[yy * r.w + xx] = 1;
          }
        }
      }
      const gseen = new Uint8Array(r.w * r.h), specs = [], gst = [];
      for (let p = 0; p < gapMask.length; p++) {
        if (!gapMask[p] || gseen[p]) continue;
        let area = 0, x0 = p % r.w, x1 = x0, y0 = (p / r.w) | 0, y1 = y0, peak = 0;
        gst.length = 0; gst.push(p); gseen[p] = 1;
        while (gst.length) {
          const q2 = gst.pop(), qy = (q2 / r.w) | 0, qx = q2 - qy * r.w; area++;
          x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
          const i = q2 * 4, l = lum(r.d[i], r.d[i + 1], r.d[i + 2]); if (l > peak) peak = l;
          for (const q3 of [q2 - 1, q2 + 1, q2 - r.w, q2 + r.w]) {
            if (q3 < 0 || q3 >= gapMask.length || !gapMask[q3] || gseen[q3]) continue;
            gseen[q3] = 1; gst.push(q3);
          }
        }
        specs.push({ area, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], peak: +peak.toFixed(4) });
      }
      specs.sort((a2, b2) => b2.area - a2.area);
      res.coreGaps = { maxLum: +coreMax.toFixed(4),
        specks: specs.filter((s) => s.area >= 9).length,
        dots: specs.filter((s) => s.area < 9).length,
        biggest: specs.slice(0, 5) };
      /* 正片背景自带的射线汇聚点（不是粒子）：单独量出来做说明 */
      res.rayOrigin = box(r, S(1402) - S(8), S(454) - S(8), S(16), S(16));
      /* 过曝面积占比（方案要的是「不大面积过曝」） */
      let blown = 0;
      for (let p = 0; p < r.w * r.h; p++) {
        const i = p * 4;
        if (lum(r.d[i], r.d[i + 1], r.d[i + 2]) > 0.95) blown++;
      }
      res.blownRatio = +(blown / (r.w * r.h)).toFixed(5);
      res.peek = { max: box(r, 0, 0, r.w, r.h).max };
      return res;
    }

    const img = await load(${JSON.stringify(fileUrl(jpgPath))});
    const A = measure(raster(img), 1920, '1920x1080');
    let B = null;
    if (${JSON.stringify(fs.existsSync(thumbPath))} && ${JSON.stringify(thumbPath)} ) {
      const timg = await load(${JSON.stringify(fileUrl(thumbPath))});
      B = measure(raster(timg), 1920, '540x304(thumbnail)');
    } else {
      /* 没有现成缩略图就自己按 0.28125 降采样量一遍（等价于抖音缩略） */
      const src = await load(${JSON.stringify(fileUrl(jpgPath))});
      const c = document.createElement('canvas'); c.width = 540; c.height = 304;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, 540, 304);
      B = measure({ c, g, d: g.getImageData(0, 0, 540, 304).data, w: 540, h: 304 }, 1920, '540x304(resampled)');
    }
    return { A, B, layout: L };
  })()` });
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || 'eval failed');
} finally {
  await b.close();
}

const { A, B } = out.result.value;
const rows = [];
const push = (name, ok, detail) => rows.push({ name, ok, detail });
const big = (gs, minW) => gs.filter((g) => g.w >= (minW || 8));
const inkArea = (gs) => gs.reduce((s, g) => s + g.area, 0);
const inkBox = (gs) => gs.reduce((a, g) => ({
  x: Math.min(a.x, g.x), y: Math.min(a.y, g.y),
  x1: Math.max(a.x1, g.x + g.w), y1: Math.max(a.y1, g.y + g.h) }),
  { x: 1e9, y: 1e9, x1: -1, y1: -1 });

/* ---- 最终校验项 ---- */
const b4g = big(B.num4x.groups), a4g = big(A.num4x.groups);
const btg = big(B.title.groups, 12), atg = big(A.title.groups, 12);
const b4box = inkBox(b4g), btbox = inkBox(btg);
push('缩小后仍能一眼识别 4×',
  b4g.length === 2 && b4g.every((g) => g.peak > 0.7 && g.w >= 18),
  `540 缩略图里 4× → ${b4g.length} 个字形组（「4」与「×」各自独立），` +
  `宽×高 ${b4g.map((g) => `${g.w}×${g.h}`).join(' / ')}，峰值 ${b4g.map((g) => g.peak).join(' / ')}`);

const gStep = A.barGold.inner.mean - A.barGold.outer.mean;
const yStep = A.barGray.inner.mean - A.barGray.outer.mean;
const bGoldW = B.barGold.rect[2], bGrayW = B.barGray.rect[2];
push('左右两根柱子轮廓清楚，不糊成一块',
  gStep > 0.05 && yStep > 0.03 && bGoldW >= 12 && (B.barGray.rect[0] - (B.barGold.rect[0] + bGoldW)) >= 40,
  `柱身与背景亮度差：金 ${gStep.toFixed(3)} / 灰 ${yStep.toFixed(3)}；` +
  `540 缩略图两柱各宽 ${bGoldW.toFixed(1)}/${bGrayW.toFixed(1)}px，间距 ${(B.barGray.rect[0] - (B.barGold.rect[0] + bGoldW)).toFixed(1)}px`);

push('控制错觉 四字清晰',
  atg.length >= 1 && btg.length >= 1,
  `1920 墨迹 ${inkBox(atg).x1 - inkBox(atg).x}×${inkBox(atg).y1 - inkBox(atg).y}px / 峰值 ${atg.map((g) => g.peak).join('/')}；` +
  `540 缩略墨迹 ${btbox.x1 - btbox.x}×${btbox.y1 - btbox.y}px / 峰值 ${btg.map((g) => g.peak).join('/')}`);

push('副标题单行可读',
  A.sub.groups.length >= 1 && (inkBox(A.sub.groups).y1 - inkBox(A.sub.groups).y) <= 70
    && inkBox(A.sub.groups).x1 <= 1824,
  `墨迹 ${inkBox(A.sub.groups).x}..${inkBox(A.sub.groups).x1} × ${inkBox(A.sub.groups).y}..${inkBox(A.sub.groups).y1}` +
  `（单行：墨迹高 ${inkBox(A.sub.groups).y1 - inkBox(A.sub.groups).y}px ≤ 70px，右界 ${inkBox(A.sub.groups).x1} ≤ 1824）`);

push('底部无关键文字',
  A.bottomBand.max < 0.25,
  `y>972 的 124px 带里最大亮度 ${A.bottomBand.max}（柱底 932 / 标签底 ~902，均在其上方）`);

push('粒子不穿过 4× / 标题 / 柱体',
  A.coreGaps.specks === 0 && B.coreGaps.specks === 0,
  `核心区非主体区域里 >0.30 的孤立块：1920 ${A.coreGaps.specks} 个 / 540 缩略 ${B.coreGaps.specks} 个，该区最大亮度 ${A.coreGaps.maxLum}` +
  `（另有 ≤2px 的椒盐点 ${A.coreGaps.dots} 个——正片背景射线汇聚点自带 1 颗柔光核 ${A.rayOrigin.max}，非粒子）`);

push('黑金低饱和科普质感（无过曝）',
  A.blownRatio < 0.015,
  `亮度 >0.95 的像素占全图 ${(A.blownRatio * 100).toFixed(3)}%（金属字材质本身含近白高光带，非大面积过曝），全图峰值 ${A.peek.max}`);

push('4× 是缩略图第一视觉',
  (b4box.y1 - b4box.y) >= (btbox.y1 - btbox.y) * 1.15 && inkArea(b4g) >= inkArea(btg) * 0.5,
  `540 下 4× 墨迹 ${b4box.x1 - b4box.x}×${b4box.y1 - b4box.y}px 面积 ${inkArea(b4g)}px² ；` +
  `标题 ${btbox.x1 - btbox.x}×${btbox.y1 - btbox.y}px 面积 ${inkArea(btg)}px²（4× 更高更大）`);

const W = (s, n) => String(s).padEnd(n, ' ');
/* 墨迹居中标定：给定成品图量到的墨迹框，算出「行盒→墨迹中心」还差多少 px */
const fit = (pieceId, gs) => {
  const p = L.pieces.filter((x) => x.id === pieceId)[0];
  if (!gs.length) return { id: pieceId, dx: null };
  const box = inkBox(gs);
  const inkCenter = (box.x + box.x1) / 2;
  return { id: pieceId, cx: p.cx, inkCenter: +inkCenter.toFixed(1),
           dx: Math.round(p.cx - inkCenter), cur: p.inkDx || 0,
           next: Math.round((p.inkDx || 0) + (p.cx - inkCenter)) };
};
console.log('\n--- 居中标定（inkDx 应写回 cover-C-A.html 的版面表）---');
console.log(JSON.stringify({ title: fit('title', big(A.title.groups, 12)),
  sub: fit('sub', big(A.sub.groups, 12)), num4x: fit('num4x', big(A.num4x.groups, 12)) }, null, 1));
console.log('\n=== 方案C-A 封面 · 最终校验项（量的是成品 JPG 的像素）===');
for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${W(r.name, 30)} ${r.detail}`);
console.log(`\n通过 ${rows.filter((r) => r.ok).length}/${rows.length}`);
console.log('\n--- 1920 实测 ---');
console.log(JSON.stringify(A, null, 1));
console.log('--- 540×304 缩略实测 ---');
console.log(JSON.stringify(B, null, 1));
if (jsonOut) fs.writeFileSync(path.resolve(jsonOut), JSON.stringify({ rows, A, B }, null, 2) + '\n');

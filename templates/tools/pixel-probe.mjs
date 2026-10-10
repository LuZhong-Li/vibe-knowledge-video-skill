// 像素级探针：直接读 ffmpeg 的灰度原始帧，把「看起来怎么样」变成可复现的数字。
// 四个模式：
//   lum  <video> <t0> <t1> <fps>     逐帧全帧平均亮度（找黑起幅 / 找最暗段）
//   diff <video> <t0> <t1> <fps>     相邻帧差分：每帧变化格数 + 变化区包围盒（量"这段到底动不动"）
//   map  <video> <t>                 单帧 24×18 字符图 + 内容包围盒 + 上中下/左中右分区墨量
//   box  <video> <t> x0,y0,x1,y1 ... 任意矩形区的 mean / max / >40 占比（量某个元素亮不亮）
// 例：node pixel-probe.mjs diff 成片.mp4 2.5 13 2      # 这 10.5 秒是不是只有一个小球在动
//     node pixel-probe.mjs map  成片.mp4 47.4          # 「一半」那一拍的版面墨量分布
// ffmpeg 走 PATH，可用环境变量 FFMPEG 覆盖；网格 96×54（每格 20×20px @1080p）
import { spawn } from 'node:child_process';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const GW = 96, GH = 54;

function grab(file, t0, t1, fps, w = GW, h = GH) {
  return new Promise(function (res, rej) {
    const p = spawn(FFMPEG, ['-v', 'error', '-ss', String(t0), '-to', String(t1), '-i', file,
      '-vf', `fps=${fps},scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const bufs = []; let err = '';
    p.stdout.on('data', (d) => bufs.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      if (code !== 0) return rej(new Error('ffmpeg ' + code + ': ' + err));
      const all = Buffer.concat(bufs), n = w * h, frames = Math.floor(all.length / n);
      const out = [];
      for (let i = 0; i < frames; i++) out.push(all.subarray(i * n, (i + 1) * n));
      res({ frames, w, h, px: out });
    });
  });
}
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const f2 = (v) => v.toFixed(2);

const mode = process.argv[2];
const file = process.argv[3];
if (!mode || !file) { console.log('用法见文件头：lum / diff / map / box'); process.exit(2); }

if (mode === 'lum') {
  const t0 = +process.argv[4], t1 = +process.argv[5], fps = +process.argv[6] || 8;
  const { frames, w, h, px } = await grab(file, t0, t1, fps);
  console.log(`# ${file}  ${t0}-${t1}s @${fps}fps  帧数=${frames}  网格=${w}x${h}`);
  for (let i = 0; i < frames; i++) {
    const a = px[i]; let s = 0, mx = 0;
    for (const v of a) { s += v; if (v > mx) mx = v; }
    console.log(`  t=${f2(t0 + i / fps)}  mean=${(s / a.length).toFixed(1)}  p99=${q(a, 0.99)}  max=${mx}`);
  }
}

if (mode === 'diff') {
  const t0 = +process.argv[4], t1 = +process.argv[5], fps = +process.argv[6] || 2;
  const thr = +(process.env.DIFF_THR || 4);
  const { frames, w, h, px } = await grab(file, t0, t1, fps);
  console.log(`# ${file}  ${t0}-${t1}s @${fps}fps  帧数=${frames}  阈值=${thr}/255  网格=${w}x${h}`);
  let eMinX = 1e9, eMaxX = -1, eMinY = 1e9, eMaxY = -1;
  const seen = new Set();
  for (let i = 1; i < frames; i++) {
    const a = px[i - 1], b = px[i];
    let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let k = 0; k < a.length; k++) {
      if (Math.abs(a[k] - b[k]) >= thr) {
        n++; seen.add(k);
        const x = k % w, y = (k / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (n) {
      if (x0 < eMinX) eMinX = x0; if (x1 > eMaxX) eMaxX = x1;
      if (y0 < eMinY) eMinY = y0; if (y1 > eMaxY) eMaxY = y1;
    }
    const box = n ? `box x[${x0 * 20}..${(x1 + 1) * 20}] y[${y0 * 20}..${(y1 + 1) * 20}]` : '无变化';
    console.log(`  t=${f2(t0 + i / fps)}  变化格=${String(n).padStart(4)}  占画面=${(n / (w * h) * 100).toFixed(1)}%  ${box}`);
  }
  console.log(`# 汇总：变化格并集=${seen.size} 格 (${(seen.size / (w * h) * 100).toFixed(1)}% 画面)`);
  if (eMaxX >= 0) console.log(`# 变化并集包围盒 x[${eMinX * 20}..${(eMaxX + 1) * 20}] y[${eMinY * 20}..${(eMaxY + 1) * 20}]（画布 1920×1080）`);
}

if (mode === 'map') {
  const t = +process.argv[4];
  const { px, w, h } = await grab(file, t, t + 0.1, 30);
  const a = px[0];
  const bg = q([...a], 0.5), hi = bg + 8;
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let k = 0; k < a.length; k++) {
    if (a[k] >= hi) {
      const x = k % w, y = (k / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const third = (xa, xb, ya, yb) => {
    let s = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { s += Math.max(0, a[y * w + x] - bg); n++; }
    return s / n;
  };
  console.log(`# ${file} @${t}s  底色中位=${bg}  内容阈值=${hi}  网格每格 20×20px`);
  console.log(`# 内容包围盒  x[${x0 * 20}..${(x1 + 1) * 20}]  y[${y0 * 20}..${(y1 + 1) * 20}]  （画布 1920×1080）`);
  console.log(`# 分区平均墨量(减底色)：上/中/下 = ${f2(third(0, w, 0, 18))} / ${f2(third(0, w, 18, 36))} / ${f2(third(0, w, 36, 54))}`);
  console.log(`# 左/中/右 = ${f2(third(0, 32, 0, 54))} / ${f2(third(32, 64, 0, 54))} / ${f2(third(64, 96, 0, 54))}`);
  const CW = 4, CH = 3;                        // 24×18 字符图
  let out = '';
  for (let y = 0; y < GH / CH; y++) {
    let line = '';
    for (let x = 0; x < GW / CW; x++) {
      let s = 0;
      for (let yy = 0; yy < CH; yy++) for (let xx = 0; xx < CW; xx++) s += a[(y * CH + yy) * GW + x * CW + xx];
      const v = s / (CW * CH);
      line += v < bg + 2 ? ' .' : v < bg + 8 ? ' :' : v < bg + 24 ? ' +' : v < bg + 60 ? ' *' : v < bg + 120 ? ' #' : ' @';
    }
    out += line + '\n';
  }
  console.log(out);
}

if (mode === 'box') {
  const t = +process.argv[4];
  const boxes = process.argv.slice(5).map((s) => s.split(',').map(Number));
  const W = 480, H = 270;
  const { px } = await grab(file, t, t + 0.05, 30, W, H);
  const a = px[0], sx = W / 1920, sy = H / 1080;
  console.log(`# ${file} @${t}s  采样 ${W}×${H}`);
  for (const [X0, Y0, X1, Y1] of boxes) {
    const x0 = Math.round(X0 * sx), x1 = Math.round(X1 * sx), y0 = Math.round(Y0 * sy), y1 = Math.round(Y1 * sy);
    let s = 0, n = 0, mx = 0, hi = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = a[y * W + x]; s += v; n++; if (v > mx) mx = v; if (v > 40) hi++;
    }
    console.log(`  x[${X0}..${X1}] y[${Y0}..${Y1}]  mean=${(s / n).toFixed(1)}  max=${mx}  >40占比=${(hi / n * 100).toFixed(1)}%`);
  }
}

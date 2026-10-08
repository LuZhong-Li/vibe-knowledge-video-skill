// v3.2 音效占位素材生成器（零依赖，纯 Node）
// ---------------------------------------------------------------
// 作用：按 §6 音效规范生成 5 个短触发 Foley + 1 个空白占位 + 1 条氛围垫音，
//       全部「暗色、低混响、无长尾、无尖锐高频」。
// 说明：这是**占位素材**。拿到授权库采样后，用同名文件覆盖 v2/audio/ 下的 wav 即可，
//       事件挂载点、音量基线、并发限制都不用改（见 02-v3.2-叙述层规范.md §6）。
// 用法：node make-foley.mjs            # 生成到 ../v2/audio
//       node make-foley.mjs --out D:\x  # 指定目录
//       node make-foley.mjs --pad 150   # 额外生成 150 秒氛围垫音 ambient_pad.mp3
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const SR = 44100;
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : '../v2/audio');
const padSec = args.includes('--pad') ? parseFloat(args[args.indexOf('--pad') + 1] || '150') : 0;
fs.mkdirSync(outDir, { recursive: true });

const rnd = (() => { let a = 0x9e3779b9; return () => { a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
const dB = (v) => Math.pow(10, v / 20);
const toDb = (x) => 20 * Math.log10(Math.max(1e-9, x));

/* ---------- 基础工具 ---------- */
function alloc(sec) { return new Float32Array(Math.round(sec * SR)); }
function fadeEnds(buf, msIn, msOut) {           // 保证首尾归零，杜绝咔哒声
  const nIn = Math.round(SR * msIn / 1000), nOut = Math.round(SR * msOut / 1000);
  for (let i = 0; i < nIn && i < buf.length; i++) buf[i] *= i / nIn;
  for (let i = 0; i < nOut && i < buf.length; i++) buf[buf.length - 1 - i] *= i / nOut;
}
function onePoleLP(buf, fc) {                   // 一阶低通（去毛刺 / 去高频刺耳）
  const a = Math.exp(-2 * Math.PI * fc / SR); let y = 0;
  for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
}
function onePoleHP(buf, fc) {
  const a = Math.exp(-2 * Math.PI * fc / SR); let x1 = 0, y1 = 0;
  for (let i = 0; i < buf.length; i++) { const y = a * (y1 + buf[i] - x1); x1 = buf[i]; y1 = y; buf[i] = y; }
}
function biquadHP(buf, fc, q) {                 // RBJ 二阶高通（巴特沃斯取 q = √½）
  const w0 = 2 * Math.PI * fc / SR, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
  const b0 = (1 + cw) / 2 / (1 + al), b1 = -(1 + cw) / (1 + al), b2 = b0;
  const a1 = -2 * cw / (1 + al), a2 = (1 - al) / (1 + al);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;          // 状态用 float64，避免极点贴近 1 时的精度损耗
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y;
  }
}
function normalize(buf, peak) {
  let mx = 0; for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i]));
  const k = mx > 0 ? peak / mx : 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
  return mx;
}
function writeWav(file, buf) {                  // 16bit 单声道 PCM
  const n = buf.length, h = Buffer.alloc(44), data = Buffer.alloc(n * 2);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] * 32767))), i * 2);
  fs.writeFileSync(file, Buffer.concat([h, data]));
  return h.length + data.length;
}
/* 尾部检查：最后 20ms 必须已经衰减到 -60dB 以下（= 无长尾混响） */
function tailDb(buf) {
  const n = Math.round(SR * 0.02); let mx = 0;
  for (let i = Math.max(0, buf.length - n); i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i]));
  return toDb(mx);
}
const report = [];
/* 尾部裁剪：找到最后一个高于 -60dB 的采样点，切到它之后 12ms —— 保证“点到即止” */
function trimTail(buf, thrDb) {
  const thr = dB(thrDb); let last = buf.length - 1;
  while (last > 8 && Math.abs(buf[last]) < thr) last--;
  return buf.slice(0, Math.min(buf.length, last + Math.round(SR * 0.012)));
}
/* 余韵时长：从峰值到"最后一次超过 -60dB"的毫秒数（衡量有没有拖尾） */
function ringOutMs(buf) {
  let pi = 0, mx = 0;
  for (let i = 0; i < buf.length; i++) if (Math.abs(buf[i]) > mx) { mx = Math.abs(buf[i]); pi = i; }
  let li = pi;
  for (let i = buf.length - 1; i > pi; i--) if (Math.abs(buf[i]) > dB(-60)) { li = i; break; }
  return Math.round((li - pi) / SR * 1000);
}
function emit(name, buf, desc) {
  const f = path.join(outDir, name + '.wav');
  normalize(buf, dB(-1));                        // 统一峰值归一 → 事件表里的 dB 就是真实听感差
  const t = trimTail(buf, -60);
  fadeEnds(t, 3, 10);
  writeWav(f, t);
  report.push({ name, ms: Math.round(t.length / SR * 1000), tail: ringOutMs(t) + 'ms', desc });
}

/* ---------- 1 soft_tick：闷的玻璃轻触（不是叮咚） ---------- */
emit('soft_tick', (() => {
  const b = alloc(0.40);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const body = Math.sin(2 * Math.PI * 760 * t) * 0.62 * Math.exp(-t / 0.030)
               + Math.sin(2 * Math.PI * 1516 * t) * 0.20 * Math.exp(-t / 0.016)
               + Math.sin(2 * Math.PI * 305 * t) * 0.26 * Math.exp(-t / 0.030);
    const transient = (rnd() - 0.5) * 0.35 * Math.exp(-t / 0.005);
    b[i] = body + transient;
  }
  onePoleLP(b, 3600);                            // 砍掉 4k 以上的“叮”
  onePoleHP(b, 120);
  return b;
})(), '轻玻璃轻触 · 文字/标签淡入');

/* ---------- 2 swish_soft：柔和气流滑音（线条生长 / 转场） ---------- */
emit('swish_soft', (() => {
  const b = alloc(0.62), dur = b.length;
  let lp = 0, bp = 0;
  for (let i = 0; i < dur; i++) {
    const u = i / dur, t = i / SR;
    const fc = 400 + 1250 * Math.sin(Math.PI * Math.pow(u, 0.85));   // 400→1650→400 扫频
    const fk = 2 * Math.sin(Math.PI * Math.min(fc, SR / 7) / SR);     // Chamberlin 状态变量带通
    const hp = (rnd() - 0.5) - lp - 0.7 * bp;
    bp = fk * hp + bp;
    lp = fk * bp + lp;
    const env = Math.pow(Math.sin(Math.PI * u), 1.6);
    b[i] = bp * env * 6.0;
  }
  onePoleLP(b, 5200);
  return b;
})(), '柔和气流滑音 · 线条生长/转场');

/* ---------- 3 low_impact：短促低频闷咚（只给三处核心标题） ---------- */
emit('low_impact', (() => {
  const b = alloc(0.70);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    const body = Math.sin(2 * Math.PI * 62 * t) * 1.00 * Math.exp(-t / 0.055)
               + Math.sin(2 * Math.PI * 93 * t) * 0.34 * Math.exp(-t / 0.035)
               + Math.sin(2 * Math.PI * 31 * t) * 0.35 * Math.exp(-t / 0.060);
    const thump = (rnd() - 0.5) * 0.30 * Math.exp(-t / 0.020);
    b[i] = body + thump;
  }
  onePoleLP(b, 210);                             // 只有低频：闷、不炸
  return b;
})(), '低频闷咚 · 核心标题爆点（限 3 处）');

/* ---------- 4 pulse_tap：微弱共振脉冲（球体 / 光点） ---------- */
emit('pulse_tap', (() => {
  const b = alloc(0.45);
  for (let i = 0; i < b.length; i++) {
    const t = i / SR;
    b[i] = Math.sin(2 * Math.PI * 330 * t) * 0.60 * Math.exp(-t / 0.050)
         + Math.sin(2 * Math.PI * 497 * t) * 0.22 * Math.exp(-t / 0.032)
         + Math.sin(2 * Math.PI * 165 * t) * 0.22 * Math.exp(-t / 0.045)
         + (rnd() - 0.5) * 0.06 * Math.exp(-t / 0.008);
  }
  onePoleLP(b, 2600);
  onePoleHP(b, 140);
  return b;
})(), '微弱共振脉冲 · 球体脉动/光点呼吸');

/* ---------- 5 sub_rise：缓慢升调铺垫（轮廓描边展开） ---------- */
emit('sub_rise', (() => {
  const b = alloc(0.95), dur = b.length;
  let ph = 0;
  for (let i = 0; i < dur; i++) {
    const u = i / dur;
    const f = 55 * Math.pow(132 / 55, u);                              // 55 → 132Hz 指数爬升
    ph += 2 * Math.PI * f / SR;
    const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 1.15)), 1.3);   // 缓起缓落
    b[i] = (Math.sin(ph) * 0.85 + Math.sin(ph * 2) * 0.12 + Math.sin(ph * 1.005) * 0.25) * env;
  }
  onePoleLP(b, 900);
  return b;
})(), '缓慢升调 · 轮廓描边/概念展开');

/* ---------- 6 blank：100ms 静音占位 ---------- */
emit('blank', alloc(0.10), '静音占位');

/* ---------- 7 ambient_pad：氛围垫音（占位，最终请换成授权 BGM） ---------- */
if (padSec > 0) {
  const n = Math.round(padSec * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const voices = [
    { f: 55.0, a: 0.34, lf: 1 / 37, ph: 0.0 },
    { f: 82.5, a: 0.24, lf: 1 / 53, ph: 1.7 },
    { f: 110.0, a: 0.16, lf: 1 / 71, ph: 3.1 },
    { f: 164.8, a: 0.07, lf: 1 / 47, ph: 4.4 }
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let sL = 0, sR = 0;
    for (const v of voices) {
      const mod = 0.72 + 0.28 * Math.sin(2 * Math.PI * t * v.lf + v.ph);
      sL += Math.sin(2 * Math.PI * v.f * t + v.ph) * v.a * mod;
      sR += Math.sin(2 * Math.PI * v.f * 1.0009 * t + v.ph + 0.35) * v.a * mod;
    }
    const breath = 0.80 + 0.20 * Math.sin(2 * Math.PI * t / 61);
    L[i] = sL * breath * 0.5;
    R[i] = sR * breath * 0.5;
  }
  /* 次声清理（v7 音频修复）：二阶巴特沃斯高通 @20Hz = 12dB/oct，压掉次声摆动，
     且四声部的 55Hz 低音根音（A1#）几乎不受影响（54Hz 处仅 −0.08dB）。
     ⚠️ 别改回"两次一阶 onePoleHP(·, 30)"：那版在 54Hz 处衰减 **−2.33dB**（实测 −2.50dB），
     会把根音削薄、并把整条音轨压低约 1.6 LU（v7 第一版踩过）。
     ⚠️ 这里绝不能再拿宽带白噪做"空气感"：0.995 的漏积分只有 6dB/oct，对 1kHz 以上只衰减约 −46dB，
     会在整条垫音里留下 −43dBFS 的宽带嘶声与次声摆动，全程贯穿（v7 前实测命中）。
     呼吸感由上面的 breath 振幅调制负责，不靠噪声。 */
  biquadHP(L, 20, Math.SQRT1_2);
  biquadHP(R, 20, Math.SQRT1_2);
  let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i]));
  const k = dB(-1) / (mx || 1);        // 峰值归一到 -1dBFS，页面里再按 -21dB 推子压下去
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  const wav = path.join(os.tmpdir(), 'pad_tmp.wav');
  const h = Buffer.alloc(44), data = Buffer.alloc(n * 4);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 4, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
  }
  fs.writeFileSync(wav, Buffer.concat([h, data]));
  const mp3 = path.join(outDir, 'ambient_pad.mp3');
  try {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '112k', mp3]);
    report.push({ name: 'ambient_pad.mp3', ms: Math.round(padSec * 1000), tail: '—', desc: '氛围垫音（占位，换成授权 BGM）' });
  } catch (e) { console.log('（跳过垫音：需要 ffmpeg）'); }
  fs.rmSync(wav, { force: true });
}

console.log(`输出目录：${outDir}`);
console.log('文件'.padEnd(20) + '时长'.padEnd(10) + '尾部'.padEnd(10) + '用途');
report.forEach((r) => console.log(r.name.padEnd(20) + (r.ms + 'ms').padEnd(10) + r.tail.padEnd(10) + r.desc));
console.log('\n注：全部为占位素材（统一峰值 -1dBFS，尾部已衰减到 -60dB 以下）。');
console.log('    拿到授权库采样后同名覆盖即可，事件挂载与音量基线无需改动。');

// v3.2 音效层：事件校验 + 离线混音 + §6.3 质检
// ---------------------------------------------------------------
// 1) 从页面读事件表（与画面同一批常量，音画同源）
// 2) 校验：重音数量 / 音量基线 / 并发上限 / 同类最小间隔 / 时刻合法性
// 3) 离线混音：foley 总线（逐事件 dB）+ 氛围垫音（-19.2dB）→ 16bit WAV
// 4) 输出实测：总线峰值、RMS、并发峰值、事件密度
// 用法: node audio-render.mjs [--out x.wav] [--start 9 --end 26] [--html ..\v2\control-illusion-v2.html]
//                            [--bgm-db -18] [--no-bgm] [--video x.mp4 --video-out y.mp4]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from './cdp.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const htmlPath = path.resolve(arg('html', '../v2/control-illusion-v2.html'));
const audioDir = path.join(path.dirname(htmlPath), 'audio');
const start = parseFloat(arg('start', '9'));
const end = parseFloat(arg('end', '26'));
const bgmDb = parseFloat(arg('bgm-db', '-19.2'));
/* 垫音推子 −19.2dB = **等价于 v6/v7 原档的 −18dB**（两个坑合起来 3.2dB，别再来回改）：
   ① ffmpeg 的 stereo→mono 在 s16 与 f32 输出间差 3.01dB（同源 mp3：s16 更低）。
      本脚本走 s16 路径，所以**用 f32 解码去量会看到 −18 变成 −21**——那是尺子差，不是工程差；
   ② 垫音去掉 air 层后，"峰值归一化到 −1dBFS"会整体抬高 1.17dB（旧素材的峰值被噪声顶高了）。
   合计 −18 − 3.01 的尺子差 + 1.17 的素材抬高 → 推子写 −19.2dB，成片电平与原档逐帧一致。 */
const outWav = path.resolve(arg('out', path.join(os.tmpdir(), 'mix.wav')));
/* --cut A,B：把时间轴上的 [A,B) 段整体剪掉（事件随之后移、落在段内的事件丢弃），
   用于出剪短版；垫音是从头连续取的，所以剪口天然无缝（不会出现长音的呼吸断点）。 */
const cutSpec = arg('cut', null);
const [cutA, cutB] = cutSpec ? cutSpec.split(',').map(Number) : [0, 0];
const cutSpan = cutB > cutA ? cutB - cutA : 0;
const SR = 44100;
const problems = [];
const dB = (v) => Math.pow(10, v / 20);
const toDb = (x) => 20 * Math.log10(Math.max(1e-9, x));

/* ---------- 1 读事件表 ---------- */
const b = await launch({ width: 1920, height: 1080, port: 9461 });
let meta;
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  meta = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__audioEvents())', returnByValue: true
  })).result.value);
} finally { await b.close(); }
const events = meta.events;

/* ---------- 2 校验 ---------- */
const impacts = events.filter((e) => e.s === 'low_impact');
const normal = events.filter((e) => e.s !== 'low_impact');
console.log(`事件 ${events.length} 条 ｜ 重音 ${impacts.length} 条（全片限 3）｜ 并发上限 ${meta.maxConcurrent}`);
if (impacts.length > 3) problems.push('重音超过 3 处');
events.forEach((e) => {
  if (e.g > -12) problems.push(`「${e.s}」@${e.t}s 音量 ${e.g}dB 高于重音上限 -12dB`);
  if (e.s === 'low_impact' ? e.g < -12 : (e.g < -22 || e.g > -14)) problems.push(`「${e.s}」@${e.t}s 音量 ${e.g}dB 超出规范区间`);
  if (e.t < 0 || e.t > 150) problems.push(`事件时刻越界：${e.t}s`);
});
/* 同类最小间隔 */
const bySound = {};
events.forEach((e) => { (bySound[e.s] = bySound[e.s] || []).push(e.t); });
Object.keys(bySound).forEach((s) => {
  const minGap = meta.defs[s].minGap;
  for (let i = 1; i < bySound[s].length; i++) {
    const gap = bySound[s][i] - bySound[s][i - 1];
    if (gap < minGap - 1e-6) problems.push(`「${s}」相邻两次只隔 ${gap.toFixed(2)}s（要求 ≥${minGap}s）`);
  }
});

/* ---------- 3 离线混音 ---------- */
function readWav(file) {
  const buf = fs.readFileSync(file);
  const ch = buf.readUInt16LE(22), sr = buf.readUInt32LE(24);
  let off = 12, dataOff = 0, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), sz = buf.readUInt32LE(off + 4);
    if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
    off += 8 + sz + (sz % 2);
  }
  const n = Math.floor(dataLen / 2 / ch);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += buf.readInt16LE(dataOff + (i * ch + c) * 2) / 32768;
    out[i] = s / ch;
  }
  return { sr, data: out };
}
function stats(arr) {
  let peak = 0, sum = 0;
  for (let i = 0; i < arr.length; i++) { const v = Math.abs(arr[i]); if (v > peak) peak = v; sum += arr[i] * arr[i]; }
  return { peak: toDb(peak), rms: toDb(Math.sqrt(sum / Math.max(1, arr.length))) };
}
function writeWav16(file, arr) {
  const n = arr.length, h = Buffer.alloc(44), data = Buffer.alloc(n * 2);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(arr[i] * 32767))), i * 2);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

const total = Math.round((end - start - cutSpan) * SR);
const foley = new Float32Array(total), bed = new Float32Array(total), mix = new Float32Array(total);
const placed = [];
const dropped = [];
events.forEach((e) => {
  if (e.t < start || e.t > end) return;
  let t = e.t;
  if (cutSpan > 0) {
    if (t >= cutA && t < cutB) { dropped.push(e); return; }   // 落在剪切段内的事件：随该段一起剪掉
    if (t >= cutB) t -= cutSpan;                              // 之后的事件整体前移
  }
  const f = path.join(audioDir, e.s + '.wav');
  if (!fs.existsSync(f)) { problems.push(`缺素材：${e.s}.wav`); return; }
  const s = readWav(f), g = dB(e.g), off = Math.round((t - start) * SR);
  for (let i = 0; i < s.data.length; i++) {
    const k = off + i;
    if (k >= 0 && k < total) foley[k] += s.data[i] * g;
  }
  placed.push({ ...e, t, tOrig: e.t, ms: Math.round(s.data.length / s.sr * 1000), end: t + s.data.length / s.sr });
});
if (cutSpan > 0) {
  console.log(`剪除 ${cutA}–${cutB}s（${cutSpan}s）→ 输出 ${((end - start - cutSpan)).toFixed(1)}s；` +
    `事件 ${placed.length} 条` + (dropped.length ? `，随段剪掉 ${dropped.length} 条：` +
    dropped.map((e) => `${e.t}${e.s}`).join(' / ') : ''));
}
/* 并发峰值 + 真正的叠加检测（重叠区间计数） */
let maxConc = 0, concAt = 0;
placed.forEach((e) => {
  let c = 0;
  placed.forEach((o) => { if (o.t < e.end && e.t < o.end) c++; });
  if (c > maxConc) { maxConc = c; concAt = e.t; }
});
if (maxConc > meta.maxConcurrent) problems.push(`实测最大叠加 ${maxConc} 个（@${concAt}s），超过上限 ${meta.maxConcurrent}`);

let bedSrc = null;
if (!has('no-bgm')) {
  const pad = path.join(audioDir, 'ambient_pad.mp3');
  if (fs.existsSync(pad)) {
    const tmpWav = path.join(os.tmpdir(), 'pad_dec.wav');
    try {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', pad, '-ac', '1', '-ar', String(SR), tmpWav]);
      bedSrc = readWav(tmpWav).data;
      fs.rmSync(tmpWav, { force: true });
    } catch (e) { console.log('（垫音解码失败，跳过 BGM）'); }
  } else console.log('（未找到 ambient_pad.mp3，输出纯 foley 版本）');
}
if (bedSrc) {
  const g = dB(bgmDb), off0 = Math.round(start * SR);
  for (let i = 0; i < total; i++) bed[i] = bedSrc[(off0 + i) % bedSrc.length] * g;
}
for (let i = 0; i < total; i++) mix[i] = foley[i] + bed[i];
writeWav16(outWav, mix);

/* ---------- 4 报告 ---------- */
const sf = stats(foley), sb = stats(bed), sm = stats(mix);
console.log('\n事件表：');
placed.forEach((e) => console.log(
  `  ${e.t.toFixed(2).padStart(6)}s${cutSpan > 0 ? `（原 ${e.tOrig.toFixed(2)}s）` : '         '}  ` +
  `${e.s.padEnd(11)} ${String(e.g).padStart(4)}dB  ${e.ms}ms  ${e.why}`));
const density = {};
placed.forEach((e) => { const k = Math.floor(e.t); density[k] = (density[k] || 0) + 1; });
console.log('\n每秒事件数：' + Object.keys(density).sort((a, b) => a - b).map((k) => k + 's×' + density[k]).join('  '));
console.log(`\n实测电平（dBFS）：foley 峰值 ${sf.peak.toFixed(1)} / RMS ${sf.rms.toFixed(1)}` +
            ` ｜ BGM 峰值 ${sb.peak.toFixed(1)} / RMS ${sb.rms.toFixed(1)}` +
            ` ｜ 混合 峰值 ${sm.peak.toFixed(1)} / RMS ${sm.rms.toFixed(1)}`);
console.log(`叠加峰值：${maxConc} 个（@${concAt}s），上限 ${meta.maxConcurrent} ${maxConc <= meta.maxConcurrent ? '✅' : '❌'}`);
if (sm.peak > -0.5) problems.push('混合峰值高于 -0.5dBFS，有削波风险');
console.log(`输出：${outWav}（${(fs.statSync(outWav).size / 1024 / 1024).toFixed(2)} MB / ${(total / SR).toFixed(1)}s）`);

/* ---------- 5 可选：与成片画面合轨 ---------- */
const video = arg('video', null);
if (video) {
  const vout = path.resolve(arg('video-out', video.replace(/\.mp4$/, '-audio.mp4')));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.resolve(video), '-i', outWav,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', vout]);
  console.log(`合轨：${vout}`);
}

console.log('\n' + (problems.length ? '❌ ' + problems.join('\n❌ ') : '✅ §6.3 音效质检通过（重音数量 / 音量基线 / 并发 / 间隔 / 电平）'));
process.exitCode = problems.length ? 1 : 0;

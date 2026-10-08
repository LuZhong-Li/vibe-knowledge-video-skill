// 旁白（配音）流水线：TTS 生成 → 时长拟合 → 排布 → 与 foley/BGM 混音（含压音）
// ---------------------------------------------------------------
// 说明：这里的旁白用 Windows 本地 TTS（Microsoft Huihui zh-CN）生成，**是可直接替换的临时旁白**。
//       真人录音替换方式：把 qa/.../旁白-150s.wav 换成同长的录音，或按「旁白脚本-时间码」自己压，
//       画面不用重渲。
// 用法: node narration.mjs [--html ..\v2\control-illusion-v2.html] [--out 目录]
//                          [--voice "Microsoft Huihui Desktop"] [--bed <foley+bgm.wav>] [--no-mix]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { launch, fileUrl } from './cdp.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes('--' + n);
const htmlPath = path.resolve(arg('html', '../v2/control-illusion-v2.html'));
const outDir = path.resolve(arg('out', path.join(path.dirname(htmlPath), '..', 'qa', 'v2', 'v33')));
const voiceName = arg('voice', 'Microsoft Huihui Desktop');
const SR = 44100, TOTAL = 150;
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
const dB = (v) => Math.pow(10, v / 20);
const toDb = (x) => 20 * Math.log10(Math.max(1e-9, x));

/* ---------- 旁白脚本：句子 → 画面分片（出场时刻从分片取，保证与画面同源） ---------- */
const LINES = [
  { s: 0, text: '你有没有发现一件很奇怪的事。', parts: ['你有没有发现', '一件', '很奇怪的事。'] },
  { s: 0, text: '同样是彩票，自己选的号码，总感觉更容易中奖。', parts: ['同样是彩票，', '自己选的号码，', '总感觉更容易中奖。'] },
  { s: 0, text: '机选的，心里就觉得不靠谱。', parts: [], fallback: 6.4 },
  { s: 1, text: '但从概率上来说，两组号码中奖概率完全一样。', parts: ['但从概率上来说，两组号码中奖概率完全一样。'] },
  { s: 1, text: '没有任何差别。', parts: ['没有任何差别。'] },
  { s: 1, text: '你只是产生了一种错觉。', parts: ['你只是产生了一种错觉。'] },
  { s: 1, text: '心理学上，叫做控制错觉。', parts: ['心理学上，叫做', '控制错觉'] },
  { s: 1, text: '我们会误以为，自己拥有选择权，就能掌控随机的结果。', parts: ['我们会误以为，自己拥有选择权，就能掌控随机的结果。'] },
  { s: 2, text: '有一个很经典的心理学实验。', parts: ['有一个很经典的心理学实验。'] },
  { s: 2, text: '研究人员让两组人参与彩票抽奖。', parts: ['研究人员让两组人参与彩票抽奖。'] },
  { s: 2, text: '一组可以自己挑选彩票。', parts: ['一组可以自己挑选彩票。'] },
  { s: 2, text: '另一组只能拿别人分配好的。', parts: ['另一组只能拿别人分配好的。'] },
  { s: 2, text: '之后，实验者询问，愿不愿意卖掉手里的彩票。', parts: ['之后，实验者询问，愿不愿意卖掉手里的彩票。'] },
  { s: 3, text: '自己选号那一组，开出的售价，足足高出四倍。', parts: ['自己选号那一组，', '开出的售价，足足高出四倍。'] },
  { s: 3, text: '明明中奖概率相同。', parts: ['明明中奖概率相同。'] },
  { s: 3, text: '仅仅因为亲手选择，人们就高估了获胜的可能性。', parts: ['仅仅因为亲手选择，人们就高估了获胜的可能性。'] },
  { s: 4, text: '这种错觉无处不在。', parts: ['这种错觉无处不在。'] },
  { s: 4, text: '打球时，觉得自己手感来了，下一球一定能进。', parts: ['打球时，觉得自己手感来了，下一球一定能进。'] },
  { s: 4, text: '扔骰子前，用力搓一搓，默念想要的数字。', parts: ['扔骰子前，用力搓一搓，默念想要的数字。'] },
  { s: 4, text: '炒股时，觉得自己判断对走势，可以掌控涨跌。', parts: ['炒股时，觉得自己判断对走势，可以掌控涨跌。'] },
  { s: 4, text: '本质上，这些结果很大程度带有随机性。', parts: ['本质上，这些结果很大程度带有随机性。'] },
  { s: 4, text: '但我们不愿意承认：很多事情，并不受我们掌控。', parts: ['但我们不愿意承认：很多事情，并不受我们掌控。'] },
  { s: 5, text: '为什么大脑会产生控制错觉？', parts: ['为什么大脑会产生控制错觉？'] },
  { s: 5, text: '大脑讨厌不确定性。', parts: ['大脑讨厌不确定性。'] },
  { s: 5, text: '它渴望掌控感，这会带来安全感。', parts: ['它渴望掌控感，这会带来安全感。'] },
  { s: 5, text: '哪怕这份掌控，只是虚假的。', parts: ['哪怕这份掌控，只是虚假的。'] },
  { s: 5, text: '把随机的好运，当成自己能力带来的成果。', parts: ['把随机的好运，当成自己能力带来的成果。'] },
  { s: 5, text: '当我们亲手参与、做出选择，大脑就会自动放大我们的影响力。', parts: ['当我们亲手参与、做出选择，大脑就会自动放大我们的影响力。'] },
  { s: 6, text: '分清能力和运气，是一种很重要的智慧。', parts: ['分清能力和运气，', '是一种很重要的智慧。'] },
  { s: 6, text: '把精力留给真正能改变的部分。', parts: ['把精力留给真正能改变的部分。'] },
  { s: 6, text: '随机的世界里，不要被虚假的掌控感困住。', parts: ['随机的世界里，不要被虚假的掌控感困住。'] },
  { s: 6, text: '承认哪些事无法掌控。', parts: ['承认哪些事无法掌控。'] }
];

/* ---------- 1 从页面取分片时刻 ---------- */
const b = await launch({ width: 1920, height: 1080, port: 9495 });
let PCS, SCS;
try {
  await b.goto(fileUrl(htmlPath) + '?t=0', { settleFrames: 4 });
  const meta = JSON.parse((await b.page.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ p: window.__pieces(), s: window.__screens(), ev: window.__audioEvents() })',
    returnByValue: true
  })).result.value);
  PCS = meta.p; SCS = meta.s;
} finally { await b.close(); }
const startOf = (line) => {
  let mn = Infinity;
  line.parts.forEach((frag) => {
    const hit = PCS.filter((p) => p.t === frag);
    hit.forEach((p) => { mn = Math.min(mn, p.start); });
  });
  return isFinite(mn) ? mn : (line.fallback != null ? line.fallback : 0);
};
LINES.forEach((l) => { l.t = startOf(l); });
LINES.sort((a, b2) => a.t - b2.t);

/* ---------- 2 TTS 合成（按屏拟合语速） ---------- */
function wavRead(file) {
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
function wavWrite(file, arr) {
  const n = arr.length, h = Buffer.alloc(44), data = Buffer.alloc(n * 2);
  h.write('RIFF', 0); h.writeUInt32LE(36 + n * 2, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(arr[i] * 32767))), i * 2);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
function resample(src, from, to) {
  if (from === to) return src;
  const n = Math.round(src.length * to / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * from / to, i0 = Math.floor(x), f = x - i0;
    out[i] = (src[i0] || 0) * (1 - f) + (src[Math.min(src.length - 1, i0 + 1)] || 0) * f;
  }
  return out;
}
function tts(batch, rate) {
  const list = batch.map((l, i) => `${rate}|${path.join(tmp, 'v' + batch[0]._i + '_' + i + '.wav')}|${l.text}`).join('\n');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, list, 'utf8');
  const ps = `Add-Type -AssemblyName System.Speech
$syn = New-Object System.Speech.Synthesis.SpeechSynthesizer
$syn.SelectVoice('${voiceName}')
$lines = Get-Content -LiteralPath '${listFile.replace(/'/g, "''")}' -Encoding UTF8
foreach ($ln in $lines) {
  $p = $ln.Split('|', 3)
  $syn.Rate = [int]$p[0]
  $syn.SetOutputToWaveFile($p[1])
  $syn.Speak($p[2])
  $syn.SetOutputToNull()
}
$syn.Dispose()`;
  const psFile = path.join(tmp, 'run.ps1');
  fs.writeFileSync(psFile, '\ufeff' + ps, 'utf8');
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: 'ignore' });
  return batch.map((l, i) => path.join(tmp, 'v' + batch[0]._i + '_' + i + '.wav'));
}

LINES.forEach((l, i) => { l._i = i; l.file = null; l.dur = 0; l.rate = 0; });
const byScreen = {};
LINES.forEach((l) => { (byScreen[l.s] = byScreen[l.s] || []).push(l); });
console.log('旁白合成（语音：' + voiceName + '）');
Object.keys(byScreen).forEach((s) => {
  const grp = byScreen[s], scr = SCS[s];
  /* 允许旁白稍微"溢"过换屏点 2.5s（旁白是连续语流，不必卡死在屏内），语速就不会被逼得太快 */
  const avail = (scr.t1 + 2.5 - 0.4) - grp[0].t;
  let rate = 0, files = null, total = 0;
  for (rate = 0; rate <= 6; rate++) {
    files = tts(grp, rate);
    total = 0;
    files.forEach((f, i) => { const w = wavRead(f); grp[i].sr = w.sr; grp[i].raw = w.data;
      grp[i].dur = w.data.length / w.sr; total += grp[i].dur; });
    if (total <= avail) break;
  }
  grp.forEach((l, i) => { l.file = files[i]; l.rate = rate; });
  console.log(`  S${+s + 1} ${scr.label}  窗口 ${avail.toFixed(1)}s / 语音 ${total.toFixed(1)}s` +
              `  rate=${rate} ${total <= avail ? '✅' : '❌ 超窗口'}`);
});

/* ---------- 3 排布到 150s 时间轴 ---------- */
const voice = new Float32Array(TOTAL * SR);
let cursor = 0;
console.log('\n旁白落点（画面分片时刻 → 实际发音时刻）');
LINES.forEach((l) => {
  const start = Math.max(l.t, cursor, 0.3);
  const data = resample(l.raw, l.sr, SR);
  const off = Math.round(start * SR);
  for (let i = 0; i < data.length; i++) { const k = off + i; if (k >= 0 && k < voice.length) voice[k] += data[i]; }
  l.actual = start;
  cursor = start + data.length / SR + 0.12;
  console.log(`  ${('S' + (l.s + 1)).padEnd(3)} 画面 ${l.t.toFixed(1)}s → 旁白 ${start.toFixed(1)}s` +
              `（${(data.length / SR).toFixed(1)}s, rate ${l.rate}）  ${l.text.slice(0, 16)}`);
});
let vPeak = 0; for (let i = 0; i < voice.length; i++) vPeak = Math.max(vPeak, Math.abs(voice[i]));
/* 旁白总线：峰值限制 → RMS 归一 → 末级软限幅。
   TTS 出来的语音峰值/均值比高达 23dB（尖刺多），只压不抬到不了可听响度；
   先限制峰值再抬均值，手机上才听得清，同时不动 foley/BGM 的相对关系（§6 只约束垫音与音效）。 */
(function compressVoice(v) {
  const ceil = dB(-9);                            // 1) 峰值限制到 −9dBFS
  const rel = Math.exp(-1 / (0.06 * SR));
  let env = 0;
  for (let i = 0; i < v.length; i++) {
    env = Math.max(Math.abs(v[i]), env * rel);
    if (env > ceil) v[i] *= ceil / env;
  }
  let sum = 0, n = 0;                             // 2) 抬均值到 −19dBFS（只统计有声样本）
  for (let i = 0; i < v.length; i++) if (Math.abs(v[i]) > dB(-60)) { sum += v[i] * v[i]; n++; }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const g = dB(-19) / Math.max(1e-6, rms);
  for (let i = 0; i < v.length; i++) v[i] *= g;
})(voice);
vPeak = 0; for (let i = 0; i < voice.length; i++) vPeak = Math.max(vPeak, Math.abs(voice[i]));
const gain = dB(-1.5) / (vPeak || 1);
for (let i = 0; i < voice.length; i++) voice[i] *= gain;
const narrFile = path.join(outDir, '旁白-150s.wav');
wavWrite(narrFile, voice);
console.log(`\n旁白音轨：${narrFile}（峰值 ${toDb(vPeak * gain).toFixed(1)}dBFS，时长 150.0s）`);

if (has('no-mix')) { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0); }

/* ---------- 4 与 foley + BGM 混音（旁白出现时压音 8dB） ---------- */
const bedFile = arg('bed', path.join(outDir, '成片-bed-150s.wav'));
if (!fs.existsSync(bedFile)) {
  console.log('生成 foley+BGM 底层音轨…');
  execFileSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'audio-render.mjs'),
    '--start', '0', '--end', '150', '--out', bedFile], { stdio: 'inherit' });
}
const bed = wavRead(bedFile).data;
if (bed.length < voice.length) throw new Error('底层音轨长度不足');
/* 旁白的包络（10ms 分辨率）→ 压音增益 */
const hop = Math.round(SR * 0.01), env = new Float32Array(Math.ceil(voice.length / hop));
for (let i = 0; i < env.length; i++) {
  let m = 0;
  for (let k = i * hop; k < Math.min(voice.length, (i + 1) * hop); k++) m = Math.max(m, Math.abs(voice[k]));
  env[i] = m;
}
for (let i = 1; i < env.length; i++) env[i] = Math.max(env[i], env[i - 1] * 0.82);   // 释放
for (let i = env.length - 2; i >= 0; i--) env[i] = Math.max(env[i], env[i + 1] * 0.6); // 起音
let duckMin = 1;
for (let i = 0; i < voice.length; i++) {
  const e = env[Math.floor(i / hop)] / dB(-3);
  const d = 1 - 0.60 * Math.min(1, e);      // 说话时垫音最多压到 40%（≈ −8dB）
  if (d < duckMin) duckMin = d;
  voice[i] = voice[i] + bed[i] * d;
}
/* 末级软限幅：峰值控制在 −1dBFS 以内，避免削波 */
let mixPeak = 0;
for (let i = 0; i < voice.length; i++) {
  const x = voice[i], lim = dB(-1);
  voice[i] = x > lim ? lim + (x - lim) / (1 + (x - lim) * 8) : (x < -lim ? -lim + (x + lim) / (1 - (x + lim) * 8) : x);
  mixPeak = Math.max(mixPeak, Math.abs(voice[i]));
}
const mixFile = path.join(outDir, '成片-音轨-150s.wav');
wavWrite(mixFile, voice);
console.log(`压音深度最深 ${(20 * Math.log10(duckMin)).toFixed(1)}dB（旁白期间垫音下压）`);
console.log(`成片音轨：${mixFile}（峰值 ${toDb(mixPeak).toFixed(1)}dBFS）`);
if (mixPeak > dB(-0.5)) console.log('⚠ 峰值偏高，建议检查');

/* ---------- 5 旁白脚本 + 时间码（供真人配音替换） ---------- */
const cue = ['# 旁白脚本 · 控制错觉（150s / 1920×1080）',
  '| # | 画面时刻 | 旁白落点 | 语速 | 文案 |', '| --- | --- | --- | --- | --- |']
  .concat(LINES.map((l, i) => `| ${i + 1} | ${l.t.toFixed(2)}s | ${l.actual.toFixed(2)}s | rate ${l.rate} | ${l.text} |`))
  .join('\n') + '\n';
fs.writeFileSync(path.join(outDir, '旁白脚本-时间码.md'), cue, 'utf8');
const srt = LINES.map((l, i) => {
  const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')},${String(Math.round((x % 1) * 1000)).padStart(3, '0')}`;
  return `${i + 1}\n${fmt(l.actual)} --> ${fmt(l.actual + l.dur)}\n${l.text}\n`;
}).join('\n');
fs.writeFileSync(path.join(outDir, '旁白-150s.srt'), srt, 'utf8');
console.log('旁白脚本：旁白脚本-时间码.md / 旁白-150s.srt');
fs.rmSync(tmp, { recursive: true, force: true });

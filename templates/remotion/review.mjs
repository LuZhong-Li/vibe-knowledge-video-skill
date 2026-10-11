// 成片节奏体检：字幕阅读速率 / 字幕空隙 / 声音事件密度 / 重音间距 —— 用数字说话，不靠感觉。
// 用法: node scripts/review.mjs
// 约定（换项目要改的三处）：
//   captions: 字幕轨 JSON，元素含 { text, startMs, endMs }
//   soundtrack: 音效组件源码，事件写成 { at: <帧号>, level: "accent|tap|swish|rise|tick" }
//   fps / totalFrames: 与 composition 一致
import fs from "node:fs";
import path from "node:path";

const FPS = 30;
const TOTAL_FRAMES = 4734;
const CAPTIONS_PATH = "src/captions.json";
const SOUNDTRACK_PATH = "src/components/Soundtrack.tsx";
const ACCENT_LEVEL = "accent";

const captions = JSON.parse(fs.readFileSync(path.resolve(CAPTIONS_PATH), "utf8"));
const soundtrack = fs.readFileSync(path.resolve(SOUNDTRACK_PATH), "utf8");

const hits = [...soundtrack.matchAll(/\{ at: (\d+), level: "(\w+)" \}/g)].map((match) => ({
  at: Number(match[1]),
  level: match[2],
}));
const fmt = (frames) => `${(frames / FPS).toFixed(1)}s`;

/* ① 字幕阅读速率：中文舒服区间约 5–8 字/秒，超过 9 字/秒基本读不完 */
console.log("① 字幕阅读速率（字数 ÷ 停留秒数）");
const rates = captions.map((caption) => {
  const seconds = (caption.endMs - caption.startMs) / 1000;
  const chars = Array.from(caption.text).length;
  return { text: caption.text, seconds, chars, rate: chars / seconds };
});
rates
  .slice()
  .sort((a, b) => b.rate - a.rate)
  .slice(0, 6)
  .forEach((row) =>
    console.log(`   ${row.rate.toFixed(2)} 字/秒  ${row.seconds.toFixed(1)}s / ${row.chars} 字  ${row.text.slice(0, 22)}`),
  );
const sortedRates = [...rates].sort((a, b) => a.rate - b.rate);
console.log(`   中位 ${sortedRates[Math.floor(sortedRates.length / 2)].rate.toFixed(2)} 字/秒`);
console.log(`   超过 8 字/秒的：${rates.filter((row) => row.rate > 8).length} 句（逐条复核：是不是落点句？是不是被转场压了？）`);

/* ② 字幕空隙：两句之间有没有"无字幕"的窗口（观众会走神） */
const gaps = captions
  .map((caption, index) => ({ from: caption.endMs, to: captions[index + 1] ? captions[index + 1].startMs : null }))
  .filter((gap) => gap.to !== null && gap.to - gap.from > 900);
console.log(`\n② 字幕空隙 >0.9s 的：${gaps.length} 处`);
gaps.forEach((gap) =>
  console.log(`   ${(gap.from / 1000).toFixed(1)}s → ${(gap.to / 1000).toFixed(1)}s  空 ${((gap.to - gap.from) / 1000).toFixed(1)}s`),
);

/* ③ 声音密度：最大空档 + >5s 的空档清单 + 重音间距 */
const sorted = hits.map((hit) => hit.at).sort((a, b) => a - b);
let worst = { gap: 0, at: 0 };
for (let i = 1; i < sorted.length; i++) {
  const gap = sorted[i] - sorted[i - 1];
  if (gap > worst.gap) worst = { gap, at: sorted[i - 1] };
}
console.log(`\n③ 声音：${hits.length} 条 ｜ 最大空档 ${fmt(worst.gap)}（${fmt(worst.at)} 之后）`);
const wide = sorted
  .map((frame, index) => ({ from: index === 0 ? 0 : sorted[index - 1], gap: frame - (index === 0 ? 0 : sorted[index - 1]) }))
  .filter((entry) => entry.gap > 5 * FPS);
if (wide.length) {
  console.log(`   >5s 的空档：${wide.map((entry) => `${fmt(entry.from)}→+${(entry.gap / FPS).toFixed(1)}s`).join("  ")}`);
  console.log(`   （刻意的静默段要能说清是哪一段；其余都该补事件）`);
}
const accents = hits.filter((hit) => hit.level === ACCENT_LEVEL).map((hit) => hit.at).sort((a, b) => a - b);
console.log(`   重音 ${accents.length} 处：${accents.map((frame) => fmt(frame)).join(" / ")}`);
for (let i = 1; i < accents.length; i++) console.log(`     间距 ${fmt(accents[i] - accents[i - 1])}`);
if (accents.length > 1) {
  const far = Math.max(...accents.map((frame, index) => (index === 0 ? 0 : frame - accents[index - 1])));
  if (far > 40 * FPS) console.log(`   ⚠️ 最长无重音段 ${fmt(far)} —— 是不是前重后轻？`);
}

/* ④ 每 20 秒的事件数：看节奏是不是前紧后松 */
console.log("\n④ 每 20s 的声音事件数");
for (let start = 0; start < TOTAL_FRAMES; start += 20 * FPS) {
  const count = sorted.filter((frame) => frame >= start && frame < start + 20 * FPS).length;
  console.log(`   ${fmt(start).padStart(6)}  ${String(count).padStart(2)}  ${"█".repeat(count)}`);
}

// 批量出静帧（校对版面用）：一次 bundle，逐帧出 PNG。
// 用法: node scripts/stills.mjs <frame> [frame...]
//   node scripts/stills.mjs 0 14 200 1900
// 出图目录: out/stills/fNNNNN.png
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";

/* ↓ 换项目要改的两处：入口与 composition id */
const ENTRY = "src/index.ts";
const COMPOSITION_ID = "AvailabilityHeuristic";

const frames = process.argv.slice(2).map(Number).filter((value) => Number.isFinite(value));
if (frames.length === 0) {
  console.error("用法: node scripts/stills.mjs <frame> [frame...]");
  process.exit(1);
}

const outDir = path.resolve("out/stills");
fs.mkdirSync(outDir, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve(ENTRY) });
const compositions = await getCompositions(serveUrl, { inputProps: {} });
const composition = compositions.find((entry) => entry.id === COMPOSITION_ID);
if (!composition) {
  console.error(`找不到 composition ${COMPOSITION_ID}（现有：${compositions.map((c) => c.id).join(", ")}）`);
  process.exit(1);
}
console.log(
  `composition ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} 帧`,
);

for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(5, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame });
  console.log("✓", output);
}

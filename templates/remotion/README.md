# templates/remotion —— Remotion 直出支线（README §23）

> 只在**用户点名要 Remotion**、或需要 React 生态 / 组件复用 / 分幕预览时用。
> 主流程仍是单文件 HTML（可 seek、有 DOM 体检）。这条线的代价是**没有 DOM 体检**：
> `clash / attach / narrative / textbox / film` 那套 A1/A19/A24/A29/A31/A32 在 Remotion 里没有对等物，
> 只能靠"静帧 + 字符图 + 逐帧亮度扫描 + review.mjs"人工审。要严格验收就回到 HTML 管线。

## 1 这套模板给什么

| 文件 | 用途 | 放进工程的哪里 |
| --- | --- | --- |
| `stills.mjs` | 一次 bundle、批量出静帧（校对版面） | `<project>/scripts/stills.mjs` |
| `review.mjs` | 节奏体检：字幕阅读速率 / 字幕空隙 / 声音事件密度 / 重音间距 | `<project>/scripts/review.mjs` |

`.mjs` 依赖 `@remotion/bundler` 与 `@remotion/renderer`（随 `@remotion/cli` 一起装，不用单独加）。

> ⚠️ **这两个脚本必须拷进工程再跑**：ESM 按**脚本自身所在目录**解析依赖，
> 直接 `node <skill目录>/templates/remotion/stills.mjs` 会报 `ERR_MODULE_NOT_FOUND: @remotion/bundler`。
> 拷到 `<project>/scripts/` 下即可（`import` 只依赖工程自己的 `node_modules`）。

## 2 起工程（GitHub 不通时的手写脚手架）

```bash
# create-video 会 clone github.com/remotion-dev/template-blank —— 连不上就手写：
mkdir my-video && cd my-video
npm init -y                     # name 用 ASCII slug（目录名可以是中文）
npm i remotion@<ver> @remotion/cli@<ver> react react-dom
npx remotion add @remotion/transitions @remotion/captions @remotion/media
```

必需文件：`tsconfig.json`（**开 `resolveJsonModule`** —— 字幕走 JSON）、`remotion.config.ts`、
`src/index.ts`（`registerRoot`）、`src/Root.tsx`（注册主 composition + 每幕一个 composition，可单独渲染）。

## 3 工程四律（都在 README §23.3 有实测依据）

1. 画面零 `Math.random()`：一切"随机感"用固定种子导出（尘埃 / 颗粒 / 汇聚粒子 / 点阵 rank）。
2. 动画值**内联**在 `style` 里（`interpolate()` 直接写在属性上；用 `scale/translate/rotate`，不写 `transform` 字符串）——
   Studio 才能拖关键帧，别人接手才能改。
3 + 4. `--bundle-cache=false` 应对"改了源码却输出一模一样"；出片后必过 `-pix_fmt yuv420p -color_range tv`
   （Remotion 默认 `yuvj420p` full range）。

## 4 已验证的 API 清单（4.0.534 实测）

| 结论 | 内容 |
| --- | --- |
| ✅ 存在 | `Easing.spring({damping})` · `interpolate(…, {output:'perceptual-scale'})` · `Interactive.Div/Span` · `springTiming({config,durationInFrames})` · `Sequence layout="none"` |
| ⚠️ **需要 `<HtmlInCanvas>`**（不能直接塞进 `TransitionSeries.Transition`） | `crossZoom` · `dreamyZoom` · `linearBlur` · `filmBurn` · `dissolve` · `swap` · `ripple` · `crosswarp` · `zoomBlur` · `zoomInOut` · `bookFlip` |
| ✅ 能直接用 | `fade` · `slide({direction})` · `wipe({direction})` · `flip({direction})` · `iris` · `clockWipe({width,height})` · `pushCut({flashColor,flashOpacity,flashFrames})` · `none` |

> 判据很简单：打开 `node_modules/@remotion/transitions/dist/presentations/<name>.d.ts`，
> 出现 `*Shader` / `draw(canvas…)` 的就是 shader 转场。

## 5 常用命令

```bash
npx remotion studio --no-open                                   # 预览（URL 会打印）
npx remotion render AvailabilityHeuristic out/film.mp4 --crf=18 --pixel-format=yuv420p --muted --bundle-cache=false
npx remotion render AvailabilityHeuristic out/audio.wav --codec=wav --bundle-cache=false   # 只渲音频，快 3–5 倍
npx remotion still CoverMask out/cover.png --frame=90 --bundle-cache=false                  # 封面静帧
node scripts/stills.mjs 0 14 200 1900                                                       # 批量静帧
node scripts/review.mjs                                                                     # 节奏体检

# 母版：抬电平 → 撞顶就限制 → 与视频流合成（视频流 md5 不变）
ffmpeg -y -i out/audio.wav -af "volume=8.5dB,alimiter=level_in=1:level_out=1:limit=0.891:attack=5:release=80:level=disabled" -c:a pcm_s16le out/audio-master.wav
ffmpeg -y -i out/video-raw.mp4 -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -color_range tv -an out/video-tv.mp4
ffmpeg -y -i out/video-tv.mp4 -i out/audio-master.wav -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart out/final.mp4
```

## 6 没有看图能力时怎么审画面

`templates/tools/imgscan.mjs` 把静帧/封面降成 84–100 列的**亮度字符图**，用文字"看"版面。
本项目就是靠它抓到：**首帧空台**（第 0 帧峰值 0.126，只有一团光晕）、**字幕带压字**、
**封面探测窗装不下墨迹**。配合 `ffmpeg … signalstats` 扫全片 YAVG 找空帧/黑帧。

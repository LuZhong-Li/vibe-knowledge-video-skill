# templates · 起步模板与工具链

> 从零开工时从这一份开始：**先把 `shot-template.html` 跑起来，再往里填你的内容。**
> 规范细节见仓库根 [README.md](../README.md)，勾选清单见 [checklist.md](../checklist.md)。

---

## 1 目录

```text
templates/
├─ shot-template.html          单文件起步模板：3 屏 / 20s / 16:9 / 无旁白，引擎已搭好
├─ shot-template-vertical.html 竖屏版骨架：3 屏 / 18s / 9:16（1080×1920），同一套引擎（README §27.3）
├─ narration-guide.md          旁白工作流正式化说明（分支 A 带旁白 / 分支 C 共用，README §27.4）
├─ remotion/                   分支 B 起步件：review.mjs（节奏体检）/ stills.mjs（批量静帧）/ README
├─ preview/                    模板自检时出的三屏静帧（成片-S1..S3.jpg）
├─ audio/                      占位音效（5 个短触发 + 静音位 + 氛围垫音），可直接用
└─ tools/                      渲染 / 混音 / 噪检 / 旁白 / 全套体检脚本（无第三方依赖，需要本机 Node + Edge/Chrome + ffmpeg）
```

环境：Node ≥ 18（实测 24）、Windows 上会找 Edge 或 Chrome（`tools/cdp.mjs` 自动探测）、`ffmpeg`/`ffprobe` 在 PATH 里。

---

## 2 三分钟上手

```powershell
cd templates

# ① 浏览器里看（音频走 WebAudio，采样级调度）
node tools/serve.mjs 8080
#    打开 http://127.0.0.1:8080/shot-template.html?sfx=1

# ② 自检：JS 异常 / NaN 帧 / 空场帧 / 量测钩子 / 末屏停住（可选 --shots 出图）
node tools/smoke-check.mjs shot-template.html

# ③ 逐帧渲染 → 合成 → 合音轨
node tools/render.mjs --html shot-template.html --out frames --fps 30 --start 0 --end 20
ffmpeg -framerate 30 -i frames/f%05d.jpg -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -color_range tv out.mp4
node tools/audio-render.mjs --html shot-template.html --start 0 --end 20 --bgm-db -19.2 --out bed.wav
ffmpeg -i out.mp4 -i bed.wav -c:v copy -c:a aac -b:a 192k -ar 44100 out-sfx.mp4
```

> `preview/成片-S1..S3.jpg` 就是模板自检时真实导出的三屏静帧 —— 先看一眼质感对不对，再动手改。

---

## 3 模板里已经替你写对的部分（不要改坏）

| 已经做对的事 | 对应规范 |
| --- | --- |
| 全部坐标走 `rx()/ry()`、尺寸走 `rFont()/rSize()`，代码里没有 `vw/vh/clamp` | P0 ① |
| 外层的 `.piece` 只写 `translate`，内层的 `.sc` 只写 `scale` 与入场 `blur` | P0 ② |
| 所有状态由 `t` 计算，`?t=8` 可定位任意一帧 | P0 ③ |
| 大字 `.04em` / 小字 `.08em` 字距，`nowrap` 分片单独标注 | P0 ④ |
| 金属字用 `filter:drop-shadow`，从不写 `text-shadow` | P0 ⑤ |
| 文字位移全部 `Math.round()` | P0 ⑥ |
| 环绕文字转速带阈值断言（`console.warn` 计入失败） | P0 ⑦ |
| 部位结构：`.piece` 上的层级/字体类 + `data-lv` / `data-screen` / `data-lf` 三个量测属性 | §7.4 量测钩子 |
| 光源关键帧由「元素被读到的时刻 + DOM 实测盒中心」自动生成 | §5.4 扫光 / A17 / A31 |
| 音效事件表时刻直接引用节拍表常量（音画同源） | §6.2 |

---

## 4 必须改的四处（其它都是可选）

1. **`ITEM_POS` + `SCREENS` + 各屏节拍表（`S1_T` / `S2_T` / `S3_T`）** —— 分幕网格与主角物品。
2. **`PIECES`** —— 文案分片表。原稿逐句拆片、降级、附着；**一句都不许删**。
3. **`drawBg()` / 图形件（球、柱、环）** —— 换成本片的母题。球簇共用 `.mball` + `data-item`，
   单球物品**不要**加 `data-item`（否则「球簇平均半径」这条指标失去意义）。
4. **`SFX_EVENTS` + `audio/`** —— 事件表与采样。全片重音**只留 3 处**。

改完把 `TOTAL`（总时长）改对，再跑 §5 的体检。

---

## 5 改完之后跑什么（顺序即优先级）

```powershell
cd templates/tools
node smoke-check.mjs        ../shot-template.html            # 先看有没有崩/空场/NaN
node film-check.mjs         ../shot-template.html            # 越界 / 重叠 / 层级比 / 版式签名
foreach ($i in 0..2) { node clash-check.mjs  ../shot-template.html $i 0.2 }   # 元素碰撞（屏号按你的幕数）
foreach ($i in 0..2) { node narrative.mjs    ../shot-template.html $i }       # A15–A21 时序/光影/高光/留白
foreach ($i in 0..2) { node attach-check.mjs ../shot-template.html $i }       # A25–A31 附着层与扫光联动
node keyword-check.mjs      ../shot-template.html            # A10 金属字亮度
node aspect-check.mjs       ../shot-template.html            # A22/A23 画幅与安全框
node playback-check.mjs     ../shot-template.html            # A6/A8 全片回放（需先改末屏断言，见下）
node noise-floor.mjs        bed.wav                          # 音频噪检
```

**体检脚本里有若干本项目专用常量，换项目时必须替换**（详见 [tools/README.md](tools/README.md)）：
`coverage.mjs` 的原稿清单、`playback-check.mjs` 的末屏注释与屏号、`film-check.mjs` 的 `STRUCT_FEATURES`、
`serve.mjs` 的默认入口、`cover-*.mjs` 的封面版面表。

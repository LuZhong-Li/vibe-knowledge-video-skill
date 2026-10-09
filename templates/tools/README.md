# tools · 渲染 / 混音 / 体检脚本

> 零第三方依赖（只用 Node 内置 API + WebSocket + 本机 Edge/Chrome），
> 每一条验收都能用命令行复现，而不是「看着还行」。
>
> **这些脚本是从一次真实交付里长出来的**，所以每个脚本都默认你的 HTML 遵守仓库根
> README §7.4 的量测钩子契约，并且有几处内嵌了本项目的常量。换项目时按第 3 节替换即可，
> 不要重新发明一套体检方式。

---

## 1 基础设施（先看这三个）

| 脚本 | 作用 |
| --- | --- |
| `cdp.mjs` | 极简 CDP 客户端 + 无头 Edge/Chrome 启动器（`launch()` / `fileUrl()`）。所有脚本都 import 它 |
| `render.mjs` | 逐帧渲染：`--html --out --fps --start --end [--limit] [--shards --shard]`（分片并行） |
| `serve.mjs` | 本地静态服务器（零依赖），用 http 打开时音频走 WebAudio 采样级调度 |

## 2 体检脚本

| 脚本 | 验收项 | 怎么用 |
| --- | --- | --- |
| `smoke-check.mjs` | 通用冒烟：JS 异常 / NaN 帧 / 空场帧 / 量测钩子齐全 / 末屏停住 | `node smoke-check.mjs <html> [--shots <目录>]` |
| `coverage.mjs` | A5 文案完整性（原稿逐句比对，按 DOM 顺序拼回拆句） | `node coverage.mjs <html>` |
| `film-check.mjs` | A1/A3/A13：逐屏越界 / 文字重叠 / 层级比 / 版式签名撞车 | `node film-check.mjs <html>` |
| `clash-check.mjs` | A24 元素碰撞（含环字 / 金点 / 球簇两两比对） | `node clash-check.mjs <html> <屏号> [步长=0.2]` |
| `narrative.mjs` | A15–A21：图形先行 / 自主节拍间隔 / 扫光聚焦 / 柔光漫游 / 金属流动高光 / 附着跟随 / 清屏留白 | `node narrative.mjs <html> <屏号>` |
| `attach-check.mjs` | A25–A31：主角物品 / 物品先行 / 同一时间线 / 附着同步 / 无大文本盒 / 底部留白 / 扫光联动 | `node attach-check.mjs <html> <屏号> [--shots <目录>]` |
| `keyword-check.mjs` | A10 金属关键词亮度必须高于同屏白字、亮部占比 ≥15% | `node keyword-check.mjs <html>` |
| `aspect-check.mjs` | A22/A23：1080p 与 2K 相对坐标偏差 <1%、安全框无越界 | `node aspect-check.mjs <html>` |
| `playback-check.mjs` | A6/A8：加速播完一遍，NaN 0 / 空场 0 / 0 报错 / 0 告警 / 停在末屏 | `node playback-check.mjs <html>` |
| `timeline.mjs` / `levels.mjs` / `check.mjs` / `selftest.mjs` / `shots.mjs` / `analyze.mjs` | 时间轴 / 层级比 / 单屏检查 / 单屏截图 | 参数见文件头 |
| `light-keys.mjs` | 从节拍表 + DOM 实测位置自动生成光源关键帧（模板里内置了简化版算法，这里是原版） | `node light-keys.mjs <html> <屏号>` |
| `copy-table.mjs` | 导出「成片文案表」：每片文字的实际出场时刻 / 角色 / 附着物品 / 层级 | `node copy-table.mjs <html> --md <输出.md>` |
| `film-stills.mjs` | 每屏静帧（探测口径与 `film-check` 一致） | `node film-stills.mjs <html> <输出目录>` |
| `audio-live-check.mjs` | 浏览器实时预览的音画同步（触发偏差 <30ms） | `node audio-live-check.mjs <html> <屏号>` |
| `audio-render.mjs` | §6 音效验收 + 离线混音出 bed（事件校验 / 并发 / 电平 / `--cut A,B` 剪短映射） | `node audio-render.mjs --start 0 --end 128 --bgm-db -19.2 --out bed.wav` |
| `noise-floor.mjs` | §6.5 噪检：汉宁窗逐帧频谱（186ms 帧 / 50% 重叠）取帧间中位数 | `node noise-floor.mjs <bed.wav 或 mp4>` |
| `make-foley.mjs` | 生成占位音效与氛围垫音（已含 v7 修复：无 air 白噪层 + 二阶巴特沃斯 @20Hz 高通） | `node make-foley.mjs --out ../audio --pad 150` |
| `narration.mjs` | （本片未采用）旁白流水线：TTS 到时长拟合到排布到压音混音，输出音轨 + 脚本 + SRT | `node narration.mjs --bed <bed.wav>` |
| `cover-extract.mjs` / `cover-render.mjs` / `cover-check.mjs` | 封面：从成片抽素材，出 16:9 JPG/PNG + 缩略测试图，8 条《最终校验项》逐条给数 | 见文件头 |
| `imgscan.mjs` | 把成品图打成字符图输出到终端（没有看图能力时用来「看」版面） | `node imgscan.mjs <图片> [列数=112]` |
| `anti-slop.mjs` | §18.1 反模式分诊单：封装 `impeccable detect`（59 条确定性规则，离线），默认起服务扫 URL（看得见 JS 渲染出的元素），结果分三桶。需要联网首次拉取 `impeccable` | `node anti-slop.mjs [--html <成片.html>] [--file] [--json]` |

---

## 3 换项目时必须替换的常量

| 脚本 | 要改什么 | 为什么不能省 |
| --- | --- | --- |
| `coverage.mjs` | 顶部 `ORIGINAL` 数组（原稿的全部句子） | 这是 **A5 的唯一依据**。原稿清单必须写在脚本里（外部、独立），不能从页面读，否则等于自己检查自己 |
| `playback-check.mjs` | 末屏注释断言与末屏屏号（本项目是「分清能力与运气」与 `data-screen="6"`）；总时长从页面读，不用改 | 这两处是本项目的文本与幕数 |
| `film-check.mjs` | `STRUCT_FEATURES`（每屏的图形结构清单，用于版式签名）；默认文件名 | 版式撞车判定依赖它 |
| `narrative.mjs` / `attach-check.mjs` | 默认文件名；`attach-check` 里的光源公式 `0.74 + 0.26 * smoothstep(...)` 必须与页面**同一条** | 逐帧比对靠这条公式，两边不一致必然对不上 |
| `serve.mjs` | 默认入口文件（原来写死为本项目成片） | 换项目后访问 `/` 会 404 |
| `cover-extract.mjs` / `cover-render.mjs` / `cover-check.mjs` | 封面版面表与 8 条校验项（本项目是「极简柱」方案） | 封面方案换了，校验项也要跟着换 |
| `copy-table.mjs` / `film-stills.mjs` | 一般不用改（从页面读 `__screens()` / `__pieces()`） | — |

---

## 4 三条硬规矩（本项目踩过）

1. **体检脚本里不要写死画布尺寸** —— 一律从 `window.__canvas()` 读，切 16:9 / 2K 不用改脚本。
2. **页面必须把体检要的数字主动暴露出来**（`data-lf` / `__items()` / `__light()` / `__narrative()`），
   让脚本能对账；量不到就等于没做。本项目 `.ringtext` 缺 `position` 导致环绕文字一直在画外，
   而当时的脚本只查了透明度没查位置 —— 这就是「量不到」的代价。
3. **图形件的几何要能自证**。柱体 `top` 忘了减柱高，正片里 4 倍差距没立起来，
   而几何体检只查"有没有越界"，查不出"高度比对不对" —— 最后是**封面按本意几何出图**时才暴露的。
   任何"比例/数量"要表达的结论，都要有一条能算出比例的检查。

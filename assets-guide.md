# 视觉素材与色彩规范

> 本文档只管「长什么样」：色彩 token、字体分层、视觉母题、金属渐变字、背景弱结构、安全区、
> 音效素材检索词、封面素材抽法、图片模型素材生产（§8）。流程与验收见 [README.md](README.md)，
> 勾选清单见 [checklist.md](checklist.md)。

---

## 1 色彩 token（代码里只准用这 8 个，不允许硬编码颜色字面量）

```css
:root{
  --bg-deep:#0A0A0A;                     /* 背景基色（近黑） */
  --bg-char:#141210;                     /* 炭灰渐变终点 */
  --ink:#F5F1E8;                         /* 暖白主文字 */
  --ink-2:rgba(245,241,232,.62);         /* 次级文字 / 正文 */
  --ink-3:rgba(245,241,232,.30);         /* 注释 / 顶部标识 */
  --gold-hi:#D7B979;                     /* 香槟金高光 */
  --gold:#B8944A;                        /* 暗金主色（描边 / 结构线） */
  --gold-line:#8A7655;                   /* 暗金灰：辅助线 / 刻度 / 概率曲线 */
  --glow:#6B4A1A;                        /* 棕金光晕，透明度 ≤ .09 */
}
```

**层次至少四级**：深黑背景 → 暖白文字 → 香槟金关键词 → 暗金灰结构线，再叠棕金光晕与少量金粒子。
只靠「黑 + 白 + 一个金色」= 「像加了个圆环的黑底页」。

背景渐变（`#stage` 底）：

```css
background:
  radial-gradient(120% 70% at 74% 32%, #1A1510 0%, rgba(20,18,16,0) 58%),
  linear-gradient(180deg,#0E0D0C 0%,#0A0A0A 55%,#060606 100%);
```

暗角（`#vignette`）：

```css
background:
  radial-gradient(72% 52% at 50% 44%, rgba(0,0,0,0) 40%, rgba(0,0,0,.55) 100%),
  linear-gradient(180deg, rgba(0,0,0,.34) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 76%, rgba(0,0,0,.46) 100%);
```

---

## 2 字体分层

```css
--serif:"Source Han Serif SC","Noto Serif SC","Songti SC","STSong","SimSun","Times New Roman",serif;
--kai:"KaiTi","STKaiti","Kaiti SC","Songti SC","SimSun",serif;
```

| 层级 | 字体 | 用法 |
| --- | --- | --- |
| 主标题 | 衬线 + 金属渐变 | 「控制错觉」/「4×」这类爆点 |
| 正文解释 | 思源宋体 / 宋体 | 承载信息的解释句 |
| 标签短句 | 楷体 | 「手感来了」「自己选号」这类贴在物品上的标签 |
| 注释小字 | 衬线 28–32px | 底部说明、来源标注 |
| 路径文字 | 衬线 30–32px · 透明度 ≤.34 | 沿圆环 / 曲线排列 |

**正文一律不用楷体**（可读性会崩）。**不打包字体文件**，只用系统字体栈（规避商用授权风险）。

---

## 3 四级文字层级与安全区

| 级别 | 字号(1080p) | 行高 | 字距 | 颜色 | 用量 |
| --- | --- | --- | --- | --- | --- |
| L0 爆点 | 160 / 300px | 1.10 | .02em | 暗金或暖白 | 每屏 ≤1 |
| L1 大标题 / 金句 | 72–96px | 1.40 | .04em | 暖白 | 每屏 ≤1 |
| L2 强调句 | 60–64px | 1.55 | .05em | 暖白 | 每屏 ≤2 行 |
| L3 解释 / 注释 | 32–52px | 1.30–1.75 | .08em | 暖白 / `--ink-2` | 拆短注分散 |
| L4 底部小字 | 28px | 1.60 | .10em | `--ink-3` | 每屏 1 条 |

行高参考（排版对表用）：`52px→91` `60px→93` `96px→134` `160px→176` `300px→330`。

**安全区**：`0.05–0.95`。1080p 下 = 左右 96 / 1824，上下 54 / 1026。
底部 10%（抖音 UI 遮挡区）不放关键信息：`y ≥ 0.80H` 的文字总宽 ≤0.35W，且无单条 >0.30W。
正文块最大宽度 ≈0.44W（1080p 下 845px）。

---

## 4 视觉母题（全片一套，不换装饰）

### 4.1 彩票球

```text
形态：正圆，1.5px 描边，内部 8% 同色径向填充（可加一条细弧作高光）
直径：90–240px，同屏必有大小差异（避免贴图感）
主球：220px，描边 1.5px rgba(184,160,106,.55)，球内号码字号 ≈ 球径 44% 且用暖白
      —— 金色只留给描边，不占用「金色文字 ≤5 处」的配额
运动：漂浮周期 >20s，自转 ≤5°/s，禁止弹性与快速位移
角色复用：S1 氛围球 / S3 证据球阵（左组一颗实心金，右组全空心）/ S5 线描图标
```

### 4.2 概率刻度

```text
形态：1px 主线 + 每 10% 一根 4px 短刻度 + 8px 实心游标点
语义：等长 = 概率相同
用法：S2 单条（两端 50%，游标居中）/ S4 上下两条等长刻度对照（概率一样长，标价点不一样大）
```

### 4.3 随机粒子

```text
数量：60–80 个；直径 1–3px；两层视差（近层更亮更大）；缓慢上浮
透明度：始终 ≤0.15（它是「空气」，任何时刻不得抢字）
其中约 1/4 用香槟金 rgba(215,185,121,·)，透明度上限 .17
```

### 4.4 背景弱结构（固定四件，全部在文字之下，全部由 t 驱动）

```text
① 极淡射线：14 条自球心放射，长度 1250±260px，1.4px，rgba(215,185,121,.055)→0，整组 0.25°/s
② 低透明概率曲线：正态曲线 1px，rgba(138,118,85,.22)，振幅 190 / σ=210，随正文用 2.2s「长出来」
③ 棕金光晕：球体后方 rgba(107,74,26,.085)，半径 820px，呼吸周期 >30s
④ 四角暗角：压到 rgba(0,0,0,.55)，顶部与底部各留一层线性压暗
```

透明度上限不得突破（射线 ≤.055、曲线 ≤.22），否则会变成「科技感 HUD」，违反禁止清单。
背景结构必须随时间缓慢变化（「事件感」的来源），不是静态贴图。

### 4.5 结构元素（辅助，不构成母题）

1px 细线 / 1px 细线框 / 极弱径向光晕（≤6%）/ 胶片颗粒（≤5%，12 次/秒跳变）/
专用轮廓线（1.5px，透明度 ≤0.10，内含呼吸光点）。

### 4.6 禁止清单

霓虹色、发光描边、玻璃拟态、科技感 HUD/网格、大色块渐变、弹跳回弹、打字机、故障闪烁、
粒子爆炸、位移 >40px 的转场、emoji 图标、真实照片、3D 渲染、
金色文字超过 5 处、同一屏两个同级视觉中心、**每屏更换一套装饰元素**。

---

## 5 金属渐变字（金色关键词专用）

```css
.metal{
  background:linear-gradient(176deg,#FFF6DE 0%,#F4E1B2 20%,#EFDCAF 40%,
                            #FFFBE9 58%,#EBD5A4 78%,#F6E7C0 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  -webkit-text-stroke:.6px rgba(74,48,12,.28);
  filter:drop-shadow(0 8px 30px rgba(107,74,26,.42));   /* 绝不用 text-shadow */
}
```

| 项 | 规范 |
| --- | --- |
| 关键点 | **第 58% 处必须有比暖白更亮的高光带**，保证金属字是画面最亮处 |
| 亮度下限 | 所有色阶灰度 ≥200；不允许暗金深色档（会压成「土金」） |
| 呼吸 | 幅度收到 `0.96↔1.00`（金属字已经很亮，幅度大了会显得闪） |
| 流动高光 | 用 `background-position` 随光源滑动，实测位置摆动 83%–94% |
| 验收 | 关键词区亮度峰值 > 同屏任何白字；亮部(>140) 占比 ≥15% |

**金色关键词全片 4–5 处**，其余屏的颜色重心靠「金 / 灰对比」与图形，不再加金。

---

## 6 素材获取

### 6.1 图形（全部代码自绘，不用图片素材）

- 球 / 刻度 / 粒子 / 柱 / 气泡 / 线稿：**CSS + Canvas/SVG 现画**，随画布缩放（`rSize()`）。
- 大脑轮廓一类曲线：用 SVG path（1.5px 线稿），不引入位图。
- **零外部资源**：单文件 HTML 里不出现 `<img>`、外链字体、CDN。

### 6.2 音效素材（占位 → 授权替换）

| 文件 | 检索词（英文优先） | 筛选标准 | 触发 |
| --- | --- | --- | --- |
| `soft_tick` | minimal glass tap / soft glass tick / hollow tap short | 短、干净、偏闷的玻璃轻触，不要清脆叮咚 | 文字 / 标签淡入 |
| `swish_soft` | soft swish / minimal whoosh light / air sweep subtle | 慢、气流感，不是快速呼啸，无强风噪 | 线条 / 轮廓生长、转场 |
| `low_impact` | minimal low impact short / soft stinger low thud | 低频扎实、衰减极快，无爆破、无长混响 | **仅三处重音** |
| `pulse_tap` | tonal pulse short / subtle resonant tap | 柔和共鸣，像微小球体震动，不是电子哔声 | 球体脉动 / 光点 / 堆叠 |
| `sub_rise` | minimal rise fx slow / subtle pitch swell short | 平缓柔和爬升，不尖锐 | 概念展开 / 轮廓描边 |
| `ambient_pad` | minimal ambient underscore slow no drums / cerebral ambient pad | 无鼓点、暗调、长音垫；**无嘶声、无次声摆动** | 全片垫音 |

**避雷词**：epic / trailer / explosion / cartoon / ding / bell / sparkle / boom / loud / fantasy。
**挑选实操**：波形尾部快速归零 → 叠上 bed 不抢戏 → 优先 44.1kHz 16bit 单声道 →
同类 2–3 个备选在单屏原型里对比锁定，其余丢弃。
**版权**：优先 Zapsplat / Epidemic / Uppbeat / PremiumBeat 等授权库；免费库确认 CC 可商用。

起步阶段用 [`templates/tools/make-foley.mjs`](templates/tools/make-foley.mjs) 生成占位素材（零依赖、程序化、统一峰值 −1dBFS、
尾部裁到 −60dB 以下），**拿到授权采样后同名覆盖即可**。

### 6.3 封面素材抽法（不重画图形）

```text
背景板  取成片 S1「读字静止段」t=5.20s 的背景引擎层：
        只保留 #bg/#grain/#vignette 抓帧；粒子 globalAlpha ×0.35，核心区内直接不绘制粒子
对比柱  取数据屏柱体生长完成态（本项目 S4 t=53.50s）的柱体元素：
        透明底 2× 抓取（392×1168 / 392×460），落回封面是缩小 0.5，不发虚
数字钩子 用正片同一份 .metal 材质现渲染（430px 比 300px 更锐），高光落点锁 background-position
参照帧  同时留档原帧，便于逐像素对比
```

⚠️ 无头浏览器 canvas `fillText` 画中文会回退成缺字方框；「行盒 → 墨迹中心」的补偿
**必须从成品图实测标定**（本项目：标题 inkDx=+6、副标题 +2、数字 +39/−33），不要用 canvas 估算。

---

## 7 目录约定（模板与样例共用）

```text
<项目>/
├─ <name>.html        # 成片本体（单文件、零依赖）
├─ audio/             # 音效采样 + 垫音（授权素材同名覆盖）
├─ tools/             # 渲染 / 混音 / 体检脚本（见 templates/）
└─ qa/<版本>/          # 每次交付的产物：成片、音轨、七屏静帧、文案表、封面、体检日志
```

每次改版**新建版本目录**（`qa/v5/`、`qa/v6/`…），旧版本只归档不覆盖 ——
排查回归时「拿上一版逐字重跑得同一数值」是证明「不是本轮引入」的唯一办法。

---

## 8 素材生产（图片生成模型：GPT Image2 一类）

> 定位：**只做「看」的素材，不做「演」的元素。**
> 画面里所有**会动的**东西（球 / 柱 / 刻度 / 粒子 / 线稿 / 大脑轮廓）一律代码自绘（§6.1）。
> 生成图只允许出现在两个位置：① 开工前的**构图概念稿**（给人看，不进任何交付物）；
> ② 封面**底图候选**（是例外，须先过 §8.5 三关）。

模型侧无硬依赖：本机 vocabulary 里有 `gpt-image-2` 等型号，但**「目录能取回」不等于
「路由已通」**，真要用先跑一次 `hypit plan` 确认，别把它当既定能力写进计划。

### 8.1 三条红线

1. **不让它写文字**（中文必糊）。`4×` 这类数字钩子**也归这条**：封面验收要把 `4×` 拆成
   ≥2 个独立字形组量峰值亮度（README §10），生成模型出的字形锁不住 §5 的 `.metal` 材质与
   `background-position`。所有文字与数字一律 DOM 排。
2. **不让它出成片、出连续帧** —— 时序由 `t` 算（P0 ③），模型给不了可 seek 的状态。
3. **不让它画照片级 / 复杂场景** —— 人物、实拍感、多层渐变插画一律不接（§4.6 禁止清单）。

### 8.2 什么时候用它

| 用途 | 输入 | 输出 | 去向 |
| --- | --- | --- | --- |
| 分镜构图概念稿 | 每屏一句话构图描述 | 16:9 静帧 | 写进 `docs/` 与分幕网格对照，**不进成片、不进封面** |
| 封面构图候选 | 一句话视觉描述 | 16:9 概念图 | 只用来和 README §10 那八条验收对表；**底图仍走 §6.3 从成片抽** |
| 母题形态参考 | 单个图形描述 | 静帧 / 线稿图 | 只当「长这样」的参照，**SVG 由人手写 path** |

一句话判据：**它产出的是「给眼睛看的图」，不是「给引擎用的件」。**

### 8.3 什么时候不用它

- 带中文、带任何文字或数字的画面（红线 1）
- 想要它直接产出「能内联进 HTML 的 SVG」—— 这是最容易踩的一脚，见 §8.4
- 照片、人物、真实场景、复杂渐变插画
- 成片帧、连续帧、转场素材
- **已经能用 §4 母题规格画出来的东西**（球 / 刻度 / 粒子 / 柱 / 气泡）—— 自绘永远更可控
- 让别的模型把绘图提示词转述一遍、再逐帧拼成片子 —— 要位图就走 §8.2 的表，
  路线问题见 [README.md](README.md) §7.5

### 8.4 ⚠️ 不要「一键转矢量」后直接内联

「生成图 → Illustrator / Figma 一键 Image Trace → SVG → 内联进 HTML」这条链在**本风格下是净损失**：

- 描摹会把 §4.4 的**柔光晕、粒子、暗角、颗粒**描成上千个杂点路径 —— 这正是「科技感 HUD」的成因（§4.6 禁止）；
- 描摹结果**不可参数化**：颜色写不进 token（§1 只准那 8 个）、半径不跟 `rSize()` 缩放、状态不能由 `t` 驱动（P0 ①③）；
- 单个母题（球 / 柱 / 大脑轮廓）**手写 SVG path 只有几行**，比清理描摹结果快一个量级，而且天然可控可体检。

所以只有两条路：**要么它只当参考、图形照 §6.1 自绘；要么整张走位图进封面 `cover/assets/`**
（封面本来就是位图管线，允许 `<img>`，但必须留 `assets.json` 出处）。**没有第三条路。**

顺带：生成模型口头的「transparent background」不可靠，别指望它给干净透明底。

### 8.5 真要当封面底图，得先过这三关

封面管线（`cover-extract.mjs` / `assets.json` / `cover-C-A.html`）是按「不重画图形、
直接取成片资产」建的（§6.3、README §10.2）。生成图要破例进来，必须**同时**满足：

1. `assets.json` 里记得住出处（模型 + 提示词 + 尺寸 + 版本），能复现；
2. 配色对得上 §1 那 8 个 token —— 不是封面方案 C 那次的一次性
   `#D4AF37 / #B4B4B4 / #0A0A0C`（那三个值是单项目的地方色，**不是**本 skill 的 token）；
3. 过 README §10 的八条像素验收，重点是「底部无关键文字 `y>972` 亮度 <0.10」
   「粒子不穿过主体」「亮度 >0.95 占比 <3%」。

三条缺一条，就退回「概念稿」定位。

### 8.6 提示词模板（英文提示词 + 约束写死）

通用写法：**英文提示词、点名色值、扁平矢量、明写「无任何文字」、明写不要照片写实**。
色值一律填 §1 的 token，不填一次性地方色。

**① 封面 / 底图概念稿**

```text
A minimalist 16:9 key visual for a psychology explainer video.
Deep charcoal near-black background (#0A0A0A).
Two flat bars standing on the same baseline: one tall dark-gold bar (#B8944A),
one short muted warm-grey bar (warm white at low opacity).
Leave the centre as clean empty negative space for a large numeric hook to be typeset later.
Faint champagne-gold (#D7B979) particle dots, very low contrast, background only.
Flat vector style, thin 1.5px outlines. No 3D-looking gradients, no glow rings,
no HUD grid, no neon, no glassmorphism, no photorealism.
Completely free of text, letters, numbers, symbols, watermarks and logos.
Cinematic, restrained, documentary aesthetic. Low saturation.
```

**② 单屏分镜构图概念稿**

```text
16:9 frame, deep black background (#0A0A0A).
A thin circle outline in dark gold (#B8944A), 1.5px, centred, generous margins.
Inside: six small solid dots clustered on the left half, six hollow dots scattered on the right half.
A faint vertical mirror line through the centre, very low opacity.
Flat vector line art, very low contrast, lots of empty space.
No text, no numbers, no labels, no glow, no 3D, no photorealism, no UI chrome.
```

**③ 母题形态参考（只为照着手写 SVG path）**

```text
Flat vector line-art icon: a simple brain outline, two thin strokes only,
dark grey line on a flat mid-grey background. Minimal, geometric, no fill, no shading, no 3D.
Square 1:1. No text, no letters, no numbers, no watermark.
```

### 8.7 与 HTML 动画层的交接

- **概念稿**：只写进 `docs/`，不进 `tools/`，不参与任何体检脚本。
- **位图（仅封面）**：落 `cover/assets/`，登记 `assets.json`；封面是**静态**排版，
  不做描边生长 / 位移入场这类动画。
- **图形动画**：一律自绘，挂在 SVG / CSS / Canvas 元素上。`stroke-dashoffset` 生长、
  `transform` 入场、`opacity` 淡入全部由 `t` 驱动、`?t=45` 可定位（P0 ③）。

### 8.8 落地验证（跑通这两条才算接得上）

1. 生成一张封面**概念稿** → 只做构图对照，**不覆盖** `cover/assets/` 里从成片抽出来的素材。
2. 生成一张大脑轮廓参考 → 照它**手写** SVG path（1.5px 线稿），挂进 S6 的 `t` 驱动动画，
   跑 `film-check.mjs` / `attach-check.mjs` 全绿。

验证的是「**参考 → 自绘**」，不是「生成 → 内联」。这两条过了，说明这个上游工具只是
「多一个出素材的口子」，没有动到 HTML 时间轴、音效与文案规范。

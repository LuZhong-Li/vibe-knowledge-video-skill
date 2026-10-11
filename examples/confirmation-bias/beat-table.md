# 分幕网格 · 节拍表 · 音效事件表

> 这一份是**画面、光影、音效三处唯一的事实来源**：改一处，三处同改。
> 音效事件表里的时刻直接引用节拍表常量（`S1.cardL` / `S3.half` 这种），不是手抄一遍 ——
> 这是"音画同步误差 = 0"的工程保证。
>
> 第三期《确认偏误》是**互动式八幕**：观众先在心里选立场 → 看证据被自己的立场筛掉一半 →
> 命名 → 迁移 → 拆机制 → 自检。母题与第二期互补：那边是样本被**外界**筛掉（空缺），
> 这边是大脑**自己**筛证据（一组亮、一组暗）。

---

## 1 分幕网格（8 幕 / 140.000s）

| 幕 | 时间 | 主角物品 | 核心交互 | 文字依附 |
| --- | --- | --- | --- | --- |
| S1 先选立场 | 0–17s | 两张观点卡 + 思考小球 + **过渡桥段** | 左卡 0.2s 生长 → 右卡 1.2s → **2.40s 底部提问**（不能再早：2.0–2.1s 会插到两张卡标签 2.15s 之前，柔光来不及在 0.6s 内飘过去，A17 挂两处）→ **小球 2.5–6.7s 只做两次往返（每段 0.70s），到左/到右时对应卡框呼吸发亮** → 7.5s 起停在中间偏左、两侧卡框**同步**微弱呼吸 → **10.5s 弹出心理桥段，13.2–15.0s 两张卡整体收缩退场** | 两行标签贴各卡上方（随卡收退）；底部提问（9.6s 淡出）；桥段句居中 |
| S2 证据选择 | 17–29s | 搜索环 + 8 个证据象征符号 | **17.1–22.4s 只有搜索环的空画布（心理间隙）** → 22.5s 起证据 Group 逐个弹出（0.43s）→ 26.2s 提示 → 停留 2.0s → 28.2s 焦点框扫描 | 顶部标题 / 左上角小字 / 8 条符号标签（与符号同组）/ 底部提问 |
| S3 筛选揭示 | 29–54s | 筛网 + 两组证据 | 筛网 2.2s 落下 → 一组亮一组暗 → 左右分流（≤11.13px/s）→ 「一半」弹入（**47.4s 重音①**） | 左右堆标签；注 + 文献线索；命名铺垫句 |
| S4 命名卡 | 54–71s | 分流后的证据组 + 分隔线 | 分隔线生长 → 左组高亮框 / 右组暗蒙版 → 主标题弹出（**67.5s 重音②**）→ 反问钩子 | 左右标签 / 竖排边注 / 示意标注 / 英文字幕 / 反问句 |
| S5 机制展开 | 71–86s | 四节点流程链 | 两段标题 → 四节点每 1.4s 依次点亮 → 方向光带穿过 → 说明句 | 节点标签四片 |
| S6 生活迁移 | 86–108s | 三场景 + 小筛子 | 场景依次高亮，每个场景内小筛子过滤一次（2 留 2 掉）→ 六散落符号每 1.5s 淡入 | 三标签 + 收束句 |
| S7 大脑处理 | 108–126s | 大脑 + 四条路径 | 大脑呼吸 → 四条弧线生长 → 四节点依次亮 → 支持上浮变亮 / 反对下沉变暗 → 总结两行 | 四节点标签 |
| S8 自检收束 | 126–140s | 汇线 + 自检框 | 粒子汇聚成线 → 标题卡 → 自检框弹出框住金句（**129.2s 重音③**）→ 左右对照证据 → 138s 起压暗 | 竖排边注 / 互动提问 / 文献线索 |

---

## 2 节拍表（画面 / 光影 / 音效三处只读这一张）

```text
S1 先选立场 0–17s                                                                   out 17.0
  画面  cardL 0.20(描边 1.1s) / cardR 1.20 / tagL 0.80 / tagR 1.80 / note 2.40(9.60 淡出)
        selector 2.50–6.70(S1.sel0→sel1)：中→左→右→中→左→右→中，每段 0.70s、±200px，
                 共两次往返；到左 3.20/5.30、到右 3.90/6.00（卡框同步呼吸发亮）
                 7.50 漂到中心偏左 restX −0.30×A(−60px) 停住，光环呼吸幅度 7→4.5px
        bridge 10.50(心理桥段 L2 金属，13.20 起淡出)
        13.20–15.00 两张观点卡整体收缩淡出(k→0.55、向两侧各移 70px、卡内符号与卡内文字同步)
                   —— 15.00 起画布干净，交给 S2
  音效  cardL/cardR swish_soft −18 / tagL/tagR note soft_tick −22·−21
        sel0 pulse_tap −16（出发）｜3.20·3.90·5.30·6.00 pulse_tap −17（到左/到右"叮"）
        4.60·6.70 sub_rise −22（回中"嗡"）｜8.50 soft_tick −22（停住收口）
        bridge sub_rise −18 / cardsOut 13.20 swish_soft −19
S2 证据选择 17–29s                                                                  out 29.0
  画面  search 17.10(搜索环：旋转虚线环 r150→80，17.1–22.4 是空画布期唯一的图形动作)
        title 17.20 / corner 17.60 / dot0 22.50 @0.43s(8 个证据 Group 无规则弹出)
        note 26.20 / scan 28.20–29.00(焦点框跳，落在哪个证据整组高亮)
S3 筛选揭示 29–54s                                                                  out 54.0
  画面  sieve 30.50(2.2s 落下) / sel0 33.00(支持组亮) / dim0 35.00→dim1 38.00(反对组暗)
        sort0 33.00→sort1 47.00(最大位移 155.8px，速度上限 11.13px/s)
        tagL 41.00 / tagR 43.00 / half 47.40(★重音①) / note 48.80
        name 50.60(命名仪式铺垫) / src 51.90
S4 命名卡 54–71s                                                                    out 71.0
  画面  divider 54.60(自上而下 1.2s) / tag1 56.50 / tag2 58.00 / frame 60.00
        side 62.00 / disc 64.50 / title 67.50(★重音②) / sub 68.60 / hook 69.30(转向"为什么"的反问)
S5 机制展开 71–86s                                                                  out 86.0
  画面  flow 72.60 / left 73.20 / right 75.20 / node0 77.00 @1.40s ×4 / note 83.60
S6 生活迁移 86–108s                                                                 out 108.0
  画面  main 87.50 / A 92.00 / B 98.00 / C 103.00 / scatter 92.00 起 ×6 @1.50s / close 105.20
S7 大脑处理 108–126s                                                                out 126.0
  画面  brain 108.60 / node 109.50,112.00,114.50,117.00(★四节点)
        双标：支持上浮 30px + 变亮 / 反对下沉 30px + 变暗
        sum1 121.90 / sum2 123.00
S8 自检收束 126–140s                                                                out 140.0
  画面  line 126.00(粒子汇聚 2.0s) / title 126.90 / frame 127.60(自检框)
        q1 129.20(★重音③) / side 131.60 / ask 132.80 / src 135.20 / dim 138.00
（★ = 全片三处重音；三处时间戳与第一版完全对齐，任何改版都不许挪）
```

---

## 3 音效事件表（60 条 · 从页面 `SFX_EVENTS` 原样导出）

**三条硬规则**（§21.1-5，都是这一期踩出来的）：

1. 非重音 dB 必须落在 **[−22, −14]**；重音 ≤−12 且全片仅 3 处。想更轻就换音色或拉长间隔，别把 dB 写到区间外。
2. 同类最小间隔：`soft_tick .18 / pulse_tap .30 / swish_soft .35 / sub_rise 1.00 / low_impact 1.50`（秒）。
3. 事件**按时间升序**排 —— 体检脚本按数组顺序算同类间隔，尾部追加会算出负间隔。

```js
  var SFX_EVENTS = [
    { t:S1.cardL, id:'swish_soft', dB:-18, pri:2 },      // S1 左观点卡描边生长
    { t:S1.tagL,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S1.cardR, id:'swish_soft', dB:-18, pri:2 },      // 右卡
    { t:S1.tagR,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S1.note,  id:'soft_tick',  dB:-21, pri:1 },      // 底部提问
    { t:S1.sel0,  id:'pulse_tap',  dB:-16, pri:1 },      // 思考小球出发
    /* v3.5：两次往返的落点音 —— 到左/到右是轻「叮」（pulse_tap），回中是低「嗡」（sub_rise）。
       间隔 0.70s ≥ pulse_tap 0.30 / sub_rise 1.00 的下限；一个重音都没占（全片仍锁 3 处）。 */
    { t:3.20, id:'pulse_tap', dB:-17, pri:1 },           // 第一次到左
    { t:3.90, id:'pulse_tap', dB:-17, pri:1 },           // 第一次到右
    { t:4.60, id:'sub_rise',  dB:-22, pri:1 },           // 回到中心
    { t:5.30, id:'pulse_tap', dB:-17, pri:1 },           // 第二次到左
    { t:6.00, id:'pulse_tap', dB:-17, pri:1 },           // 第二次到右
    { t:6.70, id:'sub_rise',  dB:-22, pri:1 },           // 回到中心（摆球结束）
    { t:8.50, id:'soft_tick', dB:-22, pri:1 },           // 停住落点（选择窗口收口）
    /* 心理桥段入场：用 sub_rise 而不是 low_impact —— 全片重音配额锁死 3 处
       （47.4「一半」/ 67.5「确认偏误」/ 129.2 金句），bridge 只能用一个普通事件 */
    { t:S1.bridge, id:'sub_rise',  dB:-18, pri:1 },
    { t:S1.cardsOut, id:'swish_soft', dB:-19, pri:2 },   // 立场卡片整体退场
    { t:S2.search, id:'sub_rise',  dB:-20, pri:1 },      // S2 搜索环：大脑开始搜寻
    { t:S2.title, id:'soft_tick',  dB:-21, pri:1 },
    { t:S2.dot0,  id:'pulse_tap',  dB:-16, pri:1 },      // 证据 Group 开始弹出
    { t:S2.note,  id:'soft_tick',  dB:-21, pri:1 },      // 挑你认为有说服力的
    { t:S2.scan0, id:'swish_soft', dB:-17, pri:2 },      // 焦点框开始扫描
    { t:S3.sieve, id:'swish_soft', dB:-18, pri:2 },      // 筛网落下
    { t:S3.sel0,  id:'pulse_tap',  dB:-16, pri:1 },      // 一组亮起
    { t:S3.dim0,  id:'pulse_tap',  dB:-16, pri:1 },      // 另一组变暗
    { t:S3.dim1,  id:'soft_tick',  dB:-21, pri:1 },
    { t:S3.tagL,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S3.tagR,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S3.half,  id:'low_impact', dB:-12, pri:3 },      // ★重音①「一半」
    { t:S3.src,   id:'soft_tick',  dB:-21, pri:1 },      // 文献线索（S3）
    { t:S4.matrix, id:'soft_tick', dB:-22, pri:1 },      // 分隔线起笔
    { t:S4.frame, id:'swish_soft', dB:-18, pri:2 },      // 高亮框 / 暗蒙版
    { t:S4.side,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S4.title, id:'low_impact', dB:-12, pri:3 },      // ★重音②「确认偏误」
    { t:S4.sub,   id:'soft_tick',  dB:-22, pri:1 },      // 英文副题
    { t:S5.flow,  id:'swish_soft', dB:-18, pri:2 },      // S5 流程链出现
    { t:S5.right, id:'soft_tick',  dB:-21, pri:1 },
    { t:S5.node0, id:'pulse_tap',  dB:-16, pri:1 },
    { t:S5.node0 + S5.nodeStep,     id:'pulse_tap', dB:-16, pri:1 },
    { t:S5.node0 + 2 * S5.nodeStep, id:'pulse_tap', dB:-16, pri:1 },
    { t:S5.node0 + 3 * S5.nodeStep, id:'pulse_tap', dB:-16, pri:1 },
    { t:S5.note,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S6.main,  id:'swish_soft', dB:-18, pri:2 },      // S6 三场景
    { t:S6.A,     id:'pulse_tap',  dB:-16, pri:1 },
    { t:S6.B,     id:'pulse_tap',  dB:-16, pri:1 },
    { t:S6.C,     id:'pulse_tap',  dB:-16, pri:1 },
    { t:S6.close, id:'soft_tick',  dB:-22, pri:1 },
    { t:S7.brain, id:'swish_soft', dB:-18, pri:2 },      // S7 大脑出现
    { t:S7.node[0], id:'pulse_tap', dB:-16, pri:1 },
    { t:S7.node[1], id:'pulse_tap', dB:-16, pri:1 },
    { t:S7.node[2], id:'pulse_tap', dB:-16, pri:1 },
    { t:S7.node[3], id:'pulse_tap', dB:-16, pri:1 },
    { t:S7.sum1,  id:'soft_tick',  dB:-22, pri:1 },
    { t:S8.line,  id:'swish_soft', dB:-18, pri:2 },      // S8 粒子汇聚成线
    { t:S8.frame, id:'soft_tick',  dB:-22, pri:1 },      // 自检框弹出
    { t:S8.q1,    id:'low_impact', dB:-12, pri:3 },      // ★重音③ 收尾金句
    { t:S8.ask,   id:'soft_tick',  dB:-22, pri:1 },
    { t:S8.src,   id:'soft_tick',  dB:-22, pri:1 },
    /* v3.3 新增：幕间转场音（全部用 audio/ 里真实存在的素材，且不新增重音；
       17.1 与 29.0 已有 sub_rise / swish_soft，不重复挂 */
    { t:54.00,    id:'swish_soft', dB:-19, pri:2 },      // S3→S4：命名卡落地
    { t:71.00,    id:'swish_soft', dB:-20, pri:2 },      // S4→S5：转向机制
    { t:86.00,    id:'sub_rise',   dB:-20, pri:1 },      // S5→S6：沉到生活场景
    { t:108.00,   id:'soft_tick',  dB:-21, pri:1 }       // S6→S7：进入大脑
  ];
```

实测：60 条事件 / 重音 3 处 / 并发峰值 2（上限 3）/ 混合峰值 −13.0 dBFS。

---

## 4 复现命令

```powershell
cd templates\tools        # 或把项目的 tools\ 指到这几支脚本
node smoke-check.mjs     <成片.html>
node coverage.mjs        <成片.html>
node film-check.mjs      <成片.html>
node textbox-check.mjs   <成片.html>
node keyword-check.mjs   <成片.html>
node aspect-check.mjs    <成片.html>
node playback-check.mjs  <成片.html>
node readability-check.mjs <成片.html> <帧目录> --stride 3 --md <可读性.md>
0..7 | % { node clash-check.mjs <成片.html> $_ 0.2 }
0..7 | % { node narrative.mjs <成片.html> $_ }
0..7 | % { node attach-check.mjs <成片.html> $_ }
node audio-render.mjs --html <成片.html> --start 0 --end 140 --out <音轨.wav>
node noise-floor.mjs <音轨.wav>
# 取证（本片新增的两支）
node pixel-probe.mjs diff <成片.mp4> 2.5 13 2      # 低动态段到底动不动
node box-probe.mjs <成片.html> 6,8.6,26.4,47.4     # 引线端点 / 文字贴边 / 图形越界
```

> 渲染：`node render.mjs --html <成片.html> --out <帧目录> --fps 30 --start 0 --end 140 --shards 4 --shard N`
> （四片并行，8–12 分钟；`-color_range tv` 不能省。**渲染期间不要跑体检**，见 §12.2 坑 25。）

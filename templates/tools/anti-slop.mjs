// 反模式自检：封装 `impeccable detect`（59 条确定性规则，离线、不用 LLM/API key）。
//
// 用法（在 templates/tools 目录里）:
//   node anti-slop.mjs                          # 起本地服务，扫 templates/shot-template.html（URL 模式）
//   node anti-slop.mjs --html ../xxx/成片.html   # 扫指定成片（路径相对当前目录）
//   node anti-slop.mjs --file                   # 静态扫文件（快，但看不见 JS/Canvas 渲染出来的元素）
//   node anti-slop.mjs --json                   # 机器可读输出
//
// 退出码：0 = 干净，或只剩 WAIVED 里的故意签名；2 = 有本片必须处理的 primary finding；1 = 跑不起来。
//
// 为什么要走 URL 模式：本 skill 的画面由 JS 逐帧写进 DOM，静态扫文件只看得到源里的 CSS
// （实测：文件模式 1 条、URL 模式 2 条）。URL 模式需要 Chromium 系浏览器，用 cdp.mjs 的探测结果。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './cdp.mjs';

// 本 skill 的「故意签名」：命中即豁免，但仍然打印出来，避免它们悄悄变成真问题。
const WAIVED = {
  'gradient-text': '§5.5 金属渐变字（background-clip:text 是本片的视觉签名）',
  'dark-glow': '§4.4 棕金光晕（背景弱结构 ③）',
  'radial-spotlight-glow': '§4.3 球体径向填充 / §4.4 光晕',
  // 下面两条是「衬线 + 英文 tracked caps」风格的常见误报，命中不判失败，但要人工看一眼。
  'italic-serif-display': '本片正文用衬线（§2 字体分层）',
  'tracked-caps': '§4.5 英文副题是大写字距排的',
  // 检出的规则面向的是「会交互的网页」，在逐帧驱动的片子里是常规手法
  'wide-tracking': '§5.3 字距就是 0.04/0.08em（P0 ④ 已按此重测过换行）——与 impeccable 的网页排版建议冲突，本片按自己的来',
  'clipped-overflow-container': 'overflow 裁切是片子的遮罩手法（柱体生长 / 文字擦除）',
  'gpt-thin-border-wide-shadow': '§10.4 描边加固 + 光晕是抗糊手段，不是 UI 阴影'
};

// 分类错位：web 版式的判据套到逐帧片子上不成立，但它们各自对应本 skill 已有的、更准的检查。
const MAPPED = {
  'content-hidden-at-rest': '逐帧片子的文字本来就要等 t 到才显示 → 用 A5 文案完整性（coverage.mjs）判，比它准',
  'low-contrast': '它把扫描那一瞬的半透明入场态当成了最终态 → 用 §5.5 关键词亮度验收（峰值 > 同屏任何白字、亮部占比 ≥15%）判',
  'bounce-easing': '若命中，直接看 §5.4「禁止弹性曲线」'
};

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, '..');
const htmlArg = val('--html', path.join(templatesDir, 'shot-template.html'));
const html = path.resolve(process.cwd(), htmlArg);
const fileMode = has('--file');
const jsonMode = has('--json');
const portArg = val('--port', '0');   // 0 = 自动挑一个空闲端口

if (!fs.existsSync(html)) { console.error('找不到 HTML: ' + html); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

const port = parseInt(portArg, 10) > 0 ? parseInt(portArg, 10) : await freePort();
// 服务根目录：成片在 skill 仓库内就用仓库根（示例工程的相对引用才连得上），
// 在仓库外（别的项目的成片）就用它自己的目录。
const repoRoot = path.resolve(templatesDir, '..');
const root = html.startsWith(repoRoot) ? repoRoot : path.dirname(html);
const rel = path.relative(root, html).split(path.sep).join('/');
const url = `http://127.0.0.1:${port}/${rel}`;

let server = null;
async function ensureServer() {
  if (fileMode) return;
  const probe = async () => {
    try { const r = await fetch(url, { method: 'GET' }); return r.ok; } catch { return false; }
  };
  if (await probe()) return;
  server = spawn(process.execPath, [path.join(here, 'serve.mjs'), String(port), root], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { await sleep(150); if (await probe()) return; }
  throw new Error('本地服务起不来：' + url);
}

function runDetect(target) {
  const env = { ...process.env };
  if (!fileMode) env.IMPECCABLE_BROWSER = process.env.IMPECCABLE_BROWSER || findBrowser();
  // Node 24 在 Windows 上不再允许直接 spawn .cmd/.bat，所以绕开 npx.cmd：
  // 直接让 node 跑 npm 自带的 npx-cli.js（不用 shell，参数不做字符串转义）。
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  let exe, argv;
  if (process.env.IMPECCABLE_CMD) {
    exe = process.env.IMPECCABLE_CMD; argv = ['detect', target, '--json'];
  } else if (fs.existsSync(npxCli)) {
    exe = process.execPath; argv = [npxCli, '-y', 'impeccable@latest', 'detect', target, '--json'];
  } else {
    exe = process.platform === 'win32' ? 'npx.cmd' : 'npx'; argv = ['-y', 'impeccable@latest', 'detect', target, '--json'];
  }
  const r = spawnSync(exe, argv, { env, encoding: 'utf8', shell: exe.endsWith('.cmd') });
  if (r.error) throw r.error;
  const out = (r.stdout || '').trim();
  if (!out) throw new Error('detect 无输出；stderr: ' + (r.stderr || '').trim().split('\n').slice(-3).join(' | '));
  return { findings: JSON.parse(out), stderr: r.stderr || '' };
}

try {
  await ensureServer();
  const target = fileMode ? html : url;
  const { findings } = runDetect(target);
  const list = Array.isArray(findings) ? findings : [findings];
  const waived = list.filter((f) => WAIVED[f.antipattern]);
  const mapped = list.filter((f) => !WAIVED[f.antipattern] && MAPPED[f.antipattern]);
  const real = list.filter((f) => !WAIVED[f.antipattern] && !MAPPED[f.antipattern]);
  const tally = (arr) => {
    const m = new Map();
    for (const f of arr) {
      const e = m.get(f.antipattern) || { count: 0, sample: f };
      e.count++; m.set(f.antipattern, e);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  };

  if (jsonMode) {
    console.log(JSON.stringify({
      target: fileMode ? html : url, mode: fileMode ? 'file' : 'url',
      total: list.length, real: real.length, mapped: mapped.length, waived: waived.length,
      rules: {
        real: tally(real).map(([rule, e]) => ({ rule, count: e.count })),
        mapped: tally(mapped).map(([rule, e]) => ({ rule, count: e.count })),
        waived: tally(waived).map(([rule, e]) => ({ rule, count: e.count }))
      },
      findings: list
    }, null, 2));
  } else {
    console.log(`# 反模式自检  ${fileMode ? 'file' : 'url'}  ${target}`);
    console.log(`  命中 ${list.length} 条 → 待处理 ${real.length} / 转本 skill 自有检查 ${mapped.length} / 故意签名 ${waived.length}`);
    if (waived.length) {
      console.log(`\n故意签名，不改（${waived.length} 条）：`);
      for (const [rule, e] of tally(waived)) console.log(`  - ${rule} ×${e.count}  ← ${WAIVED[rule]}`);
    }
    if (mapped.length) {
      console.log(`\n分类错位 → 改跑本 skill 的检查（${mapped.length} 条）：`);
      for (const [rule, e] of tally(mapped)) console.log(`  ~ ${rule} ×${e.count}  →  ${MAPPED[rule]}`);
    }
    if (real.length) {
      console.log(`\n要看一眼（${real.length} 条）：`);
      for (const [rule, e] of tally(real)) {
        console.log(`  ! ${rule} ×${e.count}  [${e.sample.severity}/${e.sample.category}]`);
        console.log(`    ${e.sample.description}`);
        if (e.sample.snippet) console.log(`    ${e.sample.snippet}`);
      }
    } else {
      console.log('\n无待处理项。');
    }
  }
  process.exitCode = real.length ? 2 : 0;
} catch (e) {
  console.error('反模式自检失败：' + e.message);
  process.exitCode = 1;
} finally {
  if (server) { try { server.kill(); } catch {} }
}

// 极简 CDP 客户端 + 无头 Edge 启动器（无需任何 npm 依赖）
// 用于：截取任意时刻的静帧、逐帧渲染成视频
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

export function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到 Edge/Chrome 可执行文件');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        const set = this.handlers.get(msg.method);
        if (set) set.forEach((fn) => fn(msg.params));
      }
    });
  }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', (e) => rej(new Error('ws error: ' + (e.message || 'unknown'))), { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(fn);
    return () => this.handlers.get(method).delete(fn);
  }
  once(method) {
    return new Promise((resolve) => {
      const off = this.on(method, (p) => { off(); resolve(p); });
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

export async function launch({ port = 9333, width = 1080, height = 1920, scale = 1, url = 'about:blank', gpu = false, extraArgs = [] } = {}) {
  const exe = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-profile-'));
  const args = [
    '--headless=new',
    ...(gpu ? [] : ['--disable-gpu']),
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion',
    '--force-device-scale-factor=' + scale,
    '--window-size=' + width + ',' + height,
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port,
    ...extraArgs,
    url
  ];
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true });

  let version = null;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      version = await r.json();
      break;
    } catch { await sleep(120); }
  }
  if (!version) throw new Error('浏览器调试端口未就绪');

  // 浏览器级连接
  const browser = await CDP.connect(version.webSocketDebuggerUrl);

  // 找到页面 target
  let pageTarget = null;
  for (let i = 0; i < 60; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    pageTarget = list.find((t) => t.type === 'page');
    if (pageTarget) break;
    await sleep(120);
  }
  if (!pageTarget) throw new Error('找不到页面 target');

  const session = (await browser.send('Target.attachToTarget', {
    targetId: pageTarget.id, flatten: true
  })).sessionId;
  const page = await CDP.connect(pageTarget.webSocketDebuggerUrl);

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: scale, mobile: false
  });

  return {
    browser, page, child, port, profile,
    async goto(targetUrl, { waitLoad = true, settleFrames = 3 } = {}) {
      const loaded = page.once('Page.loadEventFired');
      await page.send('Page.navigate', { url: targetUrl });
      if (waitLoad) { await Promise.race([loaded, sleep(15000)]); }
      await page.send('Runtime.evaluate', {
        expression: `new Promise(r=>{let n=${settleFrames};const s=()=>{n-->0?requestAnimationFrame(s):r(1)};requestAnimationFrame(s)})`,
        awaitPromise: true
      });
    },
    async shot(file) {
      const res = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
      return file;
    },
    async close() {
      try { await browser.send('Browser.close'); } catch {}
      page.close(); browser.close();
      await sleep(300);
      try { child.kill(); } catch {}
      await sleep(200);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    }
  };
}

export function fileUrl(p) {
  const parts = path.resolve(p).replace(/\\/g, '/').split('/');
  // 第一段是盘符（D:）或空，保持原样；其余逐段编码以支持中文路径
  return 'file:///' + parts.map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join('/');
}

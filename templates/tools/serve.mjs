// 本地静态服务器（零依赖）：用 http 打开页面时，音频走 WebAudio 采样级调度，
// 比 file:// 下用媒体元素播放更精准（file:// 下 fetch 被浏览器拦，只能退回媒体元素）。
// 用法: node serve.mjs [端口=8080] [根目录=..]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = parseInt(process.argv[2] || '8080', 10);
const root = path.resolve(process.argv[3] || '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.md': 'text/markdown; charset=utf-8' };

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, url);
  if (url === '/' || url.endsWith('/')) file = path.join(root, 'v2', 'control-illusion-v2.html');
  if (!path.resolve(file).startsWith(root)) { res.writeHead(403).end('403'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, () => {
  console.log(`http://127.0.0.1:${port}/  →  根目录 ${root}`);
  console.log(`预览（带音效）：http://127.0.0.1:${port}/v2/control-illusion-v2.html?sfx=1`);
});

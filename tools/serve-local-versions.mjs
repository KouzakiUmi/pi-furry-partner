// Local review only. Real host readers/controllers; no profile or config writes.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const release = join(repository, 'dist/releases');
const template = join(repository, 'tools/review-template.html');
const port = Number(process.argv[2] || 8910);
const roots = {
  ordinary: join(repository, 'dist/staging/hd-remaster'),
  animated: join(repository, 'dist/staging/full-animation'),
};
const routes = {};
for (const [track, root] of Object.entries(roots)) {
  const { apply } = await import(pathToFileURL(join(root, 'lib/index.js')));
  routes[track] = new Map();
  apply({ fiber: { id: `local-${track}-review` }, on() {}, inject(_deps, callback) {
    callback({ effect(run) { run(); }, settings: { configure() {} }, connection: { fetch: { register(spec) {
      routes[track].set(spec.path, spec); return () => {};
    } } } });
  } });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/') {
      const info = JSON.parse(await readFile(join(release, 'release-summary.json'), 'utf8'));
      const rows = info.packages.map(item => `<tr><td>${item.label}</td><td>${(item.archiveBytes / 1048576).toFixed(1)} MiB</td><td><a href="/download/${basename(item.archive)}">下载安装包</a></td></tr>`).join('');
      const page = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>呜咪 · 插件完整构建</title><style>body{font:16px/1.8 system-ui;background:#111b29;color:#e5edf9;max-width:1000px;margin:50px auto;padding:24px}a{color:#add4ff}.cards{display:flex;gap:25px;flex-wrap:wrap}.card{display:block;padding:24px;border:1px solid #425776;border-radius:15px;flex:1;min-width:220px;text-decoration:none}h2{font-size:21px}td,th{padding:12px 18px;border-bottom:1px solid #34475d;text-align:left}table{width:100%;margin:30px 0}p{color:#b5c4d8}</style><h1>呜咪 · 插件完整构建</h1><p>一个仓库、共用源码；构建时选择高清重制／全动态，像素统一保留原始版本。</p><div class="cards"><a class="card" href="/ordinary/"><h2>原逻辑高清重制版</h2><p>恢复标题与原有简单帧动画，稳定眨眼，保留原版交互和节拍。</p>打开实际控制器预览 →</a><a class="card" href="/animated/"><h2>全动态重做版</h2><p>17段完整动作与键盘进出转场，固定角色尺度与支撑锚点。</p>打开实际控制器预览 →</a></div><table><thead><tr><th>构建</th><th>大小</th><th>本地文件</th></tr></thead><tbody>${rows}</tbody></table><p>全动态仅用于插画；两种构建的像素画风均使用原始像素素材和原简单帧逻辑。DSH请选择完整包。本轮仅生成安装包，未覆盖本机安装。</p><a href="/release-summary.json">构建与验证记录</a></html>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page); return;
    }
    if (url.pathname === '/release-summary.json') {
      const bytes = await readFile(join(release, 'release-summary.json'));
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(bytes); return;
    }
    if (url.pathname.startsWith('/download/')) {
      const name = decodeURIComponent(url.pathname.slice('/download/'.length));
      if (name !== basename(name) || !/^pi-furry-partner-[a-z0-9.-]+\.tgz$/.test(name)) throw new Error('Invalid archive name');
      const path = join(release, name), info = await stat(path);
      res.writeHead(200, { 'content-type': 'application/gzip', 'content-length': info.size, 'content-disposition': `attachment; filename="${name}"` });
      if (req.method === 'HEAD') res.end(); else createReadStream(path).pipe(res);
      return;
    }
    const match = /^\/(ordinary|animated)(\/.*)$/.exec(url.pathname);
    if (!match) { res.writeHead(404); res.end(); return; }
    const [, track, path] = match;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Read-only local preview'); return; }
    if (path === '/') {
      let page = await readFile(template, 'utf8');
      const label = track === 'ordinary' ? '原逻辑高清重制版' : '全动态重做版';
      page = page.replace('<title>Umi · 双端动作适配预览</title>', `<title>呜咪 · ${label}</title>`)
        .replace('17 段已验收 · 双端适配检查 · 尚未安装', `${label} · 本地完整构建 · 尚未安装`)
        .replace('状态切换时，呜咪留在同一个位置', label)
        .replace('src="/lib/client.js"', `src="/${track}/client.js"`)
        .replace('fetchImpl:window.fetch.bind(window)', `fetchImpl:(url, options)=>window.fetch('/${track}'+url,options)`)
        .replace('普通版 2.4.1 的安装仍保留。', '此页使用本轮实际构建；不会修改本机安装或配置。');
      if (track === 'ordinary') {
        page = page.replace('使用实际 DSH 构建的控制器与批准序列。插画显示原高清帧；像素画显示 Pi 同源 indexed 帧。', '使用普通版实际控制器和高清素材，保留原有简单帧动画与状态节拍，不加载全动态版19段动作。')
          .replace('<button data-phase="editing">', '<button data-phase="success">完成／开闭眼</button><button data-phase="editing">')
          .replace("else if(id==='error'){", "else if(id==='success'){a.handle('agent_before_settle',{outcome:'success'});a.handle('agent_settled')}else if(id==='error'){");
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page); return;
    }
    if (path === '/client.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(await readFile(join(roots[track], 'lib/client.js'))); return;
    }
    const handler = routes[track].get(path);
    if (!handler) { res.writeHead(404); res.end(); return; }
    const target = new URL(path + url.search, url.origin);
    const response = await handler.fetch(new Request(target, { method: req.method, headers: req.headers }));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end(error.message); }
});
server.listen(port, '127.0.0.1', () => console.log(`Plugin whole-build review http://127.0.0.1:${port}/`));

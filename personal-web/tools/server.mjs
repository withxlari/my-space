import http from 'node:http';
import { mkdir, writeFile, stat, realpath, copyFile, cp } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createAuth, equal } from './auth.mjs';
import { readContent, saveContent, validateContent, exportSite, ensureContent } from './content.mjs';
import { createCommunity } from './community.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
const maxUpload = 32 * 1024 * 1024;
types['.avif'] = 'image/avif';
function problem(message, status = 400) { return Object.assign(new Error(message), { status }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function bodyBytes(req, max) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw problem('Arquivo ou conteúdo grande demais.', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw problem('Envie conteúdo JSON.', 415);
  try {
    const value = JSON.parse((await bodyBytes(req, 512 * 1024)).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw problem('Envie um objeto JSON válido.');
    return value;
  }
  catch (error) { if (error.status) throw error; throw problem('JSON inválido.'); }
}
function extensionFor(bytes, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg'].includes(ext) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (ext === '.png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ext;
  if (ext === '.gif' && /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))) return ext;
  if (ext === '.webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return ext;
  if (ext === '.mp3' && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return ext;
  if (ext === '.wav' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return ext;
  if (ext === '.ogg' && bytes.toString('ascii', 0, 4) === 'OggS') return ext;
  if (ext === '.m4a' && bytes.toString('ascii', 4, 8) === 'ftyp') return ext;
  throw problem('Tipo não permitido. Use JPG, PNG, GIF, WebP, MP3, WAV, OGG ou M4A.');
}
export function createSiteServer({ root, dataDirectory = process.env.MYSPACE_DATA_DIR, privateDirectory = path.join(dataDirectory || root, dataDirectory ? 'private' : '.private'), publicOrigin = process.env.MYSPACE_PUBLIC_ORIGIN || '', setupCode = process.env.MYSPACE_SETUP_CODE } = {}) {
  if (dataDirectory && !path.isAbsolute(dataDirectory)) throw new Error('MYSPACE_DATA_DIR deve ser um caminho absoluto.');
  if (publicOrigin && setupCode && setupCode.length < 24) throw new Error('O código inicial online precisa ter pelo menos 24 caracteres.');
  if (publicOrigin && (new URL(publicOrigin).protocol !== 'https:' || new URL(publicOrigin).origin !== publicOrigin)) throw new Error('MYSPACE_PUBLIC_ORIGIN deve ser a origem HTTPS completa, sem barra final.');
  const contentRoot = dataDirectory || root;
  const ready = (async () => {
    await ensureContent(root);
    if (dataDirectory) {
      await mkdir(path.join(dataDirectory, 'js'), { recursive: true });
      await mkdir(path.join(dataDirectory, 'assets'), { recursive: true });
      try { await cp(path.join(root, 'assets/uploads'), path.join(dataDirectory, 'assets/uploads'), { recursive: true, force: false, errorOnExist: false }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await copyFile(path.join(root, 'js/site-data.js'), path.join(dataDirectory, 'js/site-data.js'), 1); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
  })();
  ready.catch(() => {});
  const auth = createAuth(privateDirectory, { secureCookies: Boolean(publicOrigin), setupCode, allowSetup: !publicOrigin || Boolean(setupCode) });
  const community = createCommunity(privateDirectory);
  const limits = new Map();
  function limit(req, kind) {
    const key = `${kind}:${req.socket.remoteAddress}`;
    const now = Date.now();
    for (const [id, item] of limits) if (now > item.until) limits.delete(id);
    const item = limits.get(key) || { count: 0, until: now + 60000 };
    item.count++; limits.set(key, item);
    if (item.count > (kind === 'message' ? 4 : 8)) throw problem('Muitos envios. Aguarde um minuto antes de tentar novamente.', 429);
  }
  let saving = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    if (publicOrigin) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      await ready;
      const port = server.address()?.port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (publicOrigin) allowedHosts.push(new URL(publicOrigin).host);
      if (!allowedHosts.includes(req.headers.host)) throw problem('Host não autorizado.', 403);
      const origin = publicOrigin || `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/community')) {
        if (req.method === 'POST' && req.headers.origin !== origin) throw problem('Origem não autorizada.', 403);
        const { data: config } = await readContent(contentRoot);
        if (url.pathname === '/api/community' && req.method === 'GET') return json(res, 200, await community.publicFeed(config));
        if (url.pathname === '/api/community/comments' && req.method === 'GET') return json(res, 200, { comments: await community.comments(config, url.searchParams.get('post')) });
        if (url.pathname === '/api/community/messages' && req.method === 'POST') {
          limit(req, 'message'); return json(res, 201, await community.submitMessage(await jsonBody(req)));
        }
        if (url.pathname === '/api/community/comments' && req.method === 'POST') {
          limit(req, 'comment'); return json(res, 201, { comment: await community.addComment(config, await jsonBody(req), false) });
        }
        throw problem('Rota não encontrada.', 404);
      }
      if (url.pathname.startsWith('/api/admin/')) {
        const write = !['GET', 'HEAD'].includes(req.method);
        if (write && req.headers.origin !== origin) throw problem('Origem não autorizada.', 403);
        const endpoint = url.pathname.slice('/api/admin/'.length);
        const session = auth.get(req);
        if (endpoint === 'session' && req.method === 'GET') return json(res, 200, { configured: Boolean(await auth.account()), authenticated: Boolean(session), ...(session && { username: session.username, csrf: session.csrf }) });
        if (endpoint === 'setup' && req.method === 'POST') {
          const login = await auth.setup(await jsonBody(req), req, res);
          return json(res, 201, { username: login.username, csrf: login.csrf });
        }
        if (endpoint === 'login' && req.method === 'POST') {
          const login = await auth.login(await jsonBody(req), req, res);
          return json(res, 200, { username: login.username, csrf: login.csrf });
        }
        if (!session) throw problem('Entre com seu usuário e senha.', 401);
        if (write && !equal(req.headers['x-csrf-token'] || '', session.csrf)) throw problem('Sessão inválida. Recarregue o painel.', 403);
        if (endpoint === 'logout' && req.method === 'POST') { auth.logout(req, res); return json(res, 200, { ok: true }); }
        if (endpoint === 'account' && req.method === 'PUT') {
          const login = await auth.changePassword(await jsonBody(req), req, res);
          return json(res, 200, { username: login.username, csrf: login.csrf });
        }
        if (endpoint === 'community' && req.method === 'GET') return json(res, 200, await community.adminFeed());
        if (endpoint === 'community' && req.method === 'PATCH') {
          const { data: config } = await readContent(contentRoot);
          return json(res, 200, await community.moderate(config, await jsonBody(req)));
        }
        if (endpoint === 'community/comments' && req.method === 'POST') {
          const { data: config } = await readContent(contentRoot);
          return json(res, 201, { comment: await community.addComment(config, await jsonBody(req), true) });
        }
        if (endpoint === 'content' && req.method === 'GET') return json(res, 200, await readContent(contentRoot));
        if (endpoint === 'content' && req.method === 'PUT') {
          const input = validateContent(await jsonBody(req));
          if (saving) throw problem('Uma gravação está em andamento. Tente novamente.', 409);
          saving = true;
          try {
            const current = await readContent(contentRoot);
            if (!equal(req.headers['if-match'] || '', current.revision)) throw problem('O conteúdo mudou em outra aba. Recarregue antes de salvar.', 409);
            return json(res, 200, await saveContent(contentRoot, privateDirectory, input));
          } finally { saving = false; }
        }
        if (endpoint === 'upload' && req.method === 'POST') {
          const bytes = await bodyBytes(req, maxUpload);
          const ext = extensionFor(bytes, url.searchParams.get('name') || '');
          const relative = `assets/uploads/${randomUUID()}${ext}`;
          await mkdir(path.join(contentRoot, 'assets/uploads'), { recursive: true });
          await writeFile(path.join(contentRoot, relative), bytes, { flag: 'wx' });
          return json(res, 201, { path: relative });
        }
        if (endpoint === 'export' && req.method === 'GET') {
          const archive = await exportSite(root, contentRoot);
          res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="my-space-neocities.zip"', 'Content-Length': archive.length });
          return res.end(archive);
        }
        throw problem('Rota não encontrada.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw problem('Método não permitido.', 405);
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (!/^\/(index\.html|admin\.html|(?:css|js|assets)\/[a-z\d_./ -]+)$/i.test(pathname) || pathname.includes('..') || pathname.includes('//') || pathname.split('/').some(part => part.startsWith('.'))) throw problem('Arquivo não encontrado.', 404);
      const base = pathname === '/js/site-data.js' || pathname.startsWith('/assets/uploads/') ? contentRoot : root;
      const target = await realpath(path.join(base, pathname.slice(1)));
      const rootReal = await realpath(base);
      if (!target.startsWith(rootReal + path.sep)) throw problem('Arquivo não encontrado.', 404);
      const info = await stat(target);
      if (!info.isFile()) throw problem('Arquivo não encontrado.', 404);
      const type = types[path.extname(target).toLowerCase()];
      if (!type) throw problem('Arquivo não encontrado.', 404);
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(match?.[1]), end = match?.[2] ? Number(match[2]) : info.size - 1;
        if (!match || start > end || end >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
        res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Accept-Ranges': 'bytes' });
        if (req.method === 'HEAD') return res.end();
        const stream = createReadStream(target, { start, end });
        stream.on('error', () => res.destroy()); return stream.pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(target);
      stream.on('error', () => res.destroy()); stream.pipe(res);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
      json(res, status, { error: status === 404 ? 'Arquivo não encontrado.' : status >= 500 ? 'Não foi possível completar a operação.' : error.message || 'Não foi possível completar a operação.' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return { server, auth, ready };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createSiteServer } from './server.mjs';
import { ensureContent } from './content.mjs';
const source = fileURLToPath(new URL('../', import.meta.url));
await ensureContent(source);

test('admin: autenticação, isolamento, CSRF, edição, mídia, exportação e troca de senha', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'myspace-test-'));
  const root = path.join(temp, 'public');
  await mkdir(path.join(root, 'js'), { recursive: true });
  await mkdir(path.join(root, 'css'), { recursive: true });
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await copyFile(path.join(source, 'js/site-data.js'), path.join(root, 'js/site-data.js'));
  await writeFile(path.join(root, 'index.html'), '<!doctype html><a href="admin.html">admin ↗</a><h1>test</h1>');
  await writeFile(path.join(root, 'js/admin.js'), 'export {};');
  const privateDirectory = path.join(temp, '.private');
  const { server, auth } = createSiteServer({ root, privateDirectory });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const password = randomBytes(20).toString('hex');
  let cookie = '', csrf = '';
  async function request(endpoint, options = {}) {
    const headers = { Origin: origin, ...(cookie && { Cookie: cookie }), ...(csrf && { 'X-CSRF-Token': csrf }), ...options.headers };
    return fetch(origin + endpoint, { ...options, headers });
  }
  async function send(endpoint, body, method = 'POST', headers = {}) {
    return request(`/api/admin/${endpoint}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  }
  function useSession(response, body) { cookie = response.headers.get('set-cookie').split(';')[0]; csrf = body.csrf; }
  try {
    assert.equal((await request('/api/admin/content')).status, 401);
    assert.deepEqual(await (await request('/api/admin/session')).json(), { configured: false, authenticated: false });
    assert.equal((await send('setup', {}, 'POST', { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await send('setup', { code: 'wrong', username: 'tester', password })).status, 401);
    let response = await send('setup', { code: auth.setupCode, username: 'tester', password });
    assert.equal(response.status, 201);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    useSession(response, await response.json());
    const stored = await readFile(path.join(privateDirectory, 'admin.json'), 'utf8');
    assert.ok(!stored.includes(password), 'senha nunca fica em texto simples');
    assert.equal((await send('setup', { code: auth.setupCode, username: 'other', password })).status, 409);
    assert.equal((await send('login', { username: 'tester', password: 'incorrect' })).status, 401);
    response = await send('login', { username: 'tester', password });
    assert.equal(response.status, 200); useSession(response, await response.json());
    const current = await (await request('/api/admin/content')).json();
    const edited = structuredClone(current.data); edited.identity.name = 'isolated test';
    assert.equal((await send('content', edited, 'PUT', { 'X-CSRF-Token': '', 'If-Match': current.revision })).status, 403);
    assert.equal((await send('content', edited, 'PUT', { Origin: 'https://foreign.example', 'If-Match': current.revision })).status, 403);
    response = await send('content', edited, 'PUT', { 'If-Match': current.revision });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.data.identity.name, 'isolated test');
    assert.match(await (await request('/js/site-data.js')).text(), /isolated test/);
    assert.equal((await send('content', edited, 'PUT', { 'If-Match': current.revision })).status, 409);
    const bad = structuredClone(edited); bad.links = [{title:'test',url:'javascript:alert(1)',description:''}];
    assert.equal((await send('content', bad, 'PUT', { 'If-Match': saved.revision })).status, 400);
    bad.links[0].url = 'https://example.com'; bad.about.avatar = 'assets/../.private/admin.json';
    assert.equal((await send('content', bad, 'PUT', { 'If-Match': saved.revision })).status, 400);
    for (const target of ['/.private/admin.json', '/tools/auth.mjs', '/%2eprivate/admin.json']) assert.equal((await request(target)).status, 404);
    assert.equal((await request('/api/admin/upload?name=evil.svg', { method: 'POST', body: '<svg><script/></svg>' })).status, 400);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMioAAAAASUVORK5CYII=', 'base64');
    response = await request('/api/admin/upload?name=test.png', { method: 'POST', body: png });
    assert.equal(response.status, 201);
    const upload = await response.json();
    assert.match(upload.path, /^assets\/uploads\/[a-f\d-]+\.png$/);
    response = await request('/' + upload.path, { headers: { Range: 'bytes=0-7' } });
    assert.equal(response.status, 206); assert.equal((await response.arrayBuffer()).byteLength, 8);
    response = await request('/api/admin/export');
    assert.equal(response.status, 200);
    const archive = Buffer.from(await response.arrayBuffer()), names = [];
    let offset = 0;
    while (archive.readUInt32LE(offset) === 0x04034b50) {
      const size = archive.readUInt32LE(offset + 18), length = archive.readUInt16LE(offset + 26), extra = archive.readUInt16LE(offset + 28);
      names.push(archive.toString('utf8', offset + 30, offset + 30 + length));
      offset += 30 + length + extra + size;
    }
    assert.ok(names.includes('index.html')); assert.ok(names.includes('js/site-data.js'));
    assert.ok(!names.some(name => /admin|private|tools/.test(name)), 'exportação nunca inclui painel, conta ou servidor');
    assert.ok(!archive.toString('utf8').includes('<a href="admin.html">'), 'site exportado não tem link de admin quebrado');
    assert.equal((await send('account', { username: 'tester', currentPassword: 'wrong', password: password + 'x' }, 'PUT')).status, 401);
    const oldCookie = cookie;
    response = await send('account', { username: 'tester', currentPassword: password, password: password + 'x' }, 'PUT');
    assert.equal(response.status, 200); useSession(response, await response.json());
    assert.equal((await request('/api/admin/content', { headers: { Cookie: oldCookie } })).status, 401);
    assert.equal((await send('logout', {})).status, 200);
    assert.equal((await request('/api/admin/content')).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('myspace-test-'));
    await rm(temp, { recursive: true, force: true });
  }
});

test('bloqueia tentativas repetidas de login', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'myspace-test-'));
  const { server } = createSiteServer({ root: source, privateDirectory: temp });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let index = 0; index < 9; index++) {
      const response = await fetch(origin + '/api/admin/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'nobody', password: 'wrong' }) });
      assert.equal(response.status, index < 8 ? 401 : 429);
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('myspace-test-'));
    await rm(temp, { recursive: true, force: true });
  }
});

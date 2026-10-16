import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite } from './content.mjs';
const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const sessionLife = 2 * 60 * 60 * 1000;
const absoluteLife = 8 * 60 * 60 * 1000;
let hashing = 0;
export function equal(a, b) {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
async function passwordHash(password, salt) {
  if (hashing >= 2) throw Object.assign(new Error('O login está ocupado. Tente novamente em alguns segundos.'), { status: 429 });
  hashing++;
  try { return (await derive(password, salt, 64, options)).toString('hex'); }
  finally { hashing--; }
}
function validateCredentials(username, password) {
  if (typeof username !== 'string' || !/^[a-z\d_.-]{3,40}$/i.test(username)) throw Object.assign(new Error('Use um usuário de 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Object.assign(new Error('A senha precisa ter de 12 a 128 caracteres.'), { status: 400 });
}
export function createAuth(privateDirectory, { secureCookies = false, setupCode: suppliedCode, allowSetup = true } = {}) {
  const file = path.join(privateDirectory, 'admin.json');
  const sessions = new Map();
  const attempts = new Map();
  const setupCode = suppliedCode || randomBytes(18).toString('hex');
  let settingUp = false;
  async function account() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function rateLimit(key) {
    const now = Date.now();
    for (const [ip, item] of attempts) if (now > item.until) attempts.delete(ip);
    const item = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    item.count++; attempts.set(key, item);
    if (item.count > 8) throw Object.assign(new Error('Muitas tentativas. Tente novamente em 15 minutos.'), { status: 429 });
  }
  function open(res, username) {
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    const session = { username, csrf: randomBytes(24).toString('hex'), expires: now + sessionLife, created: now };
    for (const [key, value] of sessions) if (now > value.expires || now - value.created > absoluteLife) sessions.delete(key);
    sessions.set(createHash('sha256').update(token).digest('hex'), session);
    res.setHeader('Set-Cookie', `myspace_session=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=7200${secureCookies ? '; Secure' : ''}`);
    return session;
  }
  function get(req) {
    const token = /(?:^|;\s*)myspace_session=([a-f\d]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    if (!token) return null;
    const key = createHash('sha256').update(token).digest('hex'), session = sessions.get(key);
    if (!session) return null;
    if (Date.now() > session.expires || Date.now() - session.created > absoluteLife) { sessions.delete(key); return null; }
    return { ...session, key };
  }
  return {
    setupCode, account, get,
    async setup(body, req, res) {
      if (!allowSetup) throw Object.assign(new Error('Configure MYSPACE_SETUP_CODE no servidor para criar o acesso inicial.'), { status: 503 });
      rateLimit(req.socket.remoteAddress);
      if (settingUp) throw Object.assign(new Error('O administrador já está sendo configurado.'), { status: 409 });
      settingUp = true;
      try {
        if (await account()) throw Object.assign(new Error('O administrador já foi configurado.'), { status: 409 });
        if (!equal(body.code, setupCode)) throw Object.assign(new Error('Código de configuração inválido. Confira o código inicial.'), { status: 401 });
        validateCredentials(body.username, body.password);
        const salt = randomBytes(32).toString('hex');
        const hash = await passwordHash(body.password, salt);
        await mkdir(privateDirectory, { recursive: true });
        await writeFile(file, JSON.stringify({ username: body.username, salt, hash }), { flag: 'wx', mode: 0o600 });
        return open(res, body.username);
      } finally { settingUp = false; }
    },
    async login(body, req, res) {
      rateLimit(req.socket.remoteAddress);
      const stored = await account();
      if (typeof body.username !== 'string' || body.username.length > 40) throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
      const hash = await passwordHash(password, stored?.salt || '0'.repeat(64));
      if (!stored || !equal(hash, stored.hash) || !equal(body.username, stored.username)) throw Object.assign(new Error('Usuário ou senha incorretos.'), { status: 401 });
      attempts.delete(req.socket.remoteAddress);
      return open(res, stored.username);
    },
    logout(req, res) {
      const session = get(req);
      if (session) sessions.delete(session.key);
      res.setHeader('Set-Cookie', `myspace_session=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies ? '; Secure' : ''}`);
    },
    async changePassword(body, req, res) {
      rateLimit(req.socket.remoteAddress);
      const stored = await account();
      if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || !equal(await passwordHash(body.currentPassword, stored.salt), stored.hash)) throw Object.assign(new Error('A senha atual não confere.'), { status: 401 });
      validateCredentials(body.username, body.password);
      const salt = randomBytes(32).toString('hex');
      await atomicWrite(file, JSON.stringify({ username: body.username, salt, hash: await passwordHash(body.password, salt) }));
      sessions.clear();
      return open(res, body.username);
    }
  };
}

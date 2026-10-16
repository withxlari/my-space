import { readFile, writeFile, rename, mkdir, readdir, realpath, access, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const featureDefaults = {
  profile: { name: 'your name', handle: 'you', age: '—', personality: '—', role: 'your work / interests', study: 'your studies', avatar: 'assets/images/motoko.avif', avatarAlt: 'Motoko Kusanagi — arte oficial de The Ghost in the Shell', heading: 'personal dossier', note: 'a human behind the terminal.' },
  dailySettings: { title: 'daily.log', heading: 'small transmissions.', intro: 'notas soltas, imagens e pequenos pedaços do dia.', author: 'you', commentsEnabled: true },
  daily: []
};

const sectionFields = {
  identity: ['name', 'year', 'topNote', 'description'],
  banner: ['eyebrow', 'line1', 'line2', 'caption', 'bottom', 'image', 'wires'],
  about: ['kicker', 'title', 'paragraphs', 'interestsTitle', 'interests', 'avatar', 'avatarAlt', 'caption', 'captionYear', 'bottom'],
  media: ['icon', 'decoration'],
  theme: ['paper', 'cream', 'blue', 'ink', 'sage', 'rust', 'terminal', 'terminalText', 'width', 'fontSize', 'avatarPosition'],
  labels: ['home', 'about', 'diary', 'gallery', 'thoughts', 'links', 'guestbook', 'navigationWindow', 'aboutWindow', 'diaryWindow', 'galleryWindow', 'thoughtsWindow', 'linksWindow', 'bookmarksWindow', 'guestbookWindow', 'statusWindow', 'playerWindow'],
  copy: ['navBottom', 'linksNote', 'badgeNote', 'diaryLabel', 'diaryMore', 'galleryKicker', 'galleryTitle', 'galleryIntro', 'thoughtsKicker', 'thoughtsTitle', 'thoughtsIntro', 'linksKicker', 'linksTitle', 'linksIntro', 'guestbookKicker', 'guestbookTitle', 'guestbookIntro', 'quietNote', 'footerNote', 'bottomLeft', 'bottomRight'],
  status: ['connection', 'location', 'mood', 'system', 'visitor', 'footer', 'timezone']
};
sectionFields.profile = Object.keys(featureDefaults.profile);
sectionFields.dailySettings = Object.keys(featureDefaults.dailySettings);
sectionFields.labels.push('daily', 'messages', 'profileWindow');
const listFields = {
  diary: ['id', 'date', 'title', 'image', 'alt', 'excerpt', 'paragraphs', 'tags', 'example'],
  gallery: ['src', 'title', 'alt', 'credit'], thoughts: ['text', 'date'],
  links: ['url', 'title', 'description'], tracks: ['title', 'artist', 'src', 'cover']
};
listFields.daily = ['id', 'date', 'text', 'images', 'alt', 'tags', 'quoteId', 'example'];
const assetKeys = new Set(['banner.image', 'banner.wires', 'about.avatar', 'profile.avatar', 'media.icon', 'media.decoration', 'diary.image', 'gallery.src', 'tracks.src', 'tracks.cover', 'daily.images']);

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value, label) {
  if (typeof value !== 'string' || value.length > 20000 || value.includes('\0')) throw invalid(`Campo inválido: ${label}`);
  return value;
}
function field(value, key, group) {
  if (key === 'example' || key === 'commentsEnabled') return value === true;
  if (['paragraphs', 'interests', 'tags', 'images'].includes(key)) {
    if (!Array.isArray(value) || value.length > 100) throw invalid(`Lista inválida: ${key}`);
    if (key === 'images') {
      if (value.length > 8) throw invalid('Cada daily pode ter até 8 fotos.');
      return value.map(item => field(item, 'src', 'daily-image'));
    }
    return value.map(item => text(item, key));
  }
  if (group === 'theme') {
    if (['width', 'fontSize', 'avatarPosition'].includes(key)) {
      const ranges = { width: [900, 1600], fontSize: [10, 16], avatarPosition: [0, 100] };
      const [min, max] = ranges[key];
      if (!Number.isFinite(value) || value < min || value > max) throw invalid(`Valor fora da faixa: ${key}`);
      return value;
    }
    if (!/^#[a-f\d]{6}$/i.test(value)) throw invalid(`Cor inválida: ${key}`);
    return value;
  }
  const result = text(value, `${group}.${key}`);
  const isAsset = assetKeys.has(`${group}.${key}`) || group === 'daily-image';
  if (isAsset && !/^assets\/[a-z\d_./ -]+$/i.test(result)) throw invalid('Use um arquivo da pasta assets.');
  if (isAsset && (result.includes('..') || result.includes('//'))) throw invalid('Caminho de mídia inválido.');
  if (key === 'url') {
    let url;
    try { url = new URL(result); } catch { throw invalid('Use um link completo com https:// ou http://.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw invalid('Link inválido.');
  }
  if (['diary','daily'].includes(group) && key === 'id' && !/^[a-z\d][a-z\d_-]{0,79}$/i.test(result)) throw invalid('O ID deve usar letras, números e hífens.');
  if (group === 'diary' && key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(result)) throw invalid('Use uma data no formato AAAA-MM-DD.');
  if (key === 'timezone') {
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: result }); } catch { throw invalid('Fuso horário inválido.'); }
  }
  return result;
}
export function validateContent(input) {
  if (!object(input) || input.version !== 1) throw invalid('Formato de conteúdo inválido.');
  input = { ...input, profile: input.profile || featureDefaults.profile, dailySettings: input.dailySettings || featureDefaults.dailySettings, daily: input.daily || [] };
  input.labels = { daily: 'daily', messages: 'messages', profileWindow: 'profile.sys', ...input.labels };
  const output = { version: 1 };
  for (const [group, keys] of Object.entries(sectionFields)) {
    if (!object(input[group])) throw invalid(`Seção ausente: ${group}`);
    output[group] = Object.fromEntries(keys.map(key => [key, field(input[group][key], key, group)]));
  }
  for (const [group, keys] of Object.entries(listFields)) {
    if (!Array.isArray(input[group]) || input[group].length > 200) throw invalid(`Lista inválida: ${group}`);
    output[group] = input[group].map(item => {
      if (!object(item)) throw invalid(`Item inválido: ${group}`);
      return Object.fromEntries(keys.map(key => [key, field(item[key], key, group)]));
    });
  }
  const ids = output.diary.map(entry => entry.id);
  if (new Set(ids).size !== ids.length) throw invalid('Cada entrada do diário precisa de um ID único.');
  const dailyIds = new Set(output.daily.map(post => post.id));
  if (dailyIds.size !== output.daily.length) throw invalid('Cada daily precisa de um ID único.');
  for (const post of output.daily) {
    if (!post.text.trim() && !post.images.length && !post.quoteId) throw invalid('O daily precisa ter texto, foto ou uma citação.');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(post.date)) throw invalid('Use data e horário no daily.');
    if (post.quoteId && (!dailyIds.has(post.quoteId) || post.quoteId === post.id)) throw invalid('O daily citado precisa existir e ser outro post.');
    const visited = new Set([post.id]);
    let next = post.quoteId;
    while (next) {
      if (visited.has(next)) throw invalid('As citações não podem formar um ciclo.');
      visited.add(next); next = output.daily.find(item => item.id === next)?.quoteId;
    }
  }
  return output;
}
export function contentSource(data) {
  return 'window.SITE_DATA = ' + JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\n';
}
export async function ensureContent(root) {
  const target = path.join(root, 'js/site-data.js');
  try { await access(target); return; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { await copyFile(path.join(root, 'js/site-data.example.js'), target, 1); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
export async function readContent(root) {
  const source = await readFile(path.join(root, 'js/site-data.js'), 'utf8');
  const marker = 'window.SITE_DATA = ';
  const index = source.indexOf(marker);
  if (index < 0) throw invalid('Arquivo de conteúdo inválido.');
  const data = validateContent(JSON.parse(source.slice(index + marker.length).trim().replace(/;$/, '')));
  return { data, revision: createHash('sha256').update(source).digest('hex') };
}
export async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
  await rename(temp, target);
}
export async function saveContent(root, privateDirectory, data) {
  const current = await readContent(root);
  await atomicWrite(path.join(privateDirectory, 'last-content-backup.json'), JSON.stringify(current.data, null, 2));
  await atomicWrite(path.join(root, 'js/site-data.js'), contentSource(validateContent(data)));
  return readContent(root);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export async function exportSite(root, contentRoot = root) {
  const files = [];
  const sources = new Map();
  const rootReal = await realpath(root);
  async function collect(relative, base = root) {
    const target = path.join(base, relative);
    for (const item of await readdir(target, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const next = path.posix.join(relative, item.name);
      if (item.isDirectory()) await collect(next, base);
      else if (item.isFile()) { if (!sources.has(next)) files.push(next); sources.set(next, base); }
    }
  }
  files.push('index.html');
  for (const dir of ['css', 'js', 'assets']) await collect(dir);
  sources.set('js/site-data.js', contentRoot);
  if (contentRoot !== root) {
    try { await collect('assets/uploads', contentRoot); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const chunks = [], directory = [];
  let offset = 0, total = 0;
  for (const file of files) {
    if (file.startsWith('js/admin') || file.startsWith('css/admin')) continue;
    const base = sources.get(file) || root;
    const target = await realpath(path.join(base, file));
    const allowedRoot = base === root ? rootReal : await realpath(base);
    if (!target.startsWith(allowedRoot + path.sep)) throw invalid('Arquivo fora da pasta pública.');
    let bytes = await readFile(target);
    if (file === 'index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<a href="admin.html">admin ↗</a>', ''));
    total += bytes.length;
    if (total > 100 * 1024 * 1024) throw invalid('A exportação suporta até 100 MB.');
    const name = Buffer.from(file, 'utf8'), checksum = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    chunks.push(header, name, bytes); directory.push(central, name);
    offset += header.length + name.length + bytes.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22), count = directory.length / 2;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, central, end]);
}

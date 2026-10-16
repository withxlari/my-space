import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { atomicWrite } from './content.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw fail('Texto inválido ou grande demais.');
  const result = value.trim();
  if (required && !result) throw fail('Escreva uma mensagem antes de enviar.');
  return result;
}
export function createCommunity(directory) {
  const file = path.join(directory, 'community.json');
  let queue = Promise.resolve();
  async function read() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, messages: [], comments: [] }; throw error; }
  }
  function change(operation) {
    const task = queue.then(async () => {
      const store = await read();
      const result = operation(store);
      await atomicWrite(file, JSON.stringify(store, null, 2));
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  function postExists(config, id) {
    if (!config.daily.some(post => post.id === id)) throw fail('Este daily não existe mais.', 404);
  }
  return {
    async publicFeed(config) {
      const store = await read(), ids = new Set(config.daily.map(post => post.id)), counts = Object.create(null);
      for (const comment of store.comments) if (!comment.hidden && ids.has(comment.postId)) counts[comment.postId] = (counts[comment.postId] || 0) + 1;
      const messages = store.messages.filter(message => message.reply && !message.hidden).sort((a,b) => b.reply.createdAt.localeCompare(a.reply.createdAt)).slice(0,50);
      return { messages, counts };
    },
    async comments(config, postId) {
      postExists(config, postId);
      return (await read()).comments.filter(comment => comment.postId === postId && !comment.hidden);
    },
    submitMessage(body) {
      const name = text(body.name || '', 40) || 'anônimo', message = text(body.body, 2000, true);
      return change(store => {
        if (store.messages.length >= 2000) throw fail('A caixa de mensagens está cheia. Tente em outro momento.', 503);
        const item = { id: randomUUID(), name, body: message, createdAt: new Date().toISOString(), reply: null, hidden: false };
        store.messages.unshift(item);
        return { id: item.id, pending: true };
      });
    },
    addComment(config, body, isAdmin = false) {
      postExists(config, body.postId);
      if (!config.dailySettings.commentsEnabled && !isAdmin) throw fail('Os comentários estão pausados.', 403);
      const name = isAdmin ? config.profile.handle : text(body.name || '', 40) || 'anônimo';
      const message = text(body.body, 2000, true), parentId = text(body.parentId || '', 80);
      return change(store => {
        if (store.comments.length >= 10000) throw fail('Comentários indisponíveis no momento.', 503);
        if (parentId && !store.comments.some(comment => comment.id === parentId && comment.postId === body.postId && !comment.hidden)) throw fail('O comentário respondido não está disponível.');
        const item = { id: randomUUID(), postId: body.postId, name, body: message, parentId, isAdmin, hidden: false, createdAt: new Date().toISOString() };
        store.comments.push(item);
        return item;
      });
    },
    async adminFeed() { return read(); },
    moderate(config, body) {
      return change(store => {
        if (body.kind === 'message') {
          const item = store.messages.find(message => message.id === body.id);
          if (!item) throw fail('Mensagem não encontrada.', 404);
          if (body.action === 'reply') {
            item.reply = { body: text(body.body, 4000, true), author: config.profile.handle, createdAt: new Date().toISOString() };
            item.hidden = false;
          } else if (['hide','show'].includes(body.action)) {
            if (body.action === 'show' && !item.reply) throw fail('Responda antes de publicar.');
            item.hidden = body.action === 'hide';
          } else throw fail('Ação inválida.');
          return item;
        }
        if (body.kind === 'comment') {
          const item = store.comments.find(comment => comment.id === body.id);
          if (!item) throw fail('Comentário não encontrado.', 404);
          if (!['hide','show'].includes(body.action)) throw fail('Ação inválida.');
          item.hidden = body.action === 'hide';
          return item;
        }
        throw fail('Ação inválida.');
      });
    }
  };
}

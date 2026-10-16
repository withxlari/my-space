import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createSiteServer } from './server.mjs';
import { readContent, contentSource, ensureContent } from './content.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
await ensureContent(source);
async function fixture(options={}) {
  const temp=await mkdtemp(path.join(os.tmpdir(),'myspace-community-'));
  const root=path.join(temp,'app');
  for(const folder of ['js','css','assets']) await mkdir(path.join(root,folder),{recursive:true});
  await copyFile(path.join(source,'js/site-data.js'),path.join(root,'js/site-data.js'));
  const {data:config}=await readContent(root);
  config.daily=[{id:'test-post',date:'2026-10-16T12:00',text:'isolated test',images:[],alt:'',tags:[],quoteId:'',example:false}];
  await writeFile(path.join(root,'js/site-data.js'),contentSource(config));
  await writeFile(path.join(root,'index.html'),'<!doctype html><h1>test fixture</h1>');
  const args={root,privateDirectory:path.join(temp,'private'),...options};
  const instance=createSiteServer(args); await instance.ready;
  await new Promise(resolve=>instance.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${instance.server.address().port}`;
  let cookie='',csrf='';
  async function request(endpoint,opts={}) {
    return fetch(origin+endpoint,{...opts,headers:{Origin:options.publicOrigin||origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...opts.headers}});
  }
  async function send(endpoint,body,method='POST',headers={}) { return request(endpoint,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}); }
  async function owner() {
    const response=await send('/api/admin/setup',{code:instance.auth.setupCode,username:'tester',password:randomBytes(20).toString('hex')});
    assert.equal(response.status,201); const login=await response.json(); cookie=response.headers.get('set-cookie').split(';')[0];csrf=login.csrf;
    return response;
  }
  async function close() {
    instance.server.closeAllConnections(); await new Promise(resolve=>instance.server.close(resolve));
    assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('myspace-community-'));
    await rm(temp,{recursive:true,force:true});
  }
  return {temp,root,instance,request,send,owner,close};
}

test('mensagens privadas, respostas públicas, comentários anônimos, selo admin e moderação',async()=>{
  const f=await fixture();
  try {
    const {data}=await readContent(f.root),postId=data.daily[0].id;
    let response=await f.send('/api/community/messages',{name:'',body:'um sinal privado'});
    assert.equal(response.status,201);const submitted=await response.json();
    assert.equal((await (await f.request('/api/community')).json()).messages.length,0,'perguntas sem resposta não são públicas');
    assert.equal((await f.send('/api/admin/community',{kind:'message',id:submitted.id,action:'reply',body:'não autorizada'},'PATCH')).status,401);
    response=await f.send('/api/community/comments',{postId,name:'',body:'comentário anônimo',isAdmin:true});
    assert.equal(response.status,201);const guest=(await response.json()).comment;
    assert.equal(guest.name,'anônimo');assert.equal(guest.isAdmin,false,'visitantes não conseguem forjar selo admin');
    response=await f.send('/api/community/comments',{postId,name:'terminal-02',body:'comentário com apelido'});
    assert.equal(response.status,201);
    assert.equal((await f.send('/api/community/comments',{postId:'missing',body:'bad'})).status,404);
    assert.equal((await f.send('/api/community/messages',{body:'bad'},'POST',{Origin:'https://foreign.example'})).status,403);
    await f.owner();
    const inbox=await (await f.request('/api/admin/community')).json();
    assert.equal(inbox.messages[0].body,'um sinal privado');
    response=await f.send('/api/admin/community',{kind:'message',id:submitted.id,action:'reply',body:'resposta de byte'},'PATCH');
    assert.equal(response.status,200);
    const feed=await (await f.request('/api/community')).json();
    assert.equal(feed.messages[0].reply.body,'resposta de byte'); assert.equal(feed.messages[0].reply.author,data.profile.handle);
    response=await f.send('/api/admin/community/comments',{postId,parentId:guest.id,body:'resposta do administrador'});
    const ownerComment=(await response.json()).comment;
    assert.equal(ownerComment.isAdmin,true);assert.equal(ownerComment.parentId,guest.id);
    assert.equal((await f.send('/api/admin/community',{kind:'comment',id:guest.id,action:'hide'},'PATCH')).status,200);
    let list=(await (await f.request(`/api/community/comments?post=${postId}`)).json()).comments;
    assert.ok(!list.some(item=>item.id===guest.id));
    await f.send('/api/admin/community',{kind:'comment',id:guest.id,action:'show'},'PATCH');
    list=(await (await f.request(`/api/community/comments?post=${postId}`)).json()).comments;
    assert.equal(list.length,3);
    await f.send('/api/admin/community',{kind:'message',id:submitted.id,action:'hide'},'PATCH');
    assert.equal((await (await f.request('/api/community')).json()).messages.length,0);
    await f.send('/api/admin/community',{kind:'message',id:submitted.id,action:'show'},'PATCH');
    assert.equal((await f.request('/.private/community.json')).status,404);
    const stored=JSON.parse(await readFile(path.join(f.temp,'private/community.json'),'utf8'));
    assert.equal(stored.comments.length,3);assert.equal(stored.messages[0].reply.body,'resposta de byte');
    assert.ok(!JSON.stringify(stored).includes('127.0.0.1'),'não grava endereços IP nas conversas');
  } finally { await f.close(); }
});

test('limita envios repetidos e não perde mensagens concorrentes',async()=>{
  const f=await fixture();
  try {
    const responses=await Promise.all(Array.from({length:4},(_,index)=>f.send('/api/community/messages',{name:`user-${index}`,body:`sinal ${index}`})));
    assert.ok(responses.every(response=>response.status===201));
    assert.equal((await f.send('/api/community/messages',{body:'quinta mensagem'})).status,429);
    await f.owner();
    const inbox=await (await f.request('/api/admin/community')).json();assert.equal(inbox.messages.length,4);
  } finally { await f.close(); }
});

test('modo online exige HTTPS e emite cookies Secure',async()=>{
  assert.throws(()=>createSiteServer({root:source,publicOrigin:'http://unsafe.example'}),/HTTPS/);
  const f=await fixture({publicOrigin:'https://myspace.example',setupCode:randomBytes(24).toString('hex')});
  try {
    const response=await f.owner();assert.match(response.headers.get('set-cookie'),/; Secure/);
    assert.equal((await f.send('/api/community/messages',{body:'origem HTTP'},'POST',{Origin:'http://myspace.example'})).status,403);
  } finally { await f.close(); }
});

test('dados persistentes ficam fora do código e sobrevivem a uma nova instância',async()=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'myspace-community-'));
  const root=path.join(temp,'app'),dataDirectory=path.join(temp,'data');
  for(const folder of ['js','css','assets']) await mkdir(path.join(root,folder),{recursive:true});
  await mkdir(path.join(root,'assets/uploads'),{recursive:true});
  await writeFile(path.join(root,'assets/uploads/photo.jpg'),'bundled photo');
  await copyFile(path.join(source,'js/site-data.js'),path.join(root,'js/site-data.js'));
  let app=createSiteServer({root,dataDirectory});await app.ready;
  assert.equal(await readFile(path.join(dataDirectory,'assets/uploads/photo.jpg'),'utf8'),'bundled photo');
  await writeFile(path.join(dataDirectory,'assets/uploads/photo.jpg'),'saved photo');
  await writeFile(path.join(dataDirectory,'assets-marker.txt'),'persistent test');
  const original=await readFile(path.join(dataDirectory,'js/site-data.js'),'utf8');
  await writeFile(path.join(root,'js/site-data.js'),original.replace('my space','new build'));
  app=createSiteServer({root,dataDirectory});await app.ready;
  assert.equal(await readFile(path.join(dataDirectory,'assets/uploads/photo.jpg'),'utf8'),'saved photo','novo deploy preserva uploads existentes');
  assert.equal(await readFile(path.join(dataDirectory,'js/site-data.js'),'utf8'),original,'novo deploy não sobrescreve conteúdo salvo');
  assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('myspace-community-'));
  await rm(temp,{recursive:true,force:true});
});

test('rejeita JSON primitivo, hosts falsos e arquivos privados em diretórios públicos',async()=>{
  const f=await fixture();
  try {
    for(const payload of [null,[],true,'message']) assert.equal((await f.send('/api/community/messages',payload)).status,400);
    const hostStatus=await new Promise((resolve,reject)=>{
      const req=httpRequest(`http://127.0.0.1:${f.instance.server.address().port}/api/community`,{headers:{Host:'foreign.example'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(hostStatus,403);
    assert.equal((await f.send('/api/community/messages',{body:'no origin'},'POST',{Origin:''})).status,403);
    await mkdir(path.join(f.root,'assets/private'),{recursive:true});
    await writeFile(path.join(f.root,'assets/private/admin.json'),'{"secret":"test-only"}');
    for(const target of ['/assets/private/admin.json','/.env','/tools/server.mjs','/.private/community.json']) {
      const response=await f.request(target);assert.equal(response.status,404);
      assert.ok(!(await response.text()).includes('test-only'));
    }
    const response=await f.request('/index.html');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.match(response.headers.get('permissions-policy'),/camera=\(\)/);
    await mkdir(path.join(f.temp,'private'),{recursive:true});
    await writeFile(path.join(f.temp,'private/community.json'),'private-sentinel-invalid-json');
    const failed=await f.request('/api/community');
    assert.equal(failed.status,500);assert.ok(!(await failed.text()).includes('private-sentinel'));
  } finally { await f.close(); }
});

test('cabeçalhos de proxy forjados não burlam o limite de envios online',async()=>{
  const f=await fixture({publicOrigin:'https://myspace.example'});
  try {
    for(let index=0;index<5;index++) {
      const response=await f.send('/api/community/messages',{body:'test'},'POST',{'X-Forwarded-For':`198.51.100.${index}`});
      assert.equal(response.status,index<4?201:429);
    }
  } finally { await f.close(); }
});

test('protege o login de verificações de senha concorrentes em excesso',async()=>{
  const f=await fixture();
  try {
    const responses=await Promise.all(Array.from({length:6},()=>f.send('/api/admin/login',{username:'tester',password:'incorrect'})));
    assert.ok(responses.every(response=>[401,429].includes(response.status)));
    assert.ok(responses.some(response=>response.status===429));
  } finally { await f.close(); }
});

test('cadastro inicial concorrente só cria uma conta',async()=>{
  const f=await fixture();
  try {
    const password=randomBytes(20).toString('hex');
    const responses=await Promise.all(['first','second'].map(username=>f.send('/api/admin/setup',{code:f.instance.auth.setupCode,username,password})));
    assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
  } finally { await f.close(); }
});

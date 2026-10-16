'use strict';
const $ = selector => document.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let draft, revision, csrf = '', username = '', section = 'home', dirty = false, configured = false;
const tabs = {home:'home & identidade',profile:'about me',images:'imagens',theme:'aparência',diary:'diário',daily:'daily',inbox:'mensagens',comments:'comentários',gallery:'galeria',thoughts:'pensamentos',links:'favoritos',tracks:'músicas',labels:'menus & janelas',copy:'outros textos',status:'status',account:'minha conta'};
const fields = {
  home: [
    ['identity.name','nome do site'],['identity.year','ano'],['identity.topNote','mensagem do topo'],['identity.description','descrição do site'],
    ['banner.eyebrow','pequena frase do banner'],['banner.line1','banner / primeira linha'],['banner.line2','banner / segunda linha'],['banner.caption','frase abaixo do título'],['banner.bottom','frase no canto do banner'],
    ['about.kicker','saudação'],['about.title','abertura da apresentação','textarea'],['about.paragraphs','texto da apresentação — separe parágrafos com uma linha vazia','paragraphs'],['about.interestsTitle','título dos interesses'],['about.interests','interesses — um por linha','lines'],['about.caption','legenda do avatar'],['about.captionYear','ano da legenda'],['about.bottom','mensagem abaixo da apresentação']
  ],
  images: [['banner.image','imagem do banner','asset'],['banner.wires','sobreposição dos fios','asset'],['about.avatar','avatar','asset'],['about.avatarAlt','descrição acessível do avatar'],['media.icon','ícone do computador','asset'],['media.decoration','ornamento de fundo','asset']],
  theme: [['theme.paper','fundo','color'],['theme.cream','interior das janelas','color'],['theme.blue','barras de título','color'],['theme.ink','texto','color'],['theme.sage','seleção e detalhes','color'],['theme.rust','destaques','color'],['theme.terminal','fundo do terminal','color'],['theme.terminalText','texto do terminal','color'],['theme.width','largura desktop (900 a 1600)','number'],['theme.fontSize','tamanho da fonte base (10 a 16)','number'],['theme.avatarPosition','enquadramento horizontal do avatar (0 a 100)','number']],
  status: [['status.connection','conexão'],['status.location','local'],['status.mood','humor'],['status.system','sistema'],['status.visitor','mensagem para o visitante'],['status.footer','mensagem abaixo do terminal'],['status.timezone','fuso horário IANA — exemplo: America/Sao_Paulo']]
};
const itemFields = {
  daily: [['id','ID único, sem espaços'],['date','data e horário','datetime-local'],['text','seu daily','textarea'],['images','fotos — até 8 por post','photos'],['alt','descrição das fotos'],['tags','tags — uma por linha','lines'],['quoteId','citar outro daily','quote'],['example','identificar como exemplo','checkbox']],
  diary: [['id','ID único, sem espaços'],['date','data','date'],['title','título'],['excerpt','resumo no painel lateral','textarea'],['image','imagem','asset'],['alt','descrição da imagem'],['paragraphs','texto — separe parágrafos com uma linha vazia','paragraphs'],['tags','tags — uma por linha','lines'],['example','identificar como texto de exemplo','checkbox']],
  gallery: [['src','imagem','asset'],['title','título'],['alt','descrição acessível'],['credit','créditos e origem']],
  thoughts: [['text','pensamento','textarea'],['date','data ou legenda']],
  links: [['title','nome'],['url','endereço completo'],['description','descrição']],
  tracks: [['title','nome da música'],['artist','artista'],['src','arquivo de áudio','audio'],['cover','capa','asset']]
};
const descriptions = {
  profile:'As informações do seu perfil. A imagem é de Motoko Kusanagi, do site oficial de Ghost in the Shell.',daily:'Pequenas notas, fotos e citações. Salve o post antes de comentar como admin. Você pode citar um daily pelo botão ↪ de cada cartão.',
  home:'A abertura, os textos e a identidade do seu espaço.',images:'Escolha arquivos do computador ou use um caminho existente da pasta assets. Novos uploads aceitam JPG, PNG, GIF e WebP. Os SVG que acompanham o site podem continuar sendo usados pelo caminho.',
  theme:'Ajuste a paleta e o tamanho do site. As mudanças aparecem depois de salvar e recarregar a prévia.',diary:'Adicione entradas e organize a ordem com as setas. O primeiro item aparece primeiro.',gallery:'Imagens, legendas e créditos da galeria.',thoughts:'Pequenos fragmentos para guardar entre uma transmissão e outra.',links:'Links completos com https://. Os três primeiros também aparecem na barra lateral.',tracks:'A primeira música é carregada ao abrir o site. Use as setas para ordenar. Novas faixas ficam na playlist; a reprodução só começa quando o visitante clicar em play. Upload de até 32 MB por arquivo.',labels:'Nomes dos menus e das janelas.',copy:'Textos dos painéis e do rodapé.',status:'O relógio é atualizado automaticamente; as outras informações são textos editáveis.'
};
fields.profile=[['profile.name','nome / apresentação'],['profile.handle','apelido e assinatura das respostas'],['profile.age','idade'],['profile.personality','personalidade'],['profile.role','trabalho / área'],['profile.study','estudos'],['profile.avatar','imagem de Ghost in the Shell','asset'],['profile.avatarAlt','descrição acessível da imagem'],['profile.heading','subtítulo do perfil'],['profile.note','frase de rodapé do perfil']];
function newDaily(quoteId='') {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(item=>[item.type,item.value]));
  return {id:`daily-${crypto.randomUUID().slice(0,8)}`,date:`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`,text:'',images:[],alt:'',tags:[],quoteId,example:false};
}
const labelNames = {home:'menu / home',about:'menu / about',diary:'menu / diário',gallery:'menu / galeria',thoughts:'menu / pensamentos',links:'menu / links',guestbook:'menu / visitas',navigationWindow:'janela / navegação',aboutWindow:'janela / apresentação',diaryWindow:'janela / diário',galleryWindow:'janela / galeria',thoughtsWindow:'janela / pensamentos',linksWindow:'janela lateral / links',bookmarksWindow:'janela central / links',guestbookWindow:'janela / visitas',statusWindow:'janela / terminal',playerWindow:'janela / player',interestsWindow:'título auxiliar dos interesses'};
const copyNames = {navBottom:'abaixo da navegação',linksNote:'mensagem dos favoritos',badgeNote:'abaixo dos selos',diaryLabel:'cabeçalho do resumo do diário',diaryMore:'link para o diário',galleryKicker:'galeria / subtítulo',galleryTitle:'galeria / título',galleryIntro:'galeria / introdução',thoughtsKicker:'pensamentos / subtítulo',thoughtsTitle:'pensamentos / título',thoughtsIntro:'pensamentos / introdução',linksKicker:'favoritos / subtítulo',linksTitle:'favoritos / título',linksIntro:'favoritos / introdução',guestbookKicker:'visitas / subtítulo',guestbookTitle:'visitas / título',guestbookIntro:'visitas / introdução',quietNote:'frase abaixo do player',footerNote:'mensagem do rodapé',bottomLeft:'última linha / esquerda',bottomRight:'última linha / direita'};
function message(text, error = false, selector = '#editor-message') { $(selector).textContent = text; $(selector).classList.toggle('error', error); }
function markDirty() { dirty = true; $('#dirty-state').textContent = 'alterações ainda não salvas.'; $('#dirty-state').classList.add('dirty'); }
function markSaved() { dirty = false; $('#dirty-state').textContent = 'tudo salvo no servidor.'; $('#dirty-state').classList.remove('dirty'); }
function get(path) { return path.split('.').reduce((value,key)=>value[key],draft); }
function set(path,value) { const keys=path.split('.'), last=keys.pop(); keys.reduce((node,key)=>node[key],draft)[last]=value; markDirty(); }
async function api(endpoint, options = {}) {
  const { binary, ...init } = options;
  const headers = {...init.headers};
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (typeof init.body === 'string') headers['Content-Type'] = 'application/json';
  const response = await fetch(`api/admin/${endpoint}`, {...init,headers,credentials:'same-origin'});
  if (!response.ok) {
    let error; try { error=await response.json(); } catch {}
    throw Object.assign(new Error(error?.error || 'Não foi possível conectar ao painel.'), { status: response.status });
  }
  return binary ? response.blob() : response.json();
}
function inputField(path,label,type='text') {
  const value=get(path), id=`field-${path.replaceAll('.','-')}`;
  if(type==='quote') {
    const current=get(path.replace(/quoteId$/,'id'));
    return `<label class="field-wide" for="${id}">${e(label)}<select id="${id}" data-field="${path}" data-type="text"><option value="">não citar</option>${draft.daily.filter(post=>post.id!==current).map(post=>`<option value="${e(post.id)}" ${value===post.id?'selected':''}>${e(post.date.replace('T',' / '))} — ${e(post.text.slice(0,65)||post.id)}</option>`).join('')}</select></label>`;
  }
  if(type==='photos') return `<div class="field-wide"><label for="${id}">${e(label)}</label><textarea id="${id}" data-field="${path}" data-type="lines">${e(value.join('\n'))}</textarea><label class="upload-control">adicionar fotos do computador<input type="file" multiple data-upload="${path}" data-upload-mode="append" accept="image/jpeg,image/png,image/gif,image/webp"></label><div class="admin-photo-grid">${value.map(src=>`<img src="${e(src)}" alt="foto do daily">`).join('')}</div><small>um caminho por linha; remova a linha para retirar uma foto.</small></div>`;
  if(type==='checkbox') return `<label class="checkbox-field field-wide"><input id="${id}" type="checkbox" data-field="${path}" data-type="checkbox" ${value?'checked':''}>${e(label)}</label>`;
  const wide=['textarea','paragraphs','lines','asset','audio'].includes(type);
  const control=['textarea','paragraphs','lines'].includes(type)?`<textarea id="${id}" data-field="${path}" data-type="${type}">${e(Array.isArray(value)?value.join(type==='paragraphs'?'\n\n':'\n'):value)}</textarea>`:`<input id="${id}" type="${['date','datetime-local','number','color'].includes(type)?type:'text'}" data-field="${path}" data-type="${type}" value="${e(value)}">`;
  if(type==='asset'||type==='audio') {
    const preview=type==='asset'?`<img class="asset-preview" src="${e(value)}" alt="prévia de ${e(label)}">`:'';
    return `<div class="field-wide field-asset"><div><label for="${id}">${e(label)}</label>${control}<label class="upload-control">${type==='audio'?'enviar áudio':'enviar imagem'} do computador<input type="file" data-upload="${path}" accept="${type==='audio'?'audio/*':'image/jpeg,image/png,image/gif,image/webp'}"></label></div>${preview}</div>`;
  }
  return `<label class="${wide?'field-wide':''}" for="${id}">${e(label)}${control}</label>`;
}
function renderTabs() { $('#editor-tabs').innerHTML=Object.entries(tabs).map(([key,label])=>`<button data-section="${key}" aria-pressed="${key===section}">${e(label)}</button>`).join(''); }
function renderSection() {
  window.AdminCommunity?.cancel();
  $('#editor-fields').onclick=null; $('#editor-fields').onsubmit=null;
  renderTabs();
  if(['inbox','comments'].includes(section)) { window.AdminCommunity.render(section,{api,e,message,data:draft,root:$('#editor-fields')}); return; }
  if(section==='account') {
    $('#editor-fields').innerHTML=`<div class="admin-section-heading"><h3>minha conta</h3></div><p class="admin-help">Somente uma conta de administrador. A mudança encerra as outras sessões.</p><form id="account-form" class="account-form"><label>usuário<input name="username" value="${e(username)}" required minlength="3" maxlength="40" autocomplete="username"></label><label>senha atual<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>nova senha — no mínimo 12 caracteres<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>confirme a nova senha<input name="confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button>atualizar minha conta</button><p id="account-message" role="status"></p></form>`;
    return;
  }
  let body='';
  if(itemFields[section]) {
    body=draft[section].map((item,index)=>`<article class="list-card"><div class="list-card-header"><h4>${String(index+1).padStart(2,'0')} / ${e(item.title||item.text?.slice(0,40)||'novo item')}</h4><div class="list-card-actions">${section==='daily'?`<button data-quote-item="${index}" aria-label="Citar daily ${index+1}">↪ citar</button>`:''}<button data-move="${index}" data-direction="-1" aria-label="Mover item ${index+1} para cima" ${index===0?'disabled':''}>↑</button><button data-move="${index}" data-direction="1" aria-label="Mover item ${index+1} para baixo" ${index===draft[section].length-1?'disabled':''}>↓</button><button class="delete-item" data-remove="${index}" aria-label="Remover item ${index+1}">remover</button></div></div><div class="field-grid">${itemFields[section].map(([key,label,type])=>inputField(`${section}.${index}.${key}`,label,type)).join('')}</div></article>`).join('')||'<p class="admin-help">ainda não há itens. crie o primeiro.</p>';
    if(section==='daily') body=`<div class="list-card"><div class="field-grid">${[['dailySettings.title','nome da janela'],['dailySettings.heading','título da página'],['dailySettings.intro','introdução'],['dailySettings.author','nome nas publicações'],['dailySettings.commentsEnabled','permitir comentários de visitantes','checkbox']].map(args=>inputField(...args)).join('')}</div></div>`+body;
  } else {
    let list=fields[section];
    if(section==='labels') list=Object.keys(draft.labels).map(key=>[`labels.${key}`,labelNames[key]||key]);
    if(section==='copy') list=Object.keys(draft.copy).map(key=>[`copy.${key}`,copyNames[key]||key,'textarea']);
    body=`<div class="field-grid">${list.map(args=>inputField(...args)).join('')}</div>`;
  }
  $('#editor-fields').innerHTML=`<div class="admin-section-heading"><h3>${e(tabs[section])}</h3>${itemFields[section]?'<button id="add-item">+ adicionar</button>':''}</div><p class="admin-help">${e(descriptions[section]||'')}</p>${body}`;
}
async function loadEditor(session) {
  csrf=session.csrf; username=session.username;
  if (!draft || !dirty) { const result=await api('content'); draft=result.data; revision=result.revision; }
  $('#auth-screen').hidden=true; $('#editor-screen').hidden=false; $('#boot-status').hidden=true;
  $('#admin-name').textContent=username;
  if (!dirty) markSaved();
  renderSection();
  const quoteId=location.hash.match(/^#daily\/quote\/([a-z\d_-]+)$/i)?.[1];
  if(quoteId && draft.daily.some(post=>post.id===quoteId)) { section='daily'; draft.daily.unshift(newDaily(quoteId)); markDirty(); history.replaceState(null,'',location.pathname+'#daily'); renderSection(); }
}
function showAuth(isConfigured) {
  configured=isConfigured; $('#boot-status').hidden=true; $('#auth-screen').hidden=false; $('#editor-screen').hidden=true;
  $('#setup-code-label').hidden=configured; $('#confirm-password-label').hidden=configured;
  $('#auth-form').elements.code.required=!configured; $('#auth-form').elements.confirm.required=!configured;
  $('#auth-form').elements.password.minLength=configured?1:12;
  $('#auth-form').elements.password.autocomplete=configured?'current-password':'new-password';
  $('#auth-title').textContent=configured?'bem-vinda de volta.':'este espaço é seu.';
  $('#auth-description').textContent=configured?'Entre com seu usuário e senha.':'Copie o código mostrado no seu terminal e crie seu único login. Guarde sua senha: ela não fica no código do site.';
  $('#auth-submit').textContent=configured?'entrar ↗':'criar meu acesso ↗';
}
async function boot() {
  try { const session=await api('session'); if(session.authenticated) await loadEditor(session); else showAuth(session.configured); }
  catch { $('#boot-status').hidden=true; $('#unavailable-screen').hidden=false; }
}
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault(); const form=event.target;
  if(!configured&&form.elements.password.value!==form.elements.confirm.value) { message('As senhas não coincidem.',true,'#auth-message'); return; }
  $('#auth-submit').disabled=true;
  try { const session=await api(configured?'login':'setup',{method:'POST',body:JSON.stringify({username:form.elements.username.value,password:form.elements.password.value,code:form.elements.code.value.trim()})}); form.reset(); await loadEditor(session); }
  catch(error) { message(error.message,true,'#auth-message'); }
  finally { $('#auth-submit').disabled=false; }
});
$('#editor-tabs').addEventListener('click',event=>{ const button=event.target.closest('[data-section]'); if(button) { section=button.dataset.section; renderSection(); } });
$('#editor-fields').addEventListener('input',event=>{
  const target=event.target,path=target.dataset.field; if(!path) return;
  let value=target.value;
  if(target.dataset.type==='number') value=Number(value);
  if(target.dataset.type==='checkbox') value=target.checked;
  if(target.dataset.type==='paragraphs') value=value.split(/\n\s*\n/).filter(text=>text.trim());
  if(target.dataset.type==='lines') value=value.split('\n').filter(text=>text.trim());
  set(path,value);
});
$('#editor-fields').addEventListener('change',async event=>{
  const path=event.target.dataset.upload,files=[...(event.target.files||[])]; if(!path||!files.length) return;
  if(files.some(file=>file.size>32*1024*1024)) { message('O limite é 32 MB por arquivo.',true); return; }
  const append=event.target.dataset.uploadMode==='append';
  if(append && get(path).length+files.length>8) { message('Cada daily aceita até 8 fotos.',true); return; }
  event.target.disabled=true; message('copiando o arquivo para o projeto...');
  try { for(const file of files) { const result=await api(`upload?name=${encodeURIComponent(file.name)}`,{method:'POST',body:file}); set(path,append?[...get(path),result.path]:result.path); } renderSection(); message('arquivo adicionado. salve as alterações para usá-lo no site.'); }
  catch(error) { message(error.message,true); event.target.disabled=false; }
});
$('#editor-fields').addEventListener('click',event=>{
  const quote=event.target.closest('[data-quote-item]');
  if(quote) { const id=draft.daily[Number(quote.dataset.quoteItem)].id; draft.daily.unshift(newDaily(id)); markDirty(); renderSection(); return; }
  if(event.target.closest('#add-item')) {
    const date=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
    const defaults={diary:{id:`post-${crypto.randomUUID().slice(0,8)}`,date,title:'nova transmissão',image:'assets/images/wires.jpg',alt:'',excerpt:'',paragraphs:[''],tags:[],example:false},gallery:{src:'assets/images/night.jpg',title:'nova memória',alt:'',credit:''},thoughts:{text:'um novo pensamento.',date},links:{title:'novo favorito',url:'https://',description:''},tracks:{title:'nova música',artist:'',src:'assets/audio/nightcall.mp3',cover:'assets/images/night.jpg'}};
    if(section==='daily') draft.daily.unshift(newDaily()); else draft[section].push(defaults[section]); markDirty(); renderSection(); return;
  }
  const remove=event.target.closest('[data-remove]');
  if(remove) { const [removed]=draft[section].splice(Number(remove.dataset.remove),1); if(section==='daily') draft.daily.forEach(post=>{if(post.quoteId===removed.id)post.quoteId='';}); markDirty(); renderSection(); message('item removido do rascunho. só será aplicado ao salvar.'); return; }
  const move=event.target.closest('[data-move]');
  if(move) { const index=Number(move.dataset.move),next=index+Number(move.dataset.direction); [draft[section][index],draft[section][next]]=[draft[section][next],draft[section][index]]; markDirty(); renderSection(); }
});
$('#save-button').addEventListener('click',async()=>{
  $('#save-button').disabled=true; message('salvando...');
  try { const result=await api('content',{method:'PUT',headers:{'If-Match':revision},body:JSON.stringify(draft)}); draft=result.data; revision=result.revision; markSaved(); message('salvo. recarregue o site para ver as mudanças.'); }
  catch(error) {
    if (error.status===401) { showAuth(true); $('#auth-description').textContent='Sua sessão terminou. Entre novamente para continuar com seu rascunho preservado.'; }
    else message(error.message,true);
  }
  finally { $('#save-button').disabled=false; }
});
$('#export-button').addEventListener('click',async()=>{
  if(dirty) { message('Salve as alterações antes de exportar.',true); return; }
  $('#export-button').disabled=true; message('preparando o ZIP público...');
  try { const blob=await api('export',{binary:true}); const url=URL.createObjectURL(blob),link=document.createElement('a'); link.href=url; link.download='my-space-neocities.zip'; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000); message('ZIP exportado. extraia e envie o conteúdo ao Neocities. seu login não está no ZIP.'); }
  catch(error) { message(error.message,true); }
  finally { $('#export-button').disabled=false; }
});
$('#logout-button').addEventListener('click',async()=>{
  if(dirty) { message('Salve as alterações antes de sair ou recarregue para descartá-las.',true); return; }
  try { await api('logout',{method:'POST'}); csrf=''; draft=null; $('#auth-form').reset(); showAuth(true); }
  catch(error) { message(error.message,true); }
});
$('#editor-fields').addEventListener('submit',async event=>{
  if(event.target.id!=='account-form') return; event.preventDefault(); const form=event.target;
  if(form.elements.password.value!==form.elements.confirm.value) { message('As senhas não coincidem.',true,'#account-message'); return; }
  const button=form.querySelector('button'); button.disabled=true;
  try { const session=await api('account',{method:'PUT',body:JSON.stringify({username:form.elements.username.value,currentPassword:form.elements.currentPassword.value,password:form.elements.password.value})}); csrf=session.csrf; username=session.username; $('#admin-name').textContent=username; form.reset(); renderSection(); message('conta atualizada; as outras sessões foram encerradas.'); }
  catch(error) { message(error.message,true,'#account-message'); button.disabled=false; }
});
window.addEventListener('beforeunload',event=>{ if(dirty) { event.preventDefault(); event.returnValue=''; } });
boot();

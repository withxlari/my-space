(() => {
  'use strict';
  const data = window.SITE_DATA;
  const $ = selector => document.querySelector(selector);
  const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const lines = value => e(value).replaceAll('\n','<br>');
  const asset = value => /^assets\/[a-z\d_./ -]+$/i.test(value || '') && !value.includes('..') ? value : 'assets/images/night.jpg';
  const date = value => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value.replace('T',' / ').replace(/^(\d{4})-(\d{2})-(\d{2})/,'$3.$2.$1');
    try { return new Date(value).toLocaleString('pt-BR',{timeZone:data.status.timezone,dateStyle:'short',timeStyle:'short'}); } catch { return value; }
  };
  let feed = {messages:[],counts:{}}, session = null, tag = '';
  const comments = new Map();
  async function request(url, options={}) {
    const headers = {...options.headers};
    if (typeof options.body === 'string') headers['Content-Type']='application/json';
    const response=await fetch(url,{...options,headers,credentials:'same-origin'});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error || 'Não foi possível enviar. Tente novamente.');
    return result;
  }
  function messageForm() {
    return `<section class="signal-composer"><div class="small-heading"><span>send a signal</span><span aria-hidden="true">↗</span></div><p>deixe uma mensagem para ${e(data.profile.handle)}.</p><form class="signal-form"><label>nome ou apelido <small>(opcional)</small><input name="name" maxlength="40" placeholder="vazio = anônimo" autocomplete="nickname"></label><label>sua mensagem<textarea name="body" required maxlength="2000" rows="3" placeholder="alguém do outro lado dos fios..."></textarea></label><input name="website" class="honey-field" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">enviar mensagem ↗</button><p class="form-feedback" role="status"></p></form><small class="signal-privacy">sua mensagem só fica pública quando ${e(data.profile.handle)} responder. a resposta também será pública.</small></section>`;
  }
  function answeredMessage(item) {
    return `<article class="answered-message"><div class="question-bubble"><p>${lines(item.body)}</p><div><span>${e(item.name)}</span><time>${date(item.createdAt)}</time></div></div><div class="answer-bubble"><img src="${e(asset(data.profile.avatar))}" alt="ícone de ${e(data.profile.handle)}"><div><span class="author-name">${e(item.reply.author)} <b class="admin-badge">admin</b></span><p>${lines(item.reply.body)}</p><time>${date(item.reply.createdAt)}</time></div></div></article>`;
  }
  function updateWidgets() {
    const widget=$('#answered-messages');
    if(widget) widget.innerHTML=feed.messages.length?feed.messages.slice(0,5).map(answeredMessage).join(''):'<p class="empty-transmission">nenhuma resposta publicada ainda.<br><a href="#messages">deixe um sinal ↗</a></p>';
    const all=$('#all-messages');
    if(all) all.innerHTML=feed.messages.length?feed.messages.map(answeredMessage).join(''):'<p class="empty-transmission">quando uma mensagem for respondida, a conversa aparece aqui.</p>';
    document.querySelectorAll('[data-count-post]').forEach(node=>node.textContent=feed.counts[node.dataset.countPost]||0);
    const latest=$('#latest-daily');
    if(latest) {
      const post=data.daily[0];
      latest.innerHTML=post?`<a class="latest-note" href="#daily/${encodeURIComponent(post.id)}"><time>${date(post.date)}</time><p>${e(post.text.slice(0,125))}${post.text.length>125?'…':''}</p><span>ler & comentar ↗</span></a>`:'<p class="empty-transmission">a próxima transmissão ainda está sendo escrita.</p>';
    }
  }
  async function refresh() {
    try { feed=await request('api/community'); updateWidgets(); }
    catch { const widget=$('#answered-messages'); if(widget) widget.innerHTML='<p class="empty-transmission">não foi possível carregar as mensagens. tente recarregar a página.</p>'; }
  }
  function diaryIndex() {
    if(!data.diary.length) return '<span class="section-kicker">diary / 00 files</span><h1 class="page-heading">memórias por escrever.</h1><p class="empty-transmission">nenhum diário publicado ainda.</p>';
    return `<div class="archive-heading"><span class="section-kicker">diary / collected memories</span><span class="file-count">${String(data.diary.length).padStart(2,'0')} files</span></div><h1 class="page-heading">escolha uma memória.</h1><p class="page-intro">textos mais longos, guardados entre uma conexão e outra.</p><div class="diary-cards">${data.diary.map((entry,index)=>`<a class="diary-card" href="#diary/${encodeURIComponent(entry.id)}"><div class="diary-card-image"><img src="${e(asset(entry.image))}" alt="${e(entry.alt)}"><span>${String(index+1).padStart(2,'0')} / log</span></div><div class="diary-card-copy"><time datetime="${e(entry.date)}">${e(entry.date.replaceAll('-','.'))}</time><h2>${e(entry.title)}</h2><p>${e(entry.excerpt)}</p><div class="card-tags">${entry.tags.slice(0,3).map(value=>`<span>#${e(value)}</span>`).join('')}</div><span class="read-file">abrir memória <b>↗</b></span></div></a>`).join('')}</div>`;
  }
  function profile() {
    const person=data.profile;
    return `<div class="dossier-header"><span>user:// ${e(person.handle)}</span><span class="dossier-light">● connected</span></div><div class="dossier-grid"><figure class="profile-visual"><img src="${e(asset(person.avatar))}" alt="${e(person.avatarAlt)}"><figcaption>visual / ghost in the shell</figcaption><span class="portrait-cross" aria-hidden="true">+</span></figure><div class="dossier-info"><span class="section-kicker">${e(person.heading)}</span><h1>${e(person.name)}</h1><div class="profile-chips"><span>age / ${e(person.age)}</span><span>${e(person.personality)}</span></div><dl><dt>work.exe</dt><dd>${e(person.role)}</dd><dt>studies.sys</dt><dd>${e(person.study)}</dd></dl><div class="profile-interests"><span>interesses.exe</span>${data.about.interests.map(value=>`<p>${e(value)}</p>`).join('')}</div></div></div><div class="dossier-footer"><span>&gt; ${e(person.note)}</span><span class="barcode" aria-hidden="true"></span></div>${messageForm()}`;
  }
  function quoted(post) {
    const original=data.daily.find(item=>item.id===post.quoteId);
    if(!original) return '';
    return `<a class="quoted-daily" href="#daily/${encodeURIComponent(original.id)}"><span class="quote-origin">↪ ${e(data.dailySettings.author)} · ${date(original.date)}</span><p>${lines(original.text)}</p>${original.images[0]?`<img src="${e(asset(original.images[0]))}" alt="${e(original.alt)}">`:''}<span>ver daily citado ↗</span></a>`;
  }
  function dailyPost(post, detail=false) {
    return `<article class="daily-post" id="daily-${e(post.id)}"><header><img class="daily-avatar" src="${e(asset(data.profile.avatar))}" alt=""><div><span class="author-name">${e(data.dailySettings.author)} <b class="admin-badge">admin</b>${post.example?' <span class="example-label">exemplo</span>':''}</span><time datetime="${e(post.date)}">${date(post.date)}</time></div><span class="post-symbol" aria-hidden="true">✧</span></header><div class="daily-content"><div class="daily-tags">${post.tags.map(value=>`<button data-filter-tag="${e(value)}">#${e(value)}</button>`).join('')}</div>${post.text?`<p class="daily-text">${lines(post.text)}</p>`:''}${quoted(post)}${post.images.length?`<div class="daily-photos ${post.images.length===1?'single-photo':''}">${post.images.map(src=>`<button data-open-photo="${e(asset(src))}" data-photo-alt="${e(post.alt)}" aria-label="Ampliar foto do daily"><img src="${e(asset(src))}" alt="${e(post.alt||'Foto anexada ao daily')}" loading="lazy"></button>`).join('')}</div>`:''}<footer><a href="#daily/${encodeURIComponent(post.id)}"><span data-count-post="${e(post.id)}">${feed.counts[post.id]||0}</span> comentários ↗</a><a href="admin.html#daily/quote/${encodeURIComponent(post.id)}">citar no meu daily <span class="owner-action">(admin)</span> ↪</a>${!detail?`<a href="#daily/${encodeURIComponent(post.id)}" aria-label="Abrir daily de ${date(post.date)}">abrir →</a>`:''}</footer></div></article>`;
  }
  function commentForm(postId) {
    if(!data.dailySettings.commentsEnabled && !session?.authenticated) return '<p class="empty-transmission">os comentários estão pausados neste momento.</p>';
    return `<form class="daily-comment-form" data-post="${e(postId)}"><input name="parentId" type="hidden" value=""><div class="replying-to" hidden></div>${session?.authenticated?`<p class="commenting-as">comentando como ${e(data.profile.handle)} <b class="admin-badge">admin</b></p>`:'<label>nome ou apelido <small>(opcional)</small><input name="name" maxlength="40" placeholder="vazio = anônimo" autocomplete="nickname"></label>'}<label>seu comentário<textarea name="body" required maxlength="2000" rows="3" placeholder="deixe um pensamento..."></textarea></label><input name="website" class="honey-field" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">comentar ↗</button><p class="form-feedback" role="status"></p></form>`;
  }
  function daily(id) {
    const post=data.daily.find(item=>item.id===id);
    if(id && !post) return '<h1 class="page-heading">essa transmissão não foi encontrada.</h1><a href="#daily">← voltar ao daily</a>';
    if(post) return `<a class="back-to-index" href="#daily">← voltar ao daily</a>${dailyPost(post,true)}<section class="comments-panel" data-comments-post="${e(post.id)}"><div class="small-heading"><h2>comentários (<span data-count-post="${e(post.id)}">${feed.counts[post.id]||0}</span>)</h2><span>leave a trace</span></div><div id="daily-comments"><p class="empty-transmission">carregando comentários...</p></div><div id="comment-form-slot">${commentForm(post.id)}</div></section>`;
    const tags=[...new Set(data.daily.flatMap(item=>item.tags))];
    const posts=tag?data.daily.filter(item=>item.tags.includes(tag)):data.daily;
    return `<span class="section-kicker">daily / unsorted life</span><h1 class="page-heading">${e(data.dailySettings.heading)}</h1><p class="page-intro">${e(data.dailySettings.intro)}</p><div class="daily-filter"><button data-filter-tag="" aria-pressed="${!tag}">tudo (${data.daily.length})</button>${tags.map(value=>`<button data-filter-tag="${e(value)}" aria-pressed="${tag===value}">#${e(value)} (${data.daily.filter(item=>item.tags.includes(value)).length})</button>`).join('')}</div><div class="daily-feed">${posts.length?posts.map(post=>dailyPost(post)).join(''):'<p class="empty-transmission">nenhuma transmissão por aqui ainda.</p>'}</div>`;
  }
  function renderComments(postId) {
    const box=$('[data-comments-post]');
    if(!box || box.dataset.commentsPost!==postId) return;
    const list=comments.get(postId)||[];
    $('#daily-comments').innerHTML=list.length?list.map(item=>{
      const parent=list.find(other=>other.id===item.parentId);
      return `<article class="daily-comment ${item.isAdmin?'owner-comment':''}"><header><b>${e(item.name)}</b>${item.isAdmin?'<span class="admin-badge">admin</span>':'<span class="visitor-badge">visitante</span>'}<time>${date(item.createdAt)}</time></header>${parent?`<div class="comment-parent">↪ ${e(parent.name)}: ${e(parent.body.slice(0,110))}</div>`:''}<p>${lines(item.body)}</p><button data-reply-comment="${e(item.id)}" data-reply-name="${e(item.name)}">responder ↗</button></article>`;
    }).join(''):'<p class="empty-transmission">sem comentários ainda. deixe o primeiro sinal.</p>';
  }
  async function mount() {
    updateWidgets();
    const box=$('[data-comments-post]');
    if(!box) return;
    const postId=box.dataset.commentsPost;
    try { session=await request('api/admin/session'); } catch { session=null; }
    if($('[data-comments-post]')?.dataset.commentsPost!==postId) return;
    $('#comment-form-slot').innerHTML=commentForm(postId);
    try { const result=await request(`api/community/comments?post=${encodeURIComponent(postId)}`); comments.set(postId,result.comments); renderComments(postId); }
    catch { if($('#daily-comments')) $('#daily-comments').innerHTML='<p class="empty-transmission">não foi possível carregar os comentários. recarregue para tentar novamente.</p>'; }
  }
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!form.matches('.signal-form,.daily-comment-form')) return;
    event.preventDefault();
    const feedback=form.querySelector('.form-feedback'), button=form.querySelector('button[type=submit]');
    if(form.elements.website.value) return;
    const body=form.elements.body.value.trim();
    if(!body) { feedback.textContent='escreva antes de enviar.'; return; }
    button.disabled=true; feedback.textContent='enviando...';
    try {
      const payload={name:form.elements.name?.value.trim()||'',body};
      if(form.matches('.signal-form')) {
        await request('api/community/messages',{method:'POST',body:JSON.stringify(payload)});
        form.reset(); feedback.textContent=`mensagem recebida. ela aparecerá quando ${data.profile.handle} responder.`;
      } else {
        payload.postId=form.dataset.post; payload.parentId=form.elements.parentId.value;
        const owner=Boolean(session?.authenticated);
        await request(owner?'api/admin/community/comments':'api/community/comments',{method:'POST',headers:owner?{'X-CSRF-Token':session.csrf}:{},body:JSON.stringify(payload)});
        form.reset(); form.querySelector('.replying-to').hidden=true;
        feedback.textContent='comentário publicado. obrigada por deixar um sinal ♡';
        await refresh();
        const result=await request(`api/community/comments?post=${encodeURIComponent(payload.postId)}`); comments.set(payload.postId,result.comments); renderComments(payload.postId);
      }
    } catch(error) { feedback.textContent=error.message; }
    finally { button.disabled=false; }
  });
  document.addEventListener('click',event=>{
    const filter=event.target.closest('[data-filter-tag]');
    if(filter) { tag=filter.dataset.filterTag; if(location.hash!=='#daily') location.hash='daily'; else { $('#page-content').innerHTML=daily(); mount(); } }
    const image=event.target.closest('[data-open-photo]');
    if(image) { $('#dialog-image').src=asset(image.dataset.openPhoto); $('#dialog-image').alt=image.dataset.photoAlt; $('#dialog-caption').textContent=image.dataset.photoAlt; $('#image-dialog').showModal(); }
    const reply=event.target.closest('[data-reply-comment]');
    if(reply) { const form=$('.daily-comment-form'); if(!form) return; form.elements.parentId.value=reply.dataset.replyComment; const info=form.querySelector('.replying-to'); info.textContent=`respondendo a ${reply.dataset.replyName}`; info.hidden=false; form.elements.body.focus(); }
  });
  window.SpaceFeatures={diaryIndex,profile,daily,messages:()=>`<span class="section-kicker">messages / across the wires</span><h1 class="page-heading">a little less alone.</h1>${messageForm()}<div id="all-messages"></div>`,messageForm,mount,refresh};
  document.addEventListener('DOMContentLoaded',()=>{ refresh(); });
  setInterval(()=>{if(!document.hidden) refresh();},30000);
})();

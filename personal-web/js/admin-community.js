(() => {
  'use strict';
  let generation=0, selectedPost='';
  async function render(view,context) {
    const ticket=++generation, {api,e,message,data,root}=context;
    root.innerHTML='<p class="admin-help">carregando conversas...</p>';
    const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:data.status.timezone});
    try {
      const store=await api('community');
      if(ticket!==generation) return;
      if(view==='inbox') {
        const pending=store.messages.filter(item=>!item.reply&&!item.hidden).length;
        root.innerHTML=`<div class="admin-section-heading"><h3>mensagens</h3><span class="moderation-counter">${pending} sem resposta</span></div><p class="admin-help">As mensagens ficam privadas até você responder. O botão “responder e publicar” publica pergunta e resposta juntas. Você pode ocultar a conversa depois.</p>${store.messages.length?store.messages.map((item,index)=>`<article class="moderation-card"><header><b>${e(item.name)}</b><time>${date(item.createdAt)}</time><span class="moderation-state">${item.hidden?'oculta':item.reply?'publicada':'privada / aguardando resposta'}</span></header><p class="moderation-question">${e(item.body).replaceAll('\n','<br>')}</p><form data-reply-message="${e(item.id)}"><label>sua resposta à mensagem ${index+1}<textarea name="body" required maxlength="4000" rows="4">${e(item.reply?.body||'')}</textarea></label><div class="moderation-actions"><button type="submit">${item.reply?'atualizar resposta':'responder e publicar'}</button><button type="button" data-moderate-id="${e(item.id)}" data-kind="message" data-action="${item.hidden?'show':'hide'}" ${item.hidden&&!item.reply?'disabled':''}>${item.hidden?'restaurar conversa':'ocultar conversa'}</button></div></form></article>`).join(''):'<div class="admin-empty">nenhum sinal recebido ainda.<p>As mensagens enviadas pelo formulário do site aparecem aqui.</p></div>'}`;
      } else {
        if(!data.daily.some(post=>post.id===selectedPost)) selectedPost=data.daily[0]?.id||'';
        const list=store.comments.filter(item=>item.postId===selectedPost);
        root.innerHTML=`<div class="admin-section-heading"><h3>comentários do daily</h3><span class="moderation-counter">${list.length} neste post</span></div><p class="admin-help">Comentários de visitantes podem ser anônimos ou ter apelido. Só os enviados por este acesso recebem o selo admin. Salve o daily antes de comentar.</p><label class="moderation-picker">escolher daily<select id="moderation-post">${data.daily.map(post=>`<option value="${e(post.id)}" ${post.id===selectedPost?'selected':''}>${e(post.date.replace('T',' / '))} — ${e(post.text.slice(0,70)||post.id)}</option>`).join('')}</select></label>${selectedPost?`<form id="owner-comment-form" class="owner-comment-composer"><h4>comentar como ${e(data.profile.handle)} <span class="admin-mini-badge">admin</span></h4><input name="parentId" type="hidden"><p id="owner-replying-to" hidden></p><label>seu comentário<textarea name="body" required maxlength="2000" rows="3"></textarea></label><button type="submit">publicar comentário como admin</button></form>`:'<p class="admin-help">crie e salve um daily primeiro.</p>'}${list.length?list.map(item=>`<article class="moderation-card ${item.hidden?'moderation-hidden':''}"><header><b>${e(item.name)}</b>${item.isAdmin?'<span class="admin-mini-badge">admin</span>':'<span class="visitor-mini-badge">visitante</span>'}<time>${date(item.createdAt)}</time><span class="moderation-state">${item.hidden?'oculto':'público'}</span></header><p>${e(item.body).replaceAll('\n','<br>')}</p><div class="moderation-actions"><button data-moderate-id="${e(item.id)}" data-kind="comment" data-action="${item.hidden?'show':'hide'}">${item.hidden?'restaurar comentário':'ocultar comentário'}</button>${!item.hidden?`<button data-owner-reply="${e(item.id)}" data-name="${e(item.name)}">responder como admin ↗</button>`:''}</div></article>`).join(''):'<p class="admin-help">nenhum comentário neste daily ainda.</p>'}`;
        const picker=root.querySelector('#moderation-post');
        if(picker) picker.onchange=()=>{selectedPost=picker.value;render(view,context);};
      }
      root.onsubmit=async event=>{
        const form=event.target;
        if(!form.matches('[data-reply-message],#owner-comment-form')) return;
        event.preventDefault();
        const button=form.querySelector('button[type=submit]'); button.disabled=true;
        try {
          if(form.dataset.replyMessage) {
            await api('community',{method:'PATCH',body:JSON.stringify({kind:'message',id:form.dataset.replyMessage,action:'reply',body:form.elements.body.value})});
            message('resposta publicada. a conversa já aparece no site.');
          } else {
            await api('community/comments',{method:'POST',body:JSON.stringify({postId:selectedPost,parentId:form.elements.parentId.value,body:form.elements.body.value})});
            message('comentário publicado com o selo admin.');
          }
          await render(view,context);
        } catch(error) { message(error.message,true); button.disabled=false; }
      };
      root.onclick=async event=>{
        const moderate=event.target.closest('[data-moderate-id]');
        if(moderate) {
          moderate.disabled=true;
          try {
            await api('community',{method:'PATCH',body:JSON.stringify({id:moderate.dataset.moderateId,kind:moderate.dataset.kind,action:moderate.dataset.action})});
            message('visibilidade atualizada.'); await render(view,context);
          } catch(error) { message(error.message,true); moderate.disabled=false; }
        }
        const reply=event.target.closest('[data-owner-reply]');
        if(reply) {
          const form=root.querySelector('#owner-comment-form');
          form.elements.parentId.value=reply.dataset.ownerReply;
          const note=root.querySelector('#owner-replying-to'); note.textContent=`respondendo a ${reply.dataset.name}`; note.hidden=false;
          form.elements.body.focus();
        }
      };
    } catch(error) { if(ticket===generation) root.innerHTML=`<p class="admin-help">${e(error.message)}</p>`; }
  }
  window.AdminCommunity={render,cancel:()=>generation++};
})();

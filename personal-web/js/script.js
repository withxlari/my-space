'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const data = window.SITE_DATA;
const content = $('#page-content');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asset = value => /^assets\/[a-z\d_./ -]+$/i.test(value || '') && !value.includes('..') ? value : 'assets/images/night.jpg';
const lines = text => e(text).replaceAll('\n', '<br>');
const pc = () => `<img class="retro-pc" src="${e(asset(data.media.icon))}" alt="" aria-hidden="true">`;
const icon = name => `<svg aria-hidden="true"><use href="assets/icons/desktop.svg#${name}"/></svg>`;
const externalLink = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '#links'; } catch { return '#links'; } };
const entries = data.diary;
const dateLabel = date => date.replaceAll('-', '.');
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function titlebar(selector, label, name) { const node = $(selector); if (node) node.innerHTML = icon(name) + e(label); }

function applySettings() {
  const vars = {paper:'paper', cream:'cream', blue:'blue', ink:'ink', sage:'sage', rust:'rust'};
  for (const [key, variable] of Object.entries(vars)) document.documentElement.style.setProperty(`--${variable}`, data.theme[key]);
  document.documentElement.style.setProperty('--site-width', `${data.theme.width}px`);
  document.documentElement.style.setProperty('--base-size', `${data.theme.fontSize}px`);
  document.documentElement.style.setProperty('--avatar-position', `${data.theme.avatarPosition}%`);
  document.documentElement.style.setProperty('--terminal-bg', data.theme.terminal);
  document.documentElement.style.setProperty('--terminal-text', data.theme.terminalText);
  document.documentElement.style.setProperty('--botanical', `url("${new URL(asset(data.media.decoration), document.baseURI).href}")`);
  $('.banner').style.backgroundImage = `url("${asset(data.banner.image)}")`;
  $('.banner-wires').style.backgroundImage = `url("${asset(data.banner.wires)}")`;
  $('meta[name="description"]').content = data.identity.description;
  setText('.topline>span:first-child', `${data.identity.name} / est. ${data.identity.year}`);
  setText('.topline>span:last-child', data.identity.topNote);
  setText('.eyebrow', data.banner.eyebrow);
  $('.banner-copy p').innerHTML = `${e(data.banner.line1)}<br><em>${e(data.banner.line2)}</em>`;
  setText('.banner-caption', data.banner.caption);
  setText('.banner-bottom', data.banner.bottom);
  document.querySelectorAll('.retro-pc').forEach(img => img.src = asset(data.media.icon));
  document.querySelectorAll('[data-route]').forEach(link => {
    const page = link.dataset.route;
    if (link.closest('.side-nav')) link.innerHTML = icon({home:'home',about:'profile',diary:'diary',daily:'message',messages:'message',gallery:'image',thoughts:'message',links:'globe',guestbook:'book'}[page]) + e(data.labels[page]) + `<span>${String(['home','about','diary','daily','messages','gallery','thoughts','links','guestbook'].indexOf(page)+1).padStart(2,'0')}</span>`;
    else link.textContent = `/ ${data.labels[page]}`;
  });
  titlebar('.navigation-window h2', data.labels.navigationWindow, 'leaf');
  titlebar('.links-window h2', data.labels.linksWindow, 'globe');
  titlebar('.diary-window h2', data.labels.diaryWindow, 'diary');
  titlebar('.status-window h2', data.labels.statusWindow, 'terminal');
  titlebar('.player-window h2', data.labels.playerWindow, 'music');
  setText('.nav-foot>span:nth-child(2)', `● ${data.copy.navBottom}`);
  $('.link-folders').innerHTML = data.links.slice(0,3).map(link => `<a href="${e(externalLink(link.url))}" target="_blank" rel="noopener noreferrer">${icon('folder')}${e(link.title)}<span>↗</span></a>`).join('') + `<a href="#links">${icon('folder')}all bookmarks<span>→</span></a><div class="link-note">${lines(data.copy.linksNote)}<span aria-hidden="true">✧</span></div>`;
  setText('.badge-note', data.copy.badgeNote);
  setText('.panel-label>span:first-child', data.copy.diaryLabel);
  setText('.panel-label>span:last-child', `${entries.length} files`);
  $('.more-link').innerHTML = `${e(data.copy.diaryMore)} <span>↗</span>`;
  $('.terminal p').innerHTML = `<span>&gt; connection:</span> ${e(data.status.connection)}<br><span>&gt; location:</span> ${e(data.status.location)}<br><span>&gt; mood:</span> ${e(data.status.mood)}<br><span>&gt; local time:</span> <time id="local-clock">--:--:--</time><br><span>&gt; system:</span> ${e(data.status.system)}<br><span>&gt; you:</span> ${e(data.status.visitor)}`;
  setText('.terminal-footer', data.status.footer);
  setText('.quiet-note>span:first-child', data.copy.quietNote);
  setText('.footer>span:first-child', `${data.identity.name} © ${data.identity.year}`);
  $('.footer>span:nth-child(2)').innerHTML = `${e(data.copy.footerNote)} ${pc()}`;
  setText('.bottom-line>span:first-child', data.copy.bottomLeft);
  $('.bottom-line>span:last-child').innerHTML = `${e(data.copy.bottomRight)} <span aria-hidden="true">▪ ▧ □</span>`;
  $('#diary-list').innerHTML = entries.map(entry => `<a class="diary-entry" href="#diary/${encodeURIComponent(entry.id)}"><img src="${e(asset(entry.image))}" alt="${e(entry.alt)}"><div><time datetime="${e(entry.date)}">${dateLabel(entry.date)}</time><h3>${e(entry.excerpt)}</h3></div></a>`).join('') || '<p class="empty-transmission">nenhum diário publicado ainda.</p>';
}
function homePage() {
  const about = data.about;
  return `<div class="about-layout"><figure class="portrait"><img src="${e(asset(about.avatar))}" alt="${e(about.avatarAlt)}"><figcaption>${e(about.caption)}<span>${e(about.captionYear)}</span></figcaption><span class="photo-corner" aria-hidden="true">+</span></figure><div class="about-copy"><span class="section-kicker">${e(about.kicker)} <span aria-hidden="true">✧</span></span><h1 class="quiet-heading">${lines(about.title)}</h1>${about.paragraphs.map(text=>`<p>${lines(text)}</p>`).join('')}<div class="interests"><span aria-hidden="true">${pc()}</span><div><b>${e(about.interestsTitle)}</b><br>${about.interests.map(e).join('<br>')}</div></div></div></div><div class="main-status"><span><span class="led"></span> ${e(about.bottom)}</span><span class="barcode" aria-hidden="true"></span></div>`;
}
function diaryPage(id) {
  const index = Math.max(0, entries.findIndex(entry => entry.id === id)), entry = entries[index];
  if (!entry) return '<h1 class="page-heading">nenhuma transmissão ainda.</h1>';
  return `<div class="post-navigation"><span class="page-tag">diário${entry.example ? ' / texto de exemplo' : ''}</span><div><button data-post="${index-1}" ${index===0?'disabled':''} aria-label="Entrada mais recente">←</button> <button data-post="${index+1}" ${index===entries.length-1?'disabled':''} aria-label="Entrada anterior">→</button></div></div><time class="post-date" datetime="${e(entry.date)}">${dateLabel(entry.date)}</time><h1 class="page-heading">${e(entry.title)}</h1><img class="post-image" src="${e(asset(entry.image))}" alt="${e(entry.alt)}"><div class="post-text">${entry.paragraphs.map(text=>`<p>${lines(text)}</p>`).join('')}</div><p class="post-tags">${entry.tags.map(tag=>`#${e(tag)}`).join(' &nbsp; ')}</p><p class="route-hint">fragmento ${index+1} de ${entries.length}</p>`;
}
function galleryPage() {
  if (!data.gallery.length) return `<span class="section-kicker">${e(data.copy.galleryKicker)} / 0 files</span><h1 class="page-heading">${e(data.copy.galleryTitle)}</h1><p class="empty-transmission">nenhuma imagem publicada ainda.</p>`;
  return `<span class="section-kicker">${e(data.copy.galleryKicker)} / ${data.gallery.length} files</span><h1 class="page-heading">${e(data.copy.galleryTitle)}</h1><p class="page-intro">${e(data.copy.galleryIntro)}</p><div class="gallery-grid">${data.gallery.map((image,index)=>`<button class="gallery-item" data-image="${index}"><img src="${e(asset(image.src))}" alt="${e(image.alt)}"><span>${String(index+1).padStart(2,'0')} / ${e(image.title)} ↗</span></button>`).join('')}</div>`;
}
function linksPage() {
  if (!data.links.length) return `<span class="section-kicker">${e(data.copy.linksKicker)}</span><h1 class="page-heading">${e(data.copy.linksTitle)}</h1><p class="empty-transmission">nenhum favorito publicado ainda.</p>`;
  return `<span class="section-kicker">${e(data.copy.linksKicker)}</span><h1 class="page-heading">${e(data.copy.linksTitle)}</h1><p class="page-intro">${e(data.copy.linksIntro)}</p><div class="bookmarks">${data.links.map(link=>`<a class="bookmark" href="${e(externalLink(link.url))}" target="_blank" rel="noopener noreferrer">${icon('folder')}<div><b>${e(link.title)}</b><small>${e(link.description)}</small></div><span aria-label="Abre em nova aba">↗</span></a>`).join('')}</div>`;
}
function guestbookPage() {
  return `<span class="section-kicker">${e(data.copy.guestbookKicker)}</span><h1 class="page-heading">${e(data.copy.guestbookTitle)}</h1><p class="page-intro">${e(data.copy.guestbookIntro)}</p>${window.SpaceFeatures.messageForm()}<div id="all-messages"></div>`;
}
function route(focus = false) {
  const [rawPage, id] = location.hash.slice(1).split('/');
  const page = ['home','about','diary','daily','messages','gallery','thoughts','links','guestbook'].includes(rawPage) ? rawPage : 'home';
  const title = ({home:data.labels.aboutWindow,about:data.labels.profileWindow,diary:data.labels.diaryWindow,daily:data.dailySettings.title,messages:'messages.txt',gallery:data.labels.galleryWindow,thoughts:data.labels.thoughtsWindow,links:data.labels.bookmarksWindow,guestbook:data.labels.guestbookWindow})[page];
  setText('#page-title', title); document.title = `${title} / ${data.identity.name}`;
  if (page==='home') content.innerHTML = homePage() + window.SpaceFeatures.messageForm();
  if (page==='about') content.innerHTML = window.SpaceFeatures.profile();
  if (page==='diary') content.innerHTML = id ? '<a class="back-to-index" href="#diary">← todos os diários</a>' + diaryPage(id) : window.SpaceFeatures.diaryIndex();
  if (page==='daily') content.innerHTML = window.SpaceFeatures.daily(id);
  if (page==='messages') content.innerHTML = window.SpaceFeatures.messages();
  if (page==='gallery') content.innerHTML = galleryPage();
  if (page==='links') content.innerHTML = linksPage();
  if (page==='thoughts') content.innerHTML = `<span class="section-kicker">${e(data.copy.thoughtsKicker)}</span><h1 class="page-heading">${e(data.copy.thoughtsTitle)}</h1><p class="page-intro">${e(data.copy.thoughtsIntro)}</p>${data.thoughts.map(t=>`<blockquote class="thought">${lines(t.text)}<small>${e(t.date)}</small></blockquote>`).join('')}`;
  if (page==='thoughts' && !data.thoughts.length) content.innerHTML += '<p class="empty-transmission">nenhum pensamento publicado ainda.</p>';
  if (page==='guestbook') content.innerHTML = guestbookPage();
  document.querySelectorAll('[data-route]').forEach(link=>{ const active=link.dataset.route===page; link.classList.toggle('active',active); if(active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
  const panel = content.closest('.window'); panel.classList.remove('collapsed'); $('.collapse',panel).setAttribute('aria-expanded','true'); $('.collapse',panel).textContent='−';
  window.SpaceFeatures.mount();
  if(focus) { $('#main').focus({preventScroll:true}); if(matchMedia('(max-width:620px)').matches) $('#main').scrollIntoView({block:'start'}); }
}
document.addEventListener('click',event=>{
  const collapse=event.target.closest('.collapse');
  if(collapse) { const hidden=collapse.closest('.window').classList.toggle('collapsed'); collapse.setAttribute('aria-expanded',String(!hidden)); collapse.textContent=hidden?'+':'−'; return; }
  const post=event.target.closest('[data-post]'); if(post&&entries[Number(post.dataset.post)]) location.hash=`diary/${entries[Number(post.dataset.post)].id}`;
  const imageButton=event.target.closest('[data-image]');
  if(imageButton) { const image=data.gallery[Number(imageButton.dataset.image)]; $('#dialog-image').src=asset(image.src); $('#dialog-image').alt=image.alt; setText('#dialog-caption',`${image.title} / ${image.credit}`); $('#image-dialog').showModal(); }
});
window.addEventListener('hashchange',()=>route(true));
function tick() {
  const now=new Date();
  setText('#local-clock',now.toLocaleTimeString('pt-BR',{timeZone:data.status.timezone}));
  setText('#task-clock',now.toLocaleTimeString('pt-BR',{timeZone:data.status.timezone,hour:'2-digit',minute:'2-digit'}));
}

const audio=$('#audio'); let audioURL, trackIndex=-1;
const formatTime=value=>{ const seconds=Number.isFinite(value)?value:0; return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`; };
function playbackState() { const playing=!audio.paused&&!audio.ended; setText('#audio-play',playing?'Ⅱ':'▶'); $('#audio-play').setAttribute('aria-label',playing?'Pausar':'Reproduzir'); $('.equalizer').classList.toggle('playing',playing); }
function loadAudio(source,title,artist='arquivo local') {
  ['#audio-play','#audio-back','#audio-next','#audio-progress'].forEach(id=>$(id).disabled=true);
  $('#audio-progress').value=0; setText('#audio-time','00:00 / 00:00');
  audio.src=source; audio.load(); setText('#track-name',title); setText('#audio-state',artist);
}
function renderPlaylist() {
  setText('#playlist-toggle',`playlist / ${String(data.tracks.length).padStart(2,'0')} ▾`);
  $('#playlist').innerHTML=data.tracks.length?data.tracks.map((track,index)=>`<button class="playlist-track ${index===trackIndex?'selected':''}" data-track="${index}" aria-pressed="${index===trackIndex}"><span>${String(index+1).padStart(2,'0')} / ${e(track.title)}</span><small>${e(track.artist)}</small></button>`).join(''):'<p class="route-hint">adicione músicas pelo painel admin.</p>';
}
function selectTrack(index,play=false) {
  const track=data.tracks[index]; if(!track) return;
  trackIndex=index; loadAudio(asset(track.src),track.title,track.artist);
  $('.album-cover').src=asset(track.cover); $('.album-cover').alt=`capa de ${track.title}`;
  renderPlaylist(); if(play) audio.play().catch(()=>setText('#audio-state','clique em play para ouvir'));
}
$('#playlist-toggle').addEventListener('click',()=>{ const hidden=!$('#playlist').hidden; $('#playlist').hidden=hidden; $('#playlist-toggle').setAttribute('aria-expanded',String(!hidden)); });
$('#playlist').addEventListener('click',event=>{ const button=event.target.closest('[data-track]'); if(button) selectTrack(Number(button.dataset.track),true); });
$('#audio-file').addEventListener('change',event=>{ const file=event.target.files[0]; if(!file) return; if(file.type&&!file.type.startsWith('audio/')) { setText('#audio-state','escolha um arquivo de áudio'); return; } if(audioURL) URL.revokeObjectURL(audioURL); audioURL=URL.createObjectURL(file); trackIndex=-1; loadAudio(audioURL,file.name.replace(/\.[^.]+$/,'')); renderPlaylist(); });
audio.addEventListener('loadedmetadata',()=>{ const valid=Number.isFinite(audio.duration)&&audio.duration>0; ['#audio-play','#audio-back','#audio-next','#audio-progress'].forEach(id=>$(id).disabled=!valid); setText('#audio-time',`00:00 / ${formatTime(audio.duration)}`); });
audio.addEventListener('timeupdate',()=>{ setText('#audio-time',`${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`); $('#audio-progress').value=audio.duration?audio.currentTime/audio.duration*100:0; });
audio.addEventListener('play',playbackState); audio.addEventListener('pause',playbackState);
audio.addEventListener('ended',()=>{ playbackState(); if(trackIndex>=0&&trackIndex<data.tracks.length-1) selectTrack(trackIndex+1,true); });
audio.addEventListener('error',()=>{ setText('#audio-state','não foi possível abrir este áudio'); ['#audio-play','#audio-back','#audio-next','#audio-progress'].forEach(id=>$(id).disabled=true); playbackState(); });
$('#audio-play').addEventListener('click',async()=>{ if(audio.paused) { try { await audio.play(); } catch { setText('#audio-state','não foi possível reproduzir'); } } else audio.pause(); });
$('#audio-back').addEventListener('click',()=>audio.currentTime=Math.max(0,audio.currentTime-10));
$('#audio-next').addEventListener('click',()=>audio.currentTime=Math.min(audio.duration,audio.currentTime+10));
$('#audio-progress').addEventListener('input',event=>{ if(Number.isFinite(audio.duration)) audio.currentTime=Number(event.target.value)/100*audio.duration; });
applySettings(); route(); tick(); setInterval(tick,1000); renderPlaylist();
if(data.tracks.length) selectTrack(0);

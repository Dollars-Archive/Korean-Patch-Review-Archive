(function () {
  'use strict';
  const Core = window.ReviewCore, Sync = window.ReviewSync;
  const $ = id => document.getElementById(id), esc = Core.escapeHtml;
  const labels = Object.fromEntries(Core.PLATFORMS.map(p => [p.id,p.label]));
  const params = new URLSearchParams(location.search);
  let games = [], busy = false, verified = false, catalogReady = false;
  let filters = {platform:labels[params.get('platform')] ? params.get('platform') : 'all',genre:'all',q:'',favoriteOnly:false,view:'active',sort:'score-desc'};
  const store = Sync.createStore({knownIds:() => new Set(games.map(g => g.id))});
  function notice(text,error=false) { $('notice').textContent=text; $('notice').classList.toggle('error',error); }
  function syncUrl() { const url=new URL(location.href); if(filters.platform==='all')url.searchParams.delete('platform');else url.searchParams.set('platform',filters.platform); history.replaceState(null,'',url.pathname+url.search+url.hash); }
  function tokenStatus(extra='') {
    $('token-status').textContent = extra || (store.getToken() ? (verified ? '열쇠 저장됨 · 쓰기 권한 확인됨' : '열쇠 있음 · 이 저장소의 쓰기 권한 확인 필요') : '등록된 열쇠 없음 · 기존 발굴 아카이브 열쇠를 사용하거나 이 기기에 등록하세요.');
  }
  function openSettings() { $('settings').open=true; $('settings').scrollIntoView({block:'nearest',behavior:'smooth'}); }
  function platformButtons() {
    const platforms=[{id:'all',label:'전체'},...Core.PLATFORMS];
    $('platforms').innerHTML=platforms.map(p=>`<button type="button" data-platform="${esc(p.id)}" class="${filters.platform===p.id?'active':''}" aria-pressed="${filters.platform===p.id}">${esc(p.label)}</button>`).join('');
  }
  function listItems(items) { return items.length ? '<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>' : '<p>아직 등록된 내용이 없습니다.</p>'; }
  function coverMarkup(game) {
    const cover=game.cover||{}, raw=typeof cover.url==='string'?cover.url:'';
    const url=/^covers\/[a-z0-9-]+\.webp$/.test(raw)?raw:Core.safeUrl(raw);
    const description=[game.title,cover.platform,cover.region,'박스 앞면 표지'].filter(Boolean).join(' · ');
    return `<div class="cover">${url?`<img class="cover-image" src="${esc(url)}" alt="${esc(description)}" title="${esc(description)}" loading="lazy" decoding="async">`:''}<span class="cover-placeholder"${url?' hidden':''}>표지 준비 중</span></div>`;
  }
  function gameMarkup(game) {
    const favorite=Core.isFavorite(store.data,game.id), deleted=Core.isDeleted(store.data,game.id);
    const disabled=busy||!store.ready ? ' disabled' : '';
    const score=game.score===null ? '미평가' : Number(game.score).toFixed(1);
    const sources=game.sources.map(s=>{const url=Core.safeUrl(s.url);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.label||'출처')} ↗</a>`:'';}).join('');
    const patchUrl=Core.safeUrl(game.patch.url);
    const patchLabel=game.patch.status==='stopped'?'패치 배포 중단':game.patch.status==='available'?'한글패치 있음':'패치 정보 미확인';
    const patchLink=game.patch.status==='available'&&patchUrl?`<a class="download" href="${esc(patchUrl)}" target="_blank" rel="noopener noreferrer">한글패치 배포 페이지 ↗</a>`:`<span>${patchLabel}</span>`;
    return `<article class="game" data-id="${esc(game.id)}"><div class="game-visual">${coverMarkup(game)}<div class="rating ${game.score===null?'unrated':''}"><strong>${score}</strong><span>${game.score===null?'평가 대기':'/ 10'}</span></div></div><div class="game-content"><h3>${esc(game.title)}</h3><div class="original">${esc(game.original)}</div><div class="badges">${game.platforms.map(p=>`<span class="badge">${esc(labels[p]||p)}</span>`).join('')}${game.genres.map(g=>`<span class="badge">${esc(g)}</span>`).join('')}</div>${game.summary?`<p class="summary">${esc(game.summary)}</p>`:''}<details class="detail"><summary>장단점 · 평가 근거 보기</summary><div class="pros-cons"><div class="pros"><h4>장점</h4>${listItems(game.pros)}</div><div class="cons"><h4>단점</h4>${listItems(game.cons)}</div></div><div class="sources">${sources}</div><div class="meta">${esc([game.reviewer,game.reviewedAt].filter(Boolean).join(' · '))}</div></details><div class="patch">${patchLink}${game.patch.notes?`<span class="patch-note">${esc(game.patch.notes)}</span>`:''}</div></div><div class="actions"><button class="star" data-action="favorite" data-id="${esc(game.id)}" aria-pressed="${favorite}" aria-label="${esc(game.title)} ${favorite?'찜 해제':'찜 추가'}"${disabled}>${favorite?'★':'☆'}</button><button data-action="deleted" data-id="${esc(game.id)}"${disabled}>${deleted?'복구':'삭제'}</button></div></article>`;
  }
  function render() {
    platformButtons();
    const state=store.data;
    const active=games.filter(g=>!Core.isDeleted(state,g.id));
    const favoriteCount=active.filter(g=>Core.isFavorite(state,g.id)).length;
    const deletedCount=games.length-active.length;
    $('stats').innerHTML=[['등록 게임',active.length],['평가 완료',active.filter(g=>g.score!==null).length],['찜한 게임',favoriteCount]].map(([label,value])=>`<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('favorites').textContent=`${filters.favoriteOnly?'★':'☆'} 찜만 보기 (${favoriteCount})`; $('favorites').setAttribute('aria-pressed',String(filters.favoriteOnly));
    $('deleted').textContent=`삭제한 게임 · 복구 (${deletedCount})`; $('deleted').setAttribute('aria-pressed',String(filters.view==='deleted'));
    $('list-title').textContent=filters.view==='deleted'?'삭제한 게임':filters.favoriteOnly?'찜한 게임':filters.platform==='all'?'전체 게임':labels[filters.platform];
    const selected=Core.selectGames(games,filters,state);
    $('count').textContent=`${selected.length}개`;
    $('results').innerHTML=selected.map(gameMarkup).join('');
    $('empty').hidden=selected.length>0||!catalogReady;
    $('empty-title').textContent=games.length===0?'평가를 기다리고 있어요':'조건에 맞는 게임이 없어요';
    $('empty-text').textContent=games.length===0?'아직 등록된 평가가 없습니다. 웹GPT 평가 결과를 추가하면 평점순으로 자동 정렬됩니다.':filters.view==='deleted'?'삭제한 게임이 없거나 현재 필터에 해당하지 않습니다.':'기종·장르·검색 조건을 바꾸거나 필터를 초기화해 보세요.';
    ['token-save','token-clear','refresh'].forEach(id=>{$(id).disabled=busy;});
    tokenStatus();
  }
  function loadGenres() {
    const genres=[...new Set(games.flatMap(g=>g.genres))].sort((a,b)=>a.localeCompare(b,'ko'));
    $('genre').innerHTML='<option value="all">전체 장르</option>'+genres.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
  }
  async function checkToken() {
    verified=false;
    if(!store.getToken()){tokenStatus();return;}
    try { verified=await store.verifyToken(); tokenStatus(verified?'열쇠 저장됨 · 쓰기 권한 확인됨':'열쇠 저장됨 · 새 저장소를 선택하고 Contents: Read and write 권한을 허용하세요.'); }
    catch(error){tokenStatus('열쇠는 보관됨 · GitHub 권한 확인 실패');throw error;}
  }
  async function refreshState() {
    if(busy)return;busy=true;render();notice('찜·삭제 목록을 확인하는 중…');
    try {
      const result=await store.load();
      await checkToken();
      render();
      notice(result.error?'찜·삭제 연동 실패 · '+result.error+' · 기존 저장값을 유지합니다.':'찜·삭제 목록을 새로 불러왔습니다.',Boolean(result.error));
    } catch(error){render();notice('GitHub 연결을 확인하지 못했습니다. '+error.message,true);}
    finally{busy=false;render();}
  }
  $('platforms').addEventListener('click',event=>{const button=event.target.closest('[data-platform]');if(!button)return;filters.platform=button.dataset.platform;syncUrl();render();});
  $('search').addEventListener('input',()=>{filters.q=$('search').value;render();});
  $('genre').addEventListener('change',()=>{filters.genre=$('genre').value;render();});
  $('sort').addEventListener('change',()=>{filters.sort=$('sort').value;render();});
  $('favorites').addEventListener('click',()=>{filters.favoriteOnly=!filters.favoriteOnly;render();});
  $('deleted').addEventListener('click',()=>{filters.view=filters.view==='deleted'?'active':'deleted';render();});
  $('reset').addEventListener('click',()=>{filters={platform:'all',genre:'all',q:'',favoriteOnly:false,view:'active',sort:'score-desc'};$('search').value='';$('genre').value='all';$('sort').value='score-desc';syncUrl();render();});
  $('settings-open').addEventListener('click',openSettings);
  $('refresh').addEventListener('click',refreshState);
  $('token-save').addEventListener('click',async()=>{
    if(busy)return;
    try{store.setToken($('token').value);$('token').value='';}catch(error){notice(error.message,true);return;}
    busy=true;render();notice('열쇠를 저장하고 쓰기 권한을 확인하는 중…');
    try{await checkToken();notice(verified?'열쇠를 이 기기에 저장했습니다. 찜·삭제를 다른 기기와 연동할 수 있습니다.':'열쇠는 저장됐지만 쓰기 권한이 없습니다. 이 저장소를 추가하고 Contents: Read and write를 허용하세요.',!verified);}
    catch(error){notice('열쇠는 이 기기에 보관됩니다. 권한 확인 요청 실패 · '+error.message,true);}
    finally{busy=false;render();}
  });
  $('token-clear').addEventListener('click',()=>{if(busy)return;try{store.clearToken();verified=false;$('token').value='';render();notice('이 코너에서 열쇠 사용을 중지했습니다. 기존 발굴 아카이브 열쇠는 유지됩니다.');}catch(error){notice(error.message,true);}});
  $('results').addEventListener('error',event=>{
    const image=event.target;
    if(!image.classList||!image.classList.contains('cover-image'))return;
    image.hidden=true;
    const placeholder=image.parentElement.querySelector('.cover-placeholder');
    if(placeholder)placeholder.hidden=false;
  },true);
  $('results').addEventListener('click',async event=>{
    const button=event.target.closest('[data-action]');if(!button||busy||!store.ready)return;
    const game=games.find(g=>g.id===button.dataset.id);if(!game)return;
    if(!store.getToken()){openSettings();notice('찜·삭제 저장에는 GitHub 열쇠가 필요합니다.',true);return;}
    busy=true;render();
    try{
      if(!verified){await checkToken();if(!verified)throw new Error('새 저장소에 대한 Contents: Read and write 권한을 확인해 주세요.');}
      const kind=button.dataset.action;
      const value=kind==='favorite'?!Core.isFavorite(store.data,game.id):!Core.isDeleted(store.data,game.id);
      notice('GitHub에 저장하는 중…');
      await store.change({kind,id:game.id,title:game.title,value});
      notice(kind==='favorite'?(value?'찜을 GitHub에 저장했습니다.':'찜을 해제했습니다.'):(value?'목록에서 삭제했습니다. 삭제한 게임에서 복구할 수 있습니다.':'게임을 목록에 복구했습니다.'));
    }catch(error){notice('저장 실패 · 기존 목록을 유지합니다. '+error.message,true);}
    finally{busy=false;render();}
  });
  async function init() {
    render();
    try{
      const response=await fetch('data/games.json?_='+Date.now(),{cache:'no-store'});if(!response.ok)throw new Error('게임 데이터 HTTP '+response.status);
      games=Core.normalizeCatalog(await response.json()).games;catalogReady=true;loadGenres();render();await refreshState();
    }catch(error){notice('게임 목록을 불러오지 못했습니다. '+error.message,true);}
  }
  init();
})();

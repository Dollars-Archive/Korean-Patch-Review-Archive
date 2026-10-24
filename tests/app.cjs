const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../docs/assets/review-core.js');
const Sync=require('../docs/assets/review-sync.js');
test('screen wiring: scores, filters, persisted star, delete and restore', async()=>{
 const html=fs.readFileSync('docs/index.html','utf8'), app=fs.readFileSync('docs/assets/app.js','utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 const nodes=Object.fromEntries(ids.map(id=>[id,{innerHTML:'',textContent:'',value:id==='sort'?'score-desc':id==='genre'?'all':'',hidden:false,disabled:false,open:false,listeners:{},classList:{toggle(){}},setAttribute(k,v){this[k]=v;},scrollIntoView(){},addEventListener(k,f){this.listeners[k]=f;}}]));
 for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(nodes[id],`missing HTML id ${id}`);
 const games=[{id:'low',title:'낮은 게임',platforms:['psp'],genres:['ADV'],score:0},{id:'high',title:'높은 게임',platforms:['psp'],genres:['ADV'],score:9,cover:{url:'covers/high-abc123.webp',source:'https://example.com/psp-box',platform:'psp',type:'Box - Front',region:'Japan'}},{id:'unrated',title:'미평가 게임',platforms:['pc'],genres:['RPG'],score:null}];
 let remote={version:1,favorites:{},deleted:{}},sha='1';
 const values=new Map([['discovery-watchlist-token-v1','fixture-token']]);
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const reply=body=>({ok:true,status:200,json:async()=>body});
 const fetcher=async(url,opts={})=>{
  if(url.startsWith('data/games.json'))return reply({version:1,games});
  if(url.includes('/contents/')){
   if(opts.method==='PUT'){const body=JSON.parse(opts.body);assert.equal(body.branch,'watchlist-data');assert.equal(body.sha,sha);remote=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));sha=String(Number(sha)+1);return reply({content:{sha}});}
   return reply({content:Buffer.from(JSON.stringify(remote)).toString('base64'),encoding:'base64',sha});
  }
  return reply({permissions:{push:true}});
 };
 const context={window:{ReviewCore:Core,ReviewSync:{createStore:opts=>Sync.createStore({...opts,fetcher,storage})}},document:{getElementById:id=>nodes[id]},fetch:fetcher,URL,URLSearchParams,location:{href:'https://example.com/?platform=psp',search:'?platform=psp'},history:{replaceState(){}},console};
 vm.runInNewContext(app,context);
 for(let i=0;i<8;i++)await new Promise(setImmediate);
 const content=()=>nodes.results.innerHTML;
 assert.ok(content().includes('class="game-visual"'));
 assert.ok(content().indexOf('class="cover"')<content().indexOf('class="rating'));
 assert.ok(content().includes('src="covers/high-abc123.webp"'));
 assert.ok(content().includes('표지 준비 중'));
 const placeholder={hidden:true};
 const brokenImage={hidden:false,classList:{contains:name=>name==='cover-image'},parentElement:{querySelector:()=>placeholder}};
 nodes.results.listeners.error({target:brokenImage});
 assert.equal(brokenImage.hidden,true);
 assert.equal(placeholder.hidden,false);
 assert.ok(content().indexOf('높은 게임')<content().indexOf('낮은 게임'));
 assert.ok(!content().includes('미평가 게임'));
 nodes.reset.listeners.click();
 assert.ok(content().indexOf('미평가 게임')>content().indexOf('낮은 게임'));
 nodes.sort.value='score-asc';nodes.sort.listeners.change();
 assert.ok(content().indexOf('낮은 게임')<content().indexOf('높은 게임'));
 const clickAction=async(action,id)=>nodes.results.listeners.click({target:{closest:()=>({dataset:{action,id}})}});
 await clickAction('favorite','high');assert.ok(remote.favorites.high);
 await clickAction('deleted','high');assert.ok(remote.deleted.high.deleted);assert.ok(!content().includes('높은 게임'));
 nodes.deleted.listeners.click();assert.ok(content().includes('높은 게임'));assert.ok(content().includes('복구'));
 await clickAction('deleted','high');assert.equal(remote.deleted.high.deleted,false);assert.ok(remote.favorites.high);
 nodes.deleted.listeners.click();nodes.favorites.listeners.click();assert.ok(content().includes('높은 게임'));assert.ok(!content().includes('낮은 게임'));
 assert.ok(nodes.notice.textContent.includes('복구'));
 assert.equal(values.get('discovery-watchlist-token-v1'),'fixture-token');
});

import {replayHTML,abilityEffectHTML} from './replay.js';
import {ABILITIES,ATTACK_ROLES,DEFENSE_ROLES,attack,defense,roleScore,dScore,gScore,lineups,validateLineup,evaluate,chemistryLinks} from './engine.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toFixed(1), signed=n=>(n>0?'+':'')+fmt(n);
let db={cards:[],chemistry:{}},state=null,code='',token='',chosen=[null,null,null],activated=[],slot=0,pendingSwapSlot=null,lastSlotTap=null,lastPoolTap=null,skipSlotClickUntil=0,marks=[0,1],busy=false,polling=false,lastSerialized='',lastPhase='',toastTimer,epoch=0,penaltyDraft={},profile=null,authToken=localStorage.getItem('fw-auth-token')||'',accountUser=null,leaderboardRows=[],rewardBusy=false,leaderboardLoadedFor='';
const storage={get(){try{return JSON.parse(sessionStorage.getItem('final-whistle')||'null')}catch{return null}},save(){try{sessionStorage.setItem('final-whistle',JSON.stringify({code,token}))}catch{}},clear(){try{sessionStorage.removeItem('final-whistle')}catch{}}};
const PROFILE_KEY='final-whistle-ranked-v1';
const profileLevel=xp=>Math.floor(xp/250)+1;
const dayKey=()=>new Date().toLocaleDateString('en-CA');
function saveProfile(){if(authToken)return;try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile))}catch{toast('Browser storage is unavailable; local guest progress may not be saved.')}}
function starterIds(){
 const picks={F:[4,8,11],M:[3,7,10],D:[4,7,10,13],G:[2,5]};
 return Object.entries(picks).flatMap(([cat,indices])=>{const pool=db.cards.filter(c=>c.category===cat).sort((a,b)=>b.ovr-a.ovr);return indices.map(i=>pool[Math.min(i,pool.length-1)]?.id).filter(Boolean)});
}
function validRankSquad(ids,owned){
 if(!Array.isArray(ids)||ids.length!==12||new Set(ids).size!==12||ids.some(id=>!owned.includes(id)))return false;
 const counts=Object.fromEntries(['F','M','D','G'].map(cat=>[cat,ids.filter(id=>db.cards.find(c=>c.id===id)?.category===cat).length]));
 return counts.F===3&&counts.M===3&&counts.D===4&&counts.G===2;
}
function masteryBadge(id){
 const m=profile?.mastery?.[id];if(!m)return '<small class="mastery-badge">MASTERY · NEW</small>';
 return `<small class="mastery-badge">MASTERY L${m.level||1} · ${(m.xp||0)%100}/100 XP</small>`;
}
function ensureProfile(){
 let saved=null;try{saved=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null')}catch{}
 const owned=Array.isArray(saved?.owned)?[...new Set(saved.owned.filter(id=>db.cards.some(c=>c.id===id)))]:starterIds();
 const min={F:3,M:3,D:4,G:2};
 for(const [cat,count] of Object.entries(min))for(const c of db.cards.filter(c=>c.category===cat&&!owned.includes(c.id)).slice(0,Math.max(0,count-owned.filter(id=>db.cards.find(x=>x.id===id)?.category===cat).length)))owned.push(c.id);
 let squad=validRankSquad(saved?.squad,owned)?saved.squad:[];
 if(!squad.length){for(const [cat,count] of Object.entries(min)){squad.push(...owned.map(id=>db.cards.find(c=>c.id===id)).filter(c=>c?.category===cat).sort((a,b)=>b.ovr-a.ovr).slice(0,count).map(c=>c.id))}}
 profile={owned,squad,xp:Math.max(0,Number(saved?.xp)||0),rating:Math.max(0,Number(saved?.rating)||1000),wins:Math.max(0,Number(saved?.wins)||0),losses:Math.max(0,Number(saved?.losses)||0),streak:Math.max(0,Number(saved?.streak)||0),bestStreak:Math.max(0,Number(saved?.bestStreak)||0),lastProcessedMatch:saved?.lastProcessedMatch||null,daily:saved?.daily?.date===dayKey()?saved.daily:{date:dayKey(),played:false,won:false},latestReward:saved?.latestReward||null};
 saveProfile();renderProfile();
}
function renderProfile(){
 const accountOut=$('accountLoggedOut'),accountIn=$('accountLoggedIn');
 if(accountOut)accountOut.hidden=!!accountUser;if(accountIn)accountIn.hidden=!accountUser;
 if($('accountName'))$('accountName').textContent=accountUser?.username||'';
 if($('accountNote'))$('accountNote').textContent=accountUser?'Your collection and Ranked progress are database-backed and follow your sign-in.':'Create an account to enable persistent Ranked play. Friendly matches remain available without an account.';
 if(!profile||!$('rankRating'))return;
 const daily=profile.daily||{},claimed=new Set(daily.claimed||[]),missions=[
  ['play1','Play 1 ranked match',25,(daily.plays||daily.matches||0)>=1],
  ['win1','Win 1 ranked match',35,(daily.wins||0)>=1],
  ['goals2','Score 2 goals',30,(daily.goals||0)>=2],
  ['midgoal','Score with a midfielder',25,(daily.midfielderGoals||daily.midfielder_goals||0)>=1],
  ['stops2','Make 2 defensive stops',25,(daily.defensiveStops||daily.defensive_stops||0)>=2],
  ['wins2','Win 2 ranked matches',50,(daily.wins||0)>=2]
 ];
 $('rankRating').textContent=profile.rating??1000;$('rankLevel').textContent=`${profileLevel(profile.xp||0)} · ${(profile.xp||0)%250}/250 XP`;$('rankRecord').textContent=`${profile.wins||0}–${profile.losses||0}`;$('rankCollection').textContent=`${profile.owned?.length||0} / ${db.cards.length}`;$('rankBestStreak').textContent=profile.bestStreak||0;
 const counts=Object.fromEntries(['F','M','D','G'].map(cat=>[cat,(profile.squad||[]).filter(id=>db.cards.find(c=>c.id===id)?.category===cat).length]));
 $('rankSquadSummary').textContent=`${profile.squad?.length||0}-player squad · ${counts.F} F / ${counts.M} M / ${counts.D} D / ${counts.G} GK`;
 $('dailyMissions').innerHTML=missions.map(([id,name,xp,done])=>`<div class="mission ${claimed.has(id)?'complete':''}"><span>${claimed.has(id)?'✓':done?'◉':'○'} ${name}</span><b>${claimed.has(id)?'CLAIMED':'+'+xp+' XP'}</b></div>`).join('')+'<small>Challenges reset daily. Rewards are added automatically when a match completes.</small>';
 $('packCount').textContent=profile.packs||0;
 if($('packHint'))$('packHint').textContent=!authToken?'Sign in to connect daily rewards and player packs to your Ranked Club.':profile.packs>0?'Open a pack to add up to three players you do not own to your Ranked collection.':'No packs yet. Claim your daily spin; some spins award one or two packs. Packs you open add new players to your Ranked collection.';
 $('spinDaily').disabled=!authToken||!!daily.spinClaimed||rewardBusy;
 $('spinDaily').textContent=daily.spinClaimed?'Come back tomorrow':'Spin daily reward';
 $('openPack').disabled=!authToken||!(profile.packs>0)||rewardBusy;
 $('openPack').textContent=profile.packs>0?'Open a pack':'No packs available';
 if($('spinResult'))$('spinResult').textContent=daily.spinClaimed?(daily.spinResult?.label||'Daily reward claimed. See you tomorrow.'):'One free spin available today.';
 const unlocked=new Set(profile.achievements||[]),achievementCatalog=[
  ['first_win','First Whistle','Win your first ranked match.'],['streak_3','On a Roll','Win three matches in a row.'],['wins_10','Club Regular','Win ten ranked matches.'],['collection_25','Scout Network','Unlock 25 player cards.'],['collection_50','Full Album','Collect all 50 cards.'],['mission_hero','Mission Hero','Complete every daily mission in one day.']
 ];
 $('achievementGrid').innerHTML=achievementCatalog.map(([id,name,description])=>`<div class="achievement ${unlocked.has(id)?'':'locked'}"><b>${unlocked.has(id)?'🏅':'🔒'} ${name}</b><small>${description}</small></div>`).join('');
 $('rankedPlay').disabled=!authToken;$('editRankedSquad').disabled=!authToken;
 renderLeaderboard();
}
async function loadAccount(){
 if(!authToken){accountUser=null;renderProfile();return}
 try{const result=await api('auth/me',{authToken});accountUser=result.user;profile=result.profile;renderProfile();await loadLeaderboard()}
 catch(error){authToken='';accountUser=null;localStorage.removeItem('fw-auth-token');renderProfile();toast(error.message||'Please sign in again.')}
}
async function authAction(kind){
 const username=$('accountUsername').value.trim(),password=$('accountPassword').value;
 if(!username||!password){toast('Enter your username and password.');return}
 for(const id of ['signIn','register'])$(id).disabled=true;
 try{const result=await api('auth/'+kind,{username,password});authToken=result.token;localStorage.setItem('fw-auth-token',authToken);accountUser=result.user;profile=result.profile;profile.latestReward=null;$('accountPassword').value='';renderProfile();await loadLeaderboard();toast(kind==='register'?'Your club has been created. Your starter collection is ready.':'Welcome back to your club.')}
 catch(error){toast(error.message)}finally{for(const id of ['signIn','register'])$(id).disabled=false}
}
async function signOut(){
 if(authToken)try{await api('auth/logout',{authToken})}catch{}
 authToken='';accountUser=null;localStorage.removeItem('fw-auth-token');ensureProfile();renderProfile();toast('Signed out. Your database collection remains saved to your account.');
}
async function loadLeaderboard(){
 if(!authToken){leaderboardRows=[];renderLeaderboard();return}
 try{const result=await api('leaderboard',{authToken});leaderboardRows=result.leaderboard||[];renderLeaderboard()}catch{leaderboardRows=[];renderLeaderboard()}
}
function renderLeaderboard(){
 const el=$('weeklyLeaderboard');if(!el)return;
 if(!authToken){el.innerHTML='<p class="section-note">Sign in and play Ranked to enter the weekly table.</p>';return}
 if(!leaderboardRows.length){el.innerHTML='<p class="section-note">No ranked results this week yet. Be the first manager on the table.</p>';return}
 el.innerHTML=`<table class="leaderboard"><thead><tr><th>#</th><th>MANAGER</th><th>W</th><th>L</th><th>RATING</th></tr></thead><tbody>${leaderboardRows.map(row=>`<tr class="${row.username===accountUser?.username?'you':''}"><td>${row.rank}</td><td>${esc(row.username)}</td><td>${row.wins}</td><td>${row.losses}</td><td>${row.rating}</td></tr>`).join('')}</tbody></table><small class="section-note">Weekly results reset every Monday. Rating is your current Ranked rating.</small>`;
}
async function spinDaily(){
 if(!authToken||rewardBusy)return;
 rewardBusy=true;renderProfile();
 openDialog('DAILY REWARD',`<div class="daily-spin-flow">
  <p class="section-note">Every possible prize and its odds are shown beside the wheel. It will land on the reward selected by the game server.</p>
  <div class="spin-showcase">
   <div class="spin-pointer" aria-hidden="true">▼</div>
   <div class="spin-wheel-large" id="dailyWheelLarge" aria-label="Daily reward wheel"><span class="spin-wheel-center">FW</span></div>
   <div class="spin-prize-list" id="dailySpinPrizes"><p class="section-note">Loading today's prize wheel…</p></div>
  </div>
  <p class="spin-status" id="dailySpinStatus" role="status" aria-live="polite">Drawing today's reward…</p>
  <div id="dailySpinFinal" class="daily-spin-final" hidden></div>
  <div class="actions"><button class="secondary" id="dailySpinRetry" hidden>Try again</button><button class="primary" id="dailyRewardDone" hidden>Continue →</button></div>
 </div>`);
 try{
  const result=await api('rewards/spin',{authToken});
  profile=result.profile;profile.latestReward=null;renderProfile();
  const outcomes=result.outcomes||[],colors=['#d7e88b','#28563a','#d1a957','#487c56','#9ab8dc','#7965a8'];
  const wheel=$('dailyWheelLarge');
  if(!wheel||!outcomes.length)throw Error('The reward wheel could not load its prize segments. Please reload and try again.');
  let cursor=0;const stops=[],segments=[];
  for(let i=0;i<outcomes.length;i++){
   const item=outcomes[i],start=cursor;cursor+=Number(item.weight)||0;
   stops.push(`${colors[i%colors.length]} ${start}% ${cursor}%`);
   segments.push({...item,color:colors[i%colors.length],center:(start+cursor)/2*3.6});
  }
  wheel.style.background=`conic-gradient(${stops.join(',')})`;
  $('dailySpinPrizes').innerHTML=segments.map(item=>`<div class="spin-prize"><span class="spin-prize-swatch" style="background:${item.color}"></span><span><b>${esc(item.label)}</b><small>${item.weight}% chance</small></span></div>`).join('');
  const landedIndex=outcomes.findIndex(x=>x.type===result.reward.type&&x.amount===result.reward.amount);
  if(landedIndex<0)throw Error('The server returned a reward that is not on the displayed wheel.');
  const target=segments[landedIndex],rotation=360*5+(360-target.center);
  wheel.style.transition='none';wheel.style.transform='rotate(0deg)';void wheel.offsetWidth;
  $('dailySpinStatus').textContent='Spinning… good luck!';
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!reduced){
   const finished=new Promise(resolve=>{
    let done=false;const finish=()=>{if(done)return;done=true;resolve()};
    wheel.addEventListener('transitionend',finish,{once:true});setTimeout(finish,4700);
   });
   requestAnimationFrame(()=>{wheel.style.transition='transform 4.3s cubic-bezier(.10,.78,.10,1)';wheel.style.transform=`rotate(${rotation}deg)`});
   await finished;
  }else wheel.style.transform=`rotate(${rotation}deg)`;
  const unlocked=(result.reward.unlocked||[]).map(id=>db.cards.find(c=>c.id===id)).filter(Boolean);
  const rewardText=result.reward.type==='pack'
   ?`You won ${result.reward.label}. Your pack balance is now ${profile.packs}. Open a pack to add up to three new players to your Ranked collection.`
   :`You won ${result.reward.label}. Your XP is now ${profile.xp}. Every 250 XP raises your Manager Level by one; each level-up unlocks a new player while cards remain.`;
  $('dailySpinStatus').textContent=`The wheel landed on ${result.reward.label}!`;
  $('dailySpinFinal').hidden=false;
  $('dailySpinFinal').innerHTML=`<div class="spin-result-mark">✦</div><h2>${esc(result.reward.label)}</h2><p>${esc(rewardText)}</p>${unlocked.length?`<h3>New level-up player${unlocked.length>1?'s':''}</h3><div class="pack-reveal">${unlocked.map(c=>`<div class="reward-card"><img src="${esc(c.photo.src)}" alt=""><span><b>${esc(c.name)}</b><small>${c.ovr} OVR · ADDED TO COLLECTION</small></span></div>`).join('')}</div>`:''}`;
  $('dailyRewardDone').hidden=false;
 }catch(error){
  $('dailySpinStatus').textContent=error.message||'The spin could not be completed. No reward was claimed.';
  $('dailySpinRetry').hidden=false;$('dailySpinRetry').onclick=spinDaily;
 }finally{rewardBusy=false;renderProfile()}
}
async function openPlayerPack(){
 if(!authToken||rewardBusy)return;rewardBusy=true;renderProfile();
 try{const result=await api('rewards/open-pack',{authToken});profile=result.profile;profile.latestReward=null;renderProfile();const items=result.cards.map((item,i)=>{const c=db.cards.find(x=>x.id===item.id);return c?`<div class="reward-card" style="animation-delay:${i*.18}s"><img src="${esc(c.photo.src)}" alt=""><span><b>${esc(c.name)}</b><small>${esc(item.rarity)} · ${c.ovr} OVR</small></span></div>`:''}).join('');openDialog('PACK OPENING',`<p class="section-note">Your pack has been opened. Every card revealed is now part of your Ranked collection.</p><div class="pack-reveal">${items}</div><button class="primary" id="packDone">Add to collection →</button>`)}
 catch(error){toast(error.message)}finally{rewardBusy=false;renderProfile()}
}

function processRankedMatch(){
 if(!profile||!state||state.mode!=='ranked'||state.stage!=='ended'||profile.lastProcessedMatch===state.match)return;
 const won=state.winner===state.you,oldLevel=profileLevel(profile.xp),baseXp=won?110:60,oldRating=profile.rating;
 profile.xp+=baseXp;profile.rating=Math.max(0,profile.rating+(won?24:-10));
 if(won){profile.wins++;profile.streak++;profile.bestStreak=Math.max(profile.bestStreak,profile.streak)}else{profile.losses++;profile.streak=0}
 let bonus=0;if(!profile.daily.played){profile.daily.played=true;bonus+=25}if(won&&!profile.daily.won){profile.daily.won=true;bonus+=35}profile.xp+=bonus;
 const newLevel=profileLevel(profile.xp),unlocked=[];
 for(let level=oldLevel+1;level<=newLevel;level++){
  const locked=db.cards.filter(c=>!profile.owned.includes(c.id));if(!locked.length)break;
  const reward=locked[Math.floor(Math.random()*locked.length)];profile.owned.push(reward.id);unlocked.push(reward);
 }
 profile.lastProcessedMatch=state.match;profile.latestReward={match:state.match,won,xp:baseXp+bonus,rating:profile.rating-oldRating,unlocked:unlocked.map(c=>({id:c.id,name:c.name,ovr:c.ovr,position:c.position}))};saveProfile();renderProfile();
}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,6500)}
async function api(route,data={}){
 const r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
 let j;try{j=await r.json()}catch{throw Error('The game server is waking up. Please try again shortly.')}
 if(!r.ok){const e=Error(j.error||'Request failed');e.status=r.status;throw e}return j;
}
function receive(next){
 const phase=[next.match,next.turn,next.phase,next.stage,next.shootout?.kick].join(':');
 if(phase!==lastPhase){chosen=[null,null,null];activated=[];slot=0;pendingSwapSlot=null;lastSlotTap=null;lastPoolTap=null;marks=[0,1];lastPhase=phase;penaltyDraft={}}
 if(next.ranked?.profile){profile=next.ranked.profile;profile.latestReward=next.ranked.reward?.match===next.match?next.ranked.reward:null;accountUser=accountUser||{username:profile.username};renderProfile();if(next.ranked.reward?.match===next.match&&leaderboardLoadedFor!==next.match){leaderboardLoadedFor=next.match;loadLeaderboard()}}
 const serialized=JSON.stringify(next);state=next;
 if(serialized!==lastSerialized){lastSerialized=serialized;render()}
}
async function poll(){
 if(!code||!token||busy||polling)return;polling=true;const currentToken=token,currentEpoch=epoch;
 try{const next=await api('state',{code,token});if(token!==currentToken||currentEpoch!==epoch)return;$('connection').hidden=true;receive(next)}
 catch(e){if(token!==currentToken||currentEpoch!==epoch)return;if(e.status===403||e.status===404){leave();toast(e.message)}else $('connection').hidden=false}
 finally{polling=false}
}
async function action(route,data={}){
 if(busy)return;epoch++;busy=true;render();
 try{const next=await api(route,{code,token,match:state.match,turn:state.turn,...data});receive(next)}
 catch(e){toast(e.message);lastSerialized=''}finally{busy=false;render();poll()}
}
async function start(practice=false,join=false,modeOverride=null,squad=null){
 if(busy)return;busy=true;document.querySelectorAll('#home button').forEach(b=>b.disabled=true);
 const mode=modeOverride||$('gameMode').value,vsAI=mode==='ranked'?true:practice;
 try{const j=await api(join?'join':'create',{name:$('name').value,practice:vsAI,mode,difficulty:$('difficulty').value,squad,authToken:mode==='ranked'?authToken:undefined,code:$('joinCode').value.trim().toUpperCase()});code=j.code;token=j.token;storage.save();receive(j.state)}
 catch(e){toast(e.message)}finally{busy=false;document.querySelectorAll('#home button').forEach(b=>b.disabled=false);if(state)render()}
}
function rankedSquadDialog(){
 if(!profile)return;
 const labels={F:'Forwards',M:'Midfielders',D:'Defenders',G:'Goalkeepers'},counts={F:3,M:3,D:4,G:2};
 const html=Object.entries(counts).map(([cat,required])=>`<section class="rank-picker-group"><div class="rank-picker-heading"><strong>${labels[cat]}</strong><span data-rank-count="${cat}">${profile.squad.filter(id=>db.cards.find(c=>c.id===id)?.category===cat).length}/${required} selected</span></div><div class="rank-picker-list">${profile.owned.map(id=>db.cards.find(c=>c.id===id)).filter(c=>c?.category===cat).sort((a,b)=>b.ovr-a.ovr).map(c=>`<label class="rank-picker-card"><input type="checkbox" data-rank-select="${c.id}" data-category="${cat}" ${profile.squad.includes(c.id)?'checked':''}><img src="${esc(c.photo.src)}" alt=""><span><b>${esc(c.name)}</b><small>${c.position} · ${c.ovr} OVR</small>${masteryBadge(c.id)}</span></label>`).join('')}</div></section>`).join('');
 openDialog('YOUR RANKED SQUAD',`<p class="section-note">Pick only from players you've unlocked. Your squad must contain 3 forwards, 3 midfielders, 4 defenders and 2 goalkeepers.</p><div class="rank-picker">${html}</div><div class="actions"><button class="secondary" id="cancelRankSquad">Cancel</button><button class="primary" id="saveRankSquad">Save squad</button></div>`);
}
function refreshRankPickerCounts(){
 for(const cat of ['F','M','D','G']){const count=document.querySelectorAll(`[data-rank-select][data-category="${cat}"]:checked`).length,required={F:3,M:3,D:4,G:2}[cat],el=document.querySelector(`[data-rank-count="${cat}"]`);if(el){el.textContent=`${count}/${required} selected`;el.classList.toggle('complete',count===required);el.classList.toggle('over',count>required)}}
}
async function startRanked(){
 if(!authToken||!accountUser){toast('Create an account or sign in to play Ranked and save your collection.');$('accountUsername').focus();return}
 if(!profile||!validRankSquad(profile.squad,profile.owned)){rankedSquadDialog();return}
 await start(true,false,'ranked',profile.squad);
}
function leave(){epoch++;code='';token='';state=null;lastSerialized='';lastPhase='';storage.clear();$('connection').hidden=true;render()}
const roleNames=()=>state.attacker===state.you?ATTACK_ROLES:DEFENSE_ROLES;
const ownPlayer=()=>({cards:state.cards,uses:state.uses});
function card(c,collection=false){
 const used=collection?0:state?.uses[c.id]||0,selected=!collection&&chosen.includes(c.id),must=!collection&&state?.required.includes(c.id),cap=state?.cap||3,armed=!collection&&activated.includes(c.id);
 const relevant=c.category==='G'?[['REF',c.stats.reflexes],['POS',c.stats.gk_positioning],['1V1',c.stats.one_on_one],['HAN',c.stats.handling],['PAC',c.stats.pace],['PAS',c.stats.passing]]:c.category==='D'?[['PAC',c.stats.pace],['TAC',c.stats.tackling],['MAR',c.stats.marking],['AWR',c.stats.awareness],['STR',c.stats.strength],['AIR',c.stats.aerial]]:[['FIN',c.stats.finishing],['PAC',c.stats.pace],['DRI',c.stats.dribbling],['PAS',c.stats.passing],['VIS',c.stats.vision],['COM',c.stats.composure]];
 const initials=c.name.split(/[\s-]+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('');
 return `<article draggable="${!collection&&!state?.submitted&&!busy?'true':'false'}" class="player-card ${c.category} ${selected?'selected':''} ${armed?'ability-glow':''} ${used>=cap?'exhausted':''}">${armed?`<span class="armed-float">✦ ARMED · UP TO +${c.ability==='control'?3:2}</span>${abilityEffectHTML()}`:''}<button class="card-select" data-action="${collection?'info':'choose'}" data-id="${c.id}" aria-label="${collection?'Inspect':selected?'Unselect':'Select'} ${esc(c.name)}" ${!collection?`aria-pressed="${selected}"`:''} ${!collection&&(state.submitted||used>=cap||busy)?'disabled':''}><div class="card-portrait"><span class="portrait-fallback" aria-hidden="true">${esc(initials)}</span><img src="${esc(c.photo.src)}" alt="${esc(c.name)}" loading="lazy" decoding="async"><div class="card-top"><span class="rating">${c.ovr}<small>${c.position}</small></span></div></div><div class="card-body">${must?'<span class="must">REQUIRED NOW</span>':''}<strong class="card-name">${esc(c.name)}</strong><span class="card-meta">${esc(c.nation)} / ${esc(c.peak)}</span><div class="mini-stats">${relevant.map(([k,v])=>`<span><b>${v}</b> ${k}</span>`).join('')}</div><div class="charges">${Array.from({length:cap},(_,i)=>`<span class="charge ${i<cap-used?'on':''}"></span>`).join('')}<em>${cap-used}/${cap} uses</em></div></div></button><div class="card-bottom"><button data-action="info" data-id="${c.id}">${esc(ABILITIES[c.ability].name)} ↗</button><span class="muted" aria-label="${!collection&&state?.spent.includes(c.id)?'Ability used':'Ability available'}">${!collection&&state?.spent.includes(c.id)?'✓ USED':armed?'✦ ARMED':'✦ READY'}</span></div></article>`;
}
function linksHTML(links){return links.map(l=>`<div class="links"><b>+${l.value}</b> ${esc(l.a)} + ${esc(l.b)}<br><small>${esc(l.reason)}</small></div>`).join('')}
function metrics(a,d,m){return `<div class="metrics"><div class="metric"><small>ATTACK</small><b>${fmt(a)}</b></div><div class="metric"><small>DEFENCE</small><b>${fmt(d)}</b></div><div class="metric"><small>MATCHUP</small><b>${signed(m)}</b></div></div>`}
function breakdown(h){return `${metrics(h.attack,h.defense,h.matchup)}<div class="math-row"><span>Weighted role stats / defensive stats</span><b>${fmt(h.attackBase)} / ${fmt(h.defenseBase)}</b></div><div class="math-row"><span>Chemistry · attack / defence</span><b>+${h.attackChem} / +${h.defChem}</b></div><div class="math-row"><span>Formation / defensive shape</span><b>${signed(h.attackShape)} / +${h.defShape}</b></div><div class="math-row"><span>Ability bonus · attack / defence</span><b>+${h.attackAbility} / +${h.defenseAbility}</b></div>${h.duels.map(d=>`<div class="math-row"><span>${esc(d.defender)} → ${esc(d.attacker)} (${d.role})</span><b>${signed(d.value)}</b></div>`).join('')}<div class="math-row"><span>Finisher vs goalkeeper matchup</span><b>${signed(h.keeperMatchup)}</b></div><div class="math-row"><span>Ability matchup bonus (total matchup capped ±6)</span><b>+${h.matchupAbility}</b></div><div class="math-row"><span>Attack − defence + matchup</span><b>${signed(h.margin)}</b></div>${h.abilities.map(a=>`<p class="section-note">✦ ${esc(a.player)} · ${esc(a.name)}: ${a.triggered?'+'+a.value+' '+a.target:'not triggered · USED'}.</p>`).join('')}`}
function history(){return `<aside><div class="panel"><p class="eyebrow">MATCH JOURNAL</p><h3>${state.mode==='penalties'?'One kick at a time.':'Every decision counts.'}</h3><div class="timeline">${state.history.length?[...state.history].reverse().map(h=>`<details class="event"><summary><b class="${h.goal?'goal':'save'}">${h.goal?'GOAL':'SAVED'}</b> · ${String(h.number).padStart(2,'0')}<br>${esc(state.players[h.attacker].name)} attacks · ${signed(h.margin)}</summary><p>${h.attackCards.map(c=>esc(c.name)).join(' / ')}<br>vs ${h.defenseCards.map(c=>esc(c.name)).join(' / ')}</p>${breakdown(h)}</details>`).join(''):`<p>${state.mode==='penalties'?'Follow each penalty and its result in the shootout panel.':'Your match story starts with the first possession.'}</p>`}</div></div><div class="panel"><p class="eyebrow">THE SMALL PRINT</p><p>${state.mode==='penalties'?'Shoot and save on alternating kicks. Your opponent cannot see your direction before both choices are locked.':'Lineups stay hidden until both managers lock in. Activating an ability spends it when the possession resolves, whether its trigger succeeds or fails.'}</p><p>${state.mode==='penalties'?'Five attempts each, then sudden death. Use all six takers before reusing one.':state.mode==='quick'?'Quick Match has no required-card rotation. Repeat a favourite while it still has a use.':'The must-play rule ensures every squad card completes its three uses by full time.'}</p><button class="text-button" data-action="squad">Inspect full squad →</button></div></aside>`}
function lineupView(cards,roles,abilityEvents=[]){return `<div class="slots">${cards.map((c,i)=>{const ev=abilityEvents.find(a=>a.id===c.id);const feedback=ev?`<span role="status" class="ability-feedback ${ev.triggered?'triggered':'untriggered'}">${ev.triggered?'+'+ev.value+' '+String(ev.target).toUpperCase():'NOT TRIGGERED · USED'}</span>`:'';return `<button class="slot filled" data-action="info" data-id="${c.id}"><small>${roles[i]}</small>${ev?.triggered?`<span class="ability-feedback triggered above-player-bonus">✦ +${ev.value} ${String(ev.target).toUpperCase()}</span>`:''}<span class="slot-player"><img src="${esc(c.photo.src)}" alt=""><span><strong>${esc(c.name)}</strong><span class="slot-score">${c.position} · ${c.ovr} OVR ↗</span></span></span>${ev&&!ev.triggered?feedback:''}</button>`}).join('')}</div>`}
function selection(){
 const attacking=state.you===state.attacker,kind=attacking?'attack':'defense',roles=roleNames(),locked=state.submitted;
 const ids=locked?state.ownLineup:chosen,cs=ids.map(id=>state.cards.find(c=>c.id===id));
 let preview=null,error='';if(cs.every(Boolean)){preview=(attacking?attack:defense)(cs,db.chemistry);try{validateLineup(ownPlayer(),ids,kind,state.cap||3)}catch(e){error=e.message}}
 return `<div class="panel"><div class="panel-title"><h2>${attacking?'Build your attack.':'Hold your ground.'}</h2><span class="badge">${attacking?'ATTACKING':'DEFENDING'}</span></div><p>${locked?'Lineup locked. Waiting for the other manager.':attacking?'Choose your three roles, then add players below. Drag players between roles to change their positions.':'Choose two defenders and a goalkeeper. You can drag to swap defensive roles; assign markers after both lineups are revealed.'}</p><div class="pitch"><div class="slots" aria-label="${attacking?'Attacking':'Defensive'} role slots">${roles.map((name,i)=>`<button class="slot ${slot===i&&!locked?'active':''} ${cs[i]?'filled':''} ${cs[i]&&!locked?'draggable-slot':''}" data-action="slot" data-slot="${i}" ${!locked&&!busy&&cs[i]?'draggable="true"':''} ${locked||busy?'disabled':''} aria-label="${cs[i]?' '+esc(cs[i].name)+' in '+name+'. Drag to move, or double-click to remove.':'Choose a player for '+name}" title="${cs[i]&&!locked?'Drag to another role to swap · double-click to remove':''}"><small>${i+1} / ${name}</small><strong>${cs[i]?esc(cs[i].name):'Choose player'}</strong><span class="slot-score">${cs[i]?fmt(attacking?roleScore(cs[i],i):i===2?gScore(cs[i]):dScore(cs[i]))+' role score':'+'}</span>${cs[i]&&!locked?'<span class="slot-hint">↔ DRAG / DOUBLE-CLICK TO REMOVE</span>':''}</button>`).join('')}</div></div>${!locked?'<p class="slot-help">Reorder: drag a player onto a role, or drag filled roles to swap them. On touch screens, tap two filled roles to swap them. Double-click (or tap twice quickly) a filled role or selected player to remove it.</p>':''}${!locked&&state.required.length?`<div class="callout">Must play now: ${state.required.map(id=>esc(state.cards.find(c=>c.id===id).name)).join(', ')}. These cards need every remaining turn to finish their uses.</div>`:''}${preview?`<div class="math-row"><span>Lineup strength before matchups and abilities</span><b>${fmt(preview.value)}</b></div><div class="math-row"><span>Weighted stats + chemistry + shape</span><b>${fmt(preview.base)} + ${preview.chemistry} ${signed(preview.shape)}</b></div><details><summary class="section-note">View chemistry links</summary>${linksHTML(preview.links)}</details>`:''}${error?`<div class="callout">${esc(error)}</div>`:''}${!locked?`<div class="ability-picks">${cs.filter(Boolean).map(c=>`<label title="${esc(ABILITIES[c.ability].text)}"><input type="checkbox" data-ability="${c.id}" ${activated.includes(c.id)?'checked':''} ${state.spent.includes(c.id)?'disabled':''}>${esc(c.name.split(' ').at(-1))} · ${state.spent.includes(c.id)?'used':activated.includes(c.id)?'ARMED · UP TO +'+(c.ability==='control'?3:2):esc(ABILITIES[c.ability].name)}</label>`).join('')}</div><p class="section-note">Activate an ability before locking. An armed badge appears on its card; after the move, see the exact bonus beside the player. Every attempt is consumed on resolution, even when its trigger fails.</p>`:''}<div class="actions"><button class="secondary" data-action="suggest" ${locked||busy?'disabled':''}>Suggest lineup</button><button class="quiet" data-action="clear" ${locked||busy?'disabled':''}>Clear</button><button class="primary" data-action="lock" ${locked||busy||!cs.every(Boolean)||error?'disabled':''}>${locked?'Locked · waiting':busy?'Sending…':'Lock in lineup →'}</button></div></div><section class="panel"><div class="panel-title"><h3>${attacking?'Your attacking pool':'Your defensive pool'}</h3><small>${locked?'Opponent '+(state.opponentSubmitted?'ready':'choosing'):'Assigning: '+roles[slot]}</small></div><div class="cards">${state.cards.filter(c=>attacking?['F','M'].includes(c.category):['D','G'].includes(c.category)).map(c=>card(c)).join('')}</div><p class="section-note">Choose a role, then a card. Click an assigned player again to remove them, or drag a player into a role.</p></section>`;
}
function marking(){
 const {attack:a,defense:d,activated:active}=state.revealed,defending=state.you!==state.attacker;
 const preview=defending&&marks[0]!==marks[1]?evaluate(a,d,marks,db.chemistry,active):null;
 return `<div class="panel"><p class="eyebrow">LINEUPS REVEALED</p><h2>${defending?'Choose your battles.':'The defence is reading your attack.'}</h2><p>${defending?'Assign each defender to a different attacker. The third attacker goes unmarked. Inspect any revealed card to compare attributes.':'Your opponent is choosing two markers. Your unmarked player still contributes their full role score.'}</p><h3>Attack</h3><div class="pitch">${lineupView(a,ATTACK_ROLES)}</div><h3>Defence</h3>${lineupView(d,DEFENSE_ROLES)}${defending?`<div class="marking-grid">${d.slice(0,2).map((c,i)=>`<label>${esc(c.name)} marks<select id="mark${i}" data-marker="${i}">${a.map((x,j)=>`<option value="${j}" ${marks[i]===j?'selected':''}>${ATTACK_ROLES[j]} · ${esc(x.name)}</option>`).join('')}</select></label>`).join('')}</div>${preview?`<div class="callout">Projected outcome: ${preview.goal?'GOAL':'DEFENCE HOLDS'} · margin ${signed(preview.margin)}. The same calculation resolves the possession.</div>`:'<div class="callout">Choose two different attackers.</div>'}<button class="primary" data-action="mark" ${!preview||busy?'disabled':''}>Confirm markers & resolve →</button>`:'<p class="callout">Waiting for the defending manager…</p>'}</div>`;
}
function penaltyReplay(){const shot=state.shootout?.history.at(-1);return shot?replayHTML({...shot,attackCards:[db.cards.find(c=>c.id===shot.takerId)],defenseCards:[db.cards.find(c=>c.id===shot.keeperId)]},state.match+':penalty:'+shot.number,true):''}
function result(){const h=state.last;return `<div class="panel"><p class="eyebrow">POSSESSION ${h.number} / ${state.turnLimit||12} · RESOLVED</p><h2 class="result-title ${h.goal?'':'save'}">${h.goal?'Back of the net.':'Defence holds.'}</h2><p>${esc(state.players[h.attacker].name)} ${h.goal?'scores':'is denied'}. ${h.goal?'A positive margin wins the attack.':'A zero or negative margin favours the defence.'}</p>${replayHTML(h,state.match+':possession:'+h.number)}<h3>Attackers</h3>${lineupView(h.attackCards,ATTACK_ROLES,h.abilities)}<h3>Defence</h3>${lineupView(h.defenseCards,DEFENSE_ROLES,h.abilities)}<details class="match-analysis"><summary>Match analysis · see why the move worked</summary>${breakdown(h)}</details><div class="actions"><small>${state.players[1-state.you].ready?'Opponent ready.':'Waiting for opponent to review.'}</small><button class="primary" data-action="next" ${state.players[state.you].ready||busy?'disabled':''}>${state.players[state.you].ready?'Ready · waiting':state.turn===(state.turnLimit||12)?'Continue to full time →':'Next possession →'}</button></div></div>`}
function penaltyOdds(shot){const goal=Math.round(shot.chance*100);return `${goal}% goal / ${100-goal}% save${shot.aim===shot.dive?' · Correct dive':''}`}
function penaltyHistory(){return [...state.shootout.history].reverse().map(shot=>`<div class="penalty-row"><b>KICK ${shot.number} / ${esc(state.players[shot.player].name)}</b><div><span class="${shot.goal?'goal':'save'}">${shot.goal?'● GOAL':'○ SAVED'}</span> · ${esc(shot.taker)} vs ${esc(shot.keeper)}<br><small>Shot ${shot.aim} / dive ${shot.dive} · ${penaltyOdds(shot)}</small></div></div>`).join('')}
function penaltyDuel(shot){return `<div class="penalty-duel">${[[shot.takerId,'TAKER'],[shot.keeperId,'KEEPER']].map(([id,role])=>{const c=db.cards.find(c=>c.id===id);return `<button class="penalty-player" data-action="info" data-id="${id}"><img src="${esc(c.photo.src)}" alt="${esc(c.name)}"><span><small>${role}</small><strong>${esc(c.name)}</strong></span></button>`}).join('')}</div>`}
function shootout(){
 const s=state.shootout,shooting=s.shooter===state.you;
 if(state.phase==='penalty-result'){
  const shot=s.history.at(-1);
  return `<div class="panel"><p class="eyebrow">PENALTY ${shot.number} / RESOLVED</p><h2 class="result-title ${shot.goal?'':'save'}">${shot.goal?'Goal.':'Saved.'}</h2><div class="penalty-score">${s.scores.join(' : ')}</div><p>${esc(state.players[shot.player].name)} ${shot.goal?'converts the penalty':'is denied from the spot'}. ${esc(state.players[s.shooter].name)} shoots next.</p>${penaltyReplay()}${penaltyDuel(shot)}<p class="section-note">Shot ${shot.aim} / dive ${shot.dive}. ${penaltyOdds(shot)}.</p><div class="actions"><small>${state.players[1-state.you].ready?'Opponent ready.':'Opponent reviewing the kick.'}</small><button class="primary" data-action="penalty-next" ${state.players[state.you].ready||busy?'disabled':''}>${state.players[state.you].ready?'Ready · waiting':'Next penalty →'}</button></div>${penaltyHistory()}</div>`;
 }
 const directions=`<option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>`;
 return `<div class="panel"><p class="eyebrow">${s.kick>10?'SUDDEN DEATH':'PENALTY SHOOTOUT'} / KICK ${s.kick}</p><h2>${shooting?'Your turn to shoot.':'Your turn to save.'}</h2><div class="penalty-score">${s.scores.join(' : ')}</div><p>${esc(state.players[s.shooter].name)} is taking this penalty. ${shooting?'Choose your taker and shot direction.':'Choose your goalkeeper and dive direction.'} Your choices stay hidden until both managers lock in.</p>${s.submitted?'<div class="callout">Choice locked. Waiting for the other manager.</div>':`<div class="penalty-form">${shooting?`<label>Penalty taker<select id="taker">${state.cards.filter(c=>['F','M'].includes(c.category)&&!s.used.includes(c.id)).map(c=>`<option value="${c.id}">${esc(c.name)} · FIN ${c.stats.finishing}</option>`).join('')}</select></label><label>Shot direction<select id="aim">${directions}</select></label>`:`<label>Goalkeeper<select id="keeper">${state.cards.filter(c=>c.category==='G').map(c=>`<option value="${c.id}">${esc(c.name)} · REF ${c.stats.reflexes}</option>`).join('')}</select></label><label>Dive direction<select id="dive">${directions}</select></label>`}</div><p class="section-note">Five attempts each, then sudden death with equal attempts. Normal uses are suspended. Rotate through all six takers before reusing one. A correct dive gives the keeper a 75–95% save chance, depending on player stats.</p><button class="primary" data-action="penalty" ${busy?'disabled':''}>${shooting?'Lock shot →':'Lock save →'}</button>`}${penaltyHistory()}</div>`;
}
function rankedReward(){
 const reward=profile?.latestReward;if(state.mode!=='ranked'||!reward||reward.match!==state.match)return '';
 const unlocked=(reward.unlocked||[]).map(id=>{const c=db.cards.find(x=>x.id===(typeof id==='string'?id:id.id));return c?`<div class="reward-card"><img src="${esc(c.photo.src)}" alt=""><span><b>${esc(c.name)}</b><small>${esc(c.position)} · ${c.ovr} OVR · NEW PLAYER</small></span></div>`:''}).join('');
 const mvp=db.cards.find(c=>c.id===reward.mvpCardId);
 const missions=(reward.missions||[]).map(m=>`<span class="mission complete">✓ ${esc(m.name)} · +${m.xp} XP</span>`).join('');
 const achievements=(reward.achievements||[]).map(a=>`<span class="achievement"><b>🏅 ${esc(a.name)}</b><small>${esc(a.description)}</small></span>`).join('');
 return `<section class="rank-reward"><p class="eyebrow">RANKED MATCH REWARDS</p><div class="reward-numbers"><div><small>XP EARNED</small><b>+${reward.xp}</b></div><div><small>RATING CHANGE</small><b class="${reward.rating>=0?'positive':'negative'}">${reward.rating>0?'+':''}${reward.rating}</b></div><div><small>WIN STREAK</small><b>${profile.streak||0}</b></div></div>${mvp?`<h3>Player of the Match</h3><div class="mvp-card"><img src="${esc(mvp.photo.src)}" alt=""><span><b>${esc(mvp.name)}</b><small>${mvp.position} · ${mvp.ovr} OVR · MATCH MVP</small></span></div>`:''}${unlocked?`<h3>New players unlocked!</h3><div class="reward-cards">${unlocked}</div>`:'<p class="section-note">Keep playing ranked matches to earn XP and unlock more players for your collection.</p>'}${missions?`<h3>Daily missions completed</h3><div class="daily-missions">${missions}</div>`:''}${achievements?`<h3>New achievements</h3><div class="achievement-grid">${achievements}</div>`:''}<p class="section-note">Your collection, level, rating and match record are saved to your account.</p><button class="text-button" data-action="home">View your club and collection →</button></section>`;
}

function ended(){const detail=state.mode==='penalties'?'Penalty shootout complete.':state.mode==='quick'?'Quick match complete. Your players can be used again in another match.': 'Tactical match complete. Every card completed its three uses.';return `<div class="panel"><p class="eyebrow">FINAL WHISTLE</p><h2 class="result-title">${state.winner===state.you?'Victory is yours.':'A lesson for next time.'}</h2><p>${esc(state.players[state.winner].name)} wins ${state.mode==='penalties'?state.shootout.scores.join('–')+' on penalties':state.players.map(p=>p.score).join('–')+(state.shootout?' ('+state.shootout.scores.join('–')+' on penalties)':'')}. ${detail}</p>${rankedReward()}<div class="actions"><button class="primary" data-action="rematch" ${state.players[state.you].rematch||busy?'disabled':''}>${state.players[state.you].rematch?'Rematch requested · waiting':'Fresh squads. Play again →'}</button><button class="secondary" data-action="home">Back to dugout</button></div>${state.shootout?penaltyReplay()+penaltyHistory():''}</div>`}
function render(){
 $('home').hidden=!!state;$('match').hidden=!state;if(!state){renderProfile();return;}
 const p=state.players,limit=state.turnLimit||12,phase=state.stage==='lobby'?'WAITING FOR RIVAL':state.stage==='ended'?'FULL TIME':state.stage==='shootout'?'PENALTIES':`POSSESSION ${Math.min(limit,state.turn+(state.phase==='result'?0:1))} / ${limit}`;
 const scoreboard=`<div class="matchbar"><span>${p.some(x=>x?.bot)?(state.mode==='ranked'?'RANKED VS COACH':'PRACTICE'):'PRIVATE ROOM'}${state.mode==='penalties'?' / PENALTIES ONLY':state.mode==='quick'?' / QUICK MATCH':state.mode==='ranked'?' / YOUR COLLECTION':''} <strong>${state.code}</strong></span><span>${phase}</span><button class="quiet" data-action="leave">Leave match ↗</button></div><div class="scoreboard"><div class="team">${esc(p[0].name)}${state.you===0?' <small>YOU</small>':'<small>RIVAL</small>'}</div><div class="scoreline">${state.mode==='penalties'&&state.shootout?state.shootout.scores[0]:p[0].score} : ${state.mode==='penalties'&&state.shootout?state.shootout.scores[1]:p[1]?.score??0}<small>${state.stage==='lobby'?'THE STAGE IS SET':p[state.first]?.name===undefined?'':esc(p[state.first].name)+' WON THE COIN TOSS'}</small></div><div class="team">${esc(p[1]?.name||'Your rival')}${state.you===1?'<small>YOU</small>':'<small>'+ (p[1]?.bot?'PRACTICE OPPONENT':'RIVAL')+'</small>'}</div></div><div class="progress" ${state.mode==='penalties'?'hidden':''} aria-label="${state.turn} of ${limit} possessions completed">${Array.from({length:limit},(_,i)=>`<span class="${i<state.turn?'done':i===state.turn?'current':''}"></span>`).join('')}</div>`;
 if(state.stage==='lobby'){
  $('match').innerHTML=scoreboard+`<div class="panel lobby"><p class="eyebrow">YOUR SQUAD IS READY</p><h2>A worthy rival awaits.</h2><p>${state.mode==='penalties'?'Penalties only: take turns shooting and saving. ':state.mode==='quick'?'Quick match: six possessions and two uses per card. ':''}Share this code with a friend on another device or in another browser tab.</p><div class="room-code">${state.code}</div><div class="invite"><input id="invite" aria-label="Invitation link" readonly value="${esc(location.origin+'/?room='+state.code)}"><button class="secondary" data-action="copy">Copy invite</button></div><button class="text-button" data-action="squad">Inspect your 12-card squad →</button><p class="section-note">Rooms expire after two hours of inactivity. A server restart clears active matches.</p></div>`;return;
 }
 const previousReplay=$('match').querySelector('.match-replay');
 const animationTimes=previousReplay?[...previousReplay.querySelectorAll('*')].flatMap(el=>el.getAnimations().map(a=>({el,name:a.animationName,time:a.currentTime}))):[];
 $('match').innerHTML=scoreboard+`<div class="match-layout"><div>${state.stage==='ended'?ended():state.stage==='shootout'?shootout():state.phase==='result'?result():state.phase==='marking'?marking():selection()}</div>${history()}</div>`;
 const nextReplay=$('match').querySelector('.match-replay');
 if(previousReplay&&nextReplay&&previousReplay.dataset.replayKey===nextReplay.dataset.replayKey){nextReplay.replaceWith(previousReplay);for(const {el,name,time} of animationTimes){const a=el.getAnimations().find(a=>a.animationName===name);if(a&&time!==null)a.currentTime=time}}
 for(const [id,value] of Object.entries(penaltyDraft)){if($(id))$(id).value=value}
}
function openDialog(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('detail').open)$('detail').showModal()}
function info(id){
 const c=db.cards.find(c=>c.id===id);if(!c)return;
 const stats=Object.entries(c.stats).filter(([k])=>c.category==='G'?['reflexes','gk_positioning','one_on_one','handling','passing','pace'].includes(k):!['reflexes','gk_positioning','one_on_one','handling'].includes(k));
 const relevant=state?state.cards.filter(x=>x.id!==id):[];
 const links=relevant.flatMap(x=>chemistryLinks([c,x],db.chemistry)).filter(x=>x.value);
 openDialog('PLAYER FILE / '+c.position,`<div class="player-file">${card(c,true)}<div><p class="eyebrow">${esc(c.nation)} / PEAK ${esc(c.peak)}</p><h2>${esc(c.name)}</h2><span class="badge">${c.ovr} OVR · GAME DESIGN RATING</span><h3>✦ ${esc(ABILITIES[c.ability].name)}</h3><p class="section-note">${esc(ABILITIES[c.ability].text)} Activate before reveal. Every attempt is consumed when the possession resolves, whether its trigger succeeds or fails.</p>${profile?.owned?.includes(c.id)?`<h3>Card mastery</h3><div class="math-row"><span>Mastery level</span><b>${profile.mastery?.[c.id]?.level||1}</b></div><div class="math-row"><span>Mastery XP · match appearances</span><b>${profile.mastery?.[c.id]?.xp||0} · ${profile.mastery?.[c.id]?.appearances||0}</b></div><div class="math-row"><span>Goals · defensive stops</span><b>${profile.mastery?.[c.id]?.goals||0} · ${profile.mastery?.[c.id]?.defensiveStops||0}</b></div>`:''}${['F','M'].includes(c.category)?`<div class="math-row"><span>Finisher / Creator / Runner</span><b>${[0,1,2].map(i=>fmt(roleScore(c,i))).join(' / ')}</b></div>`:''}<div class="full-stats">${stats.map(([key,v])=>`<div class="math-row"><span>${key.replaceAll('_',' ')}</span><b>${v}</b></div>`).join('')}</div></div></div><p class="photo-credit">Photo: ${esc(c.photo.author)} · <a href="${esc(c.photo.source)}" target="_blank" rel="noopener noreferrer">Original</a> · <a href="${esc(c.photo.licenseUrl||c.photo.source)}" target="_blank" rel="noopener noreferrer">${esc(c.photo.license)}</a>. ${esc(c.photo.changes)}</p><h3>Shared-playing history in this collection</h3><p class="section-note">${c.connections.map(x=>esc(x.team)+' '+esc(x.from)+'–'+esc(x.to)).join(' · ')||'No curated windows yet.'}</p>${links.length?'<h3>Links with your squad</h3>'+linksHTML(links):''}<p class="section-note">${esc(db.notice)}</p>`);
}
function library(squad=false){
 const cards=squad&&state?state.cards.filter(c=>state.mode!=='penalties'||c.category!=='D'):db.cards;
 openDialog(squad?'YOUR SQUAD / '+cards.length+' CARDS':'PLAYER COLLECTION / '+db.cards.length+' CARDS',`<div class="library-tools"><input id="searchPlayers" aria-label="Search players" placeholder="Search player, nation or position"><select id="filterPlayers" aria-label="Filter position"><option value="all">All positions</option><option value="F">Forwards</option><option value="M">Midfielders</option><option value="D">Defenders</option><option value="G">Goalkeepers</option></select></div><p class="section-note">${esc(db.notice)}</p><div class="cards collection" id="collection"></div>`);
 const update=()=>{const q=$('searchPlayers').value.toLowerCase(),cat=$('filterPlayers').value;const filtered=cards.filter(c=>(cat==='all'||c.category===cat)&&[c.name,c.nation,c.position].join(' ').toLowerCase().includes(q));$('collection').innerHTML=filtered.length?filtered.map(c=>`<div class="collection-item">${card(c,true)}${profile?.owned.includes(c.id)?`<span class="collection-status owned">OWNED · LV ${profile.mastery?.[c.id]?.level||1}</span>`:'<span class="collection-status locked">LOCKED</span>'}</div>`).join(''):'<p>No players match that search.</p>'};
 $('searchPlayers').oninput=update;$('filterPlayers').onchange=update;update();
}
function rules(){openDialog('THE PLAYBOOK',`<h2>Outthink the other manager.</h2><ol class="rule-list"><li><b>Choose your mode.</b> Quick Match has 6 possessions and a 2-use cap, Tactical Match has 12 possessions and the original 3-use rotation, and Ranked is a 12-possession collection-only season against Coach AI. Penalties only starts directly at the shootout.</li><li><b>Balanced squads.</b> Each manager receives 3 forwards, 3 midfielders, 4 defenders and 2 goalkeepers. No duplicate players. A coin toss chooses who attacks first.</li><li><b>Choose your pace.</b> Quick Match is six possessions with two uses per card and no forced rotation. Tactical Match is twelve possessions with three uses and the original must-play rotation.</li><li><b>Three attacking roles.</b> Finisher: 45% finishing, 25% positioning, 20% composure, 10% pace. Creator: 35% passing, 30% vision, 20% dribbling, 15% control. Runner: 40% pace, 30% dribbling, 20% off-ball, 10% physicality.</li><li><b>Natural roles and shape.</b> ST/CF gets +2 Finisher and −2 Creator; LW/RW +2 Runner; CAM/CM −2 Finisher and +2 Creator; CDM −3 Finisher, +1 Creator, −2 Runner. A natural striker–midfielder–winger trio in those roles gets +3 shape; three identical positions get −3.</li><li><b>Defend with two defenders and a keeper.</b> Defender stats: 30% pace, 25% tackling, 25% marking, 20% awareness. Keeper stats: 40% reflexes, 25% positioning, 20% one-on-one, 15% handling. A centre-back plus full-back gets +2 shape.</li><li><b>Chemistry.</b> Curated shared-playing links score +1 or +2. Three attacking pair links sum to at most +4; the defensive pair gets at most +2. Card peak years do not restrict career chemistry. Missing links give zero.</li><li><b>Mark after the reveal.</b> Each defender marks a different attacker; one stays unmarked. Role-specific stat differences, aerial and physical duels, and the keeper matchup produce a modifier capped at ±6.</li><li><b>Special abilities.</b> Each player can attempt their ability once per match. Activate before locking; the attempt is consumed when the possession resolves, whether the condition succeeds or fails. The replay glows around the player who attempted it. Successful triggers show the exact +2/+3; failed triggers show NOT TRIGGERED · USED.</li><li><b>A transparent outcome.</b> Attack = 40% Finisher + 35% Creator + 25% Runner + chemistry + shape + abilities. Defence = 27.5% each defender + 45% keeper + chemistry + shape + abilities. Attack − defence + matchup greater than zero scores. Ties favour defence. No random rolls during normal play.</li><li><b>Full time and penalties.</b> Most goals wins. A tie goes to alternating penalties, one kick at a time. The shooter chooses a taker and aim; the defender chooses a keeper and dive. Review each result, then swap roles. There are five attempts each, early clinching, then sudden death only after equal attempts. Penalties include chance; a correct dive gives the keeper a 75–95% save chance (85% with equal stats). Finishing and composure face reflexes and positioning to decide the exact odds. Use all six takers before reusing one. Normal uses and abilities do not apply.</li><li><b>Ranked progression.</b> Ranked matches use only your account's 12 owned players. Create an account to save XP, rating, records, streaks, daily missions, prize spins, packs, achievements and card mastery in the database. Ranked currently uses Coach AI opponents; human-vs-human ranked matchmaking is a separate future addition.</li><li><b>Reconnect.</b> Reload this tab to resume. Temporary network failures retain your session. Rooms are held in server memory and expire after two inactive hours or a restart.</li></ol>`)}
function rolesForSlot(index){return roleNames()[index]||'role'}
function validDropForSlot(id,index){
 const c=state.cards.find(x=>x.id===id);if(!c)return false;
 const attacking=state.attacker===state.you;
 return attacking?['F','M'].includes(c.category):(index===2?c.category==='G':c.category==='D');
}
function applySlotDrop(payload,target){
 if(!payload||!Number.isInteger(target)||target<0||target>2||state.submitted||busy)return;
 const next=[...chosen];
 if(payload.kind==='slot'){
  const source=payload.index;if(!Number.isInteger(source)||source<0||source>2||source===target||!next[source])return;
  [next[source],next[target]]=[next[target],next[source]];
 }else if(payload.kind==='card'){
  const id=payload.id,c=state.cards.find(x=>x.id===id);if(!c||!validDropForSlot(id,target)){toast('That player cannot fill this role.');return}
  if((state.uses[id]||0)>=(state.cap||3)){toast('That player has used all available turns.');return}
  const required=state.required||[];const existing=next.indexOf(id);
  if(existing>=0){[next[existing],next[target]]=[next[target],next[existing]]}
  else next[target]=id;
 }else return;
 const required=state.required||[];if(required.some(requiredId=>!next.includes(requiredId))){toast('Keep every required player in the lineup.');return}
 if(next.some((id,i)=>id&&!validDropForSlot(id,i))){toast('Keep players in a role they are eligible to play.');return}
 chosen=next;activated=activated.filter(id=>chosen.includes(id));slot=target;pendingSwapSlot=null;lastSlotTap=null;render();
}
$('match').addEventListener('dragstart',e=>{
 const role=e.target.closest('.pitch .slot.draggable-slot[draggable="true"]');
 const poolCard=e.target.closest('.cards .player-card');
 const cardButton=poolCard?.querySelector('button.card-select[data-action="choose"]');
 let payload=null;
 if(role)payload={kind:'slot',index:Number(role.dataset.slot)};
 else if(cardButton&&!cardButton.disabled)payload={kind:'card',id:cardButton.dataset.id};
 if(!payload||!e.dataTransfer)return;
 e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',JSON.stringify(payload));
 (role||poolCard).classList.add('dragging');
});
$('match').addEventListener('dragover',e=>{
 const target=e.target.closest('.pitch .slot');if(!target||state?.submitted||busy)return;
 e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='move';target.classList.add('drag-over');
});
$('match').addEventListener('dragleave',e=>{const target=e.target.closest('.pitch .slot');if(target&&!target.contains(e.relatedTarget))target.classList.remove('drag-over')});
$('match').addEventListener('drop',e=>{
 const target=e.target.closest('.pitch .slot');if(!target)return;
 e.preventDefault();target.classList.remove('drag-over');skipSlotClickUntil=Date.now()+500;
 try{const payload=JSON.parse(e.dataTransfer?.getData('text/plain')||'null');applySlotDrop(payload,Number(target.dataset.slot))}catch{toast('Could not move that player. Please try again.')}
});
$('match').addEventListener('dragend',e=>{
 $('match').querySelectorAll('.dragging,.drag-over').forEach(el=>el.classList.remove('dragging','drag-over'));
 skipSlotClickUntil=Date.now()+350;
});

$('match').addEventListener('dblclick',e=>{
 const button=e.target.closest('button.card-select[data-action="choose"]');if(!button||button.disabled)return;
 const id=button.dataset.id,index=chosen.indexOf(id);if(index<0)return;
 chosen[index]=null;activated=activated.filter(x=>chosen.includes(x));slot=index;pendingSwapSlot=null;lastSlotTap=null;render();toast(`${state.cards.find(c=>c.id===id)?.name||'Player'} removed from the lineup.`);
});

$('match').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;const a=b.dataset.action;if(Date.now()<skipSlotClickUntil&&(a==='slot'||a==='choose'))return;
 if(a==='replay'){const replay=b.closest('.match-replay');replay.replaceWith(replay.cloneNode(true));return}
 if(a==='info')return info(b.dataset.id);if(a==='squad')return library(true);
 if(a==='home')return leave();if(a==='leave'){if(confirm('Leave this match? Your opponent will be left waiting.'))leave();return}
 if(a==='copy'){try{await navigator.clipboard.writeText($('invite').value);toast('Invitation copied.')}catch{toast('Select and copy the invitation link.')}return}
 if(a==='slot'){
  if(Date.now()<skipSlotClickUntil)return;
  lastPoolTap=null;const idx=Number(b.dataset.slot),now=Date.now();
  if(chosen[idx]&&lastSlotTap?.index===idx&&now-lastSlotTap.at<450){
   const removed=chosen[idx];chosen[idx]=null;activated=activated.filter(x=>chosen.includes(x));slot=idx;pendingSwapSlot=null;lastSlotTap=null;render();toast(`${state.cards.find(c=>c.id===removed)?.name||'Player'} removed from ${rolesForSlot(idx)}.`);return;
  }
  if(pendingSwapSlot!==null&&pendingSwapSlot!==idx&&chosen[pendingSwapSlot]&&chosen[idx]){
   const from=pendingSwapSlot,swapped=[...chosen];[swapped[from],swapped[idx]]=[swapped[idx],swapped[from]];
   if(swapped.some((id,i)=>id&&!validDropForSlot(id,i))){pendingSwapSlot=null;lastSlotTap=null;slot=idx;render();toast('Those players cannot swap into each other’s roles.');return}
   chosen=swapped;slot=idx;pendingSwapSlot=null;lastSlotTap=null;render();toast('Players swapped. Their abilities stay with their cards.');return;
  }
  slot=idx;pendingSwapSlot=chosen[idx]?idx:null;lastSlotTap={index:idx,at:now};render();return;
 }
 if(a==='clear'){chosen=[null,null,null];activated=[];slot=0;pendingSwapSlot=null;lastSlotTap=null;lastPoolTap=null;render();return}
 if(a==='choose'){
  pendingSwapSlot=null;lastSlotTap=null;
  const id=b.dataset.id,now=Date.now(),c=state.cards.find(c=>c.id===id),attacking=state.attacker===state.you;
  // A fast second tap/click on the same pool card is a deliberate clear,
  // not a second selection after the first click removed it.
  if(lastPoolTap?.id===id&&now-lastPoolTap.at<500){
   const already=chosen.indexOf(id);
   if(already>=0){chosen[already]=null;slot=already;activated=activated.filter(x=>chosen.includes(x));}
   lastPoolTap=null;render();toast(`${c?.name||'Player'} is unselected.`);return
  }
  lastPoolTap={id,at:now};
  if(!attacking&&((slot===2)!==(c.category==='G'))){slot=c.category==='G'?2:chosen[0]?1:0}
  const previous=chosen.indexOf(id);
  if(previous>=0){chosen[previous]=null;slot=previous}
  else {chosen[slot]=id;const empty=chosen.indexOf(null);if(empty>=0)slot=empty}
  activated=activated.filter(x=>chosen.includes(x));render();return;
 }
 if(a==='suggest'){
  lastPoolTap=null;const kind=state.attacker===state.you?'attack':'defense';const options=lineups(ownPlayer(),kind,state.cap||3).sort((a,b)=>(kind==='attack'?attack:defense)(b,db.chemistry).value-(kind==='attack'?attack:defense)(a,db.chemistry).value);
  chosen=options[0].map(c=>c.id);activated=[];render();return;
 }
 if(a==='lock')return action('play',{ids:chosen,activated});
 if(a==='mark')return action('mark',{marks});
 if(a==='next')return action('next');
 if(a==='rematch')return action('rematch');
 if(a==='penalty-next')return action('penalty-next',{kick:state.shootout.kick});
 if(a==='penalty')return action('penalty',{kick:state.shootout.kick,...(state.shootout.shooter===state.you?{taker:$('taker').value,aim:$('aim').value}:{keeper:$('keeper').value,dive:$('dive').value})});
});
$('match').addEventListener('change',e=>{
 if(['taker','keeper','aim','dive'].includes(e.target.id))penaltyDraft[e.target.id]=e.target.value;
 if(e.target.dataset.ability){const id=e.target.dataset.ability;activated=e.target.checked?[...new Set([...activated,id])]:activated.filter(x=>x!==id);render()}
 if(e.target.dataset.marker!==undefined){marks[Number(e.target.dataset.marker)]=Number(e.target.value);render()}
});
$('dialogBody').addEventListener('click',e=>{const b=e.target.closest('[data-action="info"]');if(b)info(b.dataset.id)});
$('closeDialog').onclick=()=>$('detail').close();$('libraryButton').onclick=()=>library();$('rulesButton').onclick=rules;
$('dialogBody').addEventListener('change',e=>{if(!e.target.matches('[data-rank-select]'))return;const cat=e.target.dataset.category,required={F:3,M:3,D:4,G:2}[cat],selected=[...document.querySelectorAll(`[data-rank-select][data-category="${cat}"]:checked`)];if(selected.length>required){e.target.checked=false;toast(`Choose exactly ${required} ${cat==='G'?'goalkeepers':cat==='D'?'defenders':cat==='F'?'forwards':'midfielders'}.`)}refreshRankPickerCounts()});
$('dialogBody').addEventListener('click',async e=>{if(e.target.id==='cancelRankSquad'){$('detail').close();return}if(e.target.id==='saveRankSquad'){const ids=[...document.querySelectorAll('[data-rank-select]:checked')].map(x=>x.dataset.rankSelect);if(!validRankSquad(ids,profile.owned)){toast('Choose exactly 3 forwards, 3 midfielders, 4 defenders and 2 goalkeepers.');return}try{const saved=await api('profile/squad',{authToken,squad:ids});profile=saved.profile;renderProfile();$('detail').close();toast('Ranked squad saved to your account.')}catch(error){toast(error.message)}}if(e.target.id==='dailyRewardDone'||e.target.id==='packDone')$('detail').close()});
$('create').onclick=()=>start(false,false);$('join').onclick=()=>start(false,true);$('practice').onclick=()=>start(true,false);$('editRankedSquad').onclick=rankedSquadDialog;$('rankedPlay').onclick=startRanked;$('signIn').onclick=()=>authAction('login');$('register').onclick=()=>authAction('register');$('signOut').onclick=signOut;$('spinDaily').onclick=spinDaily;$('openPack').onclick=openPlayerPack;
$('joinCode').value=new URLSearchParams(location.search).get('room')||'';
try{const response=await fetch('/api/cards');if(!response.ok)throw Error('Cannot load the player collection. Reload to try again.');db=await response.json();ensureProfile();if(authToken)await loadAccount();const saved=storage.get();if(saved?.code&&saved?.token){code=saved.code;token=saved.token;await poll()}}catch(e){toast(e.message)}
render();setInterval(poll,1800);
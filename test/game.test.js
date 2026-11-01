import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {db,draft,newRoom,player,select,mark,advance,penalty,nextPenalty,startShootout,snapshot,runBot,createApp,database,persistRankedResult} from '../game-server.js';
import {dbInternals} from '../database.js';
import {attack,defense,evaluate,roleScore,lineups,requiredCards,validateLineup,penaltyChance} from '../public/engine.js';
const card=id=>structuredClone(db.cards.find(c=>c.id===id));
test('PostgreSQL DATE values are sent back as ISO calendar dates',()=>{
 assert.equal(dbInternals.dateKey(new Date('2026-11-01T00:00:00.000Z')),'2026-11-01');
 assert.equal(dbInternals.dateKey('2026-11-01'),'2026-11-01');
});
const sum=cs=>cs.reduce((s,c)=>s+c.ovr,0);
function two(){const r=newRoom('A',true);r.players[1].bot=false;return r}

test('all 50 cards have distinct identities, bounded complete stats and abilities',()=>{
 assert.equal(db.cards.length,50);assert.equal(new Set(db.cards.map(c=>c.name)).size,50);
 for(const c of db.cards){assert.ok(c.ability);assert.ok(c.peak);assert.ok(c.nation);for(const n of Object.values(c.stats))assert.ok(Number.isFinite(n)&&n>=0&&n<=100)}
 assert.equal(db.chemistry['B01:P02'],undefined,'Ronaldo and Mbappe do not get a same-club/different-era link');
 assert.equal(db.chemistry['A01:A02'].value,2);
});
test('drafts preserve category counts, unique players and bounded group strength',()=>{
 for(let t=0;t<1000;t++){
  const squads=draft();assert.equal(new Set(squads.flat().map(c=>c.id)).size,24);
  for(const [cat,n] of [['F',3],['M',3],['D',4],['G',2]]){
   const a=squads.map(s=>s.filter(c=>c.category===cat));a.forEach(s=>assert.equal(s.length,n));
   assert.ok(Math.abs(sum(a[0])-sum(a[1]))<=8);
  }
  assert.ok(Math.abs(sum(squads[0])-sum(squads[1]))<=8);
 }
});
test('weighted scores, caps and formation bonuses apply exactly once',()=>{
 const a=[card('A03'),card('A04'),card('A01')],d=[card('A07'),card('A09'),card('A11')];
 const A=attack(a,db.chemistry),D=defense(d,db.chemistry);
 assert.equal(A.shape,3);assert.ok(A.chemistry<=4);assert.equal(D.shape,2);
 assert.equal(A.value,.4*roleScore(a[0],0)+.35*roleScore(a[1],1)+.25*roleScore(a[2],2)+A.chemistry+3);
 const r=evaluate(a,d,[0,2],db.chemistry);assert.ok(Math.abs(r.matchup)<=6);assert.ok(Math.abs(r.margin-(r.attack-r.defense+r.matchup))<.003);
 const identical=Array.from({length:3},()=>card('A03'));assert.equal(attack(identical,{}).shape,-3);
});
test('zero margin favours defence; changing a marker changes the pace duel',()=>{
 const a=[card('A03'),card('A04'),card('A01')],d=[card('A07'),card('A09'),card('A11')];
 for(const c of [...a,...d]){Object.keys(c.stats).forEach(k=>c.stats[k]=80);c.position='X'}
 a.forEach((c,i)=>c.position='X'+i);
 const result=evaluate(a,d,[0,1],{});assert.ok(Math.abs(result.margin)<.001);assert.equal(result.goal,false);
 a[2].stats.pace=99;d[0].stats.pace=65;d[1].stats.pace=98;
 assert.ok(evaluate(a,d,[2,0],{}).matchup>evaluate(a,d,[0,2],{}).matchup);
});
test('abilities fire only on their stated conditions and stay within the matchup cap',()=>{
 const a=[card('A03'),card('P09'),card('P02')],d=[card('P16'),card('P18'),card('P23')];
 const base=evaluate(a,d,[0,1],{}),boost=evaluate(a,d,[0,1],{},['P09','P02','P23']);
 assert.equal(boost.attackAbility,2);assert.equal(boost.defenseAbility,2);assert.equal(boost.matchupAbility,2);
 assert.equal(boost.abilities.length,3);assert.ok(boost.matchup<=6);assert.equal(boost.attack,base.attack+2);
 const fail=evaluate([a[1],a[0],a[2]],d,[0,1],{},['P09']);assert.equal(fail.abilities[0].triggered,false);
});
test('lineups reject duplicates, wrong positions, foreign and exhausted cards',()=>{
 const r=two(),p=r.players[0],valid=lineups(p,'attack')[0].map(c=>c.id);
 assert.throws(()=>validateLineup(p,[valid[0],valid[0],valid[2]],'attack'));
 assert.throws(()=>validateLineup(p,r.players[1].cards.slice(0,3).map(c=>c.id),'attack'));
 assert.throws(()=>validateLineup(p,p.cards.filter(c=>c.category==='D').slice(0,3).map(c=>c.id),'defense'));
 p.uses[valid[0]]=3;assert.throws(()=>validateLineup(p,valid,'attack'));
});
test('must-play rule prevents the original exhausted-roster deadlock',()=>{
 const p=player('Test');p.cards=['A01','A02','A03','A04','A05','A06'].map(card);
 p.cards.forEach((c,i)=>p.uses[c.id]=[0,1,1,2,2,3][i]);
 const ids=p.cards.slice(1,4).map(c=>c.id);
 assert.deepEqual(requiredCards(p,'attack'),[p.cards[0].id]);
 assert.throws(()=>validateLineup(p,ids,'attack'),/now/);
});
test('500 entire matches always finish with every card used three times',()=>{
 for(let n=0;n<500;n++){
  const r=two();
  for(let turn=0;turn<12;turn++){
   const ai=(r.first+r.turn)%2;
   for(const idx of [ai,1-ai]){const options=lineups(r.players[idx],idx===ai?'attack':'defense');assert.ok(options.length);const ids=options[(n+turn)%options.length].map(c=>c.id);select(r,idx,{ids})}
   const hidden=snapshot(r,ai);assert.ok(hidden.revealed);mark(r,1-ai,[turn%3,(turn+1)%3]);advance(r);
  }
  r.players.forEach(p=>p.cards.forEach(c=>assert.equal(p.uses[c.id],3)));
  assert.ok(['ended','shootout'].includes(r.stage));assert.equal(r.history.length,12);
 }
});
test('secrets stay hidden; abilities are consumed only when their triggers succeed',()=>{
 const r=two();r.first=0;
 r.players[0].cards=['A03','A01','P02','P09','A04','A05','A07','A09','A10','P17','P24','A12'].map(card);
 r.players[1].cards=['A02','B01','P01','P10','A06','B04','P16','P18','B07','B08','P23','P25'].map(card);
 const ai=0,di=1,ids=['P09','A03','P02'],defIds=['P16','P18','P23'];
 select(r,ai,{ids,activated:ids});assert.equal(snapshot(r,di).revealed,null);assert.equal(snapshot(r,di).ownLineup,null);
 assert.throws(()=>select(r,ai,{ids}));select(r,di,{ids:defIds,activated:defIds});
 assert.throws(()=>mark(r,ai,[0,1]));assert.throws(()=>mark(r,di,[1,1]));mark(r,di,[0,1]);
 const events=r.last.abilities;
 for(const id of ids){const event=events.find(e=>e.id===id);assert.ok(event);assert.equal(r.players[ai].spent.includes(id),event.triggered)}
 for(const id of defIds){const event=events.find(e=>e.id===id);assert.ok(event);assert.equal(r.players[di].spent.includes(id),event.triggered)}
 assert.ok(events.some(e=>!e.triggered),'at least one activated ability should demonstrate a failed condition');
 assert.ok(events.some(e=>e.triggered&&e.value===2),'at least one activated ability should provide visible +2 feedback');
});

test('quick matches use a 2-use cap without mandatory rotation and finish in six possessions',()=>{
 const r=newRoom('Quick',true,'quick');r.players[1].bot=false;assert.equal(r.cap,2);assert.equal(r.turnLimit,6);
 for(let turn=0;turn<6;turn++){
  const attacker=(r.first+r.turn)%2;
  for(const idx of [attacker,1-attacker]){
   const kind=idx===attacker?'attack':'defense',options=lineups(r.players[idx],kind,r.cap);
   assert.ok(options.length);select(r,idx,{ids:options[(turn+idx)%options.length].map(c=>c.id)});
  }
  mark(r,1-attacker,[turn%3,(turn+1)%3]);advance(r);
 }
 assert.equal(r.history.length,6);assert.ok(['ended','shootout'].includes(r.stage));
 for(const p of r.players)for(const uses of Object.values(p.uses))assert.ok(uses<=2);
});

test('ranked squads contain exactly the owned 3F / 3M / 4D / 2GK roster',()=>{
 const ids=['F','M','D','G'].flatMap(cat=>db.cards.filter(c=>c.category===cat).slice(0,({F:3,M:3,D:4,G:2})[cat]).map(c=>c.id));
 const r=newRoom('Ranked',true,'ranked',{squad:ids,difficulty:'rookie'});
 assert.equal(r.mode,'ranked');assert.equal(r.turnLimit,12);assert.equal(r.difficulty,'rookie');assert.deepEqual(r.players[0].cards.map(c=>c.id),ids);
 assert.throws(()=>newRoom('Ranked',true,'ranked',{squad:ids.slice(1)}),/exactly 12/);
 assert.throws(()=>newRoom('Ranked',true,'ranked',{squad:Array(12).fill('A01')}),/12 different owned/);
 assert.equal(newRoom('Ranked',true,'ranked',{squad:ids,difficulty:'impossible'}).difficulty,'pro');
});

test('completed Ranked results persist once and return MVP/reward data to the client',async()=>{
 const ids=['F','M','D','G'].flatMap(cat=>db.cards.filter(c=>c.category===cat).slice(0,({F:3,M:3,D:4,G:2})[cat]).map(c=>c.id));
 const r=newRoom('Ranked',true,'ranked',{squad:ids});r.rankAccount={id:42,player:0};r.players[0].accountId=42;r.stage='ended';r.phase='ended';r.winner=0;r.match='ranked-match-once';r.players[0].score=3;r.players[1].score=1;
 r.history=[{attacker:0,goal:true,attackCards:[r.players[0].cards[0],r.players[0].cards[3],r.players[0].cards[1]],defenseCards:[r.players[1].cards[6],r.players[1].cards[7],r.players[1].cards[10]],abilities:[{id:r.players[0].cards[0].id,triggered:true,value:2}]}];
 let calls=0,received;
 const store={recordRankedResult:async(account,match,result)=>{calls++;received={account,match,result};return {profile:{username:'manager',xp:110,rating:1024},reward:{match,xp:110,rating:24,mvpCardId:result.mvpCardId}}}};
 const first=await persistRankedResult(r,store),second=await persistRankedResult(r,store);
 assert.equal(calls,1);assert.equal(received.account.id,42);assert.equal(received.match,'ranked-match-once');assert.equal(received.result.won,true);assert.ok(received.result.mvpCardId);assert.ok(received.result.cardMastery.length>=3);assert.equal(received.result.cardMastery.find(x=>x.cardId===r.players[0].cards[0].id).goals,1);assert.equal(first.reward.match,'ranked-match-once');assert.equal(second.reward.match,'ranked-match-once');assert.equal(r.rankResultPersistedMatch,'ranked-match-once');
});

test('ranked Coach AI match completes with the selected collection squad and preserves it on rematch',()=>{
 const ids=['F','M','D','G'].flatMap(cat=>db.cards.filter(c=>c.category===cat).slice(0,({F:3,M:3,D:4,G:2})[cat]).map(c=>c.id));
 const r=newRoom('Ranked',true,'ranked',{squad:ids,difficulty:'rookie'}),human=r.players[0],owned=human.cards.map(c=>c.id);
 let guard=0;
 while(r.stage!=='ended'&&guard++<100){
  if(r.stage==='playing'){
   runBot(r);const attacker=(r.first+r.turn)%2;
   if(r.phase==='select'){
    const kind=attacker===0?'attack':'defense',opts=lineups(human,kind,r.cap);assert.ok(opts.length);
    select(r,0,{ids:opts[0].map(c=>c.id)});runBot(r);
   }
   if(r.phase==='marking'){
    if(attacker!==0)mark(r,0,[0,1]);runBot(r);
   }
   if(r.phase==='result'){advance(r);runBot(r)}
  }else if(r.stage==='shootout'){
   runBot(r);
   if(r.phase==='penalty'&&!human.penalty){penalty(r,0,shotChoices(r,0));runBot(r)}
   if(r.phase==='penalty-result'){nextPenalty(r,0);runBot(r)}
  }
 }
 assert.ok(guard<100,'ranked match should complete');assert.equal(r.turn,12);
 if(r.stage==='ended'&&!r.shootout)human.cards.forEach(c=>assert.equal(human.uses[c.id],3));
 assert.deepEqual(human.cards.map(c=>c.id),owned);
});
function shootoutRoom(){const r=two();r.first=0;startShootout(r);return r}
function shotChoices(r,idx){
 const p=r.players[idx],shooter=(r.shootout.first+r.shootout.history.length)%2;
 return idx===shooter?{taker:p.cards.find(c=>['F','M'].includes(c.category)&&!r.shootout.used[idx].includes(c.id)).id,aim:'left'}:{keeper:p.cards.find(c=>c.category==='G').id,dive:'right'};
}
function kick(r,goal){penalty(r,0,shotChoices(r,0));penalty(r,1,shotChoices(r,1),()=>goal?0:1)}
function nextKick(r){nextPenalty(r,0);nextPenalty(r,1)}

test('correct penalty dives give 75–95% save odds across all card matchups and directions',()=>{
 const directions=['left','center','right'];
 for(const taker of db.cards.filter(c=>['F','M'].includes(c.category)))for(const keeper of db.cards.filter(c=>c.category==='G')){
  for(const aim of directions)for(const dive of directions){
   const chance=penaltyChance(taker,keeper,aim,dive);
   if(aim===dive){
    assert.ok(chance>=.05&&chance<=.25);
    assert.ok(chance<penaltyChance(taker,keeper,aim,directions.find(x=>x!==aim)));
   }else assert.ok(chance>=.25&&chance<=.95);
  }
 }
});

test('penalty stats affect odds in the right direction and remain bounded at extreme values',()=>{
 const taker={stats:{finishing:90,composure:90}},keeper={stats:{reflexes:90,gk_positioning:90}};
 assert.equal(penaltyChance(taker,keeper,'left','left'),.15);
 assert.equal(penaltyChance(taker,keeper,'left','right'),.76);
 for(const aim of ['left','center','right'])for(const dive of ['left','center','right']){
  const base=penaltyChance(taker,keeper,aim,dive);
  for(const stat of ['finishing','composure'])assert.ok(penaltyChance({stats:{...taker.stats,[stat]:100}},keeper,aim,dive)>base);
  for(const stat of ['reflexes','gk_positioning'])assert.ok(penaltyChance(taker,{stats:{...keeper.stats,[stat]:100}},aim,dive)<base);
 }
 for(const strength of [0,100]){
  const t={stats:{finishing:strength,composure:strength}},k={stats:{reflexes:100-strength,gk_positioning:100-strength}};
  assert.equal(penaltyChance(t,k,'center','center'),strength===0?.05:.25);
 }
});

test('server uses the stronger correct-dive odds for either shooter and submission order',()=>{
 for(const shooter of [0,1])for(const direction of ['left','center','right'])for(const [roll,goal] of [[.1,true],[.15,false],[.2,false]]){
  const r=shootoutRoom();r.shootout.first=shooter;
  const taker=structuredClone(r.players[shooter].cards.find(c=>c.category==='F'));
  const keeper=structuredClone(r.players[1-shooter].cards.find(c=>c.category==='G'));
  taker.stats.finishing=taker.stats.composure=keeper.stats.reflexes=keeper.stats.gk_positioning=90;
  r.players[shooter].cards=[taker];r.players[1-shooter].cards=[keeper];
  const choices=[{},{}];choices[shooter]={taker:taker.id,aim:direction};choices[1-shooter]={keeper:keeper.id,dive:direction};
  penalty(r,0,choices[0],()=>roll);penalty(r,1,choices[1],()=>roll);
  const shot=snapshot(r,shooter).shootout.history[0];
  assert.equal(shot.chance,.15);assert.equal(shot.goal,goal);
  assert.equal(r.shootout.scores[shooter],Number(goal));assert.equal(r.phase,'penalty-result');
 }
});

test('penalties resolve one kick, keep choices hidden and swap shooter after result acknowledgement',()=>{
 const r=shootoutRoom();
 assert.equal(snapshot(r,0).shootout.shooter,0);
 assert.throws(()=>penalty(r,0,{keeper:r.players[0].cards.find(c=>c.category==='G').id,dive:'left'}));
 assert.throws(()=>penalty(r,1,{taker:r.players[1].cards[0].id,aim:'left'}));
 penalty(r,0,shotChoices(r,0));
 assert.equal(snapshot(r,1).shootout.opponentSubmitted,true);assert.equal(JSON.stringify(snapshot(r,1)).includes('"aim"'),false);
 assert.throws(()=>penalty(r,0,shotChoices(r,0)),/locked/);
 penalty(r,1,shotChoices(r,1),()=>0);
 assert.equal(r.shootout.history.length,1);assert.deepEqual(r.shootout.attempts,[1,0]);assert.deepEqual(r.shootout.scores,[1,0]);
 assert.equal(r.phase,'penalty-result');assert.throws(()=>penalty(r,0,shotChoices(r,0)));
 nextPenalty(r,0);assert.equal(r.phase,'penalty-result');nextPenalty(r,1);
 assert.equal(r.phase,'penalty');assert.equal(snapshot(r,0).shootout.shooter,1);
 kick(r,false);assert.deepEqual(r.shootout.attempts,[1,1]);assert.equal(r.shootout.history.length,2);
});

test('five-penalty early clinching is correct with unequal attempts',()=>{
 const r=shootoutRoom();
 for(let i=0;i<6;i++){kick(r,i%2===0);if(i<5)nextKick(r)}
 assert.equal(r.stage,'ended');assert.equal(r.winner,0);assert.deepEqual(r.shootout.attempts,[3,3]);assert.deepEqual(r.shootout.scores,[3,0]);
});

test('sudden death always gives the second shooter their reply and rotates six takers',()=>{
 const r=shootoutRoom();
 for(let i=0;i<10;i++){kick(r,true);nextKick(r)}
 assert.equal(r.stage,'shootout');assert.deepEqual(r.shootout.scores,[5,5]);
 assert.equal(r.shootout.used[0].length,5);
 const oldId=r.shootout.used[0][0];assert.throws(()=>penalty(r,0,{taker:oldId,aim:'left'}),/unused/);
 kick(r,true);assert.equal(r.stage,'shootout','cannot win before the opponent replies');assert.equal(r.shootout.used[0].length,0);
 nextKick(r);kick(r,false);assert.equal(r.stage,'ended');assert.equal(r.winner,0);assert.deepEqual(r.shootout.attempts,[6,6]);
});

test('penalty-only practice starts directly in a shootout and AI handles only its current role',()=>{
 const r=newRoom('Human',true,'penalties');assert.equal(r.stage,'shootout');assert.equal(r.turn,0);assert.equal(r.history.length,0);
 runBot(r);assert.equal(!!r.players[1].penalty,true);
 const shooter=r.shootout.first;
 assert.deepEqual(Object.keys(r.players[1].penalty).sort(),shooter===1?['aim','taker']:['dive','keeper']);
 penalty(r,0,shotChoices(r,0),()=>0);runBot(r);assert.equal(r.phase,'penalty-result');assert.equal(r.shootout.history.length,1);
 nextPenalty(r,0);runBot(r);assert.equal(r.phase,'penalty');assert.equal(snapshot(r,0).shootout.shooter,1-shooter);
});

test('every player has a local WebP portrait and source/license credits',async()=>{
 for(const c of db.cards){
  assert.match(c.photo.src,/^\/players\/[A-Z][0-9]{2}\.webp$/);assert.match(c.photo.source,/^https:\/\/commons.wikimedia.org\//);assert.ok(c.photo.author);assert.ok(c.photo.license);
  const bytes=await readFile(new URL('../public'+c.photo.src,import.meta.url));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});

test('practice opponent progresses through a full match',()=>{
 const r=newRoom('Human',true);runBot(r);
 while(r.stage==='playing'){
  if(r.phase==='select'){const ids=lineups(r.players[0],r.first===r.turn%2?'attack':'defense')[0].map(c=>c.id);select(r,0,{ids});runBot(r)}
  if(r.phase==='marking'){mark(r,0,[0,1]);runBot(r)}
  if(r.phase==='result'){advance(r);runBot(r)}
 }
 assert.equal(r.turn,12);
});
test('account starter collection has a valid owned Ranked squad and database routes fail clearly when unconfigured',async()=>{
 const starter=dbInternals.starterCardIds(db.cards);assert.equal(starter.length,12);assert.equal(new Set(starter).size,12);assert.equal(dbInternals.validSquad(starter,starter,db.cards),true);
 const bad=[...starter];bad[0]=db.cards.find(c=>c.category==='G').id;assert.equal(dbInternals.validSquad(bad,starter,db.cards),false);
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,b)=>{const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:response.status,body:await response.json()}};
 try{
  const quick=await post('create',{name:'Quick',practice:true,mode:'quick',difficulty:'rookie'});assert.equal(quick.status,200);assert.equal(quick.body.state.cap,2);assert.equal(quick.body.state.turnLimit,6);assert.equal(quick.body.state.difficulty,'rookie');
  const tactical=await post('create',{name:'Tactical',practice:true,mode:'full'});assert.equal(tactical.status,200);assert.equal(tactical.body.state.cap,3);assert.equal(tactical.body.state.turnLimit,12);
  if(!database){const ranked=await post('create',{name:'Ranked',practice:true,mode:'ranked',squad:starter});assert.equal(ranked.status,503);assert.match(ranked.body.error,/DATABASE_URL/);assert.equal((await post('auth/register',{username:'test_user',password:'correct-horse-battery'})).status,503)}
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('HTTP room lifecycle, authentication, stale actions, reconnect, and full two-player match',async()=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,b)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:r.status,body:await r.json()}};
 try{
  assert.equal((await fetch(base+'/health')).status,200);
  const created=(await post('create',{name:'<script>alert(1)</script>'})).body,a={code:created.code,token:created.token},joined=(await post('join',{code:a.code,name:'B'})).body,b={code:joined.code,token:joined.token};
  assert.equal((await post('join',{code:a.code})).status,409);
  assert.equal((await post('state',{code:a.code,token:'bad'})).status,403);
  assert.equal((await post('play',{code:a.code,token:a.token,ids:[]})).status,409);
  const actors=[a,b].map(({code,token})=>({code,token}));let state=(await post('state',actors[0])).body;
  for(let n=0;n<12;n++){
   const ai=state.attacker;
   for(const idx of [0,1]){
    const who=actors[idx],own=(await post('state',who)).body;
    const ids=lineups({cards:own.cards,uses:own.uses},idx===ai?'attack':'defense')[0].map(c=>c.id);
    const response=await post('play',{...who,match:own.match,turn:own.turn,ids});assert.equal(response.status,200);state=response.body;
   }
   let response=await post('mark',{...actors[1-ai],match:state.match,turn:state.turn,marks:[0,1]});assert.equal(response.status,200);state=response.body;
   for(const who of actors){response=await post('next',{...who,match:state.match,turn:state.turn});assert.equal(response.status,200);state=response.body}
  }
  assert.equal(state.turn,12);assert.equal(state.history.length,12);assert.ok(['ended','shootout'].includes(state.stage));
  const restored=(await post('state',actors[0])).body;assert.equal(restored.turn,12);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('HTTP penalty-only rooms join directly, reject stale kicks and retain mode for rematches',async()=>{
 const server=createApp();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,b)=>{const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:response.status,body:await response.json()}};
 try{
  const a=(await post('create',{name:'A',mode:'penalties'})).body;assert.equal(a.state.stage,'lobby');
  const b=(await post('join',{name:'B',code:a.code})).body;assert.equal(b.state.stage,'shootout');assert.equal(b.state.mode,'penalties');
  const who=[a,b].map(({code,token})=>({code,token}));let state=b.state;let iterations=0;
  while(state.stage!=='ended'){
   assert.ok(++iterations<100,'shootout should end');
   const initial=state.shootout.kick;
   for(const idx of [0,1]){
    const own=(await post('state',who[idx])).body,shooter=own.shootout.shooter;
    const choices=idx===shooter?{taker:own.cards.find(c=>['F','M'].includes(c.category)&&!own.shootout.used.includes(c.id)).id,aim:'left'}:{keeper:own.cards.find(c=>c.category==='G').id,dive:'right'};
    const result=await post('penalty',{...who[idx],match:own.match,turn:own.turn,kick:initial,...choices});assert.equal(result.status,200);state=result.body;
   }
   assert.equal(state.shootout.history.length,initial);
   if(state.stage!=='ended'){
    for(const idx of [0,1]){const result=await post('penalty-next',{...who[idx],match:state.match,turn:state.turn,kick:initial});assert.equal(result.status,200);state=result.body}
    const stale=await post('penalty',{...who[0],match:state.match,turn:state.turn,kick:initial});assert.equal(stale.status,400);
   }
  }
  const oldMatch=state.match;
  for(const idx of [0,1]){const result=await post('rematch',{...who[idx],match:state.match,turn:state.turn});assert.equal(result.status,200);state=result.body}
  assert.equal(state.mode,'penalties');assert.equal(state.stage,'shootout');assert.notEqual(state.match,oldMatch);assert.equal(state.shootout.history.length,0);
  const image=await fetch(base+db.cards[0].photo.src);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
  assert.equal((await fetch(base+'/players/../server.js')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve))}
});


test('home UI includes the daily spin, player packs, missions, leaderboard, achievements and collection account panel',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 for(const id of ['dailyWheel','spinDaily','openPack','dailyMissions','weeklyLeaderboard','achievementGrid','rankedPlay','editRankedSquad'])assert.match(html,new RegExp(`id=\"${id}\"`));
 assert.match(app,/Player of the Match/);assert.match(app,/PACK OPENING/);assert.match(html,/Spin the wheel/);
 assert.match(app,/data-action=\"slot\"/);assert.match(app,/draggable=\"true\"/);assert.match(app,/tap twice quickly/i);
 assert.match(app,/lastPoolTap\?\.id===id/);assert.match(app,/is unselected/);assert.match(app,/database-backed/);
});
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {db,draft,newRoom,player,select,mark,advance,penalty,nextPenalty,startShootout,snapshot,runBot,createApp} from '../game-server.js';
import {attack,defense,evaluate,roleScore,lineups,requiredCards,validateLineup} from '../public/engine.js';
const card=id=>structuredClone(db.cards.find(c=>c.id===id));
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
test('secrets stay hidden, abilities cannot be reused, marking is defender-only',()=>{
 const r=two(),ai=r.first,di=1-ai,ids=lineups(r.players[ai],'attack')[0].map(c=>c.id);
 select(r,ai,{ids,activated:ids});assert.equal(snapshot(r,di).revealed,null);assert.equal(snapshot(r,di).ownLineup,null);
 assert.throws(()=>select(r,ai,{ids}));select(r,di,{ids:lineups(r.players[di],'defense')[0].map(c=>c.id)});
 assert.throws(()=>mark(r,ai,[0,1]));assert.throws(()=>mark(r,di,[1,1]));mark(r,di,[0,1]);
 ids.forEach(id=>assert.ok(r.players[ai].spent.includes(id)));
});
function shootoutRoom(){const r=two();r.first=0;startShootout(r);return r}
function shotChoices(r,idx){
 const p=r.players[idx],shooter=(r.shootout.first+r.shootout.history.length)%2;
 return idx===shooter?{taker:p.cards.find(c=>['F','M'].includes(c.category)&&!r.shootout.used[idx].includes(c.id)).id,aim:'left'}:{keeper:p.cards.find(c=>c.category==='G').id,dive:'right'};
}
function kick(r,goal){penalty(r,0,shotChoices(r,0));penalty(r,1,shotChoices(r,1),()=>goal?0:1)}
function nextKick(r){nextPenalty(r,0);nextPenalty(r,1)}

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

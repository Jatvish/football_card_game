import test from 'node:test';
import assert from 'node:assert/strict';
import {db,draft,newRoom,player,select,mark,advance,penalty,snapshot,runBot,createApp} from '../game-server.js';
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
test('shootout clinches early, hides choices, rotates takers, and resolves sudden death',()=>{
 const r=two();r.stage='shootout';r.shootout={scores:[0,0],history:[],used:[[],[]]};
 const submit=(idx,random)=>{const p=r.players[idx];return penalty(r,idx,{taker:p.cards.find(c=>['F','M'].includes(c.category)&&!r.shootout.used[idx].includes(c.id)).id,keeper:p.cards.find(c=>c.category==='G').id,aim:'left',dive:'right'},random)};
 submit(0);assert.equal(snapshot(r,1).shootout.opponentSubmitted,true);assert.equal(JSON.stringify(snapshot(r,1)).includes('"aim"'),false);
 let sample=0;submit(1,()=>sample++%2===0?0:1);
 for(let i=0;i<2;i++){submit(0);let n=0;submit(1,()=>n++===0?0:1)}
 assert.equal(r.stage,'ended');assert.equal(r.winner,0);assert.equal(r.shootout.history.length,3);
 const t=two();t.stage='shootout';t.shootout={scores:[5,5],history:Array(5).fill([]),used:[[],[]]};
 for(let idx=0;idx<2;idx++){const p=t.players[idx];let n=0;penalty(t,idx,{taker:p.cards[0].id,keeper:p.cards.find(c=>c.category==='G').id,aim:'center',dive:'left'},()=>n++===0?0:1)}
 assert.equal(t.stage,'ended');assert.equal(t.winner,0);
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
  const a=(await post('create',{name:'<script>alert(1)</script>'})).body,b=(await post('join',{code:a.code,name:'B'})).body;
  assert.equal((await post('join',{code:a.code})).status,409);
  assert.equal((await post('state',{code:a.code,token:'bad'})).status,403);
  assert.equal((await post('play',{code:a.code,token:a.token,ids:[]})).status,409);
  const actors=[a,b];let state=(await post('state',a)).body;
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
  const restored=(await post('state',a)).body;assert.equal(restored.turn,12);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

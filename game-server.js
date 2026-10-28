import http from 'node:http';
import {randomBytes,randomInt} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {attack,defense,evaluate,lineups,requiredCards,validateLineup,clamp} from './public/engine.js';
const root=dirname(fileURLToPath(import.meta.url));
export const db=JSON.parse(await readFile(join(root,'data/players.json'),'utf8'));
const byId=new Map(db.cards.map(c=>[c.id,c]));
const sum=cs=>cs.reduce((s,c)=>s+c.ovr,0),token=()=>randomBytes(24).toString('hex');
function draftOnce(){
 const squads=[[],[]];
 for(const [category,count] of [['F',3],['M',3],['D',4],['G',2]]){
  const pool=db.cards.filter(c=>c.category===category);
  for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]]}
  const dealt=pool.slice(0,count*2).sort((a,b)=>b.ovr-a.ovr),groups=[[],[]];
  for(let i=0;i<dealt.length;i+=2){
   const delta=sum(groups[0])-sum(groups[1]);
   const lower=delta===0?(sum(squads[0])===sum(squads[1])?randomInt(2):sum(squads[0])<sum(squads[1])?0:1):delta<0?0:1;
   groups[lower].push(dealt[i]);groups[1-lower].push(dealt[i+1]);
  }
  squads.forEach((s,i)=>s.push(...groups[i]));
 }
 return squads;
}
export function draft(){
 for(let trial=0;trial<1000;trial++){
  const squads=draftOnce();
  const gaps=['F','M','D','G'].map(cat=>Math.abs(sum(squads[0].filter(c=>c.category===cat))-sum(squads[1].filter(c=>c.category===cat))));
  if(Math.abs(sum(squads[0])-sum(squads[1]))<=8&&gaps.every(g=>g<=8))return squads;
 }
 throw Error('Unable to deal a balanced squad. Please retry.');
}
export function player(name,bot=false){return {name:String(name||'Manager').trim().slice(0,24)||'Manager',token:token(),bot,cards:[],uses:{},spent:[],lineup:null,activated:[],score:0,ready:false,rematch:false,penalty:null}}
export function newRoom(name,practice=false,mode='full'){
 if(!['full','penalties'].includes(mode))throw Error('Choose a valid game mode.');
 const squads=draft(),players=[player(name),practice?player('Coach AI',true):null];
 players[0].cards=squads[0];if(players[1])players[1].cards=squads[1];
 const room={mode,code:randomBytes(3).toString('hex').toUpperCase(),match:token(),players,reserve:squads[1],first:randomInt(2),turn:0,stage:practice?'playing':'lobby',phase:'select',history:[],last:null,winner:null,shootout:null,lastSeen:Date.now()};
 if(practice&&mode==='penalties')startShootout(room);
 return room;
}
export function startShootout(r){
 r.stage='shootout';r.phase='penalty';r.shootout={first:r.first,scores:[0,0],attempts:[0,0],history:[],used:[[],[]]};
 r.players.forEach(p=>{p.penalty=null;p.ready=false});
}
const attackingIndex=r=>(r.first+r.turn)%2;
export function snapshot(r,idx){
 const p=r.players[idx],op=r.players[1-idx],ai=attackingIndex(r),kind=idx===ai?'attack':'defense';
 return {mode:r.mode,code:r.code,match:r.match,you:idx,turn:r.turn,stage:r.stage,phase:r.phase,attacker:ai,first:r.first,
  players:r.players.map(x=>x?{name:x.name,score:x.score,ready:x.ready,rematch:x.rematch,bot:x.bot}:null),
  cards:p.cards,uses:p.uses,spent:p.spent,submitted:!!p.lineup,opponentSubmitted:!!op?.lineup,ownLineup:p.lineup,ownActivated:p.activated,
  required:r.stage==='playing'&&r.phase==='select'?requiredCards(p,kind):[],
  revealed:r.phase==='marking'?{attack:r.players[ai].lineup.map(id=>byId.get(id)),defense:r.players[1-ai].lineup.map(id=>byId.get(id)),activated:r.players.flatMap(p=>p.activated)}:null,
  history:r.history,last:r.last,winner:r.winner,
  shootout:r.shootout?{round:Math.floor(r.shootout.history.length/2)+1,kick:r.shootout.history.length+(r.phase==='penalty-result'?0:1),shooter:(r.shootout.first+r.shootout.history.length)%2,attempts:r.shootout.attempts,scores:r.shootout.scores,history:r.shootout.history,submitted:!!p.penalty,opponentSubmitted:!!op.penalty,used:r.shootout.used[idx]}:null,
  squadTotals:r.players.map(x=>x?sum(x.cards):null)};
}
export function select(r,idx,b){
 if(r.stage!=='playing'||r.phase!=='select')throw Error('Card selection is closed.');
 const p=r.players[idx];if(p.lineup)throw Error('Your lineup is already locked.');
 validateLineup(p,b.ids,idx===attackingIndex(r)?'attack':'defense');
 const activated=b.activated||[];
 if(!Array.isArray(activated)||new Set(activated).size!==activated.length||activated.some(id=>!b.ids.includes(id)||p.spent.includes(id)))throw Error('Activate only selected cards with an unused ability.');
 p.lineup=[...b.ids];p.activated=[...activated];if(r.players.every(p=>p.lineup))r.phase='marking';
}
export function mark(r,idx,marks){
 if(r.stage!=='playing'||r.phase!=='marking'||idx===attackingIndex(r))throw Error('It is not your marking phase.');
 if(!Array.isArray(marks)||marks.length!==2||marks.some(x=>!Number.isInteger(x)||x<0||x>2)||marks[0]===marks[1])throw Error('Mark two different attackers.');
 const ai=attackingIndex(r),a=r.players[ai],d=r.players[1-ai];
 const A=a.lineup.map(id=>byId.get(id)),D=d.lineup.map(id=>byId.get(id));
 const result=evaluate(A,D,marks,db.chemistry,[...a.activated,...d.activated]);
 if(result.goal)a.score++;
 for(const p of [a,d]){for(const id of p.lineup)p.uses[id]=(p.uses[id]||0)+1;p.spent.push(...p.activated);p.ready=false}
 r.last={number:r.turn+1,attacker:ai,...result,attackCards:A,defenseCards:D,marks};
 r.history.push(r.last);r.turn++;r.phase='result';
}
export function advance(r){
 r.players.forEach(p=>{p.lineup=null;p.activated=[];p.ready=false});
 if(r.turn===12){
  if(r.players.some(p=>p.cards.some(c=>p.uses[c.id]!==3)))throw Error('Roster accounting invariant failed.');
  if(r.players[0].score===r.players[1].score)startShootout(r);
  else {r.stage='ended';r.phase='ended';r.winner=r.players[0].score>r.players[1].score?0:1}
 }else r.phase='select';
}
export function penalty(r,idx,b,random=()=>randomInt(1000000)/1000000){
 if(r.stage!=='shootout'||r.phase!=='penalty')throw Error('No penalty selection in progress.');
 const p=r.players[idx],s=r.shootout,shooter=(s.first+s.history.length)%2;
 if(p.penalty)throw Error('Your penalty choice is already locked.');
 if(idx===shooter){
  const taker=p.cards.find(c=>c.id===b.taker&&['F','M'].includes(c.category));
  if(!taker||s.used[idx].includes(taker.id))throw Error('Choose an eligible unused penalty taker.');
  if(!['left','center','right'].includes(b.aim))throw Error('Choose a shot direction.');
  p.penalty={taker,aim:b.aim};
 }else{
  const keeper=p.cards.find(c=>c.id===b.keeper&&c.category==='G');
  if(!keeper)throw Error('Choose your goalkeeper.');
  if(!['left','center','right'].includes(b.dive))throw Error('Choose a dive direction.');
  p.penalty={keeper,dive:b.dive};
 }
 if(!r.players.every(x=>x.penalty))return;
 const a=r.players[shooter].penalty,d=r.players[1-shooter].penalty;
 const quality=.55*a.taker.stats.finishing+.45*a.taker.stats.composure,save=.55*d.keeper.stats.reflexes+.45*d.keeper.stats.gk_positioning;
 const chance=clamp(.76+(quality-save)/200-(a.aim===d.dive?.32:0),.25,.95),goal=random()<chance;
 if(goal)s.scores[shooter]++;
 s.attempts[shooter]++;s.used[shooter].push(a.taker.id);
 s.history.push({number:s.history.length+1,player:shooter,taker:a.taker.name,keeper:d.keeper.name,takerId:a.taker.id,keeperId:d.keeper.id,aim:a.aim,dive:d.dive,chance,goal});
 if(s.used[shooter].length===6)s.used[shooter]=[];
 r.players.forEach(x=>{x.penalty=null;x.ready=false});r.phase='penalty-result';
 const remaining=s.attempts.map(n=>Math.max(0,5-n));
 const early=Math.max(...s.attempts)<=5&&(s.scores[0]>s.scores[1]+remaining[1]||s.scores[1]>s.scores[0]+remaining[0]);
 const sudden=s.attempts[0]>=5&&s.attempts[0]===s.attempts[1]&&s.scores[0]!==s.scores[1];
 if(early||sudden){r.stage='ended';r.phase='ended';r.winner=s.scores[0]>s.scores[1]?0:1}
}
export function nextPenalty(r,idx){
 if(r.stage!=='shootout'||r.phase!=='penalty-result')throw Error('No penalty result to continue from.');
 r.players[idx].ready=true;
 if(r.players.every(p=>p.ready)){r.phase='penalty';r.players.forEach(p=>p.ready=false)}
}
export function runBot(r){
 const idx=r.players.findIndex(p=>p?.bot);if(idx<0)return;const p=r.players[idx];
 if(r.stage==='playing'){
  if(r.phase==='select'&&!p.lineup){
   const kind=idx===attackingIndex(r)?'attack':'defense';
   // Own squad only: never read the human's hidden lineup.
   const options=lineups(p,kind).map(cs=>({cs,value:(kind==='attack'?attack:defense)(cs,db.chemistry).value})).sort((a,b)=>b.value-a.value);
   const ids=options[0].cs.map(c=>c.id);select(r,idx,{ids,activated:ids.filter(id=>!p.spent.includes(id))});
  }
  if(r.phase==='marking'&&idx!==attackingIndex(r)){
   const a=r.players[1-idx].lineup.map(id=>byId.get(id)),d=p.lineup.map(id=>byId.get(id)),choices=[];
   for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(i!==j)choices.push([i,j]);
   choices.sort((x,y)=>evaluate(a,d,x,db.chemistry,r.players.flatMap(x=>x.activated)).margin-evaluate(a,d,y,db.chemistry,r.players.flatMap(x=>x.activated)).margin);
   mark(r,idx,choices[0]);
  }
  if(r.phase==='result')p.ready=true;
 }
 if(r.stage==='shootout'){
  if(r.phase==='penalty-result')p.ready=true;
  else if(r.phase==='penalty'&&!p.penalty){
   const shooter=(r.shootout.first+r.shootout.history.length)%2;
   if(idx===shooter){
    const candidates=p.cards.filter(c=>['F','M'].includes(c.category)&&!r.shootout.used[idx].includes(c.id)).sort((a,b)=>b.stats.finishing-a.stats.finishing);
    penalty(r,idx,{taker:candidates[0].id,aim:['left','center','right'][randomInt(3)]});
   }else penalty(r,idx,{keeper:p.cards.find(c=>c.category==='G').id,dive:['left','center','right'][randomInt(3)]});
   if(r.phase==='penalty-result')p.ready=true;
  }
 }
}
export function createApp(){
 const rooms=new Map(),limits=new Map();
 const cleanup=setInterval(()=>{for(const [c,r] of rooms)if(Date.now()-r.lastSeen>7200000)rooms.delete(c);for(const [ip,v] of limits)if(Date.now()-v.start>60000)limits.delete(ip)},60000);cleanup.unref();
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
 const body=async req=>{let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>12000)throw Error('Request too large.');chunks.push(chunk)}const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid request.');return value};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/health')return json(res,200,{ok:true,version:'2.1',cards:db.cards.length,rooms:rooms.size});
   if(path==='/api/cards'&&req.method==='GET')return json(res,200,db);
   if(path.startsWith('/api/')){
    if(req.method!=='POST')return json(res,405,{error:'Use POST.'});
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Cross-origin request rejected.'});
    const b=await body(req);
    if(path==='/api/create'){
     const ip=req.socket.remoteAddress,now=Date.now();let limit=limits.get(ip);
     if(!limit||now-limit.start>60000){limit={start:now,count:0};limits.set(ip,limit)}
     if(++limit.count>30||rooms.size>=1000)return json(res,429,{error:'Room limit reached. Try again shortly.'});
     const r=newRoom(b.name,b.practice===true,b.mode||'full');while(rooms.has(r.code))r.code=randomBytes(3).toString('hex').toUpperCase();rooms.set(r.code,r);runBot(r);
     return json(res,200,{code:r.code,token:r.players[0].token,state:snapshot(r,0)});
    }
    const r=rooms.get(String(b.code||'').trim().toUpperCase());if(!r)return json(res,404,{error:'Room expired or server restarted. Create a new match.'});
    if(path==='/api/join'){
     if(r.players[1])return json(res,409,{error:'This room already has two players.'});
     const p=player(b.name);p.cards=r.reserve;r.players[1]=p;if(r.mode==='penalties')startShootout(r);else r.stage='playing';r.lastSeen=Date.now();return json(res,200,{code:r.code,token:p.token,state:snapshot(r,1)});
    }
    const idx=r.players.findIndex(p=>p&&!p.bot&&p.token===b.token);if(idx<0)return json(res,403,{error:'Invalid room session.'});r.lastSeen=Date.now();
    if(path==='/api/state')return json(res,200,snapshot(r,idx));
    if(b.match!==r.match||b.turn!==r.turn)return json(res,409,{error:'The match moved on. Your screen is refreshing.'});
    if(path==='/api/play')select(r,idx,b);
    else if(path==='/api/mark')mark(r,idx,b.marks);
    else if(path==='/api/next'){
     if(r.phase!=='result')throw Error('No result to continue from.');r.players[idx].ready=true;if(r.players.every(p=>p.ready))advance(r);
    }else if(path==='/api/penalty'){
     if(b.kick!==r.shootout?.history.length+1)throw Error('That penalty has ended.');penalty(r,idx,b);
    }else if(path==='/api/penalty-next'){
     if(b.kick!==r.shootout?.history.length)throw Error('That penalty result has ended.');nextPenalty(r,idx);
    }else if(path==='/api/rematch'){
     if(r.stage!=='ended')throw Error('Finish the match first.');r.players[idx].rematch=true;r.players.filter(p=>p.bot).forEach(p=>p.rematch=true);
     if(r.players.every(p=>p.rematch)){
      const squads=draft();r.match=token();r.first=1-r.first;r.turn=0;r.stage='playing';r.phase='select';r.history=[];r.last=null;r.winner=null;r.shootout=null;
      r.players=r.players.map((p,i)=>({...player(p.name,p.bot),token:p.token,cards:squads[i]}));
      if(r.mode==='penalties')startShootout(r);
     }
    }else return json(res,404,{error:'Unknown action.'});
    runBot(r);return json(res,200,snapshot(r,idx));
   }
   if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
   const file=path==='/'?'index.html':path.slice(1);const photo=/^players\/[A-Z][0-9]{2}\.webp$/.test(file);if(!photo&&!['index.html','app.js','engine.js','styles.css'].includes(file))return json(res,404,{error:'Not found.'});
   const bytes=await readFile(join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.webp')?'image/webp':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':photo?'public, max-age=86400':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){if(!res.headersSent)json(res,400,{error:e instanceof SyntaxError?'Invalid JSON.':e.message});else res.end()}
 });server.on('close',()=>clearInterval(cleanup));return server;
}

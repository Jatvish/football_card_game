import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const db=JSON.parse(await readFile(join(root,'data','players.json'),'utf8'));
const cards=db.cards, byId=new Map(cards.map(c=>[c.id,c])),rooms=new Map();
const port=Number(process.env.PORT||3000),CAP=3,MAX_TURNS=12;
const rnd=n=>randomBytes(4).readUInt32BE()%n;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const pair=(a,b)=>db.chemistry[[a,b].sort().join(':')]||0;
const sum=(arr)=>arr.reduce((a,b)=>a+b,0);
const pick=(arr,n)=>{const pool=[...arr],out=[];while(out.length<n)out.push(pool.splice(rnd(pool.length),1)[0]);return out};
const requirements={F:3,M:3,D:4,G:2};
const attackRoles=['Finisher','Creator','Runner'];
function roleScore(c,i){
 const s=c.stats;
 const raw=i===0?.45*s.finishing+.25*s.attacking_positioning+.2*s.composure+.1*s.pace:i===1?.35*s.passing+.3*s.vision+.2*s.dribbling+.15*s.control:.4*s.pace+.3*s.dribbling+.2*s.off_ball+.1*s.physicality;
 const p=c.position;
 const bonus=i===0?(['ST','CF'].includes(p)?2:['CAM','CM'].includes(p)?-2:p==='CDM'?-3:0):i===1?(['ST','CF'].includes(p)?-2:['CAM','CM'].includes(p)?2:p==='CDM'?1:0):(['LW','RW'].includes(p)?2:p==='CDM'?-2:0);
 return raw+bonus;
}
function dScore(c){let s=c.stats;return .3*s.pace+.25*s.tackling+.25*s.marking+.2*s.awareness}
function gScore(c){let s=c.stats;return .4*s.reflexes+.25*s.gk_positioning+.2*s.one_on_one+.15*s.handling}
function formation(a){let positions=a.map(c=>c.position);if(new Set(positions).size===1)return -3;let natural=([a[0].position,a[1].position,a[2].position]);return (['ST','CF'].includes(natural[0])&&['CAM','CM'].includes(natural[1])&&['LW','RW'].includes(natural[2]))?3:0}
function attack(a){let chemistry=Math.min(4,pair(a[0].id,a[1].id)+pair(a[0].id,a[2].id)+pair(a[1].id,a[2].id));let shape=formation(a);return {value:.4*roleScore(a[0],0)+.35*roleScore(a[1],1)+.25*roleScore(a[2],2)+chemistry+shape,chemistry,shape}}
function defense(d){let chemistry=Math.min(2,pair(d[0].id,d[1].id)),shape=d[0].position!==d[1].position?2:0;return {value:.275*dScore(d[0])+.275*dScore(d[1])+.45*gScore(d[2])+chemistry+shape,chemistry,shape}}
function markerScore(a,d,role){
 const x=a.stats,y=d.stats;
 const raw=role===0?.3*(x.finishing-y.tackling)+.25*(x.dribbling-y.marking)+.2*(x.physicality-y.strength)+.25*(x.off_ball-y.awareness):role===1?.25*(x.passing-y.awareness)+.25*(x.vision-y.marking)+.3*(x.dribbling-y.tackling)+.2*(x.control-y.awareness):.4*(x.pace-y.pace)+.2*(x.dribbling-y.tackling)+.25*(x.off_ball-y.awareness)+.15*(x.physicality-y.strength);
 return clamp(raw/10,-3,3);
}
function evaluate(a,d,marks){let A=attack(a),D=defense(d),matchup=clamp(markerScore(a[marks[0]],d[0],marks[0])+markerScore(a[marks[1]],d[1],marks[1]),-6,6);let margin=A.value-D.value+matchup;return {goal:margin>0,margin:+margin.toFixed(3),attack:+A.value.toFixed(3),defense:+D.value.toFixed(3),matchup:+matchup.toFixed(3),attackChem:A.chemistry,defChem:D.chemistry,attackShape:A.shape,defShape:D.shape}}
function squadStrength(squad){return sum(squad.map(c=>c.ovr))}
function draft(){
 // Position-balanced drafts; choose from a shared pool without duplication.
 // Each category is dealt into two 12-card squads with a bounded total OVR gap.
 let best=null;
 for(let t=0;t<3500;t++){
  let available=[...cards],squads=[[],[]];
  for(const [cat,n] of Object.entries(requirements)){
   let pool=available.filter(c=>c.category===cat);
   let selected=pick(pool,n*2);
   for(let i=0;i<n;i++){squads[0].push(selected[i]);squads[1].push(selected[i+n])}
   available=available.filter(c=>!selected.some(x=>x.id===c.id));
  }
  let diff=Math.abs(squadStrength(squads[0])-squadStrength(squads[1]));
  let groupDiff=sum(Object.keys(requirements).map(cat=>Math.abs(sum(squads[0].filter(c=>c.category===cat).map(c=>c.ovr))-sum(squads[1].filter(c=>c.category===cat).map(c=>c.ovr)))));
  let penalty=diff+groupDiff*.5;
  if(!best||penalty<best.penalty)best={squads,penalty,diff};
  if(diff<=6&&groupDiff<=14)break;
 }
 return best.squads.map(s=>s.map(c=>c.id));
}
function newToken(){return randomBytes(20).toString('hex')}
function code(){let s;do{s=randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(s));return s}
function player(name){return {name:String(name||'Player').trim().slice(0,24)||'Player',token:newToken(),uses:{},attack:null,defense:null,marks:null,score:0,rematch:false}}
function snapshot(room,idx){
 let p=room.players[idx],other=room.players[1-idx],attacker=(room.first+room.turn)%2;
 return {code:room.code,players:room.players.map(x=>x?{name:x.name,score:x.score,rematch:x.rematch}:null),you:idx,stage:room.stage,turn:room.turn,attacker,round:Math.floor(room.turn/2)+1,totalTurns:MAX_TURNS,phase:room.phase,submitted:{attack:!!p.attack,defense:!!p.defense,marks:!!p.marks},opponentSubmitted:{attack:!!other?.attack,defense:!!other?.defense,marks:!!other?.marks},uses:p.uses,last:room.last,history:room.history,winner:room.stage==='ended'?(room.players[0].score===room.players[1].score?'draw':room.players[0].score>room.players[1].score?0:1):null,cards:p.squad.map(id=>byId.get(id)),revealed:room.phase==='marking'?{attack:room.players[attacker].attack.map(id=>byId.get(id)),defense:room.players[1-attacker].defense.map(id=>byId.get(id))}:null,remainingPool:cards.length-24}
}
function validate(ids,category,p){
 if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)throw Error('Select three distinct cards');
 for(let i=0;i<3;i++){let id=ids[i],c=byId.get(id);if(!c||!p.squad.includes(id))throw Error('Card is not in your squad');if((p.uses[id]||0)>=CAP)throw Error(c.name+' has no uses remaining');if(category==='attack'?!['F','M'].includes(c.category):(i===2?c.category!=='G':c.category!=='D'))throw Error('Wrong card category for this role')}
}
function resolve(room){
 const ai=(room.first+room.turn)%2,di=1-ai,a=room.players[ai],d=room.players[di];
 if(!a.attack||!d.defense||!d.marks)return;
 let A=a.attack.map(id=>byId.get(id)),D=d.defense.map(id=>byId.get(id));
 let e=evaluate(A,D,d.marks);
 if(e.goal)a.score++;
 for(let id of a.attack)a.uses[id]=(a.uses[id]||0)+1;
 for(let id of d.defense)d.uses[id]=(d.uses[id]||0)+1;
 room.last={number:room.turn+1,attacker:ai,...e,namesA:A.map(c=>c.name),namesD:D.map(c=>c.name),marks:d.marks};
 room.history.push(room.last);a.attack=null;d.defense=null;d.marks=null;room.turn++;room.phase='select';
 if(room.turn===MAX_TURNS){room.stage='ended';for(let p of room.players){if(p.squad.some(id=>p.uses[id]!==3))throw Error('Internal use-count mismatch')}}
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function read(req){return new Promise((ok,err)=>{let s='';req.on('data',c=>{s+=c;if(s.length>20000){req.destroy();err(Error('Request too large'))}});req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch{err(Error('Invalid JSON'))}});req.on('error',err)})}
setInterval(()=>{for(let [c,r] of rooms)if(Date.now()-r.lastSeen>7200000)rooms.delete(c)},60000).unref();
http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/health')return json(res,200,{ok:true,cards:cards.length,rooms:rooms.size});
 if(path==='/api/cards')return json(res,200,{cards,notice:db.notice});
 if(path==='/api/create'&&req.method==='POST'){let b=await read(req),c=code(),p=player(b.name),room={code:c,players:[p,null],squads:draft(),stage:'lobby',phase:'select',first:rnd(2),turn:0,last:null,history:[],lastSeen:Date.now()};p.squad=room.squads[0];rooms.set(c,room);return json(res,200,{code:c,token:p.token,state:snapshot(room,0)})}
 if(path==='/api/join'&&req.method==='POST'){let b=await read(req),room=rooms.get(String(b.code||'').trim().toUpperCase());if(!room)return json(res,404,{error:'Room not found'});if(room.players[1])return json(res,409,{error:'Room full'});let p=player(b.name);p.squad=room.squads[1];room.players[1]=p;room.stage='playing';return json(res,200,{code:room.code,token:p.token,state:snapshot(room,1)})}
 if(path.startsWith('/api/')){
  let b=req.method==='POST'?await read(req):Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
  let room=rooms.get(String(b.code||'').toUpperCase());if(!room)return json(res,404,{error:'Room not found or expired'});
  let idx=room.players.findIndex(p=>p?.token===b.token);if(idx<0)return json(res,403,{error:'Invalid player token'});room.lastSeen=Date.now();
  if(path==='/api/state')return json(res,200,snapshot(room,idx));
  if(path==='/api/play'&&req.method==='POST'){
   if(room.stage!=='playing'||room.phase!=='select')return json(res,409,{error:'Not in card selection phase'});
   let attacking=idx===(room.first+room.turn)%2,kind=attacking?'attack':'defense',p=room.players[idx];
   if(p[kind])return json(res,409,{error:'Already submitted'});
   validate(b.ids,kind,p);p[kind]=b.ids;
   let ai=(room.first+room.turn)%2;
   if(room.players[ai].attack&&room.players[1-ai].defense)room.phase='marking';
   return json(res,200,snapshot(room,idx));
  }
  if(path==='/api/mark'&&req.method==='POST'){
   if(room.stage!=='playing'||room.phase!=='marking'||idx===(room.first+room.turn)%2)return json(res,409,{error:'Not your marking phase'});
   if(!Array.isArray(b.marks)||b.marks.length!==2||b.marks.some(x=>!Number.isInteger(x)||x<0||x>2)||b.marks[0]===b.marks[1])return json(res,400,{error:'Assign the two defenders to different attackers'});
   room.players[idx].marks=b.marks;resolve(room);return json(res,200,snapshot(room,idx));
  }
  if(path==='/api/rematch'&&req.method==='POST'){
   if(room.stage!=='ended')return json(res,409,{error:'Finish the match first'});
   room.players[idx].rematch=true;
   if(room.players.every(p=>p.rematch)){
    room.squads=draft();room.first=1-room.first;room.turn=0;room.stage='playing';room.phase='select';room.history=[];room.last=null;
    room.players.forEach((p,i)=>{p.squad=room.squads[i];p.uses={};p.attack=null;p.defense=null;p.marks=null;p.score=0;p.rematch=false});
   }
   return json(res,200,snapshot(room,idx));
  }
  return json(res,404,{error:'Unknown action'});
 }
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 const file=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','styles.css'].includes(file))return json(res,404,{error:'Not found'});
 const body=await readFile(join(root,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css','Cache-Control':'no-cache'});res.end(body);
}catch(e){json(res,400,{error:e.message||'Unexpected error'})}}).listen(port,'0.0.0.0',()=>console.log('Football game v1 listening on '+port));

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = dirname(fileURLToPath(import.meta.url));
const rooms = new Map();
const port = Number(process.env.PORT || 3000);
const cards = [
['Messi','F',96,99,90,77,38],['Ronaldo','F',98,77,87,92,35],['Neymar','F',94,94,91,70,31],
['Mbappé','F',95,83,99,79,38],['Haaland','F',98,64,90,98,40],['Salah','F',93,88,94,73,41],
['De Bruyne','M',89,99,81,78,63],['Modrić','M',84,95,79,65,73],['Bellingham','M',89,89,85,84,81],
['Pedri','M',78,94,84,61,72],['Kroos','M',79,97,63,72,70],['Bruno Fernandes','M',84,94,75,72,59],
['Van Dijk','D',55,70,82,94,98],['Rúben Dias','D',43,75,70,91,96],['Rüdiger','D',50,69,88,92,92],
['Saliba','D',47,79,85,89,94],['Hakimi','D',66,78,96,69,88],['Theo Hernández','D',68,75,96,88,85],
['Alisson','G',15,40,64,88,97],['Courtois','G',13,37,45,98,98],['Ederson','G',12,80,61,86,94],['Donnarumma','G',11,35,47,96,97]
].map(([name,pos,finish,create,pace,strength,defense],id)=>({id,name,pos,finish,create,pace,strength,defense}));
const partners=[['Messi','Neymar'],['Messi','Mbappé'],['Ronaldo','Modrić'],['Haaland','De Bruyne'],['Salah','Van Dijk'],['Bellingham','Kroos'],['Mbappé','Hakimi']];
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data))}
function fail(res,status,error){json(res,status,{error})}
function read(req){return new Promise((ok,err)=>{let s='';req.on('data',c=>{s+=c;if(s.length>12000)req.destroy()});req.on('end',()=>{try{ok(JSON.parse(s||'{}'))}catch{err(new Error('Invalid JSON'))}});req.on('error',err)})}
function newToken(){return randomBytes(18).toString('hex')}
function code(){let c;do{c=randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(c));return c}
function player(name){return {name:String(name||'Player').trim().slice(0,24)||'Player',token:newToken(),uses:{},attack:null,defense:null,score:0}}
function snapshot(room,idx){let p=room.players[idx],other=room.players[1-idx];return {code:room.code,players:room.players.map(x=>x?{name:x.name,score:x.score}:null),you:idx,stage:room.stage,turn:room.turn,attacker:room.turn%2,round:Math.floor(room.turn/2)+1,totalTurns:12,submitted:{attack:!!p.attack,defense:!!p.defense},opponentSubmitted:{attack:!!other?.attack,defense:!!other?.defense},uses:p.uses,last:room.last,history:room.history,winner:room.stage==='ended'?(room.players[0].score===room.players[1].score?'draw':room.players[0].score>room.players[1].score?0:1):null,cards}}
function publicRoom(room,token){let idx=room.players.findIndex(x=>x?.token===token);if(idx<0)throw Error('Invalid player token');return snapshot(room,idx)}
function validatePick(ids,count,positions,p){if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count)throw Error('Select '+count+' different cards');for(let i=0;i<ids.length;i++){let id=ids[i];if(!Number.isInteger(id)||!cards[id])throw Error('Invalid card');if(positions[i]&&!positions[i].includes(cards[id].pos))throw Error('Wrong position for slot '+(i+1));if((p.uses[id]||0)>=3)throw Error(cards[id].name+' has no uses remaining')}}
function partnership(ids){let names=ids.map(i=>cards[i].name);return Math.min(12,partners.filter(pair=>pair.every(n=>names.includes(n))).length*6)}
function resolve(room){let attacker=room.turn%2,defender=1-attacker,a=room.players[attacker],d=room.players[defender];if(!a.attack||!d.defense)return;
let A=a.attack.map(i=>cards[i]),D=d.defense.map(i=>cards[i]);
let chemistry=partnership(a.attack),attack=A[0].finish*.48+A[1].create*.34+A[2].pace*.18+chemistry;
let defense=D[0].defense*.34+D[1].defense*.32+D[2].defense*.34;
let matchup=(A[0].strength-(D[0].strength+D[1].strength)/2)*.10;
let threshold=Math.max(9,Math.min(91,50+(attack-defense)*1.2+matchup));
let roll=Math.random()*100,goal=roll<threshold;
if(goal)a.score++;
for(let id of a.attack)a.uses[id]=(a.uses[id]||0)+1;
for(let id of d.defense)d.uses[id]=(d.uses[id]||0)+1;
room.last={number:room.turn+1,attacker,goal,chance:Math.round(threshold),roll:Math.round(roll),chemistry,attack:Math.round(attack),defense:Math.round(defense),namesA:A.map(c=>c.name),namesD:D.map(c=>c.name)};
room.history.push(room.last);a.attack=null;d.defense=null;room.turn++;if(room.turn>=12)room.stage='ended'}
setInterval(()=>{let now=Date.now();for(let [c,r] of rooms)if(now-r.lastSeen>2*60*60*1000)rooms.delete(c)},60*1000).unref();
const server=http.createServer(async(req,res)=>{
try{
const path=new URL(req.url,'http://localhost').pathname;
if(path==='/health')return json(res,200,{ok:true,rooms:rooms.size});
if(path==='/api/cards')return json(res,200,{cards});
if(path==='/api/create'&&req.method==='POST'){let b=await read(req),c=code(),p=player(b.name),room={code:c,players:[p,null],stage:'lobby',turn:0,last:null,history:[],lastSeen:Date.now()};rooms.set(c,room);return json(res,200,{code:c,token:p.token,state:snapshot(room,0)})}
if(path==='/api/join'&&req.method==='POST'){let b=await read(req),c=String(b.code||'').toUpperCase().trim(),room=rooms.get(c);if(!room)return fail(res,404,'Room not found');if(room.players[1])return fail(res,409,'Room is full');let p=player(b.name);room.players[1]=p;room.stage='playing';room.lastSeen=Date.now();return json(res,200,{code:c,token:p.token,state:snapshot(room,1)})}
if(path.startsWith('/api/')){
let b=req.method==='POST'?await read(req):Object.fromEntries(new URL(req.url,'http://localhost').searchParams);
let room=rooms.get(String(b.code||'').toUpperCase());if(!room)return fail(res,404,'Room not found or expired');
let idx=room.players.findIndex(p=>p?.token===b.token);if(idx<0)return fail(res,403,'Invalid player token');room.lastSeen=Date.now();
if(path==='/api/state')return json(res,200,snapshot(room,idx));
if(path==='/api/play'&&req.method==='POST'){
if(room.stage!=='playing')return fail(res,409,'Match has not started or is finished');
let attacking=idx===room.turn%2,kind=attacking?'attack':'defense',p=room.players[idx];
if(p[kind])return fail(res,409,'You already submitted this turn');
let ids=b.ids;
validatePick(ids,3,attacking?[['F'],['M'],['F','M']]:[['D'],['D'],['G']],p);
p[kind]=ids;resolve(room);return json(res,200,snapshot(room,idx))
}
if(path==='/api/rematch'&&req.method==='POST'){
if(room.stage!=='ended')return fail(res,409,'Finish the match first');
room.stage='playing';room.turn=0;room.history=[];room.last=null;for(let p of room.players){p.uses={};p.attack=null;p.defense=null;p.score=0}return json(res,200,snapshot(room,idx))
}
return fail(res,404,'Unknown action');
}
if(req.method!=='GET')return fail(res,405,'Method not allowed');
let file=path==='/'?'index.html':path.replace(/^\//,'');if(!['index.html','app.js','styles.css','favicon.svg'].includes(file))return fail(res,404,'Not found');
let data=await readFile(join(base,'public',file));let type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';
res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(data)
}catch(e){fail(res,400,e.message||'Unexpected error')}});server.listen(port,'0.0.0.0',()=>console.log('Football card game listening on '+port));
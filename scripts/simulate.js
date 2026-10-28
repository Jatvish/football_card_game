import {newRoom,select,mark,advance,db} from '../game-server.js';
import {lineups,attack,defense,evaluate} from '../public/engine.js';
const count=Number(process.argv[2]||500),results={matches:count,goals:0,draws:0,firstAttackerWins:0,secondAttackerWins:0,maxSquadGap:0,stalled:0};
for(let n=0;n<count;n++){
 const r=newRoom('Simulation',true);r.players[1].bot=false;
 const totals=r.players.map(p=>p.cards.reduce((s,c)=>s+c.ovr,0));results.maxSquadGap=Math.max(results.maxSquadGap,Math.abs(totals[0]-totals[1]));
 for(let t=0;t<12;t++){
  const ai=(r.first+r.turn)%2;
  for(const i of [0,1]){
   const kind=i===ai?'attack':'defense',options=lineups(r.players[i],kind).sort((a,b)=>(kind==='attack'?attack:defense)(b,db.chemistry).value-(kind==='attack'?attack:defense)(a,db.chemistry).value);
   if(!options.length)throw Error('Stalled roster');
   const ids=options[0].map(c=>c.id);select(r,i,{ids,activated:ids.filter(id=>!r.players[i].spent.includes(id))});
  }
  const A=r.players[ai].lineup.map(id=>db.cards.find(c=>c.id===id)),D=r.players[1-ai].lineup.map(id=>db.cards.find(c=>c.id===id)),choices=[];
  for(let x=0;x<3;x++)for(let y=0;y<3;y++)if(x!==y)choices.push([x,y]);
  choices.sort((x,y)=>evaluate(A,D,x,db.chemistry,r.players.flatMap(p=>p.activated)).margin-evaluate(A,D,y,db.chemistry,r.players.flatMap(p=>p.activated)).margin);
  mark(r,1-ai,choices[0]);advance(r);
 }
 results.goals+=r.players[0].score+r.players[1].score;
 if(r.stage==='shootout')results.draws++;else if(r.winner===r.first)results.firstAttackerWins++;else results.secondAttackerWins++;
}
console.log(JSON.stringify({...results,goalRate:results.goals/(count*12)},null,2));

// Pure shared rules: the browser previews; the server remains authoritative.
export const CAP = 3;
export const ATTACK_ROLES = ['Finisher', 'Creator', 'Runner'];
export const DEFENSE_ROLES = ['Defender 1', 'Defender 2', 'Goalkeeper'];
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n * 1000) / 1000;
export const ABILITIES = {
  engine: {name:'Midfield engine', text:'Once per match: +2 attack as Runner with off-ball movement of at least 75.'},
  control: {name:'Elite close control', text:'Once per match: +3 matchup when marked and dribbling beats the marker’s average tackling and awareness.'},
  aerial: {name:'Aerial threat', text:'Once per match: +2 matchup as a marked finisher with greater aerial ability than the marker.'},
  vision: {name:'Defence-splitting pass', text:'Once per match: +2 attack as Creator when vision is at least 92.'},
  burst: {name:'Explosive run', text:'Once per match: +2 matchup as Runner when unmarked or faster than the marker.'},
  finish: {name:'Ice-cold finish', text:'Once per match: +2 attack as Finisher when composure is at least 90.'},
  leader: {name:'Defensive leader', text:'Once per match: +2 defence when both selected defenders are centre-backs.'},
  recovery: {name:'Recovery tackle', text:'Once per match: +2 defence when marking the Runner with at least as much pace.'},
  sweeper: {name:'Sweeper keeper', text:'Once per match: +2 defence against a Runner with pace of at least 90.'},
  reflex: {name:'Last line', text:'Once per match: +2 defence against a Finisher with finishing of at least 92.'}
};
export function suitability(c, role) {
  const p=c.position;
  return role===0 ? (['ST','CF'].includes(p)?2:['CAM','CM'].includes(p)?-2:p==='CDM'?-3:0)
    : role===1 ? (['ST','CF'].includes(p)?-2:['CAM','CM'].includes(p)?2:p==='CDM'?1:0)
    : (['LW','RW'].includes(p)?2:p==='CDM'?-2:0);
}
export function roleScore(c,i) {
  const s=c.stats;
  return (i===0?.45*s.finishing+.25*s.attacking_positioning+.2*s.composure+.1*s.pace:
    i===1?.35*s.passing+.3*s.vision+.2*s.dribbling+.15*s.control:
    .4*s.pace+.3*s.dribbling+.2*s.off_ball+.1*s.physicality)+suitability(c,i);
}
export function dScore(c){const s=c.stats;return .3*s.pace+.25*s.tackling+.25*s.marking+.2*s.awareness}
export function gScore(c){const s=c.stats;return .4*s.reflexes+.25*s.gk_positioning+.2*s.one_on_one+.15*s.handling}
export const pairKey=(a,b)=>[a,b].sort().join(':');
export function chemistryLinks(cards, chemistry) {
  return cards.flatMap((a,i)=>cards.slice(i+1).map(b=>({a:a.name,b:b.name,...(chemistry[pairKey(a.id,b.id)]||{value:0,reason:'No curated shared-playing link'})})));
}
export function attack(cards, chemistry) {
  const scores=cards.map(roleScore), links=chemistryLinks(cards,chemistry);
  const chem=Math.min(4,links.reduce((s,x)=>s+x.value,0));
  const shape=new Set(cards.map(c=>c.position)).size===1?-3:
    ['ST','CF'].includes(cards[0].position)&&['CAM','CM','CDM'].includes(cards[1].position)&&['LW','RW'].includes(cards[2].position)?3:0;
  const base=.4*scores[0]+.35*scores[1]+.25*scores[2];
  return {value:base+chem+shape,base,chemistry:chem,shape,scores,links};
}
export function defense(cards,chemistry){
  const scores=[dScore(cards[0]),dScore(cards[1]),gScore(cards[2])],links=chemistryLinks(cards.slice(0,2),chemistry);
  const chem=Math.min(2,links[0].value);
  const shape=cards.slice(0,2).some(c=>c.position==='CB')&&cards.slice(0,2).some(c=>['LB','RB'].includes(c.position))?2:0;
  const base=.275*scores[0]+.275*scores[1]+.45*scores[2];
  return {value:base+chem+shape,base,chemistry:chem,shape,scores,links};
}
export function markerScore(a,d,role){
  const x=a.stats,y=d.stats;
  const raw=role===0?.25*(x.finishing-y.tackling)+.2*(x.dribbling-y.marking)+.2*(x.physicality-y.strength)+.2*(x.off_ball-y.awareness)+.15*(x.aerial-y.aerial):
    role===1?.25*(x.passing-y.awareness)+.25*(x.vision-y.marking)+.3*(x.dribbling-y.tackling)+.2*(x.control-y.awareness):
    .4*(x.pace-y.pace)+.2*(x.dribbling-y.tackling)+.25*(x.off_ball-y.awareness)+.15*(x.physicality-y.strength);
  return clamp(raw/10,-3,3);
}
export function evaluate(a,d,marks,chemistry,activated=[]) {
  const A=attack(a,chemistry),D=defense(d,chemistry),events=[];
  const duels=marks.map((r,i)=>({attacker:a[r].name,defender:d[i].name,role:ATTACK_ROLES[r],value:markerScore(a[r],d[i],r)}));
  const keeper=clamp((.6*a[0].stats.finishing+.4*a[0].stats.composure-(.6*d[2].stats.reflexes+.4*d[2].stats.gk_positioning))/10,-2,2);
  let aBonus=0,dBonus=0,mBonus=0;
  for(const c of [...a,...d].filter(c=>activated.includes(c.id))){
    const r=a.indexOf(c),di=d.indexOf(c),marker=marks.indexOf(r),op=marker<0?null:d[marker];
    let value=0,target='attack';
    if(c.ability==='control'&&r>=0&&op&&c.stats.dribbling>(op.stats.tackling+op.stats.awareness)/2){value=3;target='matchup'}
    if(c.ability==='aerial'&&r===0&&op&&c.stats.aerial>op.stats.aerial){value=2;target='matchup'}
    if(c.ability==='engine'&&r===2&&c.stats.off_ball>=75)value=2;
    if(c.ability==='vision'&&r===1&&c.stats.vision>=92)value=2;
    if(c.ability==='burst'&&r===2&&(!op||c.stats.pace>op.stats.pace)){value=2;target='matchup'}
    if(c.ability==='finish'&&r===0&&c.stats.composure>=90)value=2;
    if(c.ability==='leader'&&di>=0&&di<2&&d[0].position==='CB'&&d[1].position==='CB'){value=2;target='defense'}
    if(c.ability==='recovery'&&di>=0&&di<2&&marks[di]===2&&c.stats.pace>=a[2].stats.pace){value=2;target='defense'}
    if(c.ability==='sweeper'&&di===2&&a[2].stats.pace>=90){value=2;target='defense'}
    if(c.ability==='reflex'&&di===2&&a[0].stats.finishing>=92){value=2;target='defense'}
    if(target==='attack')aBonus+=value;else if(target==='defense')dBonus+=value;else mBonus+=value;
    events.push({id:c.id,player:c.name,name:ABILITIES[c.ability].name,value,target,triggered:value>0});
  }
  const matchup=clamp(duels.reduce((s,x)=>s+x.value,0)+keeper+mBonus,-6,6);
  const margin=round(A.value+aBonus-D.value-dBonus+matchup);
  return {goal:margin>0,margin:round(margin),attack:round(A.value+aBonus),defense:round(D.value+dBonus),matchup:round(matchup),
    attackChem:A.chemistry,defChem:D.chemistry,attackShape:A.shape,defShape:D.shape,
    attackBase:round(A.base),defenseBase:round(D.base),attackAbility:aBonus,defenseAbility:dBonus,matchupAbility:mBonus,
    duels:duels.map(x=>({...x,value:round(x.value)})),keeperMatchup:round(keeper),abilities:events,
    attackLinks:A.links,defenseLinks:D.links,roleScores:A.scores.map(round),defenseScores:D.scores.map(round)};
}
export function turnsLeft(player,kind){
  const cats=kind==='attack'?['F','M']:['G'];
  const remaining=player.cards.filter(c=>cats.includes(c.category)).reduce((s,c)=>s+CAP-(player.uses[c.id]||0),0);
  return remaining/(kind==='attack'?3:1);
}
export function requiredCards(player,kind){
  const turns=turnsLeft(player,kind),cats=kind==='attack'?['F','M']:['D','G'];
  return player.cards.filter(c=>cats.includes(c.category)&&CAP-(player.uses[c.id]||0)===turns).map(c=>c.id);
}
export function validateLineup(player,ids,kind){
  if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)throw Error('Choose three different cards.');
  const selected=ids.map(id=>player.cards.find(c=>c.id===id));
  selected.forEach((c,i)=>{
    if(!c)throw Error('That card is not in your squad.');
    if((player.uses[c.id]||0)>=CAP)throw Error(c.name+' is exhausted.');
    if(kind==='attack'?!['F','M'].includes(c.category):(i===2?c.category!=='G':c.category!=='D'))throw Error('Choose the correct card type for each role.');
  });
  const missing=requiredCards(player,kind).filter(id=>!ids.includes(id));
  if(missing.length)throw Error('Use '+missing.map(id=>player.cards.find(c=>c.id===id).name).join(', ')+' now so every card can finish its three uses.');
  return selected;
}
export function lineups(player,kind){
  const eligible=player.cards.filter(c=>(player.uses[c.id]||0)<CAP);
  const pool=eligible.filter(c=>kind==='attack'?['F','M'].includes(c.category):c.category==='D');
  const thirds=kind==='attack'?pool:eligible.filter(c=>c.category==='G');
  const required=requiredCards(player,kind),result=[];
  for(const a of pool)for(const b of pool)for(const c of thirds){
    if(new Set([a.id,b.id,c.id]).size<3)continue;
    if(kind==='defense'&&a.id>b.id)continue;
    if(required.every(id=>[a.id,b.id,c.id].includes(id)))result.push([a,b,c]);
  }
  return result;
}

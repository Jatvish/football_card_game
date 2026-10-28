const $=id=>document.getElementById(id);let code='',token='',state=null,chosen=[],lastTurn=-1,lastStage='';
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function api(route,data,method='POST'){let r=await fetch('/api/'+route,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(data):undefined});let j=await r.json();if(!r.ok)throw Error(j.error||'Network error');return j}
function notice(msg){$('message').textContent=msg;$('message').hidden=false;setTimeout(()=>$('message').hidden=true,4500)}
function save(){localStorage.setItem('football-room',JSON.stringify({code,token}))}
function setSession(j){code=j.code;token=j.token;save();state=j.state;chosen=[];render();location.hash=code}
async function poll(){if(!code||!token)return;try{state=await api('state',{code,token});if(state.turn!==lastTurn||state.stage!==lastStage){chosen=[];lastTurn=state.turn;lastStage=state.stage}render()}catch(e){notice(e.message);code='';token='';localStorage.removeItem('football-room');render()}}
const positions={F:'FORWARD',M:'MIDFIELD',D:'DEFENDER',G:'KEEPER'};
function card(c,selected,disabled=false){let stat=c.pos==='G'||c.pos==='D'?'DEF '+c.defense:c.pos==='M'?'PAS '+c.create:'FIN '+c.finish;let uses=state?.uses[c.id]||0;return '<button class="card '+(selected?'selected ':'')+(disabled?'unavailable':'')+'" data-card="'+c.id+'" '+(disabled?'disabled':'')+'><span class="pos">'+positions[c.pos]+'</span><strong>'+esc(c.name)+'</strong><span class="stats">'+stat+' · PAC '+c.pace+'</span><span class="uses">'+(3-uses)+'/3 uses</span></button>'}
function render(){let home=$('home'),game=$('game');home.hidden=!!state;game.hidden=!state;if(!state)return;
$('roomCode').textContent=state.code;let p=state.players;$('score').innerHTML='<span>'+esc(p[0].name)+' <b>'+p[0].score+'</b></span><span class="vs">VS</span><span><b>'+p[1]?.score+'</b> '+esc(p[1]?.name||'Waiting...')+'</span>';
$('invite').value=location.origin+'/?room='+encodeURIComponent(state.code);
$('round').textContent=state.stage==='ended'?'FULL TIME':state.stage==='lobby'?'LOBBY':('POSSESSION '+(state.turn+1)+' / 12');
let lobby=$('lobby'),play=$('play'),ended=$('ended');lobby.hidden=state.stage!=='lobby';play.hidden=state.stage!=='playing';ended.hidden=state.stage!=='ended';
if(state.stage==='lobby'){$('lobbyCode').textContent=state.code;return}
if(state.stage==='ended'){$('outcome').textContent=state.winner==='draw'?"It's a draw!":state.winner===state.you?'YOU WIN!':'OPPONENT WINS';$('historyEnd').innerHTML=history();return}
let attacking=state.attacker===state.you;let slots=attacking?[['F','Finisher'],['M','Creator'],['F/M','Runner']]:[['D','Defender 1'],['D','Defender 2'],['G','Goalkeeper']];let submitted=attacking?state.submitted.attack:state.submitted.defense;
$('roleTitle').textContent=attacking?'⚡ Your attack':'🛡 Your defense';
$('instructions').textContent=submitted?'Your selection is locked. Waiting for your opponent.':attacking?'Pick one finisher, one creator and one runner.':'Pick two defenders and a goalkeeper.';
$('slots').innerHTML=slots.map((s,i)=>'<div class="slot '+(chosen[i]!=null?'filled':'')+'"><small>'+s[1]+' · '+s[0]+'</small><strong>'+(chosen[i]==null?'Choose card':esc(state.cards[chosen[i]].name))+'</strong></div>').join('');
$('submit').disabled=submitted||chosen.length!==3;$('submit').textContent=submitted?'✓ Submitted — waiting':'Lock in selection';
$('cards').innerHTML=state.cards.filter(c=>attacking?c.pos==='F'||c.pos==='M':c.pos==='D'||c.pos==='G').map(c=>card(c,chosen.includes(c.id),(state.uses[c.id]||0)>=3||submitted)).join('');
document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{let id=Number(b.dataset.card),c=state.cards[id];if(chosen.includes(id)){chosen=chosen.filter(x=>x!==id)}else{let i=chosen.length;if(i===3)return notice('Remove a card first');let allow=attacking?[['F'],['M'],['F','M']]:[['D'],['D'],['G']];if(!allow[i].includes(c.pos))return notice('Slot '+(i+1)+' requires '+slots[i][0]);chosen.push(id)}render()});
$('history').innerHTML=history()}
function history(){if(!state.history.length)return '<p class="muted">Your first chance awaits.</p>';return [...state.history].reverse().map(h=>'<div class="event"><b>'+(h.goal?'⚽ GOAL':'🧤 SAVED')+'</b> · Chance '+h.number+' · '+esc(state.players[h.attacker].name)+'<small>Success chance '+h.chance+'% · Chemistry +'+h.chemistry+'</small></div>').join('')}
$('create').onclick=async()=>{try{setSession(await api('create',{name:$('name').value}))}catch(e){notice(e.message)}};
$('join').onclick=async()=>{try{setSession(await api('join',{name:$('name').value,code:$('joinCode').value.trim().toUpperCase()}))}catch(e){notice(e.message)}};
$('submit').onclick=async()=>{try{state=await api('play',{code,token,ids:chosen});chosen=[];render()}catch(e){notice(e.message)}};
$('rematch').onclick=async()=>{try{state=await api('rematch',{code,token});chosen=[];render()}catch(e){notice(e.message)}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);notice('Invite link copied')}catch{notice('Copy the invite link from the box')}};
$('leave').onclick=()=>{if(confirm('Leave this room?')){localStorage.removeItem('football-room');code='';token='';state=null;chosen=[];render()}};
const params=new URLSearchParams(location.search);$('joinCode').value=params.get('room')||'';try{let saved=JSON.parse(localStorage.getItem('football-room')||'null');if(saved?.token&&saved?.code){code=saved.code;token=saved.token;poll()}}catch{}render();setInterval(poll,1500);
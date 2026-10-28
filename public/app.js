const $=id=>document.getElementById(id);
let code='',token='',state=null,chosen=[],marks=[],lastKey='';
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
async function api(route,data){let r=await fetch('/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let j=await r.json();if(!r.ok)throw Error(j.error||'Network error');return j}
function notice(m){$('message').textContent=m;$('message').hidden=false;setTimeout(()=>$('message').hidden=true,4000)}
function session(j){code=j.code;token=j.token;localStorage.setItem('football-room',JSON.stringify({code,token}));state=j.state;chosen=[];marks=[];lastKey='';render();location.hash=code}
async function poll(){if(!code||!token)return;try{let next=await api('state',{code,token});let key=next.turn+':'+next.phase+':'+next.stage;if(lastKey&&lastKey!==key){chosen=[];marks=[]}lastKey=key;state=next;render()}catch(e){notice(e.message);code='';token='';state=null;localStorage.removeItem('football-room');render()}}
function card(c,disabled=false,selected=false){let used=state.uses[c.id]||0,s=c.stats,stat=c.category==='G'?'REF '+s.reflexes:c.category==='D'?'TAC '+s.tackling:c.category==='M'?'PAS '+s.passing:'FIN '+s.finishing;return '<button class="card '+(selected?'selected':'')+'" data-card="'+c.id+'" '+(disabled?'disabled':'')+'><span class="pos">'+c.position+' · '+c.category+' · OVR '+c.ovr+'</span><strong>'+esc(c.name)+'</strong><span class="stats">'+stat+' · PAC '+s.pace+' · '+esc(c.peak)+'</span><span class="uses">'+(3-used)+'/3 uses remaining</span></button>'}
function history(){if(!state.history.length)return '<p class="muted">No possessions played yet.</p>';return [...state.history].reverse().map(h=>'<div class="event"><b>'+(h.goal?'⚽ GOAL':'🛡 DEFENDED')+'</b> · Possession '+h.number+' · '+esc(state.players[h.attacker].name)+'<small>Margin '+h.margin+' · Attack '+h.attack+' · Defense '+h.defense+' · Matchup '+h.matchup+' · Chemistry '+h.attackChem+'/'+h.defChem+'</small></div>').join('')}
function render(){
 $('home').hidden=!!state;$('game').hidden=!state;if(!state)return;
 $('roomCode').textContent=state.code;$('invite').value=location.origin+'/?room='+encodeURIComponent(state.code);
 $('round').textContent=state.stage==='ended'?'FULL TIME':state.stage==='lobby'?'LOBBY':'POSSESSION '+(state.turn+1)+' / 12';
 let p=state.players;$('score').innerHTML='<span>'+esc(p[0].name)+' <b>'+p[0].score+'</b></span><span class="vs">VS</span><span><b>'+(p[1]?.score??'–')+'</b> '+esc(p[1]?.name||'Waiting...')+'</span>';
 $('lobby').hidden=state.stage!=='lobby';$('play').hidden=state.stage!=='playing';$('ended').hidden=state.stage!=='ended';
 if(state.stage==='lobby'){$('lobbyCode').textContent=state.code;return}
 if(state.stage==='ended'){$('outcome').textContent=state.winner==='draw'?'DRAW':state.winner===state.you?'YOU WIN!':'OPPONENT WINS';$('historyEnd').innerHTML=history();$('rematch').textContent=p[state.you].rematch?'Waiting for opponent to accept…':'Request rematch';$('rematch').disabled=p[state.you].rematch;return}
 $('history').innerHTML=history();
 let attacking=state.attacker===state.you,marking=state.phase==='marking';
 $('selection').hidden=marking;$('markPanel').hidden=!marking;
 if(marking){
  let revealed=state.revealed;
  if(attacking){$('markPanel').innerHTML='<h2>Opponent is assigning markers</h2><p class="muted">Both teams are revealed. Wait for the defender to choose who to mark.</p>'+lineup(revealed.attack,'Your attack')+lineup(revealed.defense,'Opponent defense');return}
  $('markPanel').innerHTML='<h2>Assign your markers</h2><p class="muted">Choose which attacker Defender 1 and Defender 2 will mark. They must mark different attackers. The third attacker stays unmarked.</p>'+lineup(revealed.defense,'Your defense')+'<div class="slotgrid">'+[0,1].map(i=>'<div class="slot"><small>'+esc(revealed.defense[i].name)+' marks</small><select id="mark'+i+'"><option value="">Choose attacker</option>'+revealed.attack.map((c,j)=>'<option value="'+j+'" '+(marks[i]===j?'selected':'')+'>'+esc(c.name)+' — '+['Finisher','Creator','Runner'][j]+'</option>').join('')+'</select></div>').join('')+'</div><button class="btn" id="confirmMarks">Confirm marking</button>';
  for(let i=0;i<2;i++)$('mark'+i).onchange=e=>marks[i]=Number(e.target.value);
  $('confirmMarks').onclick=async()=>{try{if(marks.length!==2||marks[0]===marks[1]||marks.some(x=>!Number.isInteger(x)))throw Error('Mark two different attackers');state=await api('mark',{code,token,marks});marks=[];render()}catch(e){notice(e.message)}};
  return;
 }
 let slots=attacking?['Finisher','Creator','Runner']:['Defender 1','Defender 2','Goalkeeper'];
 let submitted=attacking?state.submitted.attack:state.submitted.defense;
 $('roleTitle').textContent=attacking?'⚡ Your attack':'🛡 Your defense';
 $('instructions').textContent=submitted?'Your selection is locked. Waiting for your opponent.':attacking?'Select any 3 forwards or midfielders, assigning them to Finisher, Creator and Runner.':'Select 2 defenders, then 1 goalkeeper.';
 $('slots').innerHTML=slots.map((slot,i)=>'<div class="slot '+(chosen[i]?'filled':'')+'"><small>'+slot+'</small><strong>'+(chosen[i]?esc(state.cards.find(c=>c.id===chosen[i])?.name||''):'Choose card')+'</strong></div>').join('');
 $('submit').disabled=submitted||chosen.length!==3;$('submit').textContent=submitted?'✓ Locked — waiting':'Lock in selection';
 $('cards').innerHTML=state.cards.filter(c=>attacking?['F','M'].includes(c.category):['D','G'].includes(c.category)).map(c=>card(c,submitted||(state.uses[c.id]||0)>=3,chosen.includes(c.id))).join('');
 document.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>{
  let id=b.dataset.card,c=state.cards.find(x=>x.id===id);
  if(chosen.includes(id)){chosen=chosen.filter(x=>x!==id)}
  else{if(chosen.length===3)return notice('Remove a card first');if(!attacking&&((chosen.length===2&&c.category!=='G')||(chosen.length<2&&c.category!=='D')))return notice(chosen.length===2?'Choose a goalkeeper':'Choose a defender');chosen.push(id)}
  render();
 });
}
function lineup(arr,label){return '<h3>'+label+'</h3><div class="slotgrid">'+arr.map((c,i)=>'<div class="slot"><small>'+(['Finisher','Creator','Runner'][i])+'</small><strong>'+esc(c.name)+'</strong><small>'+c.position+' · OVR '+c.ovr+'</small></div>').join('')+'</div>'}
$('create').onclick=async()=>{try{session(await api('create',{name:$('name').value}))}catch(e){notice(e.message)}};
$('join').onclick=async()=>{try{session(await api('join',{name:$('name').value,code:$('joinCode').value.trim().toUpperCase()}))}catch(e){notice(e.message)}};
$('submit').onclick=async()=>{try{state=await api('play',{code,token,ids:chosen});chosen=[];render()}catch(e){notice(e.message)}};
$('rematch').onclick=async()=>{try{state=await api('rematch',{code,token});render()}catch(e){notice(e.message)}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);notice('Link copied')}catch{notice('Copy the link manually')}};
$('leave').onclick=()=>{if(confirm('Leave this room?')){localStorage.removeItem('football-room');code='';token='';state=null;chosen=[];render()}};
$('joinCode').value=new URLSearchParams(location.search).get('room')||'';
try{let s=JSON.parse(localStorage.getItem('football-room')||'null');if(s?.code&&s?.token){code=s.code;token=s.token;poll()}}catch{}
render();setInterval(poll,1500);

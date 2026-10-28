const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function abilityEffectHTML(){
 const edge='M8 3 H22 L25 1 28 5 31 3 H62 L65 5 69 1 72 3 H92 Q97 3 97 8 V23 L99 27 95 30 97 34 V62 L95 65 99 69 97 73 V92 Q97 97 92 97 H75 L72 99 68 95 65 97 H36 L32 95 28 99 25 97 H8 Q3 97 3 92 V76 L1 72 5 68 3 65 V37 L5 33 1 29 3 25 V8 Q3 3 8 3 Z';
 return `<svg class="ability-energy" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="ability-circuit" x="3" y="3" width="94" height="94" rx="5"/><path class="ability-current echo" pathLength="100" d="${edge}"/><path class="ability-current" pathLength="100" d="${edge}"/></svg>`;
}

// Outcomes come from the server. Movement is an illustration, never a second roll.
export function replayModel(h,penalty=false){
 const blocked=!penalty&&!h.goal&&h.duels.some(d=>d.value<0);
 const blocker=blocked?h.duels.reduce((best,d,i)=>d.value<h.duels[best].value?i:best,0):2;
 return {goal:h.goal,left:(penalty?h.player:h.attacker)===1,blocker,blocked,
  label:h.goal?'GOAL':blocked?'BLOCKED':'SAVED',endX:h.goal?94:blocked?69:84,endY:h.goal?45:blocked?(blocker===0?34:66):50};
}
export function replayHTML(h,key,penalty=false){
 const m=replayModel(h,penalty),active=h.abilities||[];
 const token=(c,role,x,y,extra='')=>`<div class="replay-player replay-at-${x}-${y} ${extra} ${active.some(a=>a.id===c.id)?'ability-glow':''}"><img src="${escape(c.photo.src)}" alt=""><span>${escape(c.name)}</span><small>${role}</small>${active.some(a=>a.id===c.id)?abilityEffectHTML():''}</div>`;
 const a=h.attackCards,d=h.defenseCards;
 const summary=`${a[0].name} ${h.goal?'scores':m.blocked?'is blocked by '+d[m.blocker].name:'is saved by '+d.at(-1).name}.`;
 return `<section class="match-replay" data-replay-key="${escape(key)}" aria-label="Match animation"><div class="replay-heading"><span>${penalty?'PENALTY':'MATCH'} HIGHLIGHT</span><button class="quiet" data-action="replay">Replay ↻</button></div><div class="replay-pitch ${m.left?'goal-left':''} ${penalty?'is-penalty':''} ${m.goal?'is-goal':m.blocked?'is-block block-'+m.blocker:'is-save'}" role="img" aria-label="${escape(summary)}"><div class="replay-world" aria-hidden="true"><div class="replay-box"></div><div class="replay-net"></div><div class="replay-circle"></div>${penalty?token(a[0],'TAKER',49,50,'replay-finisher'):token(a[1],'CREATOR',21,32)+token(a[2],'RUNNER',32,72)+token(a[0],'FINISHER',49,50,'replay-finisher')}${penalty?'':d.slice(0,2).map((c,i)=>token(c,'DEFENDER',69,i===0?34:66,m.blocked&&m.blocker===i?'replay-blocker':'')).join('')}${token(d.at(-1),'GK',84,50,!m.goal&&!m.blocked?'replay-keeper':'')}<div class="replay-ball">⚽</div></div><div class="replay-verdict">${m.label}</div></div><p class="replay-caption">${escape(summary)} <small>Illustrated replay of the resolved result.</small></p>${active.length?`<div class="replay-abilities">${active.map(a=>`<span class="ability-glow">✦ ${escape(a.player)} · ${escape(a.name)}${a.triggered?' activated':' · condition not met'}${abilityEffectHTML()}</span>`).join('')}</div>`:''}</section>`;
}

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Outcomes come from the server. Movement is an illustration, never a second roll.
export function replayModel(h,penalty=false){
 const blocked=!penalty&&!h.goal&&h.duels.some(d=>d.value<0);
 const blocker=blocked?h.duels.reduce((best,d,i)=>d.value<h.duels[best].value?i:best,0):2;
 return {goal:h.goal,left:(penalty?h.player:h.attacker)===1,blocker,blocked,
  label:h.goal?'GOAL':blocked?'BLOCKED':'SAVED',endX:h.goal?94:blocked?69:84,endY:h.goal?45:blocked?(blocker===0?34:66):50};
}
export function replayHTML(h,key,penalty=false){
 const m=replayModel(h,penalty),active=h.abilities||[];
 const token=(c,role,x,y,extra='')=>`<div class="replay-player replay-at-${x}-${y} ${extra} ${active.some(a=>a.id===c.id)?'ability-glow':''}"><img src="${escape(c.photo.src)}" alt=""><span>${escape(c.name)}</span><small>${role}</small></div>`;
 const a=h.attackCards,d=h.defenseCards;
 const summary=`${a[0].name} ${h.goal?'scores':m.blocked?'is blocked by '+d[m.blocker].name:'is saved by '+d.at(-1).name}.`;
 return `<section class="match-replay" data-replay-key="${escape(key)}" aria-label="Match animation"><div class="replay-heading"><span>${penalty?'PENALTY':'MATCH'} HIGHLIGHT</span><button class="quiet" data-action="replay">Replay ↻</button></div><div class="replay-pitch ${m.left?'goal-left':''} ${penalty?'is-penalty':''} ${m.goal?'is-goal':m.blocked?'is-block block-'+m.blocker:'is-save'}" role="img" aria-label="${escape(summary)}"><div class="replay-world" aria-hidden="true"><div class="replay-box"></div><div class="replay-net"></div><div class="replay-circle"></div>${penalty?token(a[0],'TAKER',49,50,'replay-finisher'):token(a[1],'CREATOR',21,32)+token(a[2],'RUNNER',32,72)+token(a[0],'FINISHER',49,50,'replay-finisher')}${penalty?'':d.slice(0,2).map((c,i)=>token(c,'DEFENDER',69,i===0?34:66,m.blocked&&m.blocker===i?'replay-blocker':'')).join('')}${token(d.at(-1),'GK',84,50,!m.goal&&!m.blocked?'replay-keeper':'')}<div class="replay-ball">⚽</div></div><div class="replay-verdict">${m.label}</div></div><p class="replay-caption">${escape(summary)} <small>Illustrated replay of the resolved result.</small></p>${active.length?`<div class="replay-abilities">${active.map(a=>`<span class="ability-glow">✦ ${escape(a.player)} · ${escape(a.name)}${a.triggered?' activated':' · condition not met'}</span>`).join('')}</div>`:''}</section>`;
}

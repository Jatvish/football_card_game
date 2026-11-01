import test from 'node:test';
import assert from 'node:assert/strict';
import {replayModel,replayHTML} from '../public/replay.js';
const card=(id)=>({id,name:`Player ${id}`,photo:{src:`/players/${id}.webp`}});
const h={goal:false,attacker:0,duels:[{value:1},{value:-2}],attackCards:['A01','A02','A03'].map(card),defenseCards:['B01','B02','B03'].map(card),abilities:[]};
test('replays preserve resolved outcomes and choose the strongest defensive block',()=>{
 assert.equal(replayModel(h).blocker,1);
 assert.equal(replayModel(h).label,'BLOCKED');
 assert.equal(replayModel({...h,goal:true}).label,'GOAL');
 assert.equal(replayModel({...h,duels:[{value:1},{value:2}]}).label,'SAVED');
 assert.equal(replayModel({...h,attacker:1}).left,true);
 assert.equal(replayModel({...h,player:1},true).label,'SAVED');
});
test('six-player replays and two-player penalties work under the strict style policy',()=>{
 const html=replayHTML({...h,abilities:[{id:'A01',player:'<unsafe>',name:'Ability',triggered:true}]},'match:1');
 assert.equal((html.match(/class="replay-player /g)||[]).length,6);
 assert.ok(!html.includes('style='));
 assert.ok(html.includes('&lt;unsafe&gt;'));
 assert.ok(html.includes('ability-glow'));
 const feedback=replayHTML({...h,abilities:[{id:'A01',player:'Player A01',name:'Finishing',value:2,target:'attack',triggered:true}]},'match:bonus');
 assert.ok(feedback.includes('replay-ability-bonus'));assert.ok(feedback.includes('<b class="replay-ability-bonus">+2 ATTACK</b>'));assert.ok(feedback.includes('+2 ATTACK'));
 const failed=replayHTML({...h,abilities:[{id:'B01',player:'Player B01',name:'Defensive leader',triggered:false}]},'match:failed');
 assert.ok(/replay-at-69-34\s+ability-glow/.test(failed),'a player who attempted an ability glows even when its trigger fails');
 const eventStrip=failed.match(/<div class="replay-abilities">([\s\S]*?)<\/div>/)?.[1]||'';
 assert.ok(!eventStrip.includes('ability-glow')&&!eventStrip.includes('ability-energy'),'ability summaries stay clean without electric borders');
 assert.ok(eventStrip.includes('NOT TRIGGERED · NOT CONSUMED'));
 const penalty=replayHTML({...h,player:0,attackCards:h.attackCards.slice(0,1),defenseCards:h.defenseCards.slice(2)},'penalty:1',true);
 assert.equal((penalty.match(/class="replay-player /g)||[]).length,2);
});
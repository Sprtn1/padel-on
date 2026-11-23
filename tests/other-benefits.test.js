import test from 'node:test';
import assert from 'node:assert/strict';
import {otherBenefitsView,otherBenefitStatus,normalizeOtherPlayerInput,benefitRuleLabel} from '../lib/other-benefits.js';
const players=[
 {id:'a',name:'Alpha',active:true,status:'one_free_per_week',current_counter:0},
 {id:'b',name:'Beta',active:true,status:'alternating_free_paid',current_counter:3},
 {id:'c',name:'Charlie',active:true,status:'counting',threshold:5,current_counter:4},
 {id:'d',name:'Delta',active:true,status:'next_free',threshold:5,current_counter:5},
 {id:'e',name:'Echo',active:true,status:'rule_not_configured',current_counter:0},
 {id:'f',name:'Foxtrot',active:false,status:'one_free_per_week',current_counter:0}
];
const games=[{player_id:'a',played_on:'2026-11-23',game_type:'free'}, {player_id:'b',played_on:'2026-11-22',game_type:'paid'}];
test('summary and filters distinguish available, used and review without affecting finances',()=>{
 const current=otherBenefitsView(players,games,'2026-11-23','2026-11-29');
 assert.deepEqual(current.summary,{active:5,ready:1,usedThisWeek:1,review:1});
 assert.equal(current.rows.length,5);
 assert.deepEqual(otherBenefitsView(players,games,'2026-11-23','2026-11-29','','available').rows.map(r=>r.player.id),['d']);
 assert.deepEqual(otherBenefitsView(players,games,'2026-11-23','2026-11-29','','inactive').rows.map(r=>r.player.id),['f']);
 assert.deepEqual(otherBenefitsView(players,games,'2026-11-23','2026-11-29','cha','active').rows.map(r=>r.player.id),['c']);
});
test('a Monday starts a fresh weekly allowance',()=>{
 assert.equal(otherBenefitStatus(players[0],games,'2026-11-23','2026-11-29').ready,false);
 assert.equal(otherBenefitStatus(players[0],games,'2026-11-30','2026-12-06').ready,true);
 assert.equal(otherBenefitStatus(players[1],games,'2026-11-23','2026-11-29').label,'Next game paid');
});
test('counting target is general and validated, earned benefit preserved',()=>{
 assert.equal(benefitRuleLabel(players[2]),'1 free after 5 paid games');
 assert.equal(otherBenefitStatus(players[2],games,'2026-11-23','2026-11-29').progress,'4 / 5 paid games');
 assert.equal(normalizeOtherPlayerInput({name:'Charlie',status:'counting',current_counter:'5',threshold:'5',active:'true'},players[2]).status,'next_free');
 assert.throws(()=>normalizeOtherPlayerInput({name:'Charlie',status:'counting',current_counter:'1',threshold:'',active:'true'},players[2]),/target/);
 assert.throws(()=>normalizeOtherPlayerInput({name:'Delta',status:'counting',current_counter:'5',threshold:'5',active:'true'},players[3]),/earned free/);
});
test('existing weekly counters and unconfigured flags are preserved when edited',()=>{
 const original={...players[0],current_counter:12};
 const value=normalizeOtherPlayerInput({name:'Alpha',status:'one_free_per_week',current_counter:'0',threshold:'',active:'true'},original);
 assert.equal(value.current_counter,12);
 assert.equal(value.threshold,null);
});

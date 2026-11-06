import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrizes,serializePrizes,prizeEditor} from '../lib/tournament-prizes-ui.js';
import {renderAdvancedTournamentWizard,buildTournamentSettingsFromWizard} from '../lib/tournament-advanced-wizard.js';

test('prize allocations round-trip through existing prize_text without migrations',()=>{
 const input={prize_pool:'300',prize_winner:'150',prize_runner_up:'100',prize_third:'40',prize_mvp:'10',prize_notes:'Sponsor'};
 const text=serializePrizes(input);
 assert.deepEqual(parsePrizes(text),{pool:'300.00',winner:'150.00',runner_up:'100.00',third:'40.00',mvp:'10.00',notes:'Sponsor'});
 assert.equal(buildTournamentSettingsFromWizard({...input,prize_mode:'announced'},'groups',8).prize_text,text);
});
test('legacy prize descriptions remain readable and unmodified',()=>{
 assert.equal(serializePrizes({prize_text:'Trophies for finalists'}),'Trophies for finalists');
 assert.equal(parsePrizes('Trophies for finalists').notes,'Trophies for finalists');
});
test('prize editor toggles announcement and retains editable allocations',()=>{
 assert.match(prizeEditor('announced',''),/name="prize_winner"/);
 assert.match(prizeEditor('tba',''),/value="tba" checked/);
});
test('prize amounts reject negative and overprecise input',()=>{
 assert.throws(()=>serializePrizes({prize_pool:'-2'}),/Prize amounts/);
 assert.throws(()=>serializePrizes({prize_pool:'1.999'}),/Prize amounts/);
});

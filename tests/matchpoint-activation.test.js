import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('MatchPoint live rollout is restricted to validated bookings and seven-day window',async()=>{
 const workflow=await read('.github/workflows/matchpoint-reservations-sync.yml');
 const edge=await read('supabase/functions/matchpoint-sync/index.ts');
 assert.match(edge,/MATCHPOINT_ENABLED:\"true\"/);
 assert.match(edge,/MATCHPOINT_FEEDS:\"bookings\"/);
 assert.match(edge,/MATCHPOINT_EXTENDED_SCAN:\"false\"/);
 assert.match(edge,/MATCHPOINT_LOOKAHEAD_DAYS:\"7\"/);
 assert.match(edge,/cfg\.paused!==false/);
 assert.match(edge,/matchpoint_get_cron_config/);
 assert.match(workflow,/matchpoint_set_cron_config/);
 assert.doesNotMatch(workflow,/\n\s+schedule:/);
 assert.match(workflow,/MATCHPOINT_ENABLED: 'true'/);
 assert.match(workflow,/MATCHPOINT_FEEDS: 'bookings'/);
 assert.match(workflow,/MATCHPOINT_EXTENDED_SCAN: 'false'/);
 assert.match(workflow,/MATCHPOINT_PAUSED: \$\{\{ vars\.MATCHPOINT_PAUSED \}\}/);
 assert.match(workflow,/MATCHPOINT_API_TOKEN: \$\{\{ secrets\.MATCHPOINT_API_TOKEN \}\}/);
 assert.match(workflow,/SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
});
test('scheduled sync preserves emergency pause, quota claim, strict wrapper and source ownership',async()=>{
 const worker=await read('scripts/matchpoint-sync.mjs');
 assert.match(worker,/MATCHPOINT_PAUSED==='true'/);
 assert.match(worker,/matchpoint_claim_query_request/);
 assert.match(worker,/parseMatchPointPage\(pageData,\{feed:kind,limit:1000\}\)/);
 assert.match(worker,/findConflict\(item,null\)/);
 assert.match(worker,/overlapsCourtSlot/);
 assert.doesNotMatch(worker,/matchpoint_claim_readiness_20261116/);
});
test('diagnostic is manual-only after activation and no time-slot overrides remain',async()=>{
 const workflow=await read('.github/workflows/matchpoint-connection-check.yml');
 const script=await read('scripts/matchpoint-connection-check.mjs');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s+(push|pull_request|schedule):/);
 assert.doesNotMatch(workflow,/MATCHPOINT_READINESS_ONCE/);
 assert.doesNotMatch(script,/MATCHPOINT_READINESS_ONCE|matchpoint_claim_readiness_20261116/);
});

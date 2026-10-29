import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPeriodRange,shiftReportPeriod,previousReportPeriod,reportPeriodTitle,reportComparisonMetrics} from '../lib/report-comparison.js';

test('comparison periods support day, Monday-Sunday week, and full month ranges',()=>{
 assert.deepEqual(reportPeriodRange('day','2026-10-29'),['2026-10-29','2026-10-29']);
 assert.deepEqual(reportPeriodRange('week','2026-10-26'),['2026-10-26','2026-11-01']);
 assert.deepEqual(reportPeriodRange('month','2026-02'),['2026-02-01','2026-02-28']);
 assert.equal(previousReportPeriod('day','2026-10-29'),'2026-10-28');
 assert.equal(shiftReportPeriod('week','2026-10-26',-1),'2026-10-19');
 assert.equal(shiftReportPeriod('month','2026-01',-1),'2025-12');
 assert.match(reportPeriodTitle('week','2026-10-26'),/Oct/);
});

test('comparison metrics calculate selected-minus-comparison values without mixing cash and Whish',()=>{
 const metrics=value=>({validMatches:Array(value.matches).fill({}),games:Array(value.games).fill({}),weekUsed:value.weekUsed,
  free:value.free,half:value.half,special:value.special,monthFinance:{total:value.revenue,fee:value.fee}});
 const primary=metrics({matches:4,games:7,weekUsed:8,free:5,half:2,special:3,revenue:12000,fee:1800});
 const comparison=metrics({matches:2,games:4,weekUsed:5,free:3,half:1,special:1,revenue:8000,fee:1200});
 const rows=reportComparisonMetrics('month',primary,comparison,
  {recordedIncome:10000,expenses:2000,generated:12000,goodsSold:3000,courtRevenue:6000,privatePayments:1500,whishNet:500},
  {recordedIncome:7000,expenses:2500,generated:9000,goodsSold:2000,courtRevenue:4000,privatePayments:1000,whishNet:-200});
 assert.equal(rows.find(r=>r.key==='matches').primary-rows.find(r=>r.key==='matches').comparison,2);
 assert.equal(rows.find(r=>r.key==='recordedIncome').primary-rows.find(r=>r.key==='recordedIncome').comparison,3000);
 assert.equal(rows.find(r=>r.key==='whishNet').primary-rows.find(r=>r.key==='whishNet').comparison,700);
 assert.equal(rows.find(r=>r.key==='matchmakingRevenue').primary-rows.find(r=>r.key==='matchmakingRevenue').comparison,4000);
});

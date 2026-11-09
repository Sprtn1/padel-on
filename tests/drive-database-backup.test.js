import test from 'node:test';
import assert from 'node:assert/strict';
import {planBackupRetention,shouldPruneAudit} from '../scripts/drive-database-backup.mjs';

const both=['database.dump.gpg','audit_logs.dump.gpg'];
const set=(name,files=both)=>({name,files});

test('keep exactly three latest completed backup pairs and discard older complete pair',()=>{
 const x=planBackupRetention([
  set('padelon-2026-11-01T03-17-00Z'),
  set('padelon-2026-11-04T03-17-00Z'),
  set('padelon-2026-11-03T03-17-00Z'),
  set('padelon-2026-11-02T03-17-00Z')
 ]);
 assert.deepEqual(x.keep,[
  'padelon-2026-11-04T03-17-00Z','padelon-2026-11-03T03-17-00Z','padelon-2026-11-02T03-17-00Z'
 ]);
 assert.deepEqual(x.remove,['padelon-2026-11-01T03-17-00Z']);
});

test('ignore unrelated Drive folders and delete only tool-owned incomplete snapshots',()=>{
 const x=planBackupRetention([
  set('padelon-2026-11-04T03-17-00Z',['database.dump.gpg']),
  set('vacation-photos'),set('padelon-2026-11-03T03-17-00Z'),set('padelon-2026-11-05T03-17-00Z',both),
  set('padelon-2026-11-06T03-17-00Z',['audit_logs.dump.gpg'])
 ]);
 assert.deepEqual(x.keep,['padelon-2026-11-05T03-17-00Z','padelon-2026-11-03T03-17-00Z']);
 assert.deepEqual(x.remove,['padelon-2026-11-04T03-17-00Z','padelon-2026-11-06T03-17-00Z']);
});

test('reject retention counts below one',()=>{
 assert.throws(()=>planBackupRetention([],0),/Invalid backup retention/);
});

test('weekly log clearing is disabled by default and only enabled for Monday Beirut',()=>{
 const monday=new Date('2026-11-08T22:30:00Z');
 const sunday=new Date('2026-11-08T20:30:00Z');
 assert.equal(shouldPruneAudit(monday,'true'),true);
 assert.equal(shouldPruneAudit(monday,'false'),false);
 assert.equal(shouldPruneAudit(monday,undefined),false);
 assert.equal(shouldPruneAudit(sunday,'true'),false);
});

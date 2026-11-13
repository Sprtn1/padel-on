import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const finance=readFileSync(new URL('../lib/cafeteria-finances.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261113070000_staff_cafeteria_finance_void.sql',import.meta.url),'utf8');

test('staff void capability is scoped to the Cafeteria Finances controller',()=>{
 assert.match(app,/canVoid:\(\)=>\['admin','staff'\]\.includes\(state\.staff\?\.role\)/);
 assert.match(finance,/canVoid=\(\)=>isAdmin\(\)/);
 assert.equal((finance.match(/canVoid\(\)\&\&canEdit\(\)/g)||[]).length,5); // includes reservation cancellation
 assert.match(finance,/if\(!canVoid\(\)\)throw Error\('Only authorized staff can void financial entries\.'/);
 assert.match(finance,/if\(!canVoid\(\)\)throw Error\('Only authorized staff can void Whish transactions\.'/);
});

test('day approval and reopening remain administrator-only',()=>{
 assert.match(finance,/if\(act!=='close'\&\&!isAdmin\(\)\)throw Error\('Administrators only\.'/);
 assert.match(finance,/if\(!canEdit\(\)\)throw Error\('Day is closed\.'/);
});

test('migration limits new permission to audited void RPCs',()=>{
 assert.match(migration,/function public\.cafeteria_finance_void_entry\(/);
 assert.match(migration,/function public\.whish_void_entry\(/);
 assert.equal((migration.match(/if not public\.is_staff\(\) then raise exception 'Authorized staff only'/g)||[]).length,2);
 assert.equal((migration.match(/insert into public\.audit_logs/g)||[]).length,2);
 assert.match(migration,/source_private_entry_id is not null or v_previous\.source_court_split_id is not null/);
 assert.doesNotMatch(migration,/grant (?:insert|update|delete|all) on public\./i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog, catalogProducts, makeCustomProduct} from '../lib/editable-order-catalog.js';
import {orderProducts, defaultOrderDraft, orderMessage, orderStats} from '../lib/order-counter.js';
import {reemProducts, defaultReemDraft, reemMessage, reemStats} from '../lib/reem-items.js';
import {orderCounterPage,orderInput,refreshOrderCounterFromStorage} from '../lib/order-counter-ui.js';
import {reemItemsPage,reemInput,refreshReemItemsFromStorage} from '../lib/reem-items-ui.js';

test('each list can add its own product and include it in a generated message', () => {
  const general = makeCustomProduct('Sparkling Orange Soda', orderProducts, []);
  const reem = makeCustomProduct('Sparkling Orange Soda', reemProducts, []);
  assert.ok(general.product && reem.product);
  const ga = catalogProducts(orderProducts, [general.product], []);
  const rb = catalogProducts(reemProducts, [reem.product], []);
  assert.equal(ga.length, 61);
  assert.equal(rb.length, 60);
  const gDraft = defaultOrderDraft(), rDraft = defaultReemDraft();
  gDraft.qty[general.product.id] = 3;
  rDraft.qty[reem.product.id] = 5;
  assert.match(orderMessage(gDraft, ga), /Sparkling Orange Soda x3/);
  assert.match(reemMessage(rDraft, rb), /Sparkling Orange Soda x5/);
  assert.deepEqual(orderStats(gDraft, ga), {products: 1, units: 3});
  assert.deepEqual(reemStats(rDraft, rb), {products: 1, units: 5});
});

test('removed items disappear from the message and can be restored', () => {
  const draft = defaultOrderDraft();
  draft.qty.twix = 4;
  const remaining = catalogProducts(orderProducts, [], ['twix']);
  const hidden = catalogProducts(orderProducts, [], ['twix'], true);
  assert.equal(orderMessage(draft, remaining), 'Add quantities to build your next order.');
  assert.deepEqual(hidden.map(p => p.id), ['twix']);
  assert.match(orderMessage(draft, catalogProducts(orderProducts, [], [])), /Twix x4/);
});

test('catalog validation survives storage reload and rejects accidental duplicates', () => {
  const first = makeCustomProduct('New Rimas Flavor', reemProducts, []);
  assert.ok(first.product);
  const stored = normalizeCatalog({custom:[first.product], hidden:[first.product.id, 'fake-id']}, reemProducts);
  assert.deepEqual(stored.hidden, [first.product.id]);
  assert.equal(stored.custom.length, 1);
  assert.deepEqual(catalogProducts(reemProducts, stored.custom, stored.hidden, true).map(x => x.name), ['New Rimas Flavor']);
  assert.match(makeCustomProduct('new rimas flavor', reemProducts, stored.custom).error, /already exists/);
  assert.match(makeCustomProduct('  ', reemProducts, []).error, /Enter an item name/);
});

test('Both supplier lists sync external local changes without losing their search fields',()=>{
 const stored=new Map(),previous=globalThis.localStorage,doc=globalThis.document;
 const owner='refresh-order-local-tab';
 globalThis.localStorage={getItem:key=>stored.get(key)??null,
  setItem:(key,value)=>stored.set(key,value)};
 globalThis.document={getElementById:()=>null};
 try{
  orderCounterPage(owner);
  reemItemsPage(owner);
  assert.equal(refreshOrderCounterFromStorage(owner),false);
  assert.equal(refreshReemItemsFromStorage(owner),false);
  orderInput({dataset:{orderInput:'search'},value:'Twix'});
  reemInput({dataset:{reemInput:'search'},value:'Water'});
  const general='padelon_admin_order_counter_v1:'+encodeURIComponent(owner);
  const reem='padelon_admin_reem_items_v1:'+encodeURIComponent(owner);
  stored.set(general,JSON.stringify({qty:{twix:7},intro:'Updated remotely'}));
  stored.set(reem,JSON.stringify({qty:{tannourine_05:12}}));
  assert.equal(refreshOrderCounterFromStorage(owner),true);
  assert.equal(refreshReemItemsFromStorage(owner),true);
  let html=orderCounterPage(owner);
  assert.match(html,/id="order-search"[^>]*value="Twix"/);
  assert.match(html,/Twix x7/);
  html=reemItemsPage(owner);
  assert.match(html,/id="reem-search"[^>]*value="Water"/);
  assert.match(html,/Tannourine Water 0.5 L x12/);
  assert.equal(refreshOrderCounterFromStorage(owner),false);
  assert.equal(refreshReemItemsFromStorage(owner),false);
  assert.ok(stored.has(general)&&stored.has(reem));
 }finally{
  globalThis.localStorage=previous;
  globalThis.document=doc;
 }
});

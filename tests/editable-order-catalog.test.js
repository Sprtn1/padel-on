import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog, catalogProducts, makeCustomProduct} from '../lib/editable-order-catalog.js';
import {orderProducts, defaultOrderDraft, orderMessage, orderStats} from '../lib/order-counter.js';
import {reemProducts, defaultReemDraft, reemMessage, reemStats} from '../lib/reem-items.js';

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

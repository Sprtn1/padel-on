import test from 'node:test';
import assert from 'node:assert/strict';
import {orderProducts, defaultOrderDraft, orderQuantity, selectedOrderProducts, orderStats, orderMessage} from '../lib/order-counter.js';

test('catalog preserves all historical items and the common subset', () => {
  assert.equal(orderProducts.length, 60);
  assert.equal(orderProducts.filter(item => item.frequency === 3).length, 15);
  assert.equal(new Set(orderProducts.map(item => item.id)).size, 60);
  assert.ok(orderProducts.some(item => item.id === 'barista' && item.frequency === 3));
});

test('starts with an empty message and zero totals', () => {
  const draft = defaultOrderDraft();
  assert.deepEqual(orderStats(draft), {products: 0, units: 0});
  assert.equal(orderMessage(draft), 'Add quantities to build your next order.');
});

test('positive quantities generate a WhatsApp-ready full message', () => {
  const draft = defaultOrderDraft();
  draft.qty = {maltesers: 8, twix: 4, snickers: 6, gong_original: 0};
  assert.deepEqual(orderStats(draft), {products: 3, units: 18});
  assert.deepEqual(selectedOrderProducts(draft).map(p => p.id), ['maltesers', 'twix', 'snickers']);
  assert.equal(orderMessage(draft), 'Hello, please prepare this order:\n\n- Maltesers x8\n- Twix x4\n- Snickers x6\n\nThank you!');
});

test('draft copy is customizable and zero quantities are excluded', () => {
  const draft = defaultOrderDraft();
  draft.intro = 'Stock order for PADEL ON';
  draft.outro = '';
  draft.qty = {barista: '2', nutella_biscuits: 0};
  assert.equal(orderMessage(draft), 'Stock order for PADEL ON\n\n- Barista Nespresso Intenso Capsules x2');
});

test('quantities are normalized safely', () => {
  assert.equal(orderQuantity('8'), 8);
  assert.equal(orderQuantity('-4'), 0);
  assert.equal(orderQuantity('nope'), 0);
  assert.equal(orderQuantity(100000), 9999);
  assert.equal(orderQuantity(2.99), 2);
});

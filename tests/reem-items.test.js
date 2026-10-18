import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reemProducts, defaultReemDraft, reemQuantity, reemStats,
  selectedReemProducts, reemMessage
} from '../lib/reem-items.js';
import {reemItemsPage, reemInput, reemAction} from '../lib/reem-items-ui.js';

test('Reem has a unique catalog, distinct from the existing general supplier list', () => {
  assert.equal(reemProducts.length, 59);
  assert.equal(new Set(reemProducts.map(item => item.id)).size, 59);
  assert.equal(reemProducts.filter(item => item.frequent).length, 40);
  for (const id of ['gatorade_330_blue', 'gatorade_500_blue', 'tannourine_05', 'lipton_red_zero', 'indomie_chicken']) {
    assert.ok(reemProducts.some(item => item.id === id), 'Missing ' + id);
  }
});

test('Reem message formats order and excludes unselected items', () => {
  const draft = defaultReemDraft();
  assert.equal(draft.intro, "Reem's Items List:");
  draft.qty = {tannourine_05: 30, gatorade_330_blue: 6, pringles_ketchup: 1, pacha_melon: 0};
  assert.equal(reemMessage(draft),
    "Reem's Items List:\n\n- Tannourine Water 0.5 L x30\n- Gatorade 330 ml — Blue x6\n- Pringles — Ketchup x1");
  assert.deepEqual(reemStats(draft), {products: 3, units: 37});
  assert.equal(selectedReemProducts(draft).length, 3);
  assert.equal(reemQuantity(-4), 0);
  assert.equal(reemQuantity(999999), 9999);
});

test('Reem UI saves to its own key and handles steps separately', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value)
  };
  globalThis.document = {getElementById: () => null};
  globalThis.confirm = () => true;
  const owner = 'reem-test-admin';
  let html = reemItemsPage(owner);
  assert.match(html, /Reem's Items List/);
  assert.match(html, /data-reem-input="quantity"/);
  assert.match(html, /data-action="reem-copy"/);
  assert.doesNotMatch(html, /data-action="order-copy"/);

  reemInput({dataset: {reemInput: 'quantity', reemId: 'tannourine_05'}, value: '30', closest: () => null});
  await reemAction({dataset: {action: 'reem-step', id: 'gatorade_330_blue', delta: '1'}}, () => {});
  html = reemItemsPage(owner);
  assert.match(html, /Tannourine Water 0.5 L x30/);
  assert.match(html, /Gatorade 330 ml — Blue x1/);
  const keys = [...memory.keys()];
  assert.equal(keys.length, 1);
  assert.ok(keys[0].startsWith('padelon_admin_reem_items_v1:'));
  assert.ok(!keys[0].includes('order_counter'));

  await reemAction({dataset: {action: 'reem-clear'}}, () => {});
  assert.doesNotMatch(reemItemsPage(owner), /Tannourine Water 0.5 L x30/);
});

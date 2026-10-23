import {orderProducts, defaultOrderDraft, orderQuantity, selectedOrderProducts, orderStats, orderMessage} from './order-counter.js';
import {normalizeCatalog, catalogProducts, makeCustomProduct} from './editable-order-catalog.js';

// UI-only draft: accessible through the authenticated staff/admin page, never from a public standalone route.
const ui = {filter: 'common', search: '', owner: '', draft: defaultOrderDraft(), custom: [], hidden: []};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ensureOwner(owner) {
  const key = 'padelon_admin_order_counter_v1:' + encodeURIComponent(String(owner || 'admin'));
  if (ui.owner === key) return;
  ui.owner = key; ui.filter = 'common'; ui.search = '';
  ui.draft = defaultOrderDraft(); ui.custom = []; ui.hidden = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      ({custom: ui.custom, hidden: ui.hidden} = normalizeCatalog(saved, orderProducts));
      if (saved.qty && typeof saved.qty === 'object' && !Array.isArray(saved.qty)) {
        for (const product of [...ui.custom, ...orderProducts]) {
          const n = orderQuantity(saved.qty[product.id]);
          if (n) ui.draft.qty[product.id] = n;
        }
      }
      if (typeof saved.intro === 'string') ui.draft.intro = saved.intro.slice(0, 240);
      if (typeof saved.outro === 'string') ui.draft.outro = saved.outro.slice(0, 240);
    }
  } catch {}
}
function save() {
  try { localStorage.setItem(ui.owner, JSON.stringify({...ui.draft, custom: ui.custom, hidden: ui.hidden})); } catch {}
}
function activeCatalog(){return catalogProducts(orderProducts, ui.custom, ui.hidden);}
function removedCatalog(){return catalogProducts(orderProducts, ui.custom, ui.hidden, true);}
const statsHTML = () => {
  const stats = orderStats(ui.draft, activeCatalog());
  return `<section class="order-metrics">
    <div class="order-metric"><strong id="order-products-count">${stats.products}</strong><span>Products selected</span></div>
    <div class="order-metric"><strong id="order-units-count">${stats.units}</strong><span>Pieces / packs</span></div>
    <div class="order-metric"><strong>${activeCatalog().filter(p => p.frequency === 3).length}</strong><span>Common to all 3 lists</span></div>
  </section>`;
};
function shownProducts() {
  const q = ui.search.toLowerCase().trim();
  return activeCatalog().filter(p =>
    (ui.filter === 'all' || (ui.filter === 'common' && (p.frequency === 3 || p.category === 'Added Items')) ||
      (ui.filter === 'selected' && orderQuantity(ui.draft.qty[p.id]) > 0)) &&
    (!q || (p.name + ' ' + p.category).toLowerCase().includes(q))
  );
}
function catalogHTML() {
  const matches = shownProducts();
  if (!matches.length) return '<p class="order-empty">No matching products. Try All products or a different search.</p>';
  let category = '';
  return matches.map(p => {
    let heading = '';
    if (p.category !== category) {
      category = p.category;
      heading = `<h3 class="order-category">${escapeHTML(category)}</h3>`;
    }
    const n = orderQuantity(ui.draft.qty[p.id]);
    return heading + `<div class="order-item ${n ? 'selected' : ''}" data-order-row="${escapeHTML(p.id)}">
      <div class="order-product-info"><strong>${escapeHTML(p.name)}</strong>
        ${ui.filter === 'all' && p.frequency === 3 ? '<small>Common to all 3 orders</small>' : ''}
      </div>
      <div class="order-stepper">
        <button type="button" data-action="order-step" data-id="${escapeHTML(p.id)}" data-delta="-1" aria-label="Decrease ${escapeHTML(p.name)}">−</button>
        <input data-order-input="quantity" data-order-id="${escapeHTML(p.id)}" type="number" min="0" max="9999" step="1" inputmode="numeric" aria-label="Quantity for ${escapeHTML(p.name)}" value="${n}"/>
        <button type="button" data-action="order-step" data-id="${escapeHTML(p.id)}" data-delta="1" aria-label="Increase ${escapeHTML(p.name)}">+</button>
      </div>
      <button type="button" class="order-remove-btn" data-action="order-remove-item" data-id="${escapeHTML(p.id)}" aria-label="Remove ${escapeHTML(p.name)}" title="Remove ${escapeHTML(p.name)}">×</button>
    </div>`;
  }).join('');
}

function removedHTML() {
  const items = removedCatalog();
  return `<details class="order-removed"><summary>Removed items (${items.length}) — restore items</summary>
    <div class="order-removed-list">${items.length ? items.map(item => `<div class="order-removed-item">
      <span>${escapeHTML(item.name)}</span>
      <button type="button" class="btn btn-light btn-xs" data-action="order-restore-item" data-id="${escapeHTML(item.id)}">Restore</button>
    </div>`).join('') : '<p>No removed items.</p>'}</div></details>`;
}
export function orderCounterPage(owner) {
  ensureOwner(owner);
  const filterButton = (value, label) =>
    `<button type="button" class="order-filter ${ui.filter === value ? 'active' : ''}"
      data-action="order-filter" data-filter="${value}" aria-pressed="${ui.filter === value}">${label}</button>`;
  return `<div class="heading-row">
    <div><div class="eyebrow">Settings / Ordering tools</div><h1>Order Counter</h1><p>Enter stock quantities, then copy the complete order for WhatsApp.</p></div>
    <div class="heading-actions"><button class="btn btn-light" data-action="order-back">← Back to Settings</button></div>
  </div>
  ${statsHTML()}
  <div class="order-layout">
    <section class="panel order-panel">
      <div class="order-panel-head"><h2>Select products & quantities</h2><p>Start with recurring items, or switch to all products.</p></div>
      <form class="order-add-form" id="order-add-form" data-save="order-add-item">
        <label for="order-new-name">Add a new item</label>
        <div class="order-add-fields"><input class="form-input" id="order-new-name" type="text" name="item_name" required maxlength="100" autocomplete="off" placeholder="Enter product name"/><button type="submit" class="btn btn-primary">+ Add Item</button></div>
        <small>Added items appear under Added Items. Tap × to remove any item.</small>
      </form>
      <div class="order-filters">${filterButton('common','Common to all 3')}${filterButton('all','All products')}${filterButton('selected','Selected only')}</div>
      <div class="order-search-box"><input data-order-input="search" id="order-search" type="search" class="form-input" placeholder="Search products or flavors…" autocomplete="off" value="${escapeHTML(ui.search)}"/></div>
      <div class="order-catalog">${catalogHTML()}</div>${removedHTML()}
    </section>
    <section class="panel order-panel order-preview-panel">
      <div class="order-panel-head"><h2>Ready-to-send message</h2><p>The message updates as quantities change.</p></div>
      <div class="order-preview-body">
        <div class="order-message-fields">
          <label><span>Opening line</span><input class="form-input" data-order-input="intro" maxlength="240" value="${escapeHTML(ui.draft.intro)}"/></label>
          <label><span>Closing line</span><input class="form-input" data-order-input="outro" maxlength="240" value="${escapeHTML(ui.draft.outro)}"/></label>
        </div>
        <label class="order-message-label" for="order-result">Your generated message</label>
        <textarea id="order-result" class="form-input order-result" readonly spellcheck="false" aria-live="polite">${escapeHTML(orderMessage(ui.draft, activeCatalog()))}</textarea>
        <div class="order-actions"><button class="btn btn-primary" data-action="order-copy">Copy full message</button><button class="btn btn-light" data-action="order-clear">Clear quantities</button></div>
        <p class="order-note">Quantities stay on this device. Only items above 0 appear in the message.</p>
      </div>
    </section>
  </div>`;
}
export function updateOrderPreview() {
  const stats = orderStats(ui.draft, activeCatalog());
  const products = document.getElementById('order-products-count');
  const units = document.getElementById('order-units-count');
  const result = document.getElementById('order-result');
  if (products) products.textContent = stats.products;
  if (units) units.textContent = stats.units;
  if (result) result.value = orderMessage(ui.draft, activeCatalog());
}
export function orderInput(target) {
  const kind = target.dataset.orderInput;
  if (kind === 'search') { ui.search = target.value; return 'search'; }
  if (kind === 'quantity') {
    const id = target.dataset.orderId;
    if (!activeCatalog().some(p => p.id === id)) return '';
    ui.draft.qty[id] = orderQuantity(target.value);
    const row = target.closest('.order-item');
    row?.classList.toggle('selected', ui.draft.qty[id] > 0);
  } else if (kind === 'intro' || kind === 'outro') {
    ui.draft[kind] = target.value.slice(0, 240);
  } else return '';
  save(); updateOrderPreview();
  return kind;
}

export function orderAddItem(rawName, toast) {
  const result = makeCustomProduct(rawName, orderProducts, ui.custom);
  if (result.error) {toast(result.error, true); return false;}
  ui.custom.unshift(result.product); ui.filter = 'all'; ui.search = '';
  save(); toast('Item added'); return true;
}
export async function orderAction(target, toast) {
  const act = target.dataset.action;
  if (act === 'order-remove-item') {
    const item = activeCatalog().find(item => item.id === target.dataset.id);
    if (!item) return false;
    if (!confirm('Remove "' + item.name + '" from this list? You can restore it later.')) return false;
    ui.hidden.push(item.id); delete ui.draft.qty[item.id];
    save(); toast('Item removed — use Removed items to restore it.'); return true;
  }
  if (act === 'order-restore-item') {
    if (!removedCatalog().some(item => item.id === target.dataset.id)) return false;
    ui.hidden = ui.hidden.filter(id => id !== target.dataset.id);
    ui.filter = 'all'; ui.search = '';
    save(); toast('Item restored'); return true;
  }
  if (act === 'order-filter') {
    if (!['common', 'all', 'selected'].includes(target.dataset.filter)) return false;
    ui.filter = target.dataset.filter; return true;
  }
  if (act === 'order-step') {
    const id = target.dataset.id;
    if (!activeCatalog().some(p => p.id === id)) return false;
    const delta = Number(target.dataset.delta);
    if (delta !== -1 && delta !== 1) return false;
    ui.draft.qty[id] = orderQuantity(orderQuantity(ui.draft.qty[id]) + delta);
    save(); return true;
  }
  if (act === 'order-clear') {
    if (selectedOrderProducts(ui.draft, activeCatalog()).length && !confirm('Clear all quantities to start a new order?')) return false;
    ui.draft.qty = {}; save(); toast('Ready for a new order'); return true;
  }
  if (act === 'order-copy') {
    if (!selectedOrderProducts(ui.draft, activeCatalog()).length) { toast('Add at least one quantity first', true); return false; }
    const message = orderMessage(ui.draft, activeCatalog());
    try { await navigator.clipboard.writeText(message); toast('Full order copied!'); }
    catch {
      const textarea = document.getElementById('order-result');
      textarea?.focus(); textarea?.select();
      if (textarea && document.execCommand('copy')) toast('Full order copied!');
      else toast('Select the message and copy it manually.', true);
    }
    return false;
  }
  return false;
}

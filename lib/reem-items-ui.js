import {reemProducts, defaultReemDraft, reemQuantity, selectedReemProducts, reemStats, reemMessage} from './reem-items.js';
import {normalizeCatalog, catalogProducts, makeCustomProduct} from './editable-order-catalog.js';

// UI-only draft: accessible through the authenticated staff/admin page, never from a public standalone route.
const ui = {filter: 'frequent', search: '', owner: '', draft: defaultReemDraft(), custom: [], hidden: []};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ensureOwner(owner) {
  const key = 'padelon_admin_reem_items_v1:' + encodeURIComponent(String(owner || 'admin'));
  if (ui.owner === key) return;
  ui.owner = key; ui.filter = 'frequent'; ui.search = '';
  ui.draft = defaultReemDraft(); ui.custom = []; ui.hidden = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      ({custom: ui.custom, hidden: ui.hidden} = normalizeCatalog(saved, reemProducts));
      if (saved.qty && typeof saved.qty === 'object' && !Array.isArray(saved.qty)) {
        for (const product of [...ui.custom, ...reemProducts]) {
          const n = reemQuantity(saved.qty[product.id]);
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
function activeCatalog(){return catalogProducts(reemProducts, ui.custom, ui.hidden);}
function removedCatalog(){return catalogProducts(reemProducts, ui.custom, ui.hidden, true);}
const statsHTML = () => {
  const stats = reemStats(ui.draft, activeCatalog());
  return `<section class="order-metrics">
    <div class="order-metric"><strong id="reem-products-count">${stats.products}</strong><span>Products selected</span></div>
    <div class="order-metric"><strong id="reem-units-count">${stats.units}</strong><span>Pieces / packs</span></div>
    <div class="order-metric"><strong>${activeCatalog().filter(p => p.frequent).length}</strong><span>Frequently ordered</span></div>
  </section>`;
};
function shownProducts() {
  const q = ui.search.toLowerCase().trim();
  return activeCatalog().filter(p =>
    (ui.filter === 'all' || (ui.filter === 'frequent' && (p.frequent || p.category === 'Added Items')) ||
      (ui.filter === 'selected' && reemQuantity(ui.draft.qty[p.id]) > 0)) &&
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
    const n = reemQuantity(ui.draft.qty[p.id]);
    return heading + `<div class="order-item ${n ? 'selected' : ''}" data-reem-row="${escapeHTML(p.id)}">
      <div class="order-product-info"><strong>${escapeHTML(p.name)}</strong>
        ${ui.filter === 'all' && p.frequent ? '<small>Frequently ordered</small>' : ''}
      </div>
      <div class="order-stepper">
        <button type="button" data-action="reem-step" data-id="${escapeHTML(p.id)}" data-delta="-1" aria-label="Decrease ${escapeHTML(p.name)}">−</button>
        <input data-reem-input="quantity" data-reem-id="${escapeHTML(p.id)}" type="number" min="0" max="9999" step="1" inputmode="numeric" aria-label="Quantity for ${escapeHTML(p.name)}" value="${n}"/>
        <button type="button" data-action="reem-step" data-id="${escapeHTML(p.id)}" data-delta="1" aria-label="Increase ${escapeHTML(p.name)}">+</button>
      </div>
      <button type="button" class="order-remove-btn" data-action="reem-remove-item" data-id="${escapeHTML(p.id)}" aria-label="Remove ${escapeHTML(p.name)}" title="Remove ${escapeHTML(p.name)}">×</button>
    </div>`;
  }).join('');
}

function removedHTML() {
  const items = removedCatalog();
  return `<details class="order-removed"><summary>Removed items (${items.length}) — restore items</summary>
    <div class="order-removed-list">${items.length ? items.map(item => `<div class="order-removed-item">
      <span>${escapeHTML(item.name)}</span>
      <button type="button" class="btn btn-light btn-xs" data-action="reem-restore-item" data-id="${escapeHTML(item.id)}">Restore</button>
    </div>`).join('') : '<p>No removed items.</p>'}</div></details>`;
}
export function reemItemsPage(owner) {
  ensureOwner(owner);
  const filterButton = (value, label) =>
    `<button type="button" class="order-filter ${ui.filter === value ? 'active' : ''}"
      data-action="reem-filter" data-filter="${value}" aria-pressed="${ui.filter === value}">${label}</button>`;
  return `<div class="heading-row">
    <div><div class="eyebrow">Settings / Ordering tools</div><h1>Reem's Items List</h1><p>Prepare a delivery list for Reem without mixing it with the other supplier counter.</p></div>
    <div class="heading-actions"><button class="btn btn-light" data-action="reem-back">← Back to Settings</button></div>
  </div>
  ${statsHTML()}
  <div class="order-layout">
    <section class="panel order-panel">
      <div class="order-panel-head"><h2>Reem's delivery items</h2><p>Enter delivery quantities below. The other supplier's items remain separate.</p></div>
      <form class="order-add-form" id="reem-add-form" data-save="reem-add-item">
        <label for="reem-new-name">Add a new item</label>
        <div class="order-add-fields"><input class="form-input" id="reem-new-name" type="text" name="item_name" required maxlength="100" autocomplete="off" placeholder="Enter product name"/><button type="submit" class="btn btn-primary">+ Add Item</button></div>
        <small>Added items appear under Added Items. Tap × to remove any item.</small>
      </form>
      <div class="order-filters">${filterButton('frequent','Frequently ordered')}${filterButton('all','All products')}${filterButton('selected','Selected only')}</div>
      <div class="order-search-box"><input data-reem-input="search" id="reem-search" type="search" class="form-input" placeholder="Search products or flavors…" autocomplete="off" value="${escapeHTML(ui.search)}"/></div>
      <div class="order-catalog">${catalogHTML()}</div>${removedHTML()}
    </section>
    <section class="panel order-panel order-preview-panel">
      <div class="order-panel-head"><h2>Ready-to-send message</h2><p>The message updates as quantities change.</p></div>
      <div class="order-preview-body">
        <div class="order-message-fields">
          <label><span>Opening line</span><input class="form-input" data-reem-input="intro" maxlength="240" value="${escapeHTML(ui.draft.intro)}"/></label>
          <label><span>Closing line</span><input class="form-input" data-reem-input="outro" maxlength="240" value="${escapeHTML(ui.draft.outro)}"/></label>
        </div>
        <label class="order-message-label" for="reem-result">Reem's generated message</label>
        <textarea id="reem-result" class="form-input order-result" readonly spellcheck="false" aria-live="polite">${escapeHTML(reemMessage(ui.draft, activeCatalog()))}</textarea>
        <div class="order-actions"><button class="btn btn-primary" data-action="reem-copy">Copy Reem's list</button><button class="btn btn-light" data-action="reem-clear">Clear quantities</button></div>
        <p class="order-note">Only items above zero are included. Drafts are not shared across devices.</p>
      </div>
    </section>
  </div>`;
}
export function updateReemPreview() {
  const stats = reemStats(ui.draft, activeCatalog());
  const products = document.getElementById('reem-products-count');
  const units = document.getElementById('reem-units-count');
  const result = document.getElementById('reem-result');
  if (products) products.textContent = stats.products;
  if (units) units.textContent = stats.units;
  if (result) result.value = reemMessage(ui.draft, activeCatalog());
}
export function reemInput(target) {
  const kind = target.dataset.reemInput;
  if (kind === 'search') { ui.search = target.value; return 'search'; }
  if (kind === 'quantity') {
    const id = target.dataset.reemId;
    if (!activeCatalog().some(p => p.id === id)) return '';
    ui.draft.qty[id] = reemQuantity(target.value);
    const row = target.closest('.order-item');
    row?.classList.toggle('selected', ui.draft.qty[id] > 0);
  } else if (kind === 'intro' || kind === 'outro') {
    ui.draft[kind] = target.value.slice(0, 240);
  } else return '';
  save(); updateReemPreview();
  return kind;
}

export function reemAddItem(rawName, toast) {
  const result = makeCustomProduct(rawName, reemProducts, ui.custom);
  if (result.error) {toast(result.error, true); return false;}
  ui.custom.unshift(result.product); ui.filter = 'all'; ui.search = '';
  save(); toast('Item added'); return true;
}
export async function reemAction(target, toast) {
  const act = target.dataset.action;
  if (act === 'reem-remove-item') {
    const item = activeCatalog().find(item => item.id === target.dataset.id);
    if (!item) return false;
    if (!confirm('Remove "' + item.name + '" from this list? You can restore it later.')) return false;
    ui.hidden.push(item.id); delete ui.draft.qty[item.id];
    save(); toast('Item removed — use Removed items to restore it.'); return true;
  }
  if (act === 'reem-restore-item') {
    if (!removedCatalog().some(item => item.id === target.dataset.id)) return false;
    ui.hidden = ui.hidden.filter(id => id !== target.dataset.id);
    ui.filter = 'all'; ui.search = '';
    save(); toast('Item restored'); return true;
  }
  if (act === 'reem-filter') {
    if (!['frequent', 'all', 'selected'].includes(target.dataset.filter)) return false;
    ui.filter = target.dataset.filter; return true;
  }
  if (act === 'reem-step') {
    const id = target.dataset.id;
    if (!activeCatalog().some(p => p.id === id)) return false;
    const delta = Number(target.dataset.delta);
    if (delta !== -1 && delta !== 1) return false;
    ui.draft.qty[id] = reemQuantity(reemQuantity(ui.draft.qty[id]) + delta);
    save(); return true;
  }
  if (act === 'reem-clear') {
    if (selectedReemProducts(ui.draft, activeCatalog()).length && !confirm("Clear all quantities for Reem's Items List?")) return false;
    ui.draft.qty = {}; save(); toast("Reem's quantities cleared"); return true;
  }
  if (act === 'reem-copy') {
    if (!selectedReemProducts(ui.draft, activeCatalog()).length) { toast('Add at least one quantity first', true); return false; }
    const message = reemMessage(ui.draft, activeCatalog());
    try { await navigator.clipboard.writeText(message); toast("Reem's items list copied!"); }
    catch {
      const textarea = document.getElementById('reem-result');
      textarea?.focus(); textarea?.select();
      if (textarea && document.execCommand('copy')) toast("Reem's items list copied!");
      else toast('Select the message and copy it manually.', true);
    }
    return false;
  }
  return false;
}

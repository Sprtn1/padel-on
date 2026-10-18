// Shared helpers for the two independent ordering catalogs.
// No catalog is sent to the server; each account and browser retains its own copy.
const MAX_CUSTOM_ITEMS = 200;
export function normalizeCatalog(saved, base) {
  const ids = new Set(base.map(p => p.id));
  const names = new Set(base.map(p => p.name.trim().toLocaleLowerCase()));
  const custom = [];
  const input = Array.isArray(saved?.custom) ? saved.custom : [];
  for (const item of input) {
    if (custom.length >= MAX_CUSTOM_ITEMS) break;
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string') continue;
    const name = item.name.trim();
    if (!/^custom-[a-z0-9-]{5,64}$/.test(item.id) || !name || name.length > 100 ||
        ids.has(item.id) || names.has(name.toLocaleLowerCase())) continue;
    custom.push({id:item.id, name, category:'Added Items', frequency:0, frequent:false});
    ids.add(item.id);
    names.add(name.toLocaleLowerCase());
  }
  const hidden = Array.isArray(saved?.hidden)
    ? [...new Set(saved.hidden.filter(id => typeof id === 'string' && ids.has(id)))]
    : [];
  return {custom, hidden};
}
export function catalogProducts(base, custom, hidden, includeHidden = false) {
  const hiddenSet = new Set(hidden);
  return [...custom, ...base].filter(item => hiddenSet.has(item.id) === includeHidden);
}
export function makeCustomProduct(nameValue, base, custom) {
  const name = typeof nameValue === 'string' ? nameValue.trim().replace(/\s+/g,' ') : '';
  if (!name || name.length > 100) return {error:'Enter an item name (up to 100 characters).'};
  if ([...base, ...custom].some(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    return {error:'This item already exists. If removed, restore it from Removed Items.'};
  if (custom.length >= MAX_CUSTOM_ITEMS) return {error:'Custom item limit reached.'};
  const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  return {product:{id, name, category:'Added Items', frequency:0, frequent:false}};
}

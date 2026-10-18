// PADEL ON admin Order Counter. The catalog is compiled from three historical stock orders.
// Keep all order quantities local to the signed-in admin's browser (not Supabase).
const groups = [
  ['Chocolates & biscuits',[
    ['maltesers','Maltesers',3],['bueno_white','Kinder Bueno White',3],
    ['bueno_choc','Kinder Bueno Chocolate',3],['delice','Kinder Délice',3],
    ['kinder_4','Kinder Chocolate (4 fingers)',3],['twix','Twix',3],
    ['snickers','Snickers',3],['snack','Snack (small)',3],
    ['kitkat_4','KitKat (4 fingers)',3],['metro','Metro (50.4 g)',1],
    ['albeni','Albeni (52 g)',1],['nutella_bready','Nutella B-ready',2],
    ['nutella_biscuits','Nutella Biscuits',2],['kitkat_chunky','KitKat Chunky',1],
    ['laviva_red','Laviva Red',1],['mars','Mars',2],
    ['lion_small','Lion (small)',1],['maltesers_bar','Maltesers Bar',1]
  ]],
  ['Yogurt & chilled',[
    ['yogurt_straw','Khoury Greek Yogurt — Strawberry',3],
    ['yogurt_blue','Khoury Greek Yogurt — Blueberry',3],
    ['yogurt_nuts','Khoury Greek Yogurt — Nuts on top',2],
    ['yogurt_granola','Khoury Greek Yogurt — Granola',1],
    ['candia_ayran','Candia Ayran Laban',1]
  ]],
  ['Chips & snacks',[
    ['dolsi_waves','Dolsi Small Chips — Waves',2],
    ['dolsi_twister','Dolsi Small Chips — Twister',2],
    ['dolsi_peanuts','Dolsi Small Chips — Peanuts',2],
    ['dolsi_cheese','Dolsi Small Chips — Cheese',2]
  ]],
  ['Rice cakes',[
    ['gong_original','Gong Rice Cake — Original',3],
    ['gong_herbs','Gong Rice Cake — Herbs',2],
    ['gong_honey','Gong Rice Cake — Honey Mustard',3],
    ['gong_spicy_cheese','Gong Rice Cake — Spicy Cheese',1],
    ['gong_chocolate','Gong Rice Cake — Chocolate',2]
  ]],
  ['Crax sticks',[
    ['crax_cheese','Crax Sticks — Cheese',2],
    ['crax_plain','Crax Sticks — Plain / Salted',3],
    ['crax_herbs','Crax Sticks — Herbs',2],
    ['crax_spicy','Crax Sticks — Spicy',1]
  ]],
  ['Fitness & protein bars',[
    ['fitness_cappuccino','Fitness — Cappuccino',1],
    ['fitness_white','Fitness — White Chocolate',1],
    ['fitness_milk','Fitness — Milk Chocolate',1],
    ['fitness_straw','Fitness — Strawberry',1],
    ['fitness_fiber','Fitness Fiber — Mixed (4 flavors)',1],
    ['go_chocolate','Go Protein — Chocolate (brown)',1],
    ['go_peanut','Go Protein — Peanuts',2],
    ['go_blue','Go Protein — Blue / Cookies',2],
    ['go_pistachio','Go Protein — Pistachio',1],
    ['mak_green','Mak Bar — Green',1],
    ['mak_chocolate','Mak Bar — Chocolate',1],
    ['mak_blue','Mak Bar — Blue',1]
  ]],
  ['Gum & candy',[
    ['gummies_small','Gummies — Small Mix',0],
    ['gummies_big','Gummies — Big Mix',0],
    ['trident','Trident Gum — Mixed',1],
    ['clorets_blue','Clorets — Blue',1],
    ['clorets_red','Clorets — Red',1],
    ['clorets_green','Clorets — Green',1],
    ['mentos','Mentos Chewing Candy — Mixed',1]
  ]],
  ['Coffee & supplies',[
    ['barista','Barista Nespresso Intenso Capsules',3],
    ['najar','Najar Raqwa Classic',1],
    ['nescafe_3','Nescafé 3-in-1',1],
    ['nescafe_2','Nescafé 2-in-1',1],
    ['cups','Plastic Cups — 400 cc',1]
  ]]
];

export const orderProducts = groups.flatMap(([category, items]) =>
  items.map(([id, name, frequency]) => ({id, name, category, frequency}))
);
export const defaultOrderDraft = () => ({
  qty: {}, intro: 'Hello, please prepare this order:', outro: 'Thank you!'
});
export function orderQuantity(value) {
  return Math.max(0, Math.min(9999, Math.floor(Number(value) || 0)));
}
export function selectedOrderProducts(draft, products = orderProducts) {
  return products.filter(product => orderQuantity(draft?.qty?.[product.id]) > 0);
}
export function orderStats(draft, products = orderProducts) {
  const selected = selectedOrderProducts(draft, products);
  return {products: selected.length,
    units: selected.reduce((sum, item) => sum + orderQuantity(draft.qty[item.id]), 0)};
}
export function orderMessage(draft, products = orderProducts) {
  const selected = selectedOrderProducts(draft, products);
  if (!selected.length) return 'Add quantities to build your next order.';
  const lines = selected.map(p => '- ' + p.name + ' x' + orderQuantity(draft.qty[p.id]));
  return [String(draft.intro ?? '').trim(), lines.join('\n'), String(draft.outro ?? '').trim()]
    .filter(Boolean).join('\n\n');
}

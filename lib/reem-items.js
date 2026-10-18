// A separate catalog for Reem's delivery orders. This is never merged with the general Order Counter.
const reemGroups = [
  [
    "Water",
    [
      [
        "water_05",
        "Water 0.5 L (unspecified brand)",
        true
      ],
      [
        "water_15",
        "Water 1.5 L (unspecified brand)",
        true
      ],
      [
        "tannourine_05",
        "Tannourine Water 0.5 L",
        true
      ],
      [
        "tannourine_15",
        "Tannourine Water 1.5 L",
        true
      ]
    ]
  ],
  [
    "Lipton Iced Tea",
    [
      [
        "lipton_peach",
        "Lipton Iced Tea — Peach",
        true
      ],
      [
        "lipton_peach_zero",
        "Lipton Iced Tea — Peach Diet / Zero Sugar",
        true
      ],
      [
        "lipton_red",
        "Lipton Iced Tea — Red Fruits",
        true
      ],
      [
        "lipton_red_zero",
        "Lipton Iced Tea — Red Fruits Light / Zero Sugar",
        true
      ],
      [
        "lipton_tropical",
        "Lipton Iced Tea — Tropical",
        false
      ],
      [
        "lipton_peach_straw",
        "Lipton Iced Tea — Peach Strawberry",
        false
      ],
      [
        "lipton_peach_tropical",
        "Lipton Iced Tea — Peach Tropical",
        false
      ]
    ]
  ],
  [
    "Gatorade & Energy Drinks",
    [
      [
        "gatorade_330_blue",
        "Gatorade 330 ml — Blue",
        true
      ],
      [
        "gatorade_330_orange",
        "Gatorade 330 ml — Orange",
        true
      ],
      [
        "gatorade_500_blue",
        "Gatorade 500 ml — Blue",
        true
      ],
      [
        "gatorade_500_redorange",
        "Gatorade 500 ml — Red / Orange",
        true
      ],
      [
        "redbull",
        "Red Bull — Original",
        false
      ],
      [
        "redbull_zero",
        "Red Bull — Sugar Free / Light",
        true
      ],
      [
        "darkblue_330",
        "Dark Blue 330 ml",
        true
      ]
    ]
  ],
  [
    "Pacha & Maccaw",
    [
      [
        "pacha_melon",
        "Pacha — Melon",
        true
      ],
      [
        "pacha_lychee",
        "Pacha — Lychee",
        true
      ],
      [
        "pacha_apple",
        "Pacha — Apple",
        true
      ],
      [
        "pacha_peach",
        "Pacha — Peach",
        true
      ],
      [
        "pacha_mango",
        "Pacha — Mango",
        false
      ],
      [
        "pacha_cherry",
        "Pacha — Cherry",
        false
      ],
      [
        "maccaw_apple",
        "Maccaw — Apple",
        true
      ],
      [
        "maccaw_pineapple",
        "Maccaw — Pineapple",
        true
      ],
      [
        "maccaw_mango",
        "Maccaw — Mango",
        true
      ]
    ]
  ],
  [
    "Coffee & Milkshakes",
    [
      [
        "nescafe_3in1",
        "Nescafé 3-in-1",
        true
      ],
      [
        "nescafe_2in1",
        "Nescafé 2-in-1",
        false
      ],
      [
        "iced_coffee_original",
        "Iced Coffee — Original",
        true
      ],
      [
        "iced_coffee_mocha",
        "Iced Coffee — Mocha",
        true
      ],
      [
        "iced_coffee_espresso",
        "Iced Coffee — Espresso",
        false
      ],
      [
        "milkshake_chocolate",
        "Milkshake — Chocolate",
        true
      ],
      [
        "milkshake_strawberry",
        "Milkshake — Strawberry",
        true
      ],
      [
        "cappuccino",
        "Cappuccino",
        false
      ]
    ]
  ],
  [
    "Soft Drinks",
    [
      [
        "pepsi_185",
        "Pepsi 185 ml — Regular",
        false
      ],
      [
        "pepsi_diet_185",
        "Pepsi 185 ml — Diet / Zero Sugar (small can)",
        true
      ],
      [
        "kinza_185",
        "Kinza 185 ml",
        false
      ],
      [
        "sevenup_small",
        "7UP — Small Can",
        false
      ]
    ]
  ],
  [
    "Perrier & Freeze",
    [
      [
        "perrier_original",
        "Perrier — Original / Plain (330 ml can)",
        true
      ],
      [
        "perrier_lemon",
        "Perrier — Lemon",
        true
      ],
      [
        "freeze_mango_peach",
        "Freeze — Mango & Peach",
        true
      ],
      [
        "freeze_strawberry",
        "Freeze — Strawberry",
        true
      ]
    ]
  ],
  [
    "Rimas Cakes",
    [
      [
        "rimas_brownie",
        "Rimas — Brownie",
        true
      ],
      [
        "rimas_chocolate",
        "Rimas — Chocolate Cake",
        false
      ],
      [
        "rimas_strawberry",
        "Rimas — Strawberry Cake",
        true
      ]
    ]
  ],
  [
    "Pringles",
    [
      [
        "pringles_original",
        "Pringles — Original",
        true
      ],
      [
        "pringles_bbq",
        "Pringles — BBQ",
        true
      ],
      [
        "pringles_spicy",
        "Pringles — Spicy",
        true
      ],
      [
        "pringles_spicy_small",
        "Pringles — Hot & Spicy (Small)",
        false
      ],
      [
        "pringles_salt_vinegar",
        "Pringles — Salt & Vinegar",
        true
      ],
      [
        "pringles_sourcream",
        "Pringles — Sour Cream / Green",
        true
      ],
      [
        "pringles_ketchup",
        "Pringles — Ketchup",
        true
      ]
    ]
  ],
  [
    "Castania & Snacks",
    [
      [
        "castania_cashews",
        "Castania — Cashews",
        true
      ],
      [
        "castania_pistachio",
        "Castania — Pistachios",
        false
      ],
      [
        "castania_peanuts",
        "Castania — Peanuts",
        false
      ],
      [
        "castania_corn",
        "Castania — Crispy Corn",
        false
      ]
    ]
  ],
  [
    "Indomie Cups",
    [
      [
        "indomie_chicken",
        "Indomie Cup — Chicken",
        false
      ],
      [
        "indomie_vegetables",
        "Indomie Cup — Vegetables",
        false
      ]
    ]
  ]
];

export const reemProducts = reemGroups.flatMap(([category, entries]) =>
  entries.map(([id, name, frequent]) => ({id, name, category, frequent}))
);
export function defaultReemDraft() {
  return {qty: {}, intro: "Reem's Items List:", outro: ''};
}
export function reemQuantity(value) {
  return Math.max(0, Math.min(9999, Math.floor(Number(value) || 0)));
}
export function selectedReemProducts(draft) {
  return reemProducts.filter(product => reemQuantity(draft?.qty?.[product.id]) > 0);
}
export function reemStats(draft) {
  const items = selectedReemProducts(draft);
  return {products: items.length, units: items.reduce((total, item) => total + reemQuantity(draft.qty[item.id]), 0)};
}
export function reemMessage(draft) {
  const selected = selectedReemProducts(draft);
  if (!selected.length) return "Enter quantities to prepare Reem's Items List.";
  const lines = selected.map(item => '- ' + item.name + ' x' + reemQuantity(draft.qty[item.id]));
  return [String(draft.intro ?? '').trim(), lines.join('\n'), String(draft.outro ?? '').trim()]
    .filter(Boolean).join('\n\n');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Mobile drawer replaces the scrolling bottom bar and retains role-filtered navigation',()=>{
 const app=src('../app.js'),styles=src('../styles/mobile-experience.css'),nav=src('../lib/navigation.js');
 assert.match(app,/id="mobile-drawer"/);
 assert.match(app,/navMarkup\(false\)/);
 assert.match(app,/data-action="mobile-menu-toggle"/);
 assert.match(app,/if\(mobileMenuOpen\)setMobileMenuOpen\(false/);
 assert.match(nav,/isAdmin\|\|key!=='cafeteria-payments'/);
 assert.match(styles,/\.mobile-bar\{display:none!important\}/);
 assert.match(styles,/safe-area-inset-bottom/);
});
test('New responsive stylesheet follows existing tournament overrides',()=>{
 const boot=src('../bootstrap.js');
 assert.ok(boot.indexOf("'./styles/mobile-experience.css'")>boot.indexOf("'./styles/tournament-advanced.css'"));
});

import {icon} from '../lib/icons.js';
test('Hamburger icon is visibly distinct from the generic information fallback',()=>{
 assert.match(icon('menu'),/M4 6h16M4 12h16M4 18h16/);
});
test('Authentication resets the mobile drawer and scrolling lock',()=>{
 assert.match(src('../app.js'),/function renderAuth\(message=''\)\{\s*mobileMenuOpen=false;document.body.classList.remove\('mobile-menu-open'\)/);
});

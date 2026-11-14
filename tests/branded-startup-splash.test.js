import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('The branded splash renders before the application bootstrap with first-paint styles',()=>{
 const html=read('index.html');
 const css=read('styles/startup-splash.css');
 const stylesheet=html.indexOf('href="./styles/startup-splash.css"');
 const mount=html.indexOf('id="app"');
 const bootstrap=html.indexOf('src="./bootstrap.js"');
 assert.ok(stylesheet>=0&&stylesheet<mount&&mount<bootstrap);
 assert.match(html,/<main class="startup"/);
 assert.match(html,/<img src="\.\/assets\/logo\.svg" alt=""/);
 assert.match(html,/PADEL ON<\/h1>/);
 assert.match(html,/CLUB MANAGEMENT/);
 assert.match(html,/Preparing your workspace/);
 assert.doesNotMatch(html,/class="loader"/);
 assert.doesNotMatch(html,/Loading PADEL ON…/);
 assert.match(css,/#app \.startup/);
 assert.match(css,/#app \.startup-progress-indicator/);
 assert.match(css,/@keyframes po-splash-progress/);
});
test('Splash accessibility respects reduced-motion and avoids fabricated progress',()=>{
 const html=read('index.html');
 const css=read('styles/startup-splash.css');
 assert.match(html,/role="status"/);
 assert.match(html,/role="progressbar" aria-label="Loading PADEL ON"/);
 assert.doesNotMatch(html,/aria-valuenow=/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/animation:none;transform:translateX\(66%\)/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('Existing CSP and authenticated app bootstrap remain unchanged',()=>{
 const html=read('index.html');
 const bootstrap=read('bootstrap.js');
 assert.match(html,/script-src 'self';/);
 assert.match(html,/src="\.\/bootstrap\.js"/);
 assert.match(bootstrap,/await import\(`\.\/app\.js\?v=/);
 assert.match(bootstrap,/const v = Date\.now\(\)\.toString\(36\)/);
});

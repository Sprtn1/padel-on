// PADEL ON bootstrap: keep executable JavaScript out of HTML so CSP can block inline scripts.
const v = Date.now().toString(36);
// Resolve the saved theme before dynamically loading the application styles.
const {readTheme} = await import(`./lib/theme-preference.js?v=${v}`);
let startupStorage=null;
try{startupStorage=window.localStorage;}catch{}
const initialTheme=readTheme(startupStorage);
document.documentElement.dataset.theme=initialTheme;
document.documentElement.style.colorScheme=initialTheme;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',initialTheme==='dark'?'#101922':'#f8f9fc');
    const icon = document.getElementById('site-favicon');
    if (icon) icon.href = `./assets/favicon.svg?v=${v}`;
    // CSS is modular; append stylesheets in cascade order.
    for (const path of ['./styles.css', './styles/tournament.css', './styles/cafeteria-payments.css', './styles/consignment.css', './styles/cafeteria-shifts.css', './styles/interface-polish.css', './styles/tournament-workspace.css', './styles/tournament-advanced.css', './styles/mobile-experience.css', './styles/court-timeboard.css', './styles/court-scheduler.css', './styles/court-payment-splits.css', './styles/club-multisport-calendar.css', './styles/club-calendar-v19.css', './styles/court-kinetic-v2.css', './styles/court-kinetic-sitewide.css', './styles/theme-dark.css', './styles/theme-contrast-fixes.css']) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = `${path}?v=${v}`;
      document.head.appendChild(stylesheet);
    }
    try {
      await import(`./app.js?v=${v}`);
    } catch (error) {
      console.error('PADEL ON could not load:', error);
      document.getElementById('app').textContent = 'Unable to load PADEL ON. Check your connection and try reloading.';
    }

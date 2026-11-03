// PADEL ON bootstrap: keep executable JavaScript out of HTML so CSP can block inline scripts.
const v = Date.now().toString(36);
    const icon = document.getElementById('site-favicon');
    if (icon) icon.href = `./assets/favicon.svg?v=${v}`;
    // CSS is modular; append both in the same cascade order as the original stylesheet.
    for (const path of ['./styles.css', './styles/tournament.css']) {
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

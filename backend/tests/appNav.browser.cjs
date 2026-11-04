// Bottom bar and account menu, against a mocked API: widths, keyboard, reduced motion, logout. No database.
require('./browserGuard.cjs');
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CHROME = process.env.SETTINGS_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const origin = process.env.SETTINGS_BROWSER_ORIGIN || 'http://127.0.0.1:5173';
const delay = ms => new Promise(r => setTimeout(r, ms));
const mock = () => {
  localStorage.setItem('spendsense_token', 'nav-test');
  const native = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const text = String(url);
    if (!text.startsWith('http://localhost:4000') && !text.startsWith('/api/')) return native(url, options);
    const route = new URL(text, location.origin).pathname.replace(/^\/api/, '');
    const value = route === '/auth/me' ? { id: 'nav', setupCompletedAt: '2026-10-01T00:00:00.000Z' }
      : route === '/profile' ? { userId: 'nav', email: 'nav@example.invalid', displayName: 'ทดสอบ', hasAvatar: false }
      : route === '/notifications' ? { items: [], unreadCount: 0 } : null;
    // Other routes fail on purpose: each page shows its error state, and only the bar is under test.
    return new Response(JSON.stringify(value ?? { error: 'not mocked' }), { status: value ? 200 : 503, headers: { 'Content-Type': 'application/json' } });
  };
};
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'));
  const browser = cp.spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const done = code => { browser.kill(); process.exit(code); };
  try {
    let dp; for (let i = 0; i < 100 && !dp; i++) { try { dp = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {} await delay(100); }
    const list = await (await fetch('http://127.0.0.1:' + dp + '/json/list')).json();
    const s = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => { s.onopen = r; });
    let id = 0; const pend = new Map(); s.onmessage = e => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { pend.get(x.id)(x.result || x); pend.delete(x.id); } };
    const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); s.send(JSON.stringify({ id: k, method, params })); });
    const ev = async x => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
    const waitFor = async x => { for (let i = 0; i < 300; i++) { if (await ev(x)) return; await delay(50); } throw Error('timeout: ' + x); };
    const key = async k => { const code = { ArrowDown: 40, ArrowUp: 38, Escape: 27, End: 35, Enter: 13 }[k]; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); };
    const size = w => send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: w < 768 });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + mock.toString() + ')()' });
    await size(1440); await send('Page.navigate', { url: origin + '/behavior' });
    await waitFor("document.querySelector('.app-nav')!==null");

    const analysis = "document.querySelector('.app-nav-group > button')";
    await waitFor(`${analysis}.classList.contains('is-active')`);
    console.log('PASS analysis button is selected on an analysis page');

    assert.equal(await ev("[...document.querySelectorAll('.app-nav a, .app-nav button')].every(e=>e.getAttribute('aria-label'))"), true);
    console.log('PASS every bar control has an accessible name');

    await ev(`${analysis}.focus()`); await key('ArrowDown');
    await waitFor("document.activeElement?.getAttribute('href')==='/behavior'");
    await key('ArrowDown'); assert.equal(await ev("document.activeElement.getAttribute('href')"), '/forecast');
    await key('End'); assert.equal(await ev("document.activeElement.getAttribute('href')"), '/anomaly');
    await key('ArrowDown'); assert.equal(await ev("document.activeElement.getAttribute('href')"), '/behavior');
    await key('Escape'); await waitFor("document.querySelector('.app-nav-menu')===null");
    assert.equal(await ev(`document.activeElement===${analysis}`), true);
    await key('ArrowUp'); await waitFor("document.activeElement?.getAttribute('href')==='/anomaly'");
    await key('Enter'); await waitFor("location.pathname==='/anomaly'&&document.querySelector('.app-nav-menu')===null");
    console.log('PASS analysis menu works by keyboard');

    await waitFor("document.querySelector('.user-header-profile')!==null");
    console.log('PASS account menu is on /anomaly');

    assert.equal(await ev("document.querySelector('.sidebar, .mobile-tabbar')"), null);
    console.log('PASS old sidebar is gone');

    for (const w of [320, 359, 360, 390]) {
      await size(w);
      for (const route of ['/overview', '/transactions', '/budget', '/goals', '/forecast']) {
        await ev(`document.querySelector('.app-nav a[href="${route}"]')?.click()`);
        if (route === '/forecast') { await ev(`${analysis}.click()`); await waitFor("document.querySelector('.app-nav-menu')!==null"); await ev("document.querySelector('.app-nav-menu a[href=\"/forecast\"]').click()"); }
        await waitFor(`location.pathname===${JSON.stringify(route)}`); await delay(320);
        const r = await ev("(()=>{const b=document.querySelector('.app-nav').getBoundingClientRect();return {l:b.left,r:b.right,w:innerWidth,label:document.querySelector('.app-nav .is-active .app-nav-label')?.offsetWidth}})()");
        assert.ok(r.l >= 0 && r.r <= r.w, `bar overflows at ${w} on ${route}: ${JSON.stringify(r)}`);
        if (w < 360) assert.ok(!r.label, `label should be hidden at ${w}`); else assert.ok(r.label > 0, `label should show at ${w}`);
      }
    }
    console.log('PASS bar fits 320, 359, 360 and 390 with labels hidden only below 360');

    assert.equal(await ev("(()=>{const t=document.createElement('div');t.className='local-toast-region';t.style.height='60px';document.body.append(t);const gap=document.querySelector('.app-nav').getBoundingClientRect().top-t.getBoundingClientRect().bottom;t.remove();return gap>=0})()"), true);
    console.log('PASS toast sits above the bar');

    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await ev("getComputedStyle(document.querySelector('.app-nav-label')).transitionDuration.split(',').every(d=>parseFloat(d)===0)"), true);
    console.log('PASS reduced motion stops the animation');

    await ev("document.querySelector('.user-header-profile').click()");
    await waitFor("document.querySelector('.account-logout')!==null");
    assert.equal(await ev("document.querySelector('.user-header-menu a[href=\"/settings\"]')!==null"), true);
    await ev("document.querySelector('.account-logout').click()");
    await waitFor("location.pathname==='/login'");
    assert.equal(await ev("localStorage.getItem('spendsense_token')"), null);
    console.log('PASS account menu has settings and logs out');
    s.close(); done(0);
  } catch (e) { console.error('FAIL', e.message); done(1); }
})();

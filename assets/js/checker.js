/* CoinLink.co — phishing link checker + verified link directory. */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc;

  /* FNV-1a 32-bit over UTF-8 bytes; shard = first byte as hex (matches scripts/build_blocklist.py) */
  function shardOf(d) {
    const b = new TextEncoder().encode(d);
    let h = 0x811c9dc5;
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 24).toString(16).padStart(2, '0');
  }
  const shardCache = {};
  async function inBlocklist(d) {
    const s = shardOf(d);
    if (!shardCache[s]) {
      shardCache[s] = CL.fetchJSON(CL.base + 'data/blocklist/' + s + '.txt?b=' + Math.floor(Date.now() / 864e5), { text: true, timeout: 15000 })
        .then((t) => new Set(t.split('\n'))).catch(() => new Set());
    }
    return (await shardCache[s]).has(d);
  }

  let VER = null;
  async function verified() {
    if (VER) return VER;
    try { VER = await CL.local('verified'); } catch (e) { VER = []; }
    VER.forEach((v) => { v.core = coreOf(v.d); });
    return VER;
  }

  const MULTI = ['co.uk', 'com.au', 'co.jp', 'com.br', 'co.in', 'co.kr', 'com.tr', 'com.cn', 'org.uk', 'co.za', 'com.sg', 'com.hk', 'co.nz'];
  const HOSTING = ['pages.dev', 'vercel.app', 'netlify.app', 'web.app', 'firebaseapp.com', 'github.io', 'gitbook.io', 'workers.dev', 'herokuapp.com', 'glitch.me', 'repl.co', 'replit.app', 'onrender.com', 'surge.sh', 'webflow.io', 'wixsite.com', 'weebly.com', 'blogspot.com', 'ipfs.io', 'fleek.co', 'azurewebsites.net', 'framer.app', 'framer.website', 'myshopify.com', 'square.site', 'carrd.co', 'godaddysites.com', 'translate.goog'];
  const RISKY_TLDS = ['xyz', 'top', 'click', 'live', 'online', 'site', 'shop', 'icu', 'cyou', 'buzz', 'rest', 'monster', 'sbs', 'cfd', 'lol', 'quest', 'bond', 'support', 'claims', 'info', 'pro', 'vip', 'gift', 'win', 'loan', 'work', 'world', 'today', 'run', 'fun', 'space', 'website', 'center', 'network', 'events', 'cam', 'ru', 'tk', 'ml', 'ga', 'cf', 'gq'];
  const KEYWORDS = ['claim', 'airdrop', 'reward', 'bonus', 'giveaway', 'gift', 'free', 'drop', 'connect', 'walletconnect', 'sync', 'validate', 'validation', 'verify', 'verification', 'restore', 'recover', 'recovery', 'rectify', 'migrate', 'migration', 'unlock', 'secure', 'security', 'support', 'helpdesk', 'help-desk', 'dapp', 'presale', 'whitelist', 'allowlist', 'mint', 'double', 'refund', 'compensation', 'eligible', 'eligibility', 'checker', 'portal', 'login', 'signin', 'wallet-auth', 'kyc', 'unstake', 'staking-reward'];

  function registrable(h) {
    const p = h.split('.');
    if (p.length <= 2) return h;
    const last2 = p.slice(-2).join('.');
    if (MULTI.indexOf(last2) > -1) return p.slice(-3).join('.');
    for (const s of HOSTING) if (h === s || h.endsWith('.' + s)) { const n = s.split('.').length; return p.slice(-(n + 1)).join('.'); }
    return last2;
  }
  function coreOf(h) { const r = registrable(h); let c = r.split('.')[0]; if (c.indexOf('xn--') === 0) { const i = c.lastIndexOf('-'); c = i > 4 ? c.slice(4, i) : c.slice(4); } return c; }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  const HOMO = [[/0/g, 'o'], [/1/g, 'l'], [/3/g, 'e'], [/5/g, 's'], [/rn/g, 'm'], [/vv/g, 'w'], [/i/g, 'l'], [/4/g, 'a'], [/7/g, 't']];
  const norm = (s) => HOMO.reduce((x, r) => x.replace(r[0], r[1]), s.replace(/-/g, ''));

  function parse(raw) {
    raw = String(raw || '').trim();
    if (!raw) return null;
    let s = raw;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
    let u; try { u = new URL(s); } catch (e) { return null; }
    let h = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!h || h.indexOf('.') === -1) return null;
    return { raw, url: u, host: h.replace(/^www\./, ''), full: h, scheme: u.protocol.replace(':', ''), hadScheme: /^[a-z]+:\/\//i.test(raw), userinfo: !!(u.username || u.password) };
  }

  async function analyze(raw) {
    const p = parse(raw);
    if (!p) return { error: 'That doesn’t look like a web address. Paste a full link like https://example.com.' };
    const reasons = [], good = [];
    let score = 0, match = null, suggest = null;
    const H = p.host, reg = registrable(H), core = coreOf(H), tld = H.split('.').pop();
    // 1. blocklist (host and every parent)
    const parts = H.split('.');
    let listed = null;
    for (let i = 0; i < parts.length - 1; i++) { const cand = parts.slice(i).join('.'); if (await inBlocklist(cand)) { listed = cand; break; } }
    if (!listed && p.full !== H && await inBlocklist(p.full)) listed = p.full;
    // 2. verified
    const V = await verified();
    for (const v of V) { if (H === v.d || H.endsWith('.' + v.d)) { if (!match || v.d.length > match.d.length) match = v; } }
    if (listed) { score = 100; reasons.push('<b>' + esc(listed) + '</b> is on a public crypto phishing blocklist (ScamSniffer / MetaMask). Do not connect a wallet or enter anything.'); }
    else if (match) { good.push('Matches the verified domain <b>' + esc(match.d) + '</b> (' + esc(match.n) + ' · ' + esc(match.c) + ').'); }
    // 3. structural red flags
    if (/^xn--|\.xn--/.test(p.full)) { score += 35; reasons.push('Uses an internationalized (punycode) domain — letters may be look-alike characters from other alphabets.'); }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(H)) { score += 35; reasons.push('Points to a raw IP address instead of a named domain.'); }
    if (p.userinfo) { score += 30; reasons.push('Contains an “@” trick: the real destination is not what appears at the start of the link.'); }
    if (p.hadScheme && p.scheme === 'http') { score += 8; reasons.push('Not using HTTPS encryption.'); }
    if (H.split('.').length >= 5) { score += 10; reasons.push('Unusually deep subdomain chain — often used to hide the real domain.'); }
    const hosting = HOSTING.find((s) => H === s || H.endsWith('.' + s));
    if (hosting && !match) { score += 18; reasons.push('Hosted on a free/shared platform (<b>' + esc(hosting) + '</b>) — anyone can create these in minutes. Official crypto apps rarely live here.'); }
    if (RISKY_TLDS.indexOf(tld) > -1 && !match) { score += 10; reasons.push('Uses the <b>.' + esc(tld) + '</b> extension, which is heavily abused for phishing.'); }
    const kw = KEYWORDS.filter((k) => H.indexOf(k) > -1);
    if (kw.length && !match) { score += Math.min(24, 8 * kw.length); reasons.push('Contains bait words: <b>' + kw.map(esc).join(', ') + '</b>.'); }
    // 4. look-alike detection
    if (!match && !listed) {
      const nc = norm(core);
      let best = null;
      for (const v of V) {
        if (!v.core || v.core.length < 4) continue;
        let why = null, pts = 0;
        if (core === v.core && reg !== registrable(v.d)) { why = 'uses the same name as <b>' + esc(v.d) + '</b> but a different domain'; pts = 40; }
        else if (H.indexOf(v.d + '.') === 0 || H.indexOf('.' + v.d + '.') > -1) { why = 'puts <b>' + esc(v.d) + '</b> in front of a different domain (' + esc(reg) + ')'; pts = 50; }
        else if (nc === norm(v.core) && core !== v.core) { why = 'swaps look-alike characters to imitate <b>' + esc(v.d) + '</b>'; pts = 50; }
        else if (v.core.length >= 5 && core.length >= 4) {
          const dist = lev(core, v.core);
          if (dist > 0 && dist <= (v.core.length >= 8 ? 2 : 1)) { why = 'is ' + dist + ' character' + (dist > 1 ? 's' : '') + ' away from <b>' + esc(v.d) + '</b> (typosquat)'; pts = 45; }
          else if (core !== v.core && ((v.core.length >= 5 && new RegExp('(^|[^a-z])' + v.core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(H.replace(/\./g, '-'))) || (v.core.length >= 6 && core.indexOf(v.core) > -1))) { why = 'uses the <b>' + esc(v.n) + '</b> brand name inside an unofficial domain'; pts = 35; }
        }
        if (why && (!best || pts > best.pts)) best = { why, pts, v };
      }
      if (best) { score += best.pts; reasons.unshift('This domain ' + best.why + '.'); suggest = best.v; }
    }
    score = Math.min(100, score);
    let level, title;
    if (listed) { level = 'danger'; title = 'Known phishing site — stay away'; }
    else if (match && score < 20) { level = 'safe'; title = 'Verified official domain'; score = Math.min(score, 5); }
    else if (score >= 80) { level = 'danger'; title = 'Very likely a scam'; }
    else if (score >= 50) { level = 'high'; title = 'High risk — strong scam signals'; }
    else if (score >= 20) { level = 'caution'; title = 'Caution — suspicious signals'; }
    else { level = 'low'; title = 'No red flags found — but not verified'; }
    return { p, score, level, title, reasons, good, match, suggest, listed };
  }

  function render(res, box) {
    if (res.error) { box.className = 'verdict on v-caution'; box.innerHTML = '<p>' + esc(res.error) + '</p>'; return; }
    box.className = 'verdict on v-' + res.level;
    const tips = {
      safe: 'This is the domain we have on record. Still double-check the address bar and never share your seed phrase — no legitimate site will ask for it.',
      low: 'It’s not on blocklists and shows no obvious tricks, but it’s also not in our verified directory. Find the official link from the project’s verified profile before connecting a wallet.',
      caution: 'Don’t connect a wallet or sign anything until you’ve confirmed this domain from an official source.',
      high: 'Treat this as a scam. Close the page, and if you already connected a wallet, revoke approvals immediately.',
      danger: 'Close the page now. If you connected a wallet or signed a transaction, move funds to a fresh wallet and revoke token approvals.'
    };
    box.innerHTML = '<div class="verdict-head"><div class="gauge" style="--score:' + res.score + '"><span>' + res.score + '</span></div><div><p class="eyebrow">Risk score / 100</p><h3>' + esc(res.title) + '</h3><p class="small muted">' + esc(res.p.full) + '</p></div></div>' +
      (res.good.length || res.reasons.length ? '<ul>' + res.good.map((g) => '<li class="up">✓ ' + g + '</li>').join('') + res.reasons.map((r) => '<li>⚠️ ' + r + '</li>').join('') + '</ul>' : '') +
      (res.suggest ? '<p class="callout callout-gold small">Looking for <b>' + esc(res.suggest.n) + '</b>? The verified domain is <a href="https://' + esc(res.suggest.d) + '" target="_blank" rel="noopener nofollow">' + esc(res.suggest.d) + '</a>.</p>' : '') +
      '<p class="small">' + tips[res.level] + '</p>' +
      '<div class="pay-btns"><button class="btn btn-ghost btn-sm" data-report-prefill="' + esc(res.p.raw) + '">Report this link</button><button class="btn btn-ghost btn-sm" data-copy="' + esc('CoinLink check: ' + res.p.full + ' — ' + res.title + ' (' + res.score + '/100)') + '">Copy result</button><a class="btn btn-ghost btn-sm" href="' + CL.base + 'learn/verify-official-crypto-websites.html">How to verify links</a></div>';
    const hist = CL.store.get('cl_checks', []);
    hist.unshift({ d: res.p.full, s: res.score, l: res.level, t: Date.now() });
    CL.store.set('cl_checks', hist.slice(0, 8));
    paintHistory();
  }

  function paintHistory() {
    const el = $('[data-check-history]'); if (!el) return;
    const h = CL.store.get('cl_checks', []);
    el.innerHTML = h.length ? h.map((x) => '<button class="chip" data-recheck="' + esc(x.d) + '">' + (x.l === 'safe' ? '✅' : x.l === 'danger' || x.l === 'high' ? '⛔' : x.l === 'caution' ? '⚠️' : 'ℹ️') + ' ' + esc(x.d) + '</button>').join('') : '<span class="small muted">Your recent checks appear here (stored only in your browser).</span>';
  }

  function initChecker() {
    const form = $('[data-checker]'); if (!form) return;
    const input = $('input', form), box = $('[data-verdict]');
    const run = async (v) => {
      if (v != null) input.value = v;
      const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Checking…';
      try { render(await analyze(input.value), box); } finally { btn.disabled = false; btn.textContent = 'Check link'; }
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    document.addEventListener('click', (e) => {
      const r = e.target.closest('[data-recheck]'); if (r) run(r.dataset.recheck);
      const ex = e.target.closest('[data-example]'); if (ex) run(ex.dataset.example);
      const rp = e.target.closest('[data-report-prefill]');
      if (rp) { const f = $('#report'); const u = $('[name=reported_url]'); if (u) u.value = rp.dataset.reportPrefill; if (f) f.scrollIntoView({ behavior: 'smooth' }); }
    });
    paintHistory();
    const q = new URLSearchParams(location.search).get('url');
    if (q) run(q);
    else if (form.dataset.redirect) { /* home mini-checker posts to the full page */ }
  }

  /* home mini checker: redirect to full page with ?url= */
  function initMini() {
    $$('[data-mini-checker]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); const v = $('input', f).value.trim(); if (v) location.href = CL.base + 'link-checker.html?url=' + encodeURIComponent(v); }));
  }

  /* ---------- directory ---------- */
  async function initDirectory() {
    const grid = $('[data-directory]'); if (!grid) return;
    let dir = { categories: [] }, meta = {}, markets = null;
    try { dir = await CL.local('directory'); } catch (e) {}
    try { meta = await CL.local('coins-meta'); } catch (e) {}
    try { markets = await CL.local('markets'); } catch (e) {}
    const items = [];
    dir.categories.forEach((c) => c.items.forEach((i) => items.push({ name: i.name, domain: i.domain, path: i.path || '', cat: c.name, best: i.best || '', icon: c.icon || '🔗' })));
    const ranks = {}; ((markets && markets.coins) || []).forEach((c) => (ranks[c.id] = c.rank));
    Object.keys(meta).sort((a, b) => (ranks[a] || 9999) - (ranks[b] || 9999)).forEach((id) => {
      const m = meta[id]; if (!m.homepage || !m.homepage[0]) return;
      let d; try { d = new URL(m.homepage[0]).hostname.replace(/^www\./, ''); } catch (e) { return; }
      items.push({ name: m.name + ' (' + (m.symbol || '').toUpperCase() + ')', domain: d, path: new URL(m.homepage[0]).pathname.replace(/\/$/, ''), cat: 'Coins & tokens', best: 'Official project website' + (ranks[id] ? ' · rank #' + ranks[id] : ''), icon: '🪙', coin: id, explorer: (m.explorers || [])[0] });
    });
    const cats = ['All'].concat(Array.from(new Set(items.map((i) => i.cat))));
    const chips = $('[data-dir-cats]');
    let cat = new URLSearchParams(location.search).get('cat') || 'All', q = '';
    if (chips) chips.innerHTML = cats.map((c) => '<button class="chip' + (c === cat ? ' on' : '') + '" data-dcat="' + esc(c) + '">' + esc(c) + ' <small class="muted">' + (c === 'All' ? items.length : items.filter((i) => i.cat === c).length) + '</small></button>').join('');
    const reviewed = dir.reviewed || '';
    const draw = () => {
      const s = q.toLowerCase();
      const list = items.filter((i) => (cat === 'All' || i.cat === cat) && (!s || (i.name + ' ' + i.domain + ' ' + i.best).toLowerCase().indexOf(s) > -1));
      grid.innerHTML = list.slice(0, 400).map((i) => {
        const url = 'https://' + i.domain + (i.path || '');
        return '<article class="dir-card"><h3><span>' + i.icon + ' ' + esc(i.name) + '</span><span class="badge-verified" title="' + (reviewed ? 'Reviewed ' + esc(reviewed) : 'Verified') + '">✓ Verified</span></h3>' +
          '<a class="domain" href="' + esc(url) + '" target="_blank" rel="noopener nofollow">' + esc(i.domain + (i.path || '')) + '</a>' +
          '<p>' + esc(i.cat) + (i.best ? ' · ' + esc(i.best) : '') + '</p>' +
          '<div class="dir-actions"><button class="btn btn-ghost btn-xs" data-copy="' + esc(url) + '">Copy</button>' + (i.coin ? '<a class="btn btn-ghost btn-xs" href="' + CL.coinHref(i.coin, window.__set) + '">Profile</a>' : '') + (i.explorer ? '<a class="btn btn-ghost btn-xs" href="' + esc(i.explorer) + '" target="_blank" rel="noopener nofollow">Explorer</a>' : '') + '<a class="btn btn-ghost btn-xs" href="' + CL.base + 'list-your-project.html?project=' + encodeURIComponent(i.name) + '&type=Report+a+wrong+link">Report</a></div></article>';
      }).join('') || '<p class="empty">No verified links match “' + esc(q) + '”. <a href="' + CL.base + 'link-checker.html?url=' + encodeURIComponent(q) + '">Check it with the link checker →</a></p>';
      const c = $('[data-dir-count]'); if (c) c.textContent = list.length + ' verified destinations';
    };
    window.__set = await CL.staticCoins();
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-dcat]'); if (b) { $$('[data-dcat]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); cat = b.dataset.dcat; draw(); } });
    const si = $('[data-dir-search]'); if (si) si.addEventListener('input', () => { q = si.value; draw(); });
    draw();
  }

  CL.ready(() => { initChecker(); initMini(); initDirectory(); });
  CL.analyzeLink = analyze;
})();

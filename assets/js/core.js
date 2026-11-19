/* CoinLink.co core — shared data layer + UI behaviours. No dependencies. */
(function () {
  'use strict';
  const CL = (window.CL = window.CL || {});
  const cfg = (CL.cfg = window.CL_CONFIG || {});
  const doc = document.documentElement;
  CL.base = doc.getAttribute('data-base') || '';
  const $ = (CL.$ = (s, r) => (r || document).querySelector(s));
  const $$ = (CL.$$ = (s, r) => Array.from((r || document).querySelectorAll(s)));

  /* ---------- storage ---------- */
  CL.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    sget(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const esc = (CL.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  /* ---------- currency + formatting ---------- */
  CL.cur = CL.store.get('cl_cur', 'usd');
  const SYM = { usd: '$', eur: '€', gbp: '£', cad: 'C$', inr: '₹', aud: 'A$', jpy: '¥', btc: '₿' };
  CL.fmt = {
    money(v, cur) {
      cur = cur || CL.cur;
      if (v == null || isNaN(v)) return '—';
      const s = SYM[cur] || '';
      const a = Math.abs(v);
      let d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 4 : 8;
      if (cur === 'btc') d = a >= 1 ? 4 : 8;
      if (cur === 'jpy' && a >= 1) d = 0;
      return s + Number(v).toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
    },
    compact(v, cur) {
      cur = cur || CL.cur;
      if (v == null || isNaN(v)) return '—';
      const s = SYM[cur] || '';
      const a = Math.abs(v);
      if (a >= 1e12) return s + (v / 1e12).toFixed(2) + 'T';
      if (a >= 1e9) return s + (v / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return s + (v / 1e6).toFixed(2) + 'M';
      if (a >= 1e3) return s + (v / 1e3).toFixed(1) + 'K';
      return CL.fmt.money(v, cur);
    },
    num(v, d) { if (v == null || isNaN(v)) return '—'; return Number(v).toLocaleString('en-US', { maximumFractionDigits: d == null ? 2 : d }); },
    pct(v) {
      if (v == null || isNaN(v)) return '<span class="muted">—</span>';
      return '<span class="' + (v >= 0 ? 'up' : 'down') + '">' + (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%</span>';
    },
    ago(ts) {
      const s = Math.max(1, (Date.now() - new Date(ts).getTime()) / 1000);
      if (s < 3600) return Math.round(s / 60) + 'm ago';
      if (s < 86400) return Math.round(s / 3600) + 'h ago';
      return Math.round(s / 86400) + 'd ago';
    }
  };

  /* ---------- fetching ---------- */
  CL.fetchJSON = async function (url, opt) {
    opt = opt || {};
    const key = opt.cache ? 'clc:' + url : null;
    if (key) {
      const hit = CL.store.sget(key);
      if (hit && Date.now() - hit.t < (opt.ttl || 60000)) return hit.v;
    }
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), opt.timeout || 12000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, opt.init || {}));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = opt.text ? await r.text() : await r.json();
      if (key) CL.store.sset(key, { t: Date.now(), v });
      return v;
    } finally { clearTimeout(to); }
  };
  const bucket = () => Math.floor(Date.now() / 600000); // 10-min cache buster for local JSON
  CL.local = (name) => CL.fetchJSON(CL.base + 'data/' + name + '.json?b=' + bucket(), { timeout: 15000 });

  const normGecko = (c) => ({
    id: c.id, symbol: c.symbol, name: c.name, image: c.image, rank: c.market_cap_rank,
    price: c.current_price, mcap: c.market_cap, fdv: c.fully_diluted_valuation, vol: c.total_volume,
    high24: c.high_24h, low24: c.low_24h,
    ch1h: c.price_change_percentage_1h_in_currency, ch24h: c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h,
    ch7d: c.price_change_percentage_7d_in_currency, circ: c.circulating_supply, total: c.total_supply, max: c.max_supply,
    ath: c.ath, athDate: c.ath_date, atl: c.atl, spark: c.sparkline_in_7d ? c.sparkline_in_7d.price : null
  });

  let symMap = null;
  async function symbolMap() {
    if (symMap) return symMap;
    symMap = {};
    try { const d = await CL.local('markets'); (d.coins || []).forEach((c) => { if (!symMap[c.symbol]) symMap[c.symbol] = c; }); } catch (e) {}
    return symMap;
  }

  /* Markets: CoinGecko live → cached snapshot → CoinPaprika → CoinLore */
  CL.markets = async function (opt) {
    opt = opt || {};
    const vs = opt.vs || CL.cur;
    const per = opt.per || 250;
    const page = opt.page || 1;
    try {
      const u = cfg.api.coingecko + '/coins/markets?vs_currency=' + vs + '&order=market_cap_desc&per_page=' + per + '&page=' + page + '&sparkline=' + (opt.spark === false ? 'false' : 'true') + '&price_change_percentage=1h,24h,7d';
      const d = await CL.fetchJSON(u, { cache: true, ttl: 55000 });
      if (Array.isArray(d) && d.length) return { coins: d.map(normGecko), source: 'CoinGecko (live)', vs };
    } catch (e) {}
    try {
      const d = await CL.local('markets');
      if (d.coins && d.coins.length) {
        let coins = d.coins;
        let used = 'usd';
        if (vs !== 'usd' && d.rates && d.rates[vs]) {
          const r = d.rates[vs];
          coins = coins.map((c) => Object.assign({}, c, { price: c.price * r, mcap: c.mcap * r, fdv: c.fdv ? c.fdv * r : null, vol: c.vol * r, ath: c.ath ? c.ath * r : null, high24: c.high24 ? c.high24 * r : null, low24: c.low24 ? c.low24 * r : null, spark: c.spark ? c.spark.map((x) => x * r) : null }));
          used = vs;
        }
        return { coins, source: 'Snapshot ' + (d.updated || '').slice(0, 16).replace('T', ' ') + ' UTC', vs: used };
      }
    } catch (e) {}
    try {
      const d = await CL.fetchJSON(cfg.api.paprika + '/tickers?quotes=USD', { cache: true, ttl: 55000 });
      const map = await symbolMap();
      const coins = d.filter((c) => c.rank > 0).sort((a, b) => a.rank - b.rank).slice(0, per).map((c) => {
        const q = c.quotes.USD; const k = map[c.symbol.toLowerCase()];
        return { id: k ? k.id : c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), symbol: c.symbol.toLowerCase(), name: c.name, image: k ? k.image : '', rank: c.rank, price: q.price, mcap: q.market_cap, vol: q.volume_24h, ch1h: q.percent_change_1h, ch24h: q.percent_change_24h, ch7d: q.percent_change_7d, circ: c.circulating_supply, total: c.total_supply, max: c.max_supply, ath: q.ath_price, athDate: q.ath_date, spark: null };
      });
      return { coins, source: 'CoinPaprika (live)', vs: 'usd' };
    } catch (e) {}
    const d = await CL.fetchJSON(cfg.api.coinlore + '/tickers/?start=0&limit=100', { cache: true, ttl: 55000 });
    const map = await symbolMap();
    const coins = (d.data || []).map((c) => {
      const k = map[c.symbol.toLowerCase()];
      return { id: k ? k.id : c.nameid, symbol: c.symbol.toLowerCase(), name: c.name, image: k ? k.image : '', rank: +c.rank, price: +c.price_usd, mcap: +c.market_cap_usd, vol: +c.volume24, ch1h: +c.percent_change_1h, ch24h: +c.percent_change_24h, ch7d: +c.percent_change_7d, circ: +c.csupply, total: +c.tsupply, max: c.msupply ? +c.msupply : null, spark: null };
    });
    return { coins, source: 'CoinLore (live)', vs: 'usd' };
  };

  CL.global = async function () {
    try {
      const d = await CL.fetchJSON(cfg.api.coingecko + '/global', { cache: true, ttl: 120000 });
      const g = d.data;
      return { mcap: g.total_market_cap, vol: g.total_volume, btcDom: g.market_cap_percentage.btc, ethDom: g.market_cap_percentage.eth, ch24: g.market_cap_change_percentage_24h_usd, coins: g.active_cryptocurrencies, exchanges: g.markets };
    } catch (e) {
      const d = await CL.local('global');
      return d;
    }
  };

  CL.coinDetail = (id) => CL.fetchJSON(cfg.api.coingecko + '/coins/' + encodeURIComponent(id) + '?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false', { cache: true, ttl: 60000 });
  CL.chartData = (id, days, vs) => CL.fetchJSON(cfg.api.coingecko + '/coins/' + encodeURIComponent(id) + '/market_chart?vs_currency=' + (vs || CL.cur) + '&days=' + days, { cache: true, ttl: 120000 });

  let staticCoins = null;
  CL.staticCoins = async () => { if (staticCoins) return staticCoins; try { staticCoins = new Set(await CL.local('static-coins')); } catch (e) { staticCoins = new Set(); } return staticCoins; };
  CL.coinHref = (id, set) => (set && set.has(id) ? CL.base + 'coins/' + id + '.html' : CL.base + 'coin.html?id=' + encodeURIComponent(id));

  /* ---------- SVG charts ---------- */
  CL.spark = function (arr, w, h) {
    if (!arr || arr.length < 2) return '';
    w = w || 120; h = h || 34;
    const step = Math.max(1, Math.floor(arr.length / 60));
    const pts = arr.filter((_, i) => i % step === 0);
    const mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), rg = mx - mn || 1;
    const d = pts.map((v, i) => (i * w / (pts.length - 1)).toFixed(1) + ',' + (h - 2 - (v - mn) / rg * (h - 4)).toFixed(1)).join(' ');
    const col = pts[pts.length - 1] >= pts[0] ? 'var(--up)' : 'var(--down)';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="' + col + '" stroke-width="1.6" points="' + d + '"/></svg>';
  };
  CL.lineChart = function (el, series, opts) {
    opts = opts || {};
    if (!series || series.length < 2) { el.innerHTML = '<p class="muted">Chart data unavailable right now.</p>'; return; }
    const W = 800, H = opts.h || 300, P = { l: 8, r: 64, t: 12, b: 24 };
    const xs = series.map((p) => p[0]), ys = series.map((p) => p[1]);
    const x0 = xs[0], x1 = xs[xs.length - 1], y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), yr = (y1 - y0) || 1;
    const X = (x) => P.l + (x - x0) / ((x1 - x0) || 1) * (W - P.l - P.r);
    const Y = (y) => P.t + (1 - (y - y0) / yr) * (H - P.t - P.b);
    const d = series.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
    const up = ys[ys.length - 1] >= ys[0];
    const col = opts.color || (up ? 'var(--up)' : 'var(--down)');
    const grid = [0, .25, .5, .75, 1].map((f) => { const yv = y0 + yr * f; const yy = Y(yv); return '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' + (W - P.r + 6) + '" y="' + (yy + 4) + '" fill="var(--muted)" font-size="11">' + (opts.fmt ? opts.fmt(yv) : CL.fmt.compact(yv)) + '</text>'; }).join('');
    const fmtX = (t) => { const dt = new Date(t); return opts.days && opts.days <= 1 ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: opts.days > 180 ? '2-digit' : undefined }); };
    const lbls = [0, .33, .66, 1].map((f) => { const t = x0 + (x1 - x0) * f; return '<text x="' + X(t) + '" y="' + (H - 6) + '" fill="var(--muted)" font-size="11" text-anchor="' + (f === 0 ? 'start' : f === 1 ? 'end' : 'middle') + '">' + fmtX(t) + '</text>'; }).join('');
    const gid = 'g' + Math.random().toString(36).slice(2, 7);
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Price chart"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".28"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' + grid + lbls + '<path d="' + d + ' L' + X(x1) + ' ' + (H - P.b) + ' L' + X(x0) + ' ' + (H - P.b) + ' Z" fill="url(#' + gid + ')"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2"/><line class="hx" x1="0" x2="0" y1="' + P.t + '" y2="' + (H - P.b) + '" stroke="var(--muted)" stroke-dasharray="2 3" opacity="0"/></svg><div class="tip" hidden></div>';
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), hx = el.querySelector('.hx');
    svg.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width * W;
      let best = 0, bd = Infinity;
      series.forEach((p, i) => { const dd = Math.abs(X(p[0]) - fx); if (dd < bd) { bd = dd; best = i; } });
      const p = series[best];
      hx.setAttribute('x1', X(p[0])); hx.setAttribute('x2', X(p[0])); hx.setAttribute('opacity', '1');
      tip.hidden = false; tip.style.left = (X(p[0]) / W * r.width) + 'px'; tip.style.top = (Y(p[1]) / H * r.height) + 'px';
      tip.innerHTML = '<b>' + (opts.fmt ? opts.fmt(p[1]) : CL.fmt.money(p[1])) + '</b><br>' + new Date(p[0]).toLocaleString();
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; hx.setAttribute('opacity', '0'); });
  };

  /* ---------- toasts ---------- */
  CL.toast = function (msg) {
    const w = $('[data-toasts]'); if (!w) return;
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; w.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  /* ---------- watchlist ---------- */
  CL.watch = {
    list() { return CL.store.get('cl_watch', []); },
    has(id) { return this.list().indexOf(id) > -1; },
    toggle(id) { const l = this.list(); const i = l.indexOf(id); if (i > -1) l.splice(i, 1); else l.push(id); CL.store.set('cl_watch', l); return i === -1; }
  };
  function paintStars(root) {
    $$('[data-star]', root).forEach((b) => { const on = CL.watch.has(b.dataset.star); b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-pressed', on); });
  }
  CL.paintStars = paintStars;

  /* ---------- ticker + global bar ---------- */
  async function initTicker() {
    const tr = $('[data-ticker]'); const gb = $('[data-globalbar] .gb-in');
    try {
      const [m, set] = await Promise.all([CL.markets({ per: 30, spark: false }), CL.staticCoins()]);
      CL.lastMarkets = m;
      if (tr) {
        const items = m.coins.slice(0, 20).map((c) => '<a href="' + CL.coinHref(c.id, set) + '">' + (c.image ? '<img src="' + esc(c.image) + '" alt="" loading="lazy">' : '') + '<b>' + esc(c.symbol.toUpperCase()) + '</b> ' + CL.fmt.money(c.price, m.vs) + ' ' + CL.fmt.pct(c.ch24h) + '</a>').join('');
        tr.innerHTML = items + items;
      }
    } catch (e) { if (tr) tr.innerHTML = '<span class="muted">Live prices temporarily unavailable.</span>'; }
    if (gb) {
      try {
        const g = await CL.global();
        const cur = CL.cur in (g.mcap || {}) ? CL.cur : 'usd';
        gb.innerHTML = '<span>Market cap <b>' + CL.fmt.compact(g.mcap[cur], cur) + '</b> ' + CL.fmt.pct(g.ch24) + '</span><span>24h volume <b>' + CL.fmt.compact(g.vol[cur], cur) + '</b></span><span>BTC dominance <b>' + (g.btcDom || 0).toFixed(1) + '%</b></span><span>ETH dominance <b>' + (g.ethDom || 0).toFixed(1) + '%</b></span><span>Coins <b>' + CL.fmt.num(g.coins, 0) + '</b></span><span data-gb-fng></span><span><a href="' + CL.base + 'link-checker.html">🛡️ Check a link before you click</a></span>';
        try {
          const f = await CL.fetchJSON(cfg.api.fng + '?limit=1', { cache: true, ttl: 600000 });
          const x = f.data[0];
          const el = $('[data-gb-fng]'); if (el) el.innerHTML = 'Fear &amp; Greed <b>' + x.value + '</b> ' + esc(x.value_classification) + ' <small class="faint">(Alternative.me)</small>';
        } catch (e) {}
      } catch (e) { gb.innerHTML = '<span class="muted">Market overview unavailable — <a href="' + CL.base + 'markets.html">see markets</a></span>'; }
    }
  }

  /* ---------- search palette ---------- */
  function initPalette() {
    const pal = $('[data-palette]'); if (!pal) return;
    const input = $('[data-palette-input]', pal), list = $('[data-palette-results]', pal);
    let idx = null, sel = 0, items = [];
    async function load() {
      if (idx) return idx;
      idx = [];
      try { (await CL.local('search-index')).forEach((p) => idx.push({ t: p.t, u: CL.base + p.u, k: p.k })); } catch (e) {}
      try { const set = await CL.staticCoins(); const m = CL.lastMarkets || (await CL.markets({ per: 250, spark: false })); m.coins.forEach((c) => idx.push({ t: c.name + ' (' + c.symbol.toUpperCase() + ')', u: CL.coinHref(c.id, set), k: 'Coin #' + (c.rank || '') })); } catch (e) {}
      return idx;
    }
    function render() {
      const q = input.value.trim().toLowerCase();
      items = (idx || []).filter((x) => !q || x.t.toLowerCase().indexOf(q) > -1).sort((a, b) => (a.t.toLowerCase().indexOf(q) - b.t.toLowerCase().indexOf(q))).slice(0, 12);
      if (q && /\./.test(q)) items.unshift({ t: 'Check “' + q + '” for phishing', u: CL.base + 'link-checker.html?url=' + encodeURIComponent(q), k: 'Link checker' });
      sel = 0;
      list.innerHTML = items.map((x, i) => '<li><a href="' + esc(x.u) + '" class="' + (i === 0 ? 'sel' : '') + '"><span>' + esc(x.t) + '</span><small>' + esc(x.k) + '</small></a></li>').join('') || '<li class="muted small" style="padding:10px">No matches. Try a coin name or tool.</li>';
    }
    function open() { pal.hidden = false; input.value = ''; input.focus(); load().then(render); render(); }
    function close() { pal.hidden = true; }
    $$('[data-search-open]').forEach((b) => b.addEventListener('click', open));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
      if (pal.hidden) return;
      if (e.key === 'Escape') close();
      const links = $$('a', list);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % Math.max(links.length, 1); links.forEach((a, i) => a.classList.toggle('sel', i === sel)); }
      if (e.key === 'Enter' && links[sel]) { e.preventDefault(); location.href = links[sel].href; }
    });
    input.addEventListener('input', render);
    pal.addEventListener('click', (e) => { if (e.target === pal) close(); });
  }

  /* ---------- ads (optional manual units) ---------- */
  function initAds() {
    const slots = cfg.adSlots || {};
    $$('.ad-slot[data-ad]').forEach((el) => {
      const id = slots[el.dataset.ad];
      if (!id) return;
      el.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + cfg.adsClient + '" data-ad-slot="' + id + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }

  /* ---------- small behaviours ---------- */
  function initUI() {
    const theme = $('[data-theme-toggle]');
    if (theme) theme.addEventListener('click', () => { const t = doc.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; doc.setAttribute('data-theme', t); CL.store.set('cl_theme', t); try { localStorage.setItem('cl_theme', t); } catch (e) {} });
    const menu = $('[data-menu]'), nav = $('.main-nav');
    if (menu && nav) menu.addEventListener('click', () => { const o = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', o); });
    $$('.has-more').forEach((li) => {
      const b = $('.more-btn', li);
      b.addEventListener('click', (e) => { e.stopPropagation(); const o = li.classList.toggle('open'); b.setAttribute('aria-expanded', o); });
      document.addEventListener('click', () => { li.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
    });
    const cs = $('[data-currency]');
    if (cs) { cs.value = CL.cur; cs.addEventListener('change', () => { CL.cur = cs.value; CL.store.set('cl_cur', cs.value); document.dispatchEvent(new CustomEvent('cl:currency', { detail: cs.value })); initTicker(); }); }
    // consent
    const cb = $('[data-consent]');
    if (cb && !localStorage.getItem('cl_consent')) {
      cb.hidden = false;
      $('[data-consent-accept]', cb).addEventListener('click', () => { localStorage.setItem('cl_consent', 'accepted'); cb.hidden = true; });
      $('[data-consent-reject]', cb).addEventListener('click', () => { localStorage.setItem('cl_consent', 'rejected'); cb.hidden = true; });
    }
    // slide-in lead offer
    const si = $('[data-slidein]');
    const pageName = document.body.dataset.page || '';
    if (si && !CL.store.sget('cl_si_closed') && !CL.store.get('cl_kit') && ['getstarted', 'donate', 'contact'].indexOf(pageName) === -1) {
      const onScroll = () => {
        const p = (window.scrollY + innerHeight) / document.body.scrollHeight;
        if (p > 0.45) { si.hidden = false; window.removeEventListener('scroll', onScroll); }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      $('[data-slidein-close]', si).addEventListener('click', () => { si.hidden = true; CL.store.sset('cl_si_closed', 1); });
    }
    // copy buttons
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]');
      if (c) { navigator.clipboard.writeText(c.dataset.copy).then(() => CL.toast('Copied: ' + c.dataset.copy)); }
      const s = e.target.closest('[data-star]');
      if (s) { const on = CL.watch.toggle(s.dataset.star); paintStars(document); CL.toast(on ? 'Added to watchlist' : 'Removed from watchlist'); }
      const yt = e.target.closest('.yt-thumb');
      if (yt) { const f = yt.closest('[data-yt]'); f.querySelector('.yt-thumb').outerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(f.dataset.yt) + '?autoplay=1&rel=0" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>'; }
      const v = e.target.closest('[data-vote]');
      if (v) { const box = v.closest('[data-helpful]'); CL.store.set('cl_vote_' + box.dataset.helpful, v.dataset.vote); $('.helpful-msg', box).textContent = v.dataset.vote === 'yes' ? 'Thanks! Glad it helped.' : 'Thanks — tell us what was missing via the contact page.'; $$('button', box).forEach((b) => (b.disabled = true)); }
    });
    paintStars(document);
  }

  CL.ready = function (fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); };
  CL.ready(() => { initUI(); initTicker(); initPalette(); initAds(); });
})();

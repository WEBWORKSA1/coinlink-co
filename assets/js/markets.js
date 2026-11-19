/* CoinLink.co — markets, home widgets, exchanges, sentiment, news & videos. */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc, F = CL.fmt;
  let M = null, SET = null;

  function rowHTML(c, i, opts) {
    opts = opts || {};
    const href = CL.coinHref(c.id, SET);
    return '<tr>' +
      '<td><button class="star-btn" data-star="' + esc(c.id) + '" aria-label="Watchlist ' + esc(c.name) + '">☆</button></td>' +
      '<td class="num">' + (c.rank || i + 1) + '</td>' +
      '<td><a class="coin-cell" href="' + href + '">' + (c.image ? '<img src="' + esc(c.image) + '" alt="" width="22" height="22" loading="lazy">' : '') + '<span>' + esc(c.name) + '</span> <small>' + esc((c.symbol || '').toUpperCase()) + '</small></a></td>' +
      '<td class="num">' + F.money(c.price, M.vs) + '</td>' +
      (opts.compact ? '' : '<td class="num hide-sm">' + F.pct(c.ch1h) + '</td>') +
      '<td class="num">' + F.pct(c.ch24h) + '</td>' +
      '<td class="num hide-sm">' + F.pct(c.ch7d) + '</td>' +
      '<td class="num hide-sm">' + F.compact(c.mcap, M.vs) + '</td>' +
      (opts.compact ? '' : '<td class="num hide-sm">' + F.compact(c.vol, M.vs) + '</td>') +
      '<td class="hide-sm">' + CL.spark(c.spark) + '</td></tr>';
  }

  async function load(force) {
    if (M && !force) return M;
    [M, SET] = await Promise.all([CL.markets({ per: 250 }), CL.staticCoins()]);
    CL.lastMarkets = M;
    return M;
  }

  /* ---------- home ---------- */
  async function home() {
    const tb = $('[data-topcoins]');
    if (!tb) return;
    try { await load(); } catch (e) { return; }
    tb.innerHTML = M.coins.slice(0, 10).map((c, i) => rowHTML(c, i, { compact: true })).join('');
    const src = $('[data-source]'); if (src) src.textContent = M.source;
    CL.paintStars(tb);
    const mv = M.coins.filter((c) => c.ch24h != null && c.mcap > 5e7);
    const g = mv.slice().sort((a, b) => b.ch24h - a.ch24h).slice(0, 5);
    const l = mv.slice().sort((a, b) => a.ch24h - b.ch24h).slice(0, 5);
    const li = (c) => '<li><a class="coin-cell" href="' + CL.coinHref(c.id, SET) + '">' + (c.image ? '<img src="' + esc(c.image) + '" alt="" width="20" height="20" loading="lazy">' : '') + esc(c.name) + '</a><span>' + F.money(c.price, M.vs) + ' ' + F.pct(c.ch24h) + '</span></li>';
    const ge = $('[data-gainers]'); if (ge) ge.innerHTML = g.map(li).join('');
    const le = $('[data-losers]'); if (le) le.innerHTML = l.map(li).join('');
    const tr = $('[data-trending]');
    if (tr) {
      try {
        const t = await CL.fetchJSON(CL.cfg.api.coingecko + '/search/trending', { cache: true, ttl: 600000 });
        tr.innerHTML = t.coins.slice(0, 7).map((x) => '<li><a class="coin-cell" href="' + CL.coinHref(x.item.id, SET) + '"><img src="' + esc(x.item.small || x.item.thumb) + '" alt="" width="20" height="20" loading="lazy">' + esc(x.item.name) + ' <small>' + esc(x.item.symbol) + '</small></a><span class="muted small">#' + (x.item.market_cap_rank || '—') + '</span></li>').join('');
      } catch (e) {
        try { const t = await CL.local('trending'); tr.innerHTML = (t.items || []).slice(0, 7).map((x) => '<li><a class="coin-cell" href="' + CL.coinHref(x.id, SET) + '"><img src="' + esc(x.thumb) + '" alt="" width="20" height="20" loading="lazy">' + esc(x.name) + ' <small>' + esc(x.symbol) + '</small></a><span class="muted small">#' + (x.rank || '—') + '</span></li>').join(''); } catch (e2) { tr.innerHTML = '<li class="muted">Trending data unavailable.</li>'; }
      }
    }
  }

  /* ---------- markets table ---------- */
  function marketsPage() {
    const tb = $('[data-markets]');
    if (!tb) return;
    const state = { q: new URLSearchParams(location.search).get('q') || '', sort: 'rank', dir: 1, filter: 'all', page: 1, per: 50 };
    const search = $('[data-mk-search]'); if (search) search.value = state.q;
    function filtered() {
      let a = M.coins.slice();
      const q = state.q.toLowerCase();
      if (q) a = a.filter((c) => c.name.toLowerCase().indexOf(q) > -1 || c.symbol.toLowerCase().indexOf(q) > -1);
      if (state.filter === 'gainers') a = a.filter((c) => c.ch24h > 0).sort((x, y) => y.ch24h - x.ch24h);
      else if (state.filter === 'losers') a = a.filter((c) => c.ch24h < 0).sort((x, y) => x.ch24h - y.ch24h);
      else if (state.filter === 'watch') { const w = CL.watch.list(); a = a.filter((c) => w.indexOf(c.id) > -1); }
      else if (state.filter === 'stable') a = a.filter((c) => Math.abs((c.price || 0) - 1) < 0.03 && Math.abs(c.ch7d || 0) < 2);
      if (state.filter === 'all' || state.filter === 'watch' || state.filter === 'stable') {
        const k = state.sort;
        a.sort((x, y) => { const vx = x[k] == null ? -Infinity : x[k], vy = y[k] == null ? -Infinity : y[k]; return (typeof vx === 'string' ? vx.localeCompare(vy) : vx - vy) * state.dir; });
      }
      return a;
    }
    function draw() {
      const a = filtered();
      const pages = Math.max(1, Math.ceil(a.length / state.per));
      state.page = Math.min(state.page, pages);
      const slice = a.slice((state.page - 1) * state.per, state.page * state.per);
      tb.innerHTML = slice.map((c, i) => rowHTML(c, i)).join('') || '<tr><td colspan="10" class="empty">' + (state.filter === 'watch' ? 'Your watchlist is empty. Tap ☆ on any coin to add it.' : 'No coins match your search.') + '</td></tr>';
      CL.paintStars(tb);
      const pg = $('[data-pager]');
      if (pg) { let h = ''; for (let p = 1; p <= pages; p++) h += '<button class="btn btn-ghost btn-sm' + (p === state.page ? ' btn-gold' : '') + '" data-pg="' + p + '">' + p + '</button>'; pg.innerHTML = pages > 1 ? h : ''; }
      const st = $('[data-source]'); if (st) st.textContent = M.source + ' · ' + a.length + ' assets';
    }
    $$('thead th[data-sort]').forEach((th) => th.addEventListener('click', () => { const k = th.dataset.sort; state.dir = state.sort === k ? -state.dir : (k === 'rank' || k === 'name' ? 1 : -1); state.sort = k; state.filter = state.filter === 'gainers' || state.filter === 'losers' ? 'all' : state.filter; draw(); }));
    if (search) search.addEventListener('input', () => { state.q = search.value; state.page = 1; draw(); });
    $$('[data-filter]').forEach((b) => b.addEventListener('click', () => { $$('[data-filter]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); state.filter = b.dataset.filter; state.page = 1; draw(); }));
    document.addEventListener('click', (e) => { const p = e.target.closest('[data-pg]'); if (p) { state.page = +p.dataset.pg; draw(); window.scrollTo({ top: tb.closest('.table-wrap').offsetTop - 120, behavior: 'smooth' }); } });
    const csv = $('[data-csv]');
    if (csv) csv.addEventListener('click', () => {
      const rows = [['rank', 'name', 'symbol', 'price', 'change_1h', 'change_24h', 'change_7d', 'market_cap', 'volume_24h', 'circulating_supply']].concat(filtered().map((c) => [c.rank, c.name, c.symbol, c.price, c.ch1h, c.ch24h, c.ch7d, c.mcap, c.vol, c.circ]));
      const blob = new Blob([rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n')], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'coinlink-markets-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    });
    load().then(draw).catch(() => { tb.innerHTML = '<tr><td colspan="10" class="empty">Prices are temporarily unavailable. Please refresh in a minute.</td></tr>'; });
    setInterval(() => { if (!document.hidden) load(true).then(draw).catch(() => {}); }, CL.cfg.refreshMs || 60000);
    document.addEventListener('cl:currency', () => load(true).then(draw));
  }

  /* ---------- exchanges ---------- */
  async function exchanges() {
    const tb = $('[data-exchanges]');
    if (!tb) return;
    let list = [];
    try {
      const d = await CL.fetchJSON(CL.cfg.api.coingecko + '/exchanges?per_page=100&page=1', { cache: true, ttl: 600000 });
      list = d.map((x) => ({ name: x.name, image: x.image, url: x.url, trust: x.trust_score, rank: x.trust_score_rank, btcVol: x.trade_volume_24h_btc, country: x.country, year: x.year_established }));
    } catch (e) { try { list = (await CL.local('exchanges')).map((x) => ({ name: x.name, image: x.image, url: x.url, trust: x.trust, rank: x.rank, btcVol: x.btcVol, country: x.country, year: x.year })); } catch (e2) {} }
    let btcPrice = null;
    try { const m = CL.lastMarkets || (await CL.markets({ per: 5, spark: false })); btcPrice = m.coins.find((c) => c.id === 'bitcoin').price; } catch (e) {}
    const q = $('[data-ex-search]');
    const draw = () => {
      const s = (q && q.value || '').toLowerCase();
      tb.innerHTML = list.filter((x) => !s || x.name.toLowerCase().indexOf(s) > -1).map((x) => {
        let dom = ''; try { dom = new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) {}
        return '<tr><td class="num">' + (x.rank || '') + '</td><td><span class="coin-cell">' + (x.image ? '<img src="' + esc(x.image) + '" alt="" width="22" height="22" loading="lazy">' : '') + esc(x.name) + '</span></td>' +
          '<td>' + (x.trust != null ? '<b class="' + (x.trust >= 8 ? 'up' : x.trust >= 5 ? '' : 'down') + '">' + x.trust + '/10</b>' : '—') + '</td>' +
          '<td class="num">' + (x.btcVol ? (btcPrice ? F.compact(x.btcVol * btcPrice, 'usd') : F.num(x.btcVol, 0) + ' BTC') : '—') + '</td>' +
          '<td class="hide-sm">' + esc(x.country || '—') + '</td><td class="hide-sm num">' + (x.year || '—') + '</td>' +
          '<td>' + (dom ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener nofollow">' + esc(dom) + '</a> <span class="badge-verified" title="Domain from exchange profile">✓</span>' : '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="empty">No exchanges found.</td></tr>';
    };
    if (q) q.addEventListener('input', draw);
    draw();
  }

  /* ---------- sentiment ---------- */
  async function sentiment() {
    const dial = $('[data-fng]');
    if (dial) {
      try {
        let d;
        try { d = await CL.fetchJSON(CL.cfg.api.fng + '?limit=365', { cache: true, ttl: 600000 }); } catch (e) { d = await CL.local('fng'); }
        const pts = d.data.map((x) => [x.timestamp * 1000, +x.value]).reverse();
        const now = d.data[0];
        dial.innerHTML = '<b>' + now.value + '<small>' + esc(now.value_classification) + '</small></b>';
        const hist = $('[data-fng-hist]');
        if (hist) {
          const pick = (n) => d.data[n] ? d.data[n].value + ' <small class="muted">' + esc(d.data[n].value_classification) + '</small>' : '—';
          hist.innerHTML = '<div><span>Yesterday</span><b>' + pick(1) + '</b></div><div><span>Last week</span><b>' + pick(7) + '</b></div><div><span>Last month</span><b>' + pick(30) + '</b></div><div><span>1 year ago</span><b>' + pick(Math.min(364, d.data.length - 1)) + '</b></div>';
        }
        const ch = $('[data-fng-chart]'); if (ch) CL.lineChart(ch, pts, { h: 220, fmt: (v) => Math.round(v), color: 'var(--gold)', days: 365 });
      } catch (e) { dial.innerHTML = '<b>—<small>Unavailable</small></b>'; }
    }
    const fees = $('[data-btc-fees]');
    if (fees) {
      try {
        let f;
        try { f = await CL.fetchJSON(CL.cfg.api.mempool + '/v1/fees/recommended', { cache: true, ttl: 60000 }); } catch (e) { f = (await CL.local('network')).btcFees; }
        fees.innerHTML = '<div><b>' + f.fastestFee + '</b><span>Next block (sat/vB)</span></div><div><b>' + f.halfHourFee + '</b><span>~30 min</span></div><div><b>' + f.hourFee + '</b><span>~1 hour</span></div><div><b>' + (f.economyFee || f.minimumFee) + '</b><span>Economy</span></div>';
      } catch (e) { fees.innerHTML = '<p class="muted">Fee data unavailable.</p>'; }
    }
    const gas = $('[data-eth-gas]');
    if (gas) {
      try {
        const r = await CL.fetchJSON(CL.cfg.api.ethRpc, { init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }) } });
        const gw = parseInt(r.result, 16) / 1e9;
        let eth = null; try { const m = CL.lastMarkets || (await CL.markets({ per: 5, spark: false })); eth = m.coins.find((c) => c.id === 'ethereum').price; } catch (e) {}
        const cost = (units) => eth ? ' ≈ ' + F.money(gw * 1e-9 * units * eth, 'usd') : '';
        gas.innerHTML = '<div><b>' + gw.toFixed(gw < 1 ? 3 : 1) + '</b><span>Gas price (gwei)</span></div><div><b>' + (cost(21000) || '—').replace(' ≈ ', '') + '</b><span>ETH transfer</span></div><div><b>' + (cost(65000) || '—').replace(' ≈ ', '') + '</b><span>Token transfer</span></div><div><b>' + (cost(180000) || '—').replace(' ≈ ', '') + '</b><span>DEX swap</span></div>';
      } catch (e) { try { const n = await CL.local('network'); gas.innerHTML = '<div><b>' + (n.ethGasGwei || '—') + '</b><span>Gas price (gwei, cached)</span></div>'; } catch (e2) { gas.innerHTML = '<p class="muted">Gas data unavailable.</p>'; } }
    }
    const hv = $('[data-halving]');
    if (hv) {
      let h = null;
      try { h = +(await CL.fetchJSON(CL.cfg.api.mempool + '/blocks/tip/height', { text: true, cache: true, ttl: 60000 })); } catch (e) { try { const n = await CL.local('network'); h = n.btcHeight; } catch (e2) {} }
      if (h) {
        const target = 1050000, left = target - h, eta = new Date(Date.now() + left * 600000);
        const tick = () => { const ms = eta - Date.now(); const d = Math.floor(ms / 864e5), hr = Math.floor(ms % 864e5 / 36e5), mi = Math.floor(ms % 36e5 / 6e4); hv.innerHTML = '<div><b>' + F.num(h, 0) + '</b><span>Current block</span></div><div><b>' + F.num(left, 0) + '</b><span>Blocks to go</span></div><div><b>' + d + 'd ' + hr + 'h ' + mi + 'm</b><span>Est. countdown</span></div><div><b>' + eta.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) + '</b><span>Est. date (10-min blocks)</span></div>'; };
        tick(); setInterval(tick, 60000);
      } else hv.innerHTML = '<p class="muted">Block height unavailable.</p>';
    }
    const dom = $('[data-dominance]');
    if (dom) {
      try {
        const g = await CL.global();
        const other = Math.max(0, 100 - g.btcDom - g.ethDom);
        const bar = (lbl, v, col) => '<div class="alloc-row"><span>' + lbl + '</span><div class="bar"><span style="width:' + v.toFixed(1) + '%;background:' + col + '"></span></div><b>' + v.toFixed(1) + '%</b></div>';
        dom.innerHTML = bar('Bitcoin', g.btcDom, 'var(--gold)') + bar('Ethereum', g.ethDom, 'var(--teal)') + bar('Everything else', other, 'var(--info)');
      } catch (e) { dom.innerHTML = '<p class="muted">Unavailable.</p>'; }
    }
  }

  /* ---------- news ---------- */
  async function news() {
    const el = $('[data-news]');
    if (!el) return;
    let items = [];
    try { items = (await CL.local('news')).items || []; } catch (e) { return; }
    if (!items.length) return;
    const lim = +el.dataset.news || 200;
    const state = { cat: 'All', src: 'All', q: '' };
    const cats = ['All'].concat(Array.from(new Set(items.map((x) => x.cat).filter(Boolean))));
    const srcs = ['All'].concat(Array.from(new Set(items.map((x) => x.source))));
    const cb = $('[data-news-cats]'); if (cb) cb.innerHTML = cats.map((c) => '<button class="chip' + (c === 'All' ? ' on' : '') + '" data-ncat="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const sb = $('[data-news-src]'); if (sb) sb.innerHTML = srcs.map((s) => '<option>' + esc(s) + '</option>').join('');
    const q = $('[data-news-q]');
    const draw = () => {
      const s = state.q.toLowerCase();
      const a = items.filter((x) => (state.cat === 'All' || x.cat === state.cat) && (state.src === 'All' || x.source === state.src) && (!s || x.title.toLowerCase().indexOf(s) > -1)).slice(0, lim);
      el.innerHTML = a.map((x) => '<li class="news-item"><a href="' + esc(x.link) + '" target="_blank" rel="noopener nofollow">' + esc(x.title) + '</a><span class="news-meta"><b>' + esc(x.source) + '</b> · ' + F.ago(x.date) + (x.cat ? ' · <span class="tag">' + esc(x.cat) + '</span>' : '') + '</span></li>').join('') || '<li class="empty">No headlines match.</li>';
      const u = $('[data-news-updated]'); if (u) u.textContent = items.length + ' headlines from ' + (srcs.length - 1) + ' publishers';
    };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-ncat]'); if (b) { $$('[data-ncat]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); state.cat = b.dataset.ncat; draw(); } });
    if (sb) sb.addEventListener('change', () => { state.src = sb.value; draw(); });
    if (q) q.addEventListener('input', () => { state.q = q.value; draw(); });
    draw();
  }

  /* ---------- videos ---------- */
  async function videos() {
    const el = $('[data-videos]');
    if (!el) return;
    let items = [];
    try { items = (await CL.local('videos')).items || []; } catch (e) {}
    if (!items.length) return; // keep prerendered/fallback content
    const lim = +el.dataset.videos || 60;
    const chans = ['All'].concat(Array.from(new Set(items.map((v) => v.channel))));
    const cb = $('[data-video-chans]'); if (cb) cb.innerHTML = chans.map((c) => '<button class="chip' + (c === 'All' ? ' on' : '') + '" data-vch="' + esc(c) + '">' + esc(c) + '</button>').join('');
    let ch = 'All';
    const draw = () => {
      el.innerHTML = items.filter((v) => ch === 'All' || v.channel === ch).slice(0, lim).map((v) => '<figure class="yt" data-yt="' + esc(v.id) + '"><button class="yt-thumb" aria-label="Play: ' + esc(v.title) + '"><img src="https://i.ytimg.com/vi/' + esc(v.id) + '/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt-play" aria-hidden="true">▶</span></button><figcaption><b>' + esc(v.title) + '</b><span class="small muted">' + esc(v.channel) + ' · ' + F.ago(v.date) + '</span></figcaption></figure>').join('');
    };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-vch]'); if (b) { $$('[data-vch]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); ch = b.dataset.vch; draw(); } });
    draw();
  }

  /* ---------- live counters ---------- */
  async function counters() {
    const el = $$('[data-count]');
    if (!el.length) return;
    try {
      const meta = await CL.local('blocklist/meta');
      el.forEach((x) => { if (x.dataset.count === 'blocklist') x.textContent = F.num(meta.count, 0); });
    } catch (e) {}
    try {
      const v = await CL.local('verified');
      el.forEach((x) => { if (x.dataset.count === 'verified') x.textContent = F.num(v.length, 0); });
    } catch (e) {}
  }

  CL.ready(() => { home(); marketsPage(); exchanges(); sentiment(); news(); videos(); counters(); });
  CL.loadMarkets = load;
})();

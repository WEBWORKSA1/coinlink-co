/* CoinLink.co — coin profile (static top-100 pages + dynamic coin.html?id=). */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc, F = CL.fmt;

  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function linksFrom(d) {
    const L = d.links || {}, out = [];
    (L.homepage || []).filter(Boolean).slice(0, 2).forEach((u) => out.push(['Official website', u]));
    if (L.whitepaper) out.push(['Whitepaper', L.whitepaper]);
    (L.blockchain_site || []).filter(Boolean).slice(0, 4).forEach((u) => out.push(['Block explorer', u]));
    ((L.repos_url && L.repos_url.github) || []).filter(Boolean).slice(0, 2).forEach((u) => out.push(['Source code', u]));
    if (L.twitter_screen_name) out.push(['X (Twitter)', 'https://x.com/' + L.twitter_screen_name]);
    if (L.subreddit_url && /reddit\.com\/r\/./.test(L.subreddit_url)) out.push(['Reddit', L.subreddit_url]);
    (L.chat_url || []).filter(Boolean).slice(0, 2).forEach((u) => out.push(['Community chat', u]));
    return out;
  }
  function linkRows(list) {
    return list.map((x) => '<tr><th scope="row">' + esc(x[0]) + '</th><td><a href="' + esc(x[1]) + '" target="_blank" rel="noopener nofollow">' + esc(x[1].replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a></td><td><button class="btn btn-ghost btn-xs" data-copy="' + esc(x[1]) + '">Copy</button></td></tr>').join('');
  }

  async function chart(id) {
    const el = $('[data-chart]'); if (!el) return;
    let days = 7;
    const draw = async () => {
      el.classList.add('loading');
      try {
        const d = await CL.chartData(id, days);
        CL.lineChart(el, d.prices, { days, fmt: (v) => F.money(v) });
      } catch (e) { el.innerHTML = '<p class="muted">Chart temporarily unavailable (rate limit). Try again in a minute.</p>'; }
      el.classList.remove('loading');
    };
    $$('[data-chart-range] button').forEach((b) => b.addEventListener('click', () => { $$('[data-chart-range] button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); days = +b.dataset.days; draw(); }));
    document.addEventListener('cl:currency', draw);
    draw();
  }

  function converter(price, sym) {
    const box = $('[data-mini-converter]'); if (!box) return;
    const amt = $('[data-conv-amt]', box), out = $('[data-conv-out]', box), lab = box.querySelector('small');
    const upd = () => { out.textContent = F.money((+amt.value || 0) * price); if (lab) lab.textContent = CL.cur.toUpperCase(); };
    amt.addEventListener('input', upd); upd();
  }

  function fill(md, cur) {
    const set = (k, v) => $$('[data-live="' + k + '"]').forEach((e) => (e.innerHTML = v));
    set('price', F.money(md.current_price[cur], cur));
    set('ch24h', F.pct(md.price_change_percentage_24h_in_currency ? md.price_change_percentage_24h_in_currency[cur] : md.price_change_percentage_24h));
    set('mcap', F.compact(md.market_cap[cur], cur));
    set('vol', F.compact(md.total_volume[cur], cur));
    set('fdv', md.fully_diluted_valuation && md.fully_diluted_valuation[cur] ? F.compact(md.fully_diluted_valuation[cur], cur) : '—');
    set('circ', md.circulating_supply ? F.num(md.circulating_supply, 0) : '—');
    set('ath', F.money(md.ath[cur], cur));
    set('ch7d', F.pct(md.price_change_percentage_7d_in_currency ? md.price_change_percentage_7d_in_currency[cur] : md.price_change_percentage_7d));
  }

  async function staticPage(id) {
    chart(id);
    const update = async () => {
      try {
        const d = await CL.coinDetail(id);
        const cur = d.market_data.current_price[CL.cur] != null ? CL.cur : 'usd';
        fill(d.market_data, cur);
        converter(d.market_data.current_price[cur], d.symbol);
      } catch (e) {
        try { const m = await CL.loadMarkets(); const c = m.coins.find((x) => x.id === id); if (c) { $$('[data-live="price"]').forEach((e2) => (e2.textContent = F.money(c.price, m.vs))); converter(c.price, c.symbol); } } catch (e2) {}
      }
    };
    update();
    setInterval(() => { if (!document.hidden) update(); }, 90000);
    document.addEventListener('cl:currency', update);
  }

  async function dynamicPage() {
    const root = $('[data-coin-root]'); if (!root) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { root.innerHTML = '<div class="empty card">No coin selected. <a href="markets.html">Browse markets →</a></div>'; return; }
    const set = await CL.staticCoins();
    if (set.has(id)) { location.replace(CL.base + 'coins/' + encodeURIComponent(id) + '.html'); return; }
    try {
      const d = await CL.coinDetail(id);
      const md = d.market_data, cur = md.current_price[CL.cur] != null ? CL.cur : 'usd';
      document.title = d.name + ' (' + d.symbol.toUpperCase() + ') Price, Official Links & Safety Check | CoinLink.co';
      const m = document.querySelector('meta[name=description]'); if (m) m.content = 'Live ' + d.name + ' price, chart, market cap and verified official links.';
      const links = linksFrom(d);
      const desc = (d.description && d.description.en ? d.description.en.replace(/<[^>]+>/g, '') : '').split(/(?<=\.)\s/).slice(0, 3).join(' ');
      root.innerHTML =
        '<nav class="crumbs"><a href="index.html">Home</a> › <a href="markets.html">Markets</a> › <span>' + esc(d.name) + '</span></nav>' +
        '<header class="coin-head"><div class="coin-title"><img src="' + esc(d.image && d.image.large) + '" alt="' + esc(d.name) + ' logo" width="48" height="48"><div><h1>' + esc(d.name) + ' <small>' + esc(d.symbol.toUpperCase()) + '</small></h1><p class="muted">Rank #' + (d.market_cap_rank || '—') + ((d.categories || []).length ? ' · ' + esc(d.categories.slice(0, 3).join(', ')) : '') + '</p></div><button class="star-btn" data-star="' + esc(id) + '">☆</button></div>' +
        '<div class="coin-price"><span class="big" data-live="price"></span> <span data-live="ch24h"></span></div></header>' +
        '<div class="stats-grid"><div class="stat"><span>Market cap</span><b data-live="mcap"></b></div><div class="stat"><span>24h volume</span><b data-live="vol"></b></div><div class="stat"><span>Fully diluted value</span><b data-live="fdv"></b></div><div class="stat"><span>Circulating supply</span><b data-live="circ"></b></div><div class="stat"><span>All-time high</span><b data-live="ath"></b></div><div class="stat"><span>7d change</span><b data-live="ch7d"></b></div></div>' +
        '<section class="card chart-card"><div class="chart-head"><h2 class="h4">' + esc(d.name) + ' price chart</h2><div class="seg" data-chart-range><button data-days="1">24h</button><button data-days="7" class="on">7d</button><button data-days="30">30d</button><button data-days="90">90d</button><button data-days="365">1y</button></div></div><div class="chart" data-chart="' + esc(id) + '"></div></section>' +
        '<div class="grid grid-2 coin-cols"><section class="card"><h2 class="h4">✅ Official ' + esc(d.name) + ' links</h2><p class="small muted">From the project\'s public profile. Bookmark these; never trust links from DMs or ads.</p><table class="links-table"><tbody>' + (linkRows(links) || '<tr><td class="muted">No official links listed yet.</td></tr>') + '</tbody></table><p class="small"><a href="link-checker.html">Check a link →</a></p></section>' +
        '<section class="card"><h2 class="h4">Convert ' + esc(d.symbol.toUpperCase()) + '</h2><div class="conv" data-mini-converter="' + esc(id) + '"><label>Amount<input type="number" min="0" step="any" value="1" data-conv-amt></label><p class="conv-out"><span data-conv-out></span> <small class="muted"></small></p></div>' +
        '<h3 class="h5">About</h3><p class="small muted">' + esc(desc || 'No description available.') + '</p><p class="small faint">Description: project profile via CoinGecko.</p></section></div>' +
        '<p class="small muted disclaimer-note">Not financial advice. Data via CoinGecko.</p>';
      fill(md, cur); converter(md.current_price[cur], d.symbol); chart(id); CL.paintStars(root);
    } catch (e) {
      root.innerHTML = '<div class="empty card">We couldn\'t load “' + esc(id) + '” right now (the data provider may be rate-limiting). Please try again in a minute or <a href="markets.html">browse markets</a>.</div>';
    }
  }

  CL.ready(() => {
    const id = document.body.dataset.coinId;
    if (id) staticPage(id); else dynamicPage();
  });
})();

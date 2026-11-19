/* CoinLink.co — private portfolio tracker + price alerts (stored only in this browser). */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc, F = CL.fmt;
  let M = null;
  const H = () => CL.store.get('cl_holdings', []);
  const A = () => CL.store.get('cl_alerts', []);
  const COLORS = ['#f5b841', '#22d3c5', '#60a5fa', '#a78bfa', '#f472b6', '#27d17f', '#fb923c', '#94a3b8'];

  async function load() { M = await CL.markets({ per: 250, spark: false }); return M; }
  const coin = (id) => M && M.coins.find((c) => c.id === id);

  function donut(parts) {
    const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
    let acc = 0;
    const segs = parts.map((p, i) => { const a0 = acc / tot * 2 * Math.PI; acc += p.v; const a1 = acc / tot * 2 * Math.PI; const large = a1 - a0 > Math.PI ? 1 : 0; const r = 70, cx = 80, cy = 80; const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0), x1 = cx + r * Math.sin(a1 - 0.0001), y1 = cy - r * Math.cos(a1 - 0.0001); return '<path d="M' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 + '" stroke="' + COLORS[i % COLORS.length] + '" stroke-width="22" fill="none"/>'; }).join('');
    return '<svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Allocation">' + segs + '</svg>';
  }

  function draw() {
    const tb = $('[data-holdings]'); if (!tb || !M) return;
    const hs = H();
    let tot = 0, cost = 0, ch24 = 0;
    const parts = [];
    tb.innerHTML = hs.map((h, i) => {
      const c = coin(h.id); const px = c ? c.price : 0; const v = px * h.amt; tot += v; cost += (h.cost || 0) * h.amt; ch24 += c && c.ch24h != null ? v - v / (1 + c.ch24h / 100) : 0;
      parts.push({ n: c ? c.symbol.toUpperCase() : h.id, v });
      const pl = h.cost ? v - h.cost * h.amt : null;
      return '<tr><td><span class="coin-cell">' + (c && c.image ? '<img src="' + esc(c.image) + '" width="20" height="20" alt="">' : '') + esc(c ? c.name : h.id) + '</span></td><td class="num">' + F.num(h.amt, 8) + '</td><td class="num">' + F.money(px, M.vs) + '</td><td class="num">' + F.money(v, M.vs) + '</td><td class="num">' + (pl == null ? '—' : '<span class="' + (pl >= 0 ? 'up' : 'down') + '">' + F.money(pl, M.vs) + '</span>') + '</td><td class="num">' + F.pct(c && c.ch24h) + '</td><td><button class="btn btn-ghost btn-xs" data-del="' + i + '" aria-label="Remove">✕</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No holdings yet. Add your first coin above — nothing leaves your browser.</td></tr>';
    const s = $('[data-pf-summary]');
    if (s) s.innerHTML = '<div class="kpi"><b>' + F.money(tot, M.vs) + '</b><span>Total value</span></div><div class="kpi"><b class="' + (ch24 >= 0 ? 'up' : 'down') + '">' + F.money(ch24, M.vs) + '</b><span>24h change</span></div><div class="kpi"><b class="' + (tot - cost >= 0 ? 'up' : 'down') + '">' + (cost ? F.money(tot - cost, M.vs) : '—') + '</b><span>Profit / loss (with cost basis)</span></div><div class="kpi"><b>' + hs.length + '</b><span>Assets</span></div>';
    const d = $('[data-pf-donut]');
    if (d) d.innerHTML = parts.length ? donut(parts) + '<ul class="small" style="list-style:none;padding:0">' + parts.map((p, i) => '<li><span style="color:' + COLORS[i % COLORS.length] + '">●</span> ' + esc(p.n) + ' ' + (tot ? (p.v / tot * 100).toFixed(1) : 0) + '%</li>').join('') + '</ul>' : '';
  }

  function drawAlerts() {
    const ul = $('[data-alerts]'); if (!ul) return;
    ul.innerHTML = A().map((a, i) => { const c = coin(a.id); return '<li class="news-item"><b>' + esc(c ? c.name : a.id) + '</b> ' + (a.dir === 'above' ? '≥' : '≤') + ' ' + F.money(a.price, 'usd') + (a.hit ? ' <span class="tag">triggered</span>' : '') + ' <button class="btn btn-ghost btn-xs" data-adel="' + i + '">Remove</button></li>'; }).join('') || '<li class="muted">No alerts yet.</li>';
  }

  async function checkAlerts() {
    const al = A(); if (!al.length) return;
    let m; try { m = await CL.markets({ per: 250, spark: false, vs: 'usd' }); } catch (e) { return; }
    let changed = false;
    al.forEach((a) => {
      if (a.hit) return;
      const c = m.coins.find((x) => x.id === a.id); if (!c) return;
      if ((a.dir === 'above' && c.price >= a.price) || (a.dir === 'below' && c.price <= a.price)) {
        a.hit = Date.now(); changed = true;
        const msg = c.name + ' is ' + (a.dir === 'above' ? 'above ' : 'below ') + F.money(a.price, 'usd') + ' (now ' + F.money(c.price, 'usd') + ')';
        CL.toast('🔔 ' + msg);
        try { if (Notification.permission === 'granted') new Notification('CoinLink alert', { body: msg }); } catch (e) {}
      }
    });
    if (changed) { CL.store.set('cl_alerts', al); drawAlerts(); }
  }

  async function init() {
    const pf = $('[data-portfolio]');
    if (pf) {
      await load();
      $$('[data-coin-select]').forEach((s) => (s.innerHTML = M.coins.map((c) => '<option value="' + esc(c.id) + '">' + esc(c.name) + ' (' + esc(c.symbol.toUpperCase()) + ')</option>').join('')));
      $('[data-add-holding]').addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const id = f.coin.value, amt = parseFloat(f.amount.value), cost = parseFloat(f.cost.value);
        if (!(amt > 0)) return CL.toast('Enter an amount');
        const hs = H(); const ex = hs.find((h) => h.id === id);
        if (ex) { const tc = (ex.cost || 0) * ex.amt + (cost || 0) * amt; ex.amt += amt; ex.cost = tc ? tc / ex.amt : null; } else hs.push({ id, amt, cost: cost > 0 ? cost : null });
        CL.store.set('cl_holdings', hs); f.reset(); draw();
      });
      document.addEventListener('click', (e) => {
        const d = e.target.closest('[data-del]'); if (d) { const hs = H(); hs.splice(+d.dataset.del, 1); CL.store.set('cl_holdings', hs); draw(); }
        const ad = e.target.closest('[data-adel]'); if (ad) { const al = A(); al.splice(+ad.dataset.adel, 1); CL.store.set('cl_alerts', al); drawAlerts(); }
      });
      const ex = $('[data-pf-export]'); if (ex) ex.addEventListener('click', () => { const blob = new Blob([JSON.stringify({ holdings: H(), alerts: A() }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'coinlink-portfolio.json'; a.click(); });
      const im = $('[data-pf-import]'); if (im) im.addEventListener('change', async () => { try { const j = JSON.parse(await im.files[0].text()); if (j.holdings) CL.store.set('cl_holdings', j.holdings); if (j.alerts) CL.store.set('cl_alerts', j.alerts); draw(); drawAlerts(); CL.toast('Imported'); } catch (e) { CL.toast('Invalid file'); } });
      const af = $('[data-add-alert]');
      if (af) af.addEventListener('submit', (e) => {
        e.preventDefault(); const f = e.target; const price = parseFloat(f.price.value); if (!(price > 0)) return;
        const al = A(); al.push({ id: f.coin.value, dir: f.dir.value, price }); CL.store.set('cl_alerts', al); f.reset(); drawAlerts();
        try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e2) {}
        CL.toast('Alert saved — keep a CoinLink tab open to receive it');
      });
      draw(); drawAlerts();
      setInterval(() => { if (!document.hidden) load().then(draw).catch(() => {}); }, 60000);
      document.addEventListener('cl:currency', () => load().then(draw));
    }
    if (A().length) { checkAlerts(); setInterval(checkAlerts, 60000); }
  }
  CL.ready(init);
})();

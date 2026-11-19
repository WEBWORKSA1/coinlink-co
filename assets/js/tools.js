/* CoinLink.co — calculators. Each tool lives in [data-tool="name"]; results render into [data-out]. */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc, F = CL.fmt;
  let M = null;
  const coinsReady = (async () => { try { M = await CL.markets({ per: 250, spark: false, vs: 'usd' }); } catch (e) { M = { coins: [], vs: 'usd' }; } return M; })();
  const byId = (id) => (M && M.coins.find((c) => c.id === id)) || null;
  const val = (box, n) => { const el = box.querySelector('[name="' + n + '"]'); return el ? (el.type === 'number' || el.dataset.num !== undefined ? parseFloat(el.value) : el.value) : null; };
  const rows = (obj) => '<div class="result-rows">' + Object.keys(obj).map((k) => '<div><span>' + esc(k) + '</span><b>' + obj[k] + '</b></div>').join('') + '</div>';
  const usd = (v) => F.money(v, 'usd');

  async function fillSelects(box) {
    await coinsReady;
    $$('[data-coin-select]', box).forEach((s) => {
      const def = s.dataset.default || 'bitcoin';
      const only = s.dataset.only ? s.dataset.only.split(',') : null;
      const list = only ? M.coins.filter((c) => only.indexOf(c.id) > -1) : M.coins;
      s.innerHTML = list.map((c) => '<option value="' + esc(c.id) + '"' + (c.id === def ? ' selected' : '') + '>' + esc(c.name) + ' (' + esc(c.symbol.toUpperCase()) + ')</option>').join('') || '<option value="bitcoin">Bitcoin (BTC)</option>';
    });
  }

  async function history(id) {
    try { const h = await CL.local('history/' + id); if (h.monthly && h.monthly.length > 6) return h.monthly; } catch (e) {}
    const d = await CL.chartData(id, 365, 'usd');
    const byMonth = {};
    d.prices.forEach((p) => { const k = new Date(p[0]).toISOString().slice(0, 7); byMonth[k] = p; });
    return Object.keys(byMonth).sort().map((k) => [byMonth[k][0], byMonth[k][1]]);
  }

  const T = {
    async converter(box) {
      await fillSelects(box);
      const run = async () => {
        const c = byId(val(box, 'coin')); const amt = val(box, 'amount') || 0; const fiat = val(box, 'fiat');
        if (!c) return;
        let rate = c.price, label = 'USD';
        if (fiat !== 'usd') {
          try { const d = await CL.fetchJSON(CL.cfg.api.coingecko + '/simple/price?ids=' + c.id + '&vs_currencies=' + fiat, { cache: true, ttl: 60000 }); rate = d[c.id][fiat]; label = fiat.toUpperCase(); }
          catch (e) { label = 'USD (live ' + fiat.toUpperCase() + ' rate unavailable)'; }
        } else label = 'USD';
        const rev = box.querySelector('[name=reverse]').checked;
        const out = rev ? amt / rate : amt * rate;
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">' + (rev ? F.num(amt, 2) + ' ' + label + ' =' : F.num(amt, 8) + ' ' + esc(c.symbol.toUpperCase()) + ' =') + '</span><span class="big">' + (rev ? F.num(out, 8) + ' ' + esc(c.symbol.toUpperCase()) : F.num(out, rate * amt >= 1 ? 2 : 6) + ' ' + label) + '</span>' + rows({ ['1 ' + c.symbol.toUpperCase()]: F.num(rate, 8) + ' ' + label.split(' ')[0], '24h change': F.pct(c.ch24h), 'Rank': '#' + (c.rank || '—') });
      };
      box.addEventListener('input', run); box.addEventListener('change', run); run();
    },
    profit(box) {
      const run = () => {
        const inv = val(box, 'invest'), buy = val(box, 'buy'), sell = val(box, 'sell'), bf = (val(box, 'buyfee') || 0) / 100, sf = (val(box, 'sellfee') || 0) / 100;
        if (!(inv > 0 && buy > 0 && sell >= 0)) return;
        const units = inv * (1 - bf) / buy, gross = units * sell, net = gross * (1 - sf), pl = net - inv, roi = pl / inv * 100;
        const be = buy / ((1 - bf) * (1 - sf));
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">Profit / loss</span><span class="big ' + (pl >= 0 ? 'up' : 'down') + '">' + (pl >= 0 ? '+' : '') + usd(pl) + '</span>' + rows({ 'ROI': F.pct(roi), 'Coins bought': F.num(units, 8), 'Exit value (after fees)': usd(net), 'Fees paid': usd(inv * bf + gross * sf), 'Break-even sell price': usd(be) });
      };
      box.addEventListener('input', run); run();
    },
    async dca(box) {
      await fillSelects(box);
      const run = async () => {
        const id = val(box, 'coin'), amt = val(box, 'amount') || 0, start = val(box, 'start');
        const out = box.querySelector('[data-out]');
        if (!(amt > 0)) return;
        out.innerHTML = '<span class="muted">Calculating…</span>';
        try {
          const h = await history(id);
          const s = start ? new Date(start + '-01').getTime() : 0;
          const pts = h.filter((p) => p[0] >= s);
          if (pts.length < 2) { out.innerHTML = '<p class="muted">Not enough history for that start date. Try a later month.</p>'; return; }
          const now = (byId(id) || {}).price || pts[pts.length - 1][1];
          let coins = 0; pts.forEach((p) => (coins += amt / p[1]));
          const invested = amt * pts.length, value = coins * now, lump = invested / pts[0][1] * now;
          out.innerHTML = '<span class="muted small">Value today of ' + pts.length + ' monthly buys</span><span class="big ' + (value >= invested ? 'up' : 'down') + '">' + usd(value) + '</span>' + rows({ 'Total invested': usd(invested), 'Profit / loss': usd(value - invested), 'Return': F.pct((value / invested - 1) * 100), 'Coins accumulated': F.num(coins, 8), 'Average cost': usd(invested / coins), 'Same money as one lump sum on day 1': usd(lump) }) + '<p class="small faint">Monthly closes; first buy ' + new Date(pts[0][0]).toISOString().slice(0, 7) + '.</p>';
        } catch (e) { out.innerHTML = '<p class="muted">History unavailable for this coin right now. Try Bitcoin or Ethereum, or try again later.</p>'; }
      };
      box.addEventListener('change', run); box.querySelector('[name=amount]').addEventListener('input', run); run();
    },
    async whatif(box) {
      await fillSelects(box);
      const run = async () => {
        const id = val(box, 'coin'), amt = val(box, 'amount') || 0, date = val(box, 'date');
        const out = box.querySelector('[data-out]');
        if (!(amt > 0) || !date) return;
        out.innerHTML = '<span class="muted">Looking up the price on that date…</span>';
        let then = null;
        const dd = date.split('-');
        try { const d = await CL.fetchJSON(CL.cfg.api.coingecko + '/coins/' + id + '/history?date=' + dd[2] + '-' + dd[1] + '-' + dd[0] + '&localization=false', { cache: true, ttl: 864e5 }); then = d.market_data && d.market_data.current_price.usd; } catch (e) {}
        if (!then) { try { const h = await history(id); const t = new Date(date).getTime(); let best = null; h.forEach((p) => { if (!best || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; }); if (best && Math.abs(best[0] - t) < 40 * 864e5) then = best[1]; } catch (e) {} }
        const manual = val(box, 'manual');
        if (manual > 0) then = manual;
        const now = (byId(id) || {}).price;
        if (!then || !now) { out.innerHTML = '<p class="muted">No price found for that date (free data covers roughly the last year for most coins, longer for majors). Enter the historical price manually below.</p>'; return; }
        const coins = amt / then, value = coins * now;
        out.innerHTML = '<span class="muted small">' + usd(amt) + ' on ' + esc(date) + ' would be worth</span><span class="big ' + (value >= amt ? 'up' : 'down') + '">' + usd(value) + '</span>' + rows({ 'Price then': usd(then), 'Price now': usd(now), 'Multiple': F.num(value / amt, 2) + '×', 'Return': F.pct((value / amt - 1) * 100), 'Coins': F.num(coins, 8) });
      };
      box.addEventListener('change', run); run();
    },
    async mcap(box) {
      await fillSelects(box);
      const run = () => {
        const a = byId(val(box, 'coin')), b = byId(val(box, 'target')), custom = val(box, 'custom');
        if (!a || !a.circ) return;
        const target = custom > 0 ? custom * 1e9 : b ? b.mcap : null;
        if (!target) return;
        const p = target / a.circ;
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">' + esc(a.name) + ' price at a ' + F.compact(target, 'usd') + ' market cap</span><span class="big">' + usd(p) + '</span>' + rows({ 'Current price': usd(a.price), 'Multiple from today': F.num(p / a.price, 2) + '×', 'Circulating supply used': F.num(a.circ, 0), 'Current market cap': F.compact(a.mcap, 'usd') }) + '<p class="small faint">Assumes circulating supply stays constant. Market caps are not “earned” linearly; this is a thought experiment, not a forecast.</p>';
      };
      box.addEventListener('input', run); box.addEventListener('change', run); run();
    },
    staking(box) {
      const run = () => {
        const P = val(box, 'principal'), apy = val(box, 'apy') / 100, n = +val(box, 'freq'), yrs = val(box, 'years'), px = val(box, 'price') || 0, chg = (val(box, 'pricechange') || 0) / 100;
        if (!(P > 0 && apy >= 0 && yrs > 0)) return;
        const r = n > 0 ? Math.pow(1 + apy, 1 / n) - 1 : apy;
        const tokens = n > 0 ? P * Math.pow(1 + r, n * yrs) : P * (1 + apy * yrs);
        const endPx = px * (1 + chg);
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">Tokens after ' + yrs + ' year(s)</span><span class="big up">' + F.num(tokens, 4) + '</span>' + rows({ 'Rewards earned': F.num(tokens - P, 4) + ' tokens', 'Effective growth': F.pct((tokens / P - 1) * 100), 'Value at start': px ? usd(P * px) : '—', 'Value at end (with price change)': px ? usd(tokens * endPx) : '—' }) + '<p class="small faint">Real yields vary, can fall to zero, and may include lock-up, slashing and smart-contract risk.</p>';
      };
      box.addEventListener('input', run); box.addEventListener('change', run); run();
    },
    position(box) {
      const run = () => {
        const acct = val(box, 'account'), risk = val(box, 'risk') / 100, entry = val(box, 'entry'), stop = val(box, 'stop'), tgt = val(box, 'target');
        if (!(acct > 0 && risk > 0 && entry > 0 && stop > 0 && stop !== entry)) return;
        const riskAmt = acct * risk, perUnit = Math.abs(entry - stop), units = riskAmt / perUnit, size = units * entry;
        const rr = tgt > 0 ? Math.abs(tgt - entry) / perUnit : null;
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">Position size</span><span class="big">' + usd(size) + '</span>' + rows({ 'Units to buy': F.num(units, 6), 'Max loss if stopped': usd(riskAmt), 'Stop distance': F.pct(-perUnit / entry * 100), 'Reward : risk': rr ? F.num(rr, 2) + ' : 1' : '—', 'Share of account': F.pct(size / acct * 100) }) + (size > acct ? '<p class="small down">Position exceeds account size — this would require leverage.</p>' : '');
      };
      box.addEventListener('input', run); run();
    },
    async units(box) {
      await coinsReady;
      const btc = (byId('bitcoin') || {}).price || 0, eth = (byId('ethereum') || {}).price || 0;
      const fields = { btc: 1, sats: 1e8, ethv: 1, gwei: 1e9, wei: 1e18 };
      const set = (src) => {
        const v = parseFloat(box.querySelector('[name=' + src + ']').value);
        if (isNaN(v)) return;
        if (['btc', 'sats', 'btcusd'].indexOf(src) > -1) {
          const b = src === 'btcusd' ? v / btc : v / fields[src];
          if (src !== 'btc') box.querySelector('[name=btc]').value = +b.toFixed(8);
          if (src !== 'sats') box.querySelector('[name=sats]').value = Math.round(b * 1e8);
          if (src !== 'btcusd') box.querySelector('[name=btcusd]').value = btc ? +(b * btc).toFixed(2) : '';
        } else {
          const e = src === 'ethusd' ? v / eth : v / fields[src];
          if (src !== 'ethv') box.querySelector('[name=ethv]').value = +e.toPrecision(12);
          if (src !== 'gwei') box.querySelector('[name=gwei]').value = +(e * 1e9).toPrecision(12);
          if (src !== 'wei') box.querySelector('[name=wei]').value = BigInt(Math.round(e * 1e9)) * 1000000000n + '';
          if (src !== 'ethusd') box.querySelector('[name=ethusd]').value = eth ? +(e * eth).toFixed(2) : '';
        }
      };
      box.addEventListener('input', (e) => { if (e.target.name) set(e.target.name); });
      set('btc'); set('ethv');
      const n = box.querySelector('[data-out]'); if (n) n.innerHTML = '<span class="muted small">Live reference prices</span>' + rows({ '1 BTC': usd(btc), '1 ETH': usd(eth), '1,000 sats': usd(btc / 1e5), '1 gwei': usd(eth / 1e9) });
    },
    fees(box) {
      const run = () => {
        const amt = val(box, 'amount'), bf = (val(box, 'buyfee') || 0) / 100, sf = (val(box, 'sellfee') || 0) / 100, net = val(box, 'network') || 0, spread = (val(box, 'spread') || 0) / 100;
        if (!(amt > 0)) return;
        const after = (amt - net) * (1 - bf) * (1 - spread / 2);
        const needed = amt / (after * (1 - sf) * (1 - spread / 2)) - 1;
        const totalFees = amt - after + (amt * sf);
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">Price must rise at least</span><span class="big">' + F.num(needed * 100, 2) + '%</span><span class="muted small">just to break even</span>' + rows({ 'Value actually invested': usd(after), 'Approx. round-trip costs': usd(totalFees), 'Cost as % of trade': F.num(totalFees / amt * 100, 2) + '%' });
      };
      box.addEventListener('input', run); run();
    },
    tax(box) {
      const run = () => {
        const proceeds = val(box, 'proceeds'), cost = val(box, 'cost'), fees = val(box, 'fees') || 0, held = val(box, 'held'), st = (val(box, 'strate') || 0) / 100, lt = (val(box, 'ltrate') || 0) / 100, thr = val(box, 'threshold') || 12;
        if (!(proceeds >= 0 && cost >= 0)) return;
        const gain = proceeds - cost - fees;
        const long = held >= thr;
        const rate = long ? lt : st;
        const tax = gain > 0 ? gain * rate : 0;
        box.querySelector('[data-out]').innerHTML = '<span class="muted small">Estimated tax</span><span class="big">' + usd(tax) + '</span>' + rows({ 'Taxable gain / (loss)': usd(gain), 'Holding period': held + ' months (' + (long ? 'long-term' : 'short-term') + ')', 'Rate applied': F.num(rate * 100, 1) + '%', 'Kept after tax': usd(gain - tax) }) + (gain < 0 ? '<p class="small">A capital loss may offset other gains in many countries — check local rules.</p>' : '');
      };
      box.addEventListener('input', run); box.addEventListener('change', run); run();
    }
  };

  CL.ready(() => { $$('[data-tool]').forEach((b) => { const f = T[b.dataset.tool]; if (f) f(b); }); });
})();

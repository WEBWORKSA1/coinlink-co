/* CoinLink.co — contests (countdowns, quiz), donation buttons, misc page widgets. */
(function () {
  'use strict';
  const CL = window.CL, $ = CL.$, $$ = CL.$$, esc = CL.esc;

  /* countdown to end of current month (UTC) */
  function countdowns() {
    const els = $$('[data-countdown]'); if (!els.length) return;
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    const tick = () => {
      const ms = end - Date.now(); const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
      els.forEach((e) => (e.textContent = d + 'd ' + h + 'h ' + m + 'm left'));
    };
    tick(); setInterval(tick, 30000);
    $$('[data-month]').forEach((e) => (e.textContent = now.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })));
    $$('[data-month-end]').forEach((e) => (e.textContent = end.toUTCString().slice(0, 16)));
  }

  /* quiz contest */
  const QUIZ = [
    ['Someone in a Discord DM offers to “sync” your wallet to fix an error. What should you do?', ['Share your seed phrase so they can help', 'Click their link and connect quickly', 'Ignore it — real support never DMs first', 'Send a small test amount'], 2],
    ['What does a 12- or 24-word seed phrase control?', ['Only your exchange login', 'Full access to every asset in that wallet', 'Your email password', 'Nothing important'], 1],
    ['Which link is most likely a phishing copy of metamask.io?', ['metamask.io', 'support.metamask.io', 'metamask-io-wallet.app', 'portfolio.metamask.io'], 2],
    ['What is “market cap”?', ['Price × circulating supply', 'Total coins ever mined', 'Daily trading volume', 'The highest price ever'], 0],
    ['A token approval lets a smart contract…', ['Read your email', 'Move specific tokens from your wallet', 'Change your seed phrase', 'Freeze the blockchain'], 1],
    ['What happens at a Bitcoin halving?', ['The supply cap halves', 'The block reward to miners halves', 'Prices halve', 'Fees go to zero'], 1],
    ['What is a stablecoin designed to track?', ['The price of Bitcoin', 'A reference asset such as the US dollar', 'Stock market indices only', 'Gas prices'], 1],
    ['Where should you get a project’s official website?', ['A sponsored search ad', 'A reply under a viral post', 'A verified source you already trust, typed or bookmarked', 'A Telegram DM'], 2],
    ['What does DCA mean?', ['Decentralized Crypto Account', 'Dollar-cost averaging: buying a fixed amount on a schedule', 'Daily coin auction', 'Digital custody agreement'], 1],
    ['A site promises to double any crypto you send. This is…', ['A limited-time giveaway', 'A guaranteed scam', 'A staking product', 'An airdrop'], 1]
  ];
  function quiz() {
    const box = $('[data-quiz]'); if (!box) return;
    let i = 0, score = 0;
    const show = () => {
      if (i >= QUIZ.length) {
        box.innerHTML = '<h3>You scored ' + score + '/' + QUIZ.length + '</h3><p class="muted">' + (score >= 9 ? 'Scam-proof! Enter the monthly draw below.' : 'Nice try — read the safety guides and come back for another attempt.') + '</p>';
        const s = $('[name=quiz_score]'); if (s) s.value = score + '/' + QUIZ.length;
        const f = $('#quiz-entry'); if (f) { f.hidden = false; }
        return;
      }
      const q = QUIZ[i];
      box.innerHTML = '<p class="eyebrow">Question ' + (i + 1) + ' of ' + QUIZ.length + '</p><div class="quiz-q"><h3>' + esc(q[0]) + '</h3></div><div class="quiz-opts">' + q[1].map((o, k) => '<button data-ans="' + k + '">' + esc(o) + '</button>').join('') + '</div>';
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ans]'); if (!b || b.disabled) return;
      const q = QUIZ[i], k = +b.dataset.ans;
      $$('[data-ans]', box).forEach((x) => { x.disabled = true; if (+x.dataset.ans === q[2]) x.classList.add('right'); });
      if (k === q[2]) score++; else b.classList.add('wrong');
      setTimeout(() => { i++; show(); }, 900);
    });
    show();
  }

  /* donation buttons from config */
  function donate() {
    const box = $('[data-pay]'); if (!box) return;
    const p = CL.cfg.pay || {};
    const names = { stripe: 'Card (Stripe)', paypal: 'PayPal', buymeacoffee: 'Buy Me a Coffee', kofi: 'Ko-fi', githubSponsors: 'GitHub Sponsors', patreon: 'Patreon' };
    const btns = Object.keys(names).filter((k) => p[k]).map((k) => '<a class="btn btn-ghost" href="' + esc(p[k]) + '" target="_blank" rel="noopener">' + names[k] + '</a>');
    const w = CL.cfg.wallets || {};
    const ws = Object.keys(w).filter((k) => w[k]).map((k) => '<div class="dir-card"><h3>' + esc(k.replace('_', ' ')) + '</h3><code class="domain">' + esc(w[k]) + '</code><div class="dir-actions"><button class="btn btn-ghost btn-xs" data-copy="' + esc(w[k]) + '">Copy address</button></div></div>');
    if (btns.length) box.innerHTML = '<div class="pay-btns">' + btns.join('') + '</div>';
    const wb = $('[data-wallets]'); if (wb && ws.length) { wb.innerHTML = '<h3>Donate crypto</h3><p class="small muted">Always double-check the first and last 6 characters after pasting.</p><div class="dir-grid">' + ws.join('') + '</div>'; wb.hidden = false; }
    $$('[data-tier]').forEach((t) => t.addEventListener('click', () => {
      const f = $('#pledge'); const a = $('[name=amount]'); const fr = $('[name=frequency]');
      if (a) a.value = t.dataset.tier; if (fr && t.dataset.freq) fr.value = t.dataset.freq;
      if (f) f.scrollIntoView({ behavior: 'smooth' });
    }));
  }

  /* careers: apply buttons prefill role */
  function careers() {
    $$('[data-apply]').forEach((b) => b.addEventListener('click', () => { const s = $('[name=role]'); if (s) s.value = b.dataset.apply; const f = $('#apply'); if (f) f.scrollIntoView({ behavior: 'smooth' }); }));
  }

  CL.ready(() => { countdowns(); quiz(); donate(); careers(); });
})();

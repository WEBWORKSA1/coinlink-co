# CoinLink.co

**Every coin. The right link.** An independent crypto safety & data hub: verified official links, a phishing link checker (470k+ known phishing domains), live market data, 10 free calculators, sentiment & fee dashboards, auto-updated news and videos, and 14 original guides. Static site, hosted free on GitHub Pages (main branch), monetized with Google AdSense.

## How it works

| Part | Where |
|---|---|
| Page sources (partials with JSON meta) | `_src/pages`, `_src/learn`, `_src/tools`, `_src/directory.json`, `_src/glossary.json` |
| Generator (stdlib Python) | `scripts/build.py` → writes HTML to the repo root |
| Data refresher | `scripts/fetch_data.py` → `data/*.json` (markets, global, trending, exchanges, coin links, Fear & Greed, fees, news, videos, monthly history) |
| Phishing blocklist | `scripts/build_blocklist.py` → `data/blocklist/00–ff.txt` (ScamSniffer GPL-3.0 + MetaMask) |
| Automation | `.github/workflows/refresh.yml` — every 3 hours + on push + manual run |
| Front end | `assets/css/style.css`, `assets/js/*.js` (no frameworks) |
| Settings | `assets/js/config.js` (AdSense slots, donation links, wallets, form alias) |

The browser always tries live APIs first (CoinGecko → CoinPaprika → CoinLore) and falls back to the cached JSON, so the site never shows empty tables.

## One-time setup checklist

1. **GitHub Pages** — Settings → Pages → *Deploy from a branch* → `main` / `(root)`.
2. **Custom domain** — Settings → Pages → Custom domain → `coinlink.co`, then at your registrar add `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (and optionally a `CNAME` for `www` pointing to your GitHub Pages host). Tick *Enforce HTTPS* once the certificate is issued.
3. **Forms** — submit any form once (e.g. the newsletter). FormSubmit sends a one-time *Activate* email to the site inbox; click it. Optionally paste the random alias it gives you into `formAlias` in `assets/js/config.js`.
4. **AdSense** — add `coinlink.co` in AdSense → Sites; `ads.txt` and the head code are already in place. Enable Auto ads and Google's *Privacy & messaging* consent message for EEA/UK visitors. Optional: create display units and paste slot IDs into `adSlots` in `config.js`.
5. **Donations** — paste Stripe Payment Link / PayPal / Buy Me a Coffee / Ko-fi URLs or wallet addresses into `pay` / `wallets` in `config.js`; buttons appear automatically.
6. **Optional** — add a repository secret `COINGECKO_API_KEY` (free CoinGecko demo key) for faster coin-link refreshes.

## Local build

```bash
python3 scripts/fetch_data.py        # needs internet access to the data APIs
python3 scripts/build_blocklist.py
python3 scripts/build.py
python3 -m http.server 8000
```

## Legal

CoinLink.co is an independent information website, not affiliated with any company or product named “Coinlink”/“CoinLink” or with any brand listed on the site. Third-party names and logos belong to their owners. Blocklist data in `data/blocklist/` derives from ScamSniffer scam-database (GPL-3.0) and MetaMask eth-phishing-detect. Original content © CoinLink.co.

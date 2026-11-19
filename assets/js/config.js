/* CoinLink.co — site configuration. Edit values here; no build step needed. */
window.CL_CONFIG = {
  site: 'CoinLink.co',
  adsClient: 'ca-pub-6620975821265271',

  /* Optional manual AdSense units. Auto ads work without these.
     After creating display units in AdSense, paste their slot IDs, e.g. 'home-top': '1234567890'.
     Empty slots stay invisible (no blank boxes). */
  adSlots: {
    'home-top': '', 'home-mid': '', 'markets-top': '', 'coin-mid': '',
    'article-mid': '', 'tool-bottom': '', 'news-mid': '', 'links-mid': ''
  },

  /* Form delivery (FormSubmit AJAX). The destination inbox is stored encoded and
     assembled only at send time; it is never written into the page. After the first
     submission, FormSubmit emails an activation link to the inbox — click it once.
     Optional: replace `formAlias` with the random alias FormSubmit gives you. */
  formAlias: '',
  _k: ['tyb3diZXc=', 'W1nQDFhc2', 'bW9jLmxpY'],

  /* Donation / payment buttons. Leave blank to hide. Paste full https URLs
     (e.g. a Stripe Payment Link, PayPal.me, Buy Me a Coffee, Ko-fi, GitHub Sponsors). */
  pay: {
    stripe: '', paypal: '', buymeacoffee: '', kofi: '', githubSponsors: '', patreon: ''
  },
  /* Crypto donation addresses. Leave blank to hide. */
  wallets: { BTC: '', ETH: '', SOL: '', USDT_TRC20: '' },

  /* Data providers (browser first, cached JSON fallback). */
  api: {
    coingecko: 'https://api.coingecko.com/api/v3',
    paprika: 'https://api.coinpaprika.com/v1',
    coinlore: 'https://api.coinlore.net/api',
    fng: 'https://api.alternative.me/fng/',
    mempool: 'https://mempool.space/api',
    ethRpc: 'https://ethereum-rpc.publicnode.com'
  },
  refreshMs: 60000
};

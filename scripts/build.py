#!/usr/bin/env python3
"""
CoinLink.co static site generator.

Reads page partials from _src/ and live data from data/, then writes the
published HTML into the repository root (served by GitHub Pages, main branch).
Pure standard library so it runs anywhere (local or GitHub Actions).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_src"
DATA = ROOT / "data"
SITE = "https://coinlink.co"
BRAND = "CoinLink.co"
TAGLINE = "Every coin. The right link."
ADS_CLIENT = "ca-pub-6620975821265271"
CONTACT_URL = "https://web.works/contact"
TOPBAR_TEXT = "Contact, if you are interested in this website/domain name/Sponsorship/Advertisement/Partnership"
TODAY = dt.datetime.now(dt.timezone.utc).date().isoformat()

META_RE = re.compile(r"<!--meta\s*(\{.*?\})\s*-->", re.S)


# ----------------------------------------------------------------- helpers
def esc(s) -> str:
    return html.escape(str(s if s is not None else ""), quote=True)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write(rel: str, content: str) -> None:
    out = ROOT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    old = out.read_text(encoding="utf-8") if out.exists() else None
    if old != content:
        out.write_text(content, encoding="utf-8")


def asset_version() -> str:
    h = hashlib.sha1()
    for p in sorted((ROOT / "assets").rglob("*")):
        if p.is_file() and p.suffix in {".css", ".js", ".svg"}:
            h.update(p.read_bytes())
    return h.hexdigest()[:10]


VER = asset_version()


def parse_partial(path: Path):
    text = path.read_text(encoding="utf-8")
    m = META_RE.search(text)
    meta = json.loads(m.group(1)) if m else {}
    body = META_RE.sub("", text, count=1).strip()
    return meta, body


def fmt_usd(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "—"
    if v >= 1e12:
        return f"${v/1e12:.2f}T"
    if v >= 1e9:
        return f"${v/1e9:.2f}B"
    if v >= 1e6:
        return f"${v/1e6:.2f}M"
    if v >= 1:
        return f"${v:,.2f}"
    if v == 0:
        return "$0"
    return f"${v:.8f}".rstrip("0").rstrip(".")


def fmt_pct(v) -> str:
    try:
        v = float(v)
    except (TypeError, ValueError):
        return '<span class="muted">—</span>'
    cls = "up" if v >= 0 else "down"
    return f'<span class="{cls}">{v:+.2f}%</span>'


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ----------------------------------------------------------------- layout
NAV = [
    ("markets", "Markets", "markets.html"),
    ("links", "Verified Links", "links.html"),
    ("checker", "Link Checker", "link-checker.html"),
    ("tools", "Tools", "tools.html"),
    ("learn", "Learn", "learn.html"),
    ("news", "News", "news.html"),
    ("videos", "Videos", "videos.html"),
]
MORE = [
    ("sentiment", "Sentiment & Fees", "sentiment.html"),
    ("exchanges", "Exchanges", "exchanges.html"),
    ("portfolio", "Portfolio & Alerts", "portfolio.html"),
    ("glossary", "Glossary", "glossary.html"),
    ("contests", "Contests & Prizes", "contests.html"),
    ("careers", "Careers", "careers.html"),
    ("donate", "Support Us", "donate.html"),
    ("advertise", "Advertise", "advertise.html"),
    ("list", "List Your Project", "list-your-project.html"),
]

LOGO_SVG = (
    '<svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">'
    '<defs><linearGradient id="lgc" x1="0" y1="0" x2="1" y2="1">'
    '<stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#E9A21A"/></linearGradient></defs>'
    '<circle cx="18" cy="24" r="13" fill="url(#lgc)"/>'
    '<circle cx="18" cy="24" r="8.2" fill="none" stroke="#8a5a00" stroke-opacity=".38" stroke-width="2.2"/>'
    '<rect x="20" y="13.5" width="23" height="21" rx="10.5" fill="none" stroke="#22D3C5" stroke-width="4.2"/>'
    "</svg>"
)


def header(base: str, active: str) -> str:
    cur = ' aria-current="page"'
    items = "".join(
        f'<li><a href="{base}{href}"{cur if key == active else ""}>{label}</a></li>'
        for key, label, href in NAV
    )
    more = "".join(
        f'<li><a href="{base}{href}"{cur if key == active else ""}>{label}</a></li>'
        for key, label, href in MORE
    )
    return f"""
<a class="skip" href="#main">Skip to content</a>
<div class="topbar" role="note">
  <a href="{CONTACT_URL}" target="_blank" rel="noopener">{esc(TOPBAR_TEXT)} <span aria-hidden="true">→</span></a>
</div>
<div class="tickerbar" id="ticker" aria-label="Live prices"><div class="ticker-track" data-ticker></div></div>
<header class="site-header">
  <div class="wrap header-in">
    <a class="brand" href="{base}index.html" aria-label="{BRAND} home">{LOGO_SVG}<span class="brand-name">Coin<b>Link</b><i>.co</i></span></a>
    <nav class="main-nav" aria-label="Primary">
      <ul class="nav-list">{items}
        <li class="has-more"><button class="more-btn" aria-expanded="false" aria-haspopup="true">More <span aria-hidden="true">▾</span></button>
          <ul class="more-menu">{more}</ul></li>
      </ul>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" data-search-open aria-label="Search coins and pages (Ctrl+K)" title="Search (Ctrl+K)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.42 1.41-5.39-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"/></svg></button>
      <select class="cur-select" data-currency aria-label="Display currency">
        <option value="usd">USD</option><option value="eur">EUR</option><option value="gbp">GBP</option><option value="cad">CAD</option><option value="inr">INR</option><option value="aud">AUD</option><option value="jpy">JPY</option><option value="btc">BTC</option>
      </select>
      <button class="icon-btn" data-theme-toggle aria-label="Toggle light/dark theme" title="Theme"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/></svg></button>
      <a class="btn btn-gold btn-sm hide-sm" href="{base}get-started.html">Free Safety Kit</a>
      <button class="icon-btn menu-btn" data-menu aria-label="Open menu" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg></button>
    </div>
  </div>
</header>
<div class="global-bar" data-globalbar><div class="wrap gb-in"><span class="muted">Loading market overview…</span></div></div>
"""


def footer(base: str) -> str:
    year = dt.date.today().year
    return f"""
<section class="footer-cta">
  <div class="wrap fcta-in">
    <div><h2>Get the CoinLink Brief</h2><p>One short email a week: verified-link alerts, new phishing patterns, market moves that matter. No spam, unsubscribe anytime.</p></div>
    <form class="inline-form" data-form="newsletter" data-label="Newsletter signup" novalidate>
      <input type="text" name="_gotcha" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="sr" for="nl-email">Email</label>
      <input id="nl-email" type="email" name="email" placeholder="you@email.com" required autocomplete="email">
      <input type="hidden" name="source" value="footer">
      <button class="btn btn-gold" type="submit">Subscribe</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>
<footer class="site-footer">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <a class="brand" href="{base}index.html">{LOGO_SVG}<span class="brand-name">Coin<b>Link</b><i>.co</i></span></a>
      <p>{TAGLINE} Verified official links, phishing checks, live prices, tools and plain-English guides.</p>
      <p class="small muted">Not financial advice. Crypto assets are volatile and can lose all value.</p>
    </div>
    <div><h3>Markets</h3><ul>
      <li><a href="{base}markets.html">Prices &amp; market cap</a></li><li><a href="{base}exchanges.html">Exchanges</a></li>
      <li><a href="{base}sentiment.html">Sentiment &amp; fees</a></li><li><a href="{base}portfolio.html">Portfolio &amp; alerts</a></li>
      <li><a href="{base}tools.html">Calculators</a></li></ul></div>
    <div><h3>Safety</h3><ul>
      <li><a href="{base}links.html">Verified links</a></li><li><a href="{base}link-checker.html">Phishing link checker</a></li>
      <li><a href="{base}link-checker.html#report">Report a scam link</a></li><li><a href="{base}learn/common-crypto-scams.html">Scam red flags</a></li>
      <li><a href="{base}learn/scammed-what-to-do.html">Scammed? Next steps</a></li></ul></div>
    <div><h3>Learn</h3><ul>
      <li><a href="{base}learn.html">All guides</a></li><li><a href="{base}glossary.html">Glossary</a></li>
      <li><a href="{base}news.html">News</a></li><li><a href="{base}videos.html">Videos</a></li>
      <li><a href="{base}editorial-policy.html">Editorial policy</a></li></ul></div>
    <div><h3>Work with us</h3><ul>
      <li><a href="{base}get-started.html">Free safety kit</a></li><li><a href="{base}list-your-project.html">List your project</a></li>
      <li><a href="{base}advertise.html">Advertise &amp; sponsor</a></li><li><a href="{base}contests.html">Contests &amp; prizes</a></li>
      <li><a href="{base}careers.html">Careers</a></li><li><a href="{base}donate.html">Support us</a></li>
      <li><a href="{base}contact.html">Contact</a></li></ul></div>
    <div><h3>Legal</h3><ul>
      <li><a href="{base}about.html">About</a></li><li><a href="{base}privacy.html">Privacy policy</a></li>
      <li><a href="{base}terms.html">Terms of use</a></li><li><a href="{base}disclaimer.html">Disclaimer</a></li>
      <li><a href="{base}cookies.html">Cookie policy</a></li><li><a href="{base}legal.html">Trademark &amp; copyright</a></li>
      <li><a href="{base}sitemap.html">Sitemap</a></li></ul></div>
  </div>
  <div class="wrap foot-legal">
    <p><strong>Trademark &amp; copyright disclosure:</strong> {BRAND} is an independent information website. It is not affiliated with, endorsed by, or sponsored by any company, product or service named “Coinlink”, “CoinLink” or similar, nor by any exchange, wallet, blockchain project or publisher mentioned on this site. All product names, logos and brands are property of their respective owners and are used for identification only. Market data: CoinGecko, CoinPaprika, CoinLore. Sentiment: Alternative.me. Phishing data: ScamSniffer scam-database (GPL-3.0) and MetaMask eth-phishing-detect. Headlines link to their original publishers. <a href="{base}legal.html">Full disclosure</a>.</p>
    <p>© {year} {BRAND}. Original content and design are protected by copyright. All rights reserved.</p>
  </div>
</footer>
<div class="consent" data-consent hidden>
  <p>We use cookies for essential features, and Google AdSense may use cookies to show and measure ads. <a href="{base}cookies.html">Learn more</a>.</p>
  <div class="consent-btns"><button class="btn btn-ghost btn-sm" data-consent-reject>Reject non-essential</button><button class="btn btn-gold btn-sm" data-consent-accept>Accept</button></div>
</div>
<aside class="slidein" data-slidein hidden aria-label="Free safety kit offer">
  <button class="slidein-x" data-slidein-close aria-label="Close">×</button>
  <p class="eyebrow">Free download</p>
  <h3>The Scam-Proof Crypto Starter Kit</h3>
  <p>27-point safety checklist + verified-links cheat sheet. Takes 30 seconds.</p>
  <a class="btn btn-gold btn-block" href="{base}get-started.html#kit">Get the free kit</a>
</aside>
<div class="palette" data-palette hidden role="dialog" aria-modal="true" aria-label="Search">
  <div class="palette-box">
    <input type="search" data-palette-input placeholder="Search coins, tools, guides… (e.g. bitcoin, converter, wallet)" aria-label="Search">
    <ul class="palette-results" data-palette-results></ul>
    <p class="palette-hint small muted">↑↓ to move · Enter to open · Esc to close</p>
  </div>
</div>
<div class="toast-wrap" data-toasts aria-live="polite"></div>
"""


def json_ld_base() -> str:
    org = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": f"{SITE}/#org",
                "name": BRAND,
                "url": f"{SITE}/",
                "logo": f"{SITE}/assets/img/logo.svg",
                "description": "Independent crypto information hub: verified official links, phishing checks, live prices, tools and guides.",
            },
            {
                "@type": "WebSite",
                "@id": f"{SITE}/#website",
                "url": f"{SITE}/",
                "name": BRAND,
                "publisher": {"@id": f"{SITE}/#org"},
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": f"{SITE}/markets.html?q={{search_term_string}}",
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    }
    return json.dumps(org, separators=(",", ":"))


def page(meta: dict, body: str, out_rel: str, extra_ld: list | None = None) -> str:
    depth = out_rel.count("/")
    base = "/" if meta.get("absbase") else "../" * depth
    title = meta.get("title", BRAND)
    full_title = title if BRAND in title else f"{title} | {BRAND}"
    desc = meta.get("description", TAGLINE)
    canon_path = "" if out_rel == "index.html" else out_rel
    canonical = f"{SITE}/{canon_path}"
    robots = meta.get("robots", "index,follow,max-image-preview:large")
    scripts = ["config", "core", "forms"] + [s for s in meta.get("scripts", []) if s not in ("config", "core", "forms")]
    script_tags = "\n".join(f'<script defer src="{base}assets/js/{s}.js?v={VER}"></script>' for s in scripts)
    ld = [json_ld_base()]
    crumbs = meta.get("crumbs")
    if crumbs:
        items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"}]
        for i, (name, href) in enumerate(crumbs, start=2):
            items.append({"@type": "ListItem", "position": i, "name": name, "item": f"{SITE}/{href}"})
        ld.append(json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}, separators=(",", ":")))
    for x in extra_ld or []:
        ld.append(json.dumps(x, separators=(",", ":")))
    ld_tags = "\n".join(f'<script type="application/ld+json">{x}</script>' for x in ld)
    body = body.replace("{{base}}", base).replace("{{today}}", TODAY).replace("{{year}}", str(dt.date.today().year))
    body_attrs = f' data-page="{esc(meta.get("page", meta.get("nav", "")))}"'
    if meta.get("coin"):
        body_attrs += f' data-coin-id="{esc(meta["coin"])}"'
    og_img = f"{SITE}/assets/img/og.png"
    return f"""<!doctype html>
<html lang="en" data-base="{base}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(full_title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(canonical)}">
<meta name="robots" content="{esc(robots)}">
<meta property="og:type" content="{esc(meta.get('og_type', 'website'))}">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{esc(full_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(canonical)}">
<meta property="og:image" content="{og_img}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(full_title)}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{og_img}">
<meta name="theme-color" content="#0b1020">
<link rel="icon" href="{base}assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{base}assets/img/icon-192.png">
<link rel="manifest" href="{base}manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://api.coingecko.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=Space+Grotesk:wght@500;600;700&amp;display=swap">
<link rel="stylesheet" href="{base}assets/css/style.css?v={VER}">
<script>try{{var t=localStorage.getItem('cl_theme');if(t)document.documentElement.setAttribute('data-theme',t);if(localStorage.getItem('cl_consent')==='rejected'){{(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;}}}}catch(e){{}}</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={ADS_CLIENT}" crossorigin="anonymous"></script>
{ld_tags}
{script_tags}
</head>
<body{body_attrs}>
{header(base, meta.get("nav", ""))}
<main id="main">
{body}
</main>
{footer(base)}
</body>
</html>
"""


# ----------------------------------------------------------------- prerender blocks
def pre_topcoins(markets, n=10, base=""):
    rows = []
    static_ids = set(load_json(DATA / "static-coins.json", []))
    for c in markets[:n]:
        href = f"{base}coins/{c['id']}.html" if c["id"] in static_ids else f"{base}coin.html?id={c['id']}"
        rows.append(
            f'<tr><td class="num">{c.get("rank") or ""}</td>'
            f'<td><a class="coin-cell" href="{href}"><img src="{esc(c.get("image",""))}" alt="" width="22" height="22" loading="lazy"><span>{esc(c["name"])}</span> <small>{esc(c["symbol"].upper())}</small></a></td>'
            f'<td class="num">{fmt_usd(c.get("price"))}</td><td class="num">{fmt_pct(c.get("ch24h"))}</td>'
            f'<td class="num hide-sm">{fmt_pct(c.get("ch7d"))}</td><td class="num hide-sm">{fmt_usd(c.get("mcap"))}</td></tr>'
        )
    if not rows:
        return '<tr><td colspan="6" class="muted">Loading live prices…</td></tr>'
    return "".join(rows)


def pre_news(news, n=12):
    out = []
    for it in news[:n]:
        out.append(
            f'<li class="news-item"><a href="{esc(it["link"])}" target="_blank" rel="noopener nofollow">{esc(it["title"])}</a>'
            f'<span class="news-meta"><b>{esc(it.get("source",""))}</b> · <time datetime="{esc(it.get("date",""))}">{esc(it.get("date","")[:10])}</time>'
            + (f' · <span class="tag">{esc(it.get("cat",""))}</span>' if it.get("cat") else "")
            + "</span></li>"
        )
    return "".join(out) or '<li class="muted">Headlines refresh automatically every few hours.</li>'


def pre_videos(videos, n=6, fallback=False):
    out = []
    for v in videos[:n]:
        out.append(
            f'<figure class="yt" data-yt="{esc(v["id"])}"><button class="yt-thumb" aria-label="Play: {esc(v["title"])}">'
            f'<img src="https://i.ytimg.com/vi/{esc(v["id"])}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360"><span class="yt-play" aria-hidden="true">▶</span></button>'
            f'<figcaption><b>{esc(v["title"])}</b><span class="small muted">{esc(v.get("channel",""))} · {esc(v.get("date","")[:10])}</span></figcaption></figure>'
        )
    if not out and fallback:
        return ('<div class="card yt-fallback"><h3 class="h5">🎬 Video explainers</h3><p class="small muted">The latest uploads from respected crypto education channels refresh here automatically.</p>'
                '<a class="btn btn-ghost btn-sm" href="{{base}}videos.html">Browse videos</a></div>')
    return "".join(out)


# ----------------------------------------------------------------- builders
def build_guides():
    guides = []
    for p in sorted((SRC / "learn").glob("*.html")):
        meta, body = parse_partial(p)
        meta["slug"] = p.stem
        guides.append((meta, body))
    guides.sort(key=lambda g: g[0].get("order", 99))
    pages = []
    for meta, body in guides:
        s = meta["slug"]
        out = f"learn/{s}.html"
        # TOC from h2
        toc = []

        def add_id(m):
            inner = re.sub("<[^>]+>", "", m.group(2))
            hid = slug(inner)[:60]
            toc.append((hid, inner))
            return f'<h2 id="{hid}"{m.group(1)}>{m.group(2)}</h2>'

        body2 = re.sub(r"<h2([^>]*)>(.*?)</h2>", add_id, body)
        # FAQ JSON-LD from <details class="faq">
        faqs = re.findall(r'<details class="faq"><summary>(.*?)</summary>(.*?)</details>', body2, re.S)
        extra = [
            {
                "@context": "https://schema.org",
                "@type": "Article",
                "headline": meta["title"],
                "description": meta.get("description", ""),
                "datePublished": meta.get("published", "2026-11-19"),
                "dateModified": meta.get("updated", "2026-11-19"),
                "author": {"@type": "Organization", "name": f"{BRAND} Editorial"},
                "publisher": {"@id": f"{SITE}/#org"},
                "mainEntityOfPage": f"{SITE}/{out}",
                "image": f"{SITE}/assets/img/og.png",
            }
        ]
        if faqs:
            extra.append(
                {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": re.sub("<[^>]+>", "", q).strip(),
                            "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a).strip()},
                        }
                        for q, a in faqs
                    ],
                }
            )
        related = [g for g in guides if g[0]["slug"] != s][:0]
        same = [g for g in guides if g[0]["slug"] != s and g[0].get("category") == meta.get("category")]
        others = [g for g in guides if g[0]["slug"] != s and g not in same]
        related = (same + others)[:3]
        rel_html = "".join(
            f'<a class="card guide-card" href="{g[0]["slug"]}.html"><span class="tag">{esc(g[0].get("category",""))}</span>'
            f'<h3>{esc(g[0]["title"])}</h3><p>{esc(g[0].get("description",""))}</p></a>'
            for g in related
        )
        takeaways = "".join(f"<li>{esc(t)}</li>" for t in meta.get("takeaways", []))
        toc_html = "".join(f'<li><a href="#{h}">{esc(t)}</a></li>' for h, t in toc)
        art = f"""
<div class="wrap article-wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a> › <a href="../learn.html">Learn</a> › <span>{esc(meta.get('category','Guide'))}</span></nav>
  <article class="article">
    <header class="article-head">
      <span class="tag tag-{esc(meta.get('level','Beginner').lower())}">{esc(meta.get('level','Beginner'))}</span>
      <h1>{esc(meta['title'])}</h1>
      <p class="lede">{esc(meta.get('description',''))}</p>
      <p class="byline small muted">By {BRAND} Editorial · {meta.get('minutes', 8)} min read · Updated <time datetime="{meta.get('updated','2026-11-19')}">{meta.get('updated','2026-11-19')}</time> · <a href="../editorial-policy.html">How we write</a></p>
    </header>
    <aside class="takeaways"><h2 class="h4">Key takeaways</h2><ul>{takeaways}</ul></aside>
    <div class="article-grid">
      <nav class="toc" aria-label="On this page"><p class="eyebrow">On this page</p><ol>{toc_html}</ol></nav>
      <div class="prose">
        {body2}
        <div class="ad-slot" data-ad="article-mid"></div>
        <div class="helpful" data-helpful="{s}"><span>Was this guide helpful?</span><button class="btn btn-ghost btn-sm" data-vote="yes">👍 Yes</button><button class="btn btn-ghost btn-sm" data-vote="no">👎 No</button><span class="helpful-msg small muted" role="status"></span></div>
        <div class="callout callout-gold"><h3>Protect yourself before your next click</h3><p>Paste any crypto link into the <a href="../link-checker.html">CoinLink checker</a>, or grab the free <a href="../get-started.html#kit">Scam-Proof Starter Kit</a>.</p></div>
        <p class="small muted disclaimer-note">Educational content only, not financial, legal or tax advice. Always verify information with official sources. See our <a href="../disclaimer.html">disclaimer</a>.</p>
      </div>
    </div>
  </article>
  <section class="related"><h2>Keep learning</h2><div class="grid grid-3">{rel_html}</div></section>
</div>"""
        m2 = dict(meta)
        m2.setdefault("nav", "learn")
        m2["og_type"] = "article"
        m2["crumbs"] = [("Learn", "learn.html"), (meta["title"], out)]
        write(out, page(m2, art, out, extra))
        pages.append({"url": out, "title": meta["title"], "desc": meta.get("description", ""), "cat": meta.get("category", ""), "level": meta.get("level", ""), "minutes": meta.get("minutes", 8)})
    return pages


def build_tools():
    tools = []
    for p in sorted((SRC / "tools").glob("*.html")):
        meta, body = parse_partial(p)
        meta["slug"] = p.stem
        tools.append((meta, body))
    tools.sort(key=lambda t: t[0].get("order", 99))
    out_list = []
    for meta, body in tools:
        out = f"tools/{meta['slug']}.html"
        faqs = re.findall(r'<details class="faq"><summary>(.*?)</summary>(.*?)</details>', body, re.S)
        extra = [
            {
                "@context": "https://schema.org",
                "@type": "WebApplication",
                "name": meta["title"],
                "applicationCategory": "FinanceApplication",
                "operatingSystem": "Any",
                "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
                "url": f"{SITE}/{out}",
            }
        ]
        if faqs:
            extra.append(
                {
                    "@context": "https://schema.org",
                    "@type": "FAQPage",
                    "mainEntity": [
                        {"@type": "Question", "name": re.sub("<[^>]+>", "", q).strip(), "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a).strip()}}
                        for q, a in faqs
                    ],
                }
            )
        others = "".join(
            f'<a class="chip" href="{t[0]["slug"]}.html">{esc(t[0].get("short", t[0]["title"]))}</a>' for t in tools if t[0]["slug"] != meta["slug"]
        )
        wrapped = f"""
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a> › <a href="../tools.html">Tools</a> › <span>{esc(meta.get('short', meta['title']))}</span></nav>
  <header class="page-head"><span class="eyebrow">Free tool</span><h1>{esc(meta['h1'] if 'h1' in meta else meta['title'])}</h1><p class="lede">{esc(meta.get('description',''))}</p></header>
  {body}
  <div class="ad-slot" data-ad="tool-bottom"></div>
  <section class="more-tools"><h2 class="h4">More free tools</h2><div class="chips">{others}</div></section>
  <p class="small muted disclaimer-note">Calculations are estimates for education only and are not financial or tax advice. Live prices may be delayed.</p>
</div>"""
        m2 = dict(meta)
        m2["nav"] = "tools"
        m2.setdefault("scripts", ["tools"])
        m2["crumbs"] = [("Tools", "tools.html"), (meta.get("short", meta["title"]), out)]
        write(out, page(m2, wrapped, out, extra))
        out_list.append({"url": out, "title": meta["title"], "short": meta.get("short", meta["title"]), "desc": meta.get("description", ""), "icon": meta.get("icon", "🧮")})
    return out_list


def build_verified(directory):
    """data/verified.json — every domain we consider official, used by the link checker."""
    verified = {}
    for cat in directory.get("categories", []):
        for it in cat.get("items", []):
            d = it["domain"].lower()
            verified[d] = {"d": d, "n": it["name"], "c": cat["name"]}
    meta = load_json(DATA / "coins-meta.json", {})
    for cid, m in meta.items():
        for d in m.get("domains", []):
            d = d.lower()
            if d and d not in verified and not shared_host(d):
                verified[d] = {"d": d, "n": m.get("name", cid), "c": "Coin / project"}
    for ex in load_json(DATA / "exchanges.json", []):
        d = (ex.get("domain") or "").lower()
        if d and d not in verified and not shared_host(d):
            verified[d] = {"d": d, "n": ex.get("name", ""), "c": "Exchange"}
    bl_meta = load_json(DATA / "blocklist" / "meta.json", {})
    for d in bl_meta.get("fuzzylist", []):
        d = d.lower()
        if d not in verified:
            verified[d] = {"d": d, "n": d, "c": "Protected brand"}
    data = sorted(verified.values(), key=lambda x: x["d"])
    (DATA / "verified.json").write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return data


SHARED = ("github.io", "gitbook.io", "medium.com", "notion.site", "linktr.ee", "pages.dev", "vercel.app", "netlify.app", "web.app", "firebaseapp.com", "google.com", "x.com", "twitter.com", "t.me", "discord.gg", "discord.com", "youtube.com", "facebook.com", "reddit.com", "linkedin.com", "instagram.com", "github.com", "docs.google.com", "substack.com", "mirror.xyz")


def shared_host(d: str) -> bool:
    return any(d == s or d.endswith("." + s) for s in SHARED)


def build_coins(markets, meta, news, videos):
    """Static SEO pages for the top 100 coins (refreshed by the workflow)."""
    built = []
    top = [c for c in markets if c.get("id")][:100]
    by_rank = {c["id"]: c for c in top}
    for i, c in enumerate(top):
        cid = c["id"]
        m = meta.get(cid, {})
        name, sym = c["name"], c["symbol"].upper()
        out = f"coins/{cid}.html"
        links = []
        if m.get("homepage"):
            links += [("Official website", u) for u in m["homepage"][:2]]
        if m.get("whitepaper"):
            links.append(("Whitepaper", m["whitepaper"]))
        links += [("Block explorer", u) for u in m.get("explorers", [])[:4]]
        links += [("Source code", u) for u in m.get("repos", [])[:2]]
        if m.get("twitter"):
            links.append(("X (Twitter)", f"https://x.com/{m['twitter']}"))
        if m.get("subreddit"):
            links.append(("Reddit", m["subreddit"]))
        for u in m.get("chat", [])[:2]:
            links.append(("Community chat", u))
        link_rows = "".join(
            f'<tr><th scope="row">{esc(lbl)}</th><td><a href="{esc(u)}" target="_blank" rel="noopener nofollow">{esc(re.sub(r"^https?://", "", u).rstrip("/"))}</a></td>'
            f'<td><button class="btn btn-ghost btn-xs" data-copy="{esc(u)}">Copy</button></td></tr>'
            for lbl, u in links
        ) or '<tr><td colspan="3" class="muted">Official links are being verified for this asset. Use the dynamic profile or our <a href="../link-checker.html">link checker</a>.</td></tr>'
        neighbors = top[max(0, i - 3): i] + top[i + 1: i + 4]
        rel = "".join(
            f'<a class="chip" href="{n["id"]}.html"><img src="{esc(n.get("image",""))}" alt="" width="16" height="16" loading="lazy"> {esc(n["name"])}</a>' for n in neighbors
        )
        kw = {name.lower(), sym.lower()} if len(sym) >= 3 else {name.lower()}
        rel_news = [
            n for n in news if any(re.search(r"\b" + re.escape(k) + r"\b", n["title"].lower()) for k in kw)
        ][:6]
        rel_vid = [v for v in videos if any(re.search(r"\b" + re.escape(k) + r"\b", v["title"].lower()) for k in kw)][:3]
        price = fmt_usd(c.get("price"))
        circ = c.get("circ")
        mx = c.get("max")
        supply_note = (
            f"{name} has a circulating supply of about {circ:,.0f} {sym}" + (f" out of a maximum of {mx:,.0f}." if mx else " and no fixed maximum supply reported.")
            if isinstance(circ, (int, float)) and circ
            else ""
        )
        cats = ", ".join(m.get("categories", [])[:4])
        faqs = [
            (f"What is the price of {name} today?", f"At the last refresh ({TODAY}), {name} ({sym}) traded near {price}. The live price on this page updates automatically every minute."),
            (f"What is the official website of {name}?", (f"Our records list {re.sub(r'^https?://','',m['homepage'][0]).rstrip('/')} as the official website for {name}. Always type it yourself or use a bookmark, and check unfamiliar links with the CoinLink checker." if m.get("homepage") else f"We are still verifying the official website for {name}. Use the CoinLink link checker before connecting a wallet anywhere.")),
            (f"What is {name}'s market cap rank?", f"{name} ranked #{c.get('rank') or '—'} by market capitalization at the last refresh, with a market cap of roughly {fmt_usd(c.get('mcap'))}."),
            (f"Is {name} a safe investment?", f"No crypto asset is risk-free. {name}'s price changed {c.get('ch7d') or 0:+.1f}% over the past 7 days at our last refresh. Only invest what you can afford to lose and read our disclaimer."),
        ]
        faq_html = "".join(f'<details class="faq"><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in faqs)
        news_html = pre_news(rel_news, 6) if rel_news else '<li class="muted">No recent headlines mention this asset. See <a href="../news.html">all news</a>.</li>'
        vid_html = pre_videos(rel_vid, 3)
        body = f"""
<div class="wrap coin-page">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="../index.html">Home</a> › <a href="../markets.html">Markets</a> › <span>{esc(name)}</span></nav>
  <header class="coin-head">
    <div class="coin-title"><img src="{esc(c.get('image',''))}" alt="{esc(name)} logo" width="48" height="48"><div><h1>{esc(name)} <small>{esc(sym)}</small></h1><p class="muted">Rank #{c.get('rank') or '—'}{(' · ' + esc(cats)) if cats else ''}</p></div>
      <button class="star-btn" data-star="{esc(cid)}" aria-label="Add {esc(name)} to watchlist">☆</button></div>
    <div class="coin-price"><span class="big" data-live="price">{price}</span> <span data-live="ch24h">{fmt_pct(c.get('ch24h'))}</span><p class="small muted">Snapshot {TODAY} · live updates below</p></div>
  </header>
  <div class="stats-grid">
    <div class="stat"><span>Market cap</span><b data-live="mcap">{fmt_usd(c.get('mcap'))}</b></div>
    <div class="stat"><span>24h volume</span><b data-live="vol">{fmt_usd(c.get('vol'))}</b></div>
    <div class="stat"><span>Fully diluted value</span><b data-live="fdv">{fmt_usd(c.get('fdv'))}</b></div>
    <div class="stat"><span>Circulating supply</span><b data-live="circ">{(f"{circ:,.0f}" if isinstance(circ,(int,float)) and circ else "—")}</b></div>
    <div class="stat"><span>All-time high</span><b data-live="ath">{fmt_usd(c.get('ath'))}</b></div>
    <div class="stat"><span>7d change</span><b data-live="ch7d">{fmt_pct(c.get('ch7d'))}</b></div>
  </div>
  <section class="card chart-card"><div class="chart-head"><h2 class="h4">{esc(name)} price chart</h2><div class="seg" data-chart-range><button data-days="1">24h</button><button data-days="7" class="on">7d</button><button data-days="30">30d</button><button data-days="90">90d</button><button data-days="365">1y</button></div></div><div class="chart" data-chart="{esc(cid)}"><p class="muted">Loading chart…</p></div></section>
  <div class="grid grid-2 coin-cols">
    <section class="card"><h2 class="h4">✅ Official {esc(name)} links</h2><p class="small muted">Sourced from the project's public profile and cross-checked against phishing blocklists. Bookmark these instead of clicking ads or DMs.</p>
      <table class="links-table"><tbody>{link_rows}</tbody></table>
      <p class="small"><a href="../link-checker.html">Check a different {esc(name)} link →</a> · <a href="../list-your-project.html?project={esc(name)}">Report a wrong or changed link</a></p></section>
    <section class="card"><h2 class="h4">Convert {esc(sym)}</h2>
      <div class="conv" data-mini-converter="{esc(cid)}" data-symbol="{esc(sym)}"><label>Amount of {esc(sym)}<input type="number" min="0" step="any" value="1" data-conv-amt></label><p class="conv-out"><span data-conv-out>{price}</span> <small class="muted">USD</small></p></div>
      <h3 class="h5">{esc(name)} safety checklist</h3>
      <ul class="checklist small"><li>Only use the domains listed on this page or typed from memory.</li><li>No real team will DM you first or ask for your seed phrase.</li><li>“Airdrop claim” and “wallet sync” sites are the #1 drainer pattern.</li><li>Verify contract addresses on an explorer before swapping.</li></ul></section>
  </div>
  <div class="ad-slot" data-ad="coin-mid"></div>
  <section class="prose card"><h2>About {esc(name)} ({esc(sym)})</h2>
    <p>{esc(name)} ({esc(sym)}) is ranked #{c.get('rank') or '—'} among cryptocurrencies by market capitalization, valued at roughly {fmt_usd(c.get('mcap'))} at our last refresh on {TODAY}. Over the previous 24 hours roughly {fmt_usd(c.get('vol'))} worth of {esc(sym)} changed hands across tracked exchanges. {esc(supply_note)}</p>
    <p>{esc(name)}'s all-time high was {fmt_usd(c.get('ath'))}{(' (' + esc(str(c.get('athDate',''))[:10]) + ')') if c.get('athDate') else ''}. Price data on this page refreshes live in your browser and the static snapshot is rebuilt automatically every few hours.</p>
    {('<p>Categories: ' + esc(cats) + '.</p>') if cats else ''}
    <h3>How to stay safe with {esc(name)}</h3>
    <p>Scammers clone popular project sites and promote them through search ads, fake support accounts and “claim” pages. Before you connect a wallet or sign a transaction, compare the address bar with the official links above, or paste the URL into the <a href="../link-checker.html">CoinLink phishing checker</a>, which screens it against more than 400,000 known phishing domains.</p>
  </section>
  <section class="card"><h2 class="h4">Latest {esc(name)} headlines</h2><ul class="news-list">{news_html}</ul></section>
  {('<section><h2 class="h4">' + esc(name) + ' videos</h2><div class="grid grid-3 yt-grid">' + vid_html + '</div></section>') if vid_html else ''}
  <section class="faq-block"><h2>{esc(name)} FAQ</h2>{faq_html}</section>
  <section><h2 class="h4">Similar by market cap</h2><div class="chips">{rel}</div></section>
  <p class="small muted disclaimer-note">Not financial advice. Data: CoinGecko (fallbacks CoinPaprika/CoinLore). Logos and names are trademarks of their owners, shown for identification.</p>
</div>"""
        meta_page = {
            "title": f"{name} ({sym}) Price, Official Links & Safety Check",
            "description": f"Live {name} ({sym}) price, chart and market cap, plus the verified official {name} website, explorers and socials. Check any {name} link for phishing.",
            "nav": "markets",
            "page": "coin",
            "coin": cid,
            "scripts": ["markets", "coin"],
            "crumbs": [("Markets", "markets.html"), (name, out)],
        }
        extra = [
            {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs],
            }
        ]
        write(out, page(meta_page, body, out, extra))
        built.append(cid)
    (DATA / "static-coins.json").write_text(json.dumps(built), encoding="utf-8")
    # remove stale coin pages
    for p in (ROOT / "coins").glob("*.html") if (ROOT / "coins").exists() else []:
        if p.stem not in built:
            p.unlink()
    return built


def build_pages(ctx):
    out_pages = []
    for p in sorted((SRC / "pages").glob("*.html")):
        meta, body = parse_partial(p)
        out = meta.get("out", p.stem + ".html")
        depth = out.count("/")
        base = "../" * depth
        for key, fn in ctx.items():
            if f"<!--@{key}-->" in body:
                body = body.replace(f"<!--@{key}-->", fn(base))
        write(out, page(meta, body, out))
        if meta.get("sitemap", True):
            out_pages.append({"url": out, "title": meta.get("title", ""), "desc": meta.get("description", ""), "pri": meta.get("priority", 0.7)})
    return out_pages


def build_sitemaps(pages, guides, tools, coins):
    urls = []
    for pg in pages:
        loc = f"{SITE}/" if pg["url"] == "index.html" else f"{SITE}/{pg['url']}"
        urls.append((loc, pg.get("pri", 0.7), "daily" if pg["url"] in ("index.html", "markets.html", "news.html") else "weekly"))
    for g in guides:
        urls.append((f"{SITE}/{g['url']}", 0.8, "monthly"))
    for t in tools:
        urls.append((f"{SITE}/{t['url']}", 0.8, "monthly"))
    for cid in coins:
        urls.append((f"{SITE}/coins/{cid}.html", 0.6, "daily"))
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, pri, freq in urls:
        xml.append(f"<url><loc>{esc(loc)}</loc><lastmod>{TODAY}</lastmod><changefreq>{freq}</changefreq><priority>{pri}</priority></url>")
    xml.append("</urlset>")
    write("sitemap.xml", "\n".join(xml) + "\n")


def build_search_index(pages, guides, tools):
    idx = [{"t": p["title"].split("|")[0].strip(), "u": p["url"], "k": "Page"} for p in pages if p["url"] not in ("404.html",)]
    idx += [{"t": g["title"], "u": g["url"], "k": "Guide"} for g in guides]
    idx += [{"t": t["title"], "u": t["url"], "k": "Tool"} for t in tools]
    (DATA / "search-index.json").write_text(json.dumps(idx, separators=(",", ":")), encoding="utf-8")


def main():
    markets = load_json(DATA / "markets.json", {}).get("coins", []) if isinstance(load_json(DATA / "markets.json", {}), dict) else []
    meta = load_json(DATA / "coins-meta.json", {})
    news = load_json(DATA / "news.json", {}).get("items", [])
    videos = load_json(DATA / "videos.json", {}).get("items", [])
    directory = load_json(SRC / "directory.json", {"categories": []})
    (DATA / "directory.json").write_text(json.dumps(directory, separators=(",", ":")), encoding="utf-8")
    build_verified(directory)
    coins = build_coins(markets, meta, news, videos) if markets else load_json(DATA / "static-coins.json", [])
    guides = build_guides()
    tools = build_tools()

    def guide_cards(base, limit=None):
        gs = guides[:limit] if limit else guides
        return "".join(
            f'<a class="card guide-card" href="{base}{g["url"]}"><span class="tag tag-{esc(g["level"].lower())}">{esc(g["level"])}</span> <span class="tag">{esc(g["cat"])}</span>'
            f'<h3>{esc(g["title"])}</h3><p>{esc(g["desc"])}</p><span class="small muted">{g["minutes"]} min read</span></a>'
            for g in gs
        )

    def tool_cards(base, limit=None):
        ts = tools[:limit] if limit else tools
        return "".join(
            f'<a class="card tool-card" href="{base}{t["url"]}"><span class="tool-ico" aria-hidden="true">{t["icon"]}</span><h3>{esc(t["short"])}</h3><p>{esc(t["desc"])}</p></a>'
            for t in ts
        )

    def directory_static(base):
        out = []
        for cat in directory.get("categories", []):
            items = "".join(
                f'<li><a href="https://{esc(i["domain"])}" target="_blank" rel="noopener nofollow">{esc(i["name"])}</a> <span class="muted">{esc(i["domain"])}</span></li>'
                for i in cat["items"]
            )
            out.append(f'<details class="dir-static"><summary>{esc(cat["name"])} ({len(cat["items"])})</summary><ul>{items}</ul></details>')
        return "".join(out)

    def glossary_html(base):
        g = load_json(SRC / "glossary.json", [])
        g.sort(key=lambda x: x["term"].lower())
        letters = sorted({x["term"][0].upper() for x in g})
        nav = "".join(f'<a href="#g-{l}">{l}</a>' for l in letters)
        body = []
        cur = None
        for x in g:
            l = x["term"][0].upper()
            if l != cur:
                if cur:
                    body.append("</dl>")
                body.append(f'<h2 id="g-{l}" class="g-letter">{l}</h2><dl class="glossary">')
                cur = l
            body.append(f'<dt id="{slug(x["term"])}">{esc(x["term"])}</dt><dd>{x["def"]}</dd>')
        body.append("</dl>")
        return f'<nav class="az" aria-label="A to Z">{nav}</nav>' + "".join(body)

    def sitemap_html(base):
        pgs = sorted({(p["title"], p["url"]) for p in pages_holder})
        li = "".join(f'<li><a href="{base}{u}">{esc(t.split("|")[0])}</a></li>' for t, u in pgs if u != "404.html")
        gl = "".join(f'<li><a href="{base}{g["url"]}">{esc(g["title"])}</a></li>' for g in guides)
        tl = "".join(f'<li><a href="{base}{t["url"]}">{esc(t["title"])}</a></li>' for t in tools)
        cl = "".join(f'<li><a href="{base}coins/{c}.html">{esc(c.replace("-", " ").title())}</a></li>' for c in coins)
        return f'<div class="grid grid-2"><section><h2>Pages</h2><ul>{li}</ul></section><section><h2>Guides</h2><ul>{gl}</ul><h2>Tools</h2><ul>{tl}</ul></section></div><section><h2>Coin profiles</h2><ul class="cols-3">{cl or "<li>Generated automatically after the first data refresh.</li>"}</ul></section>'

    pages_holder: list = []
    ctx = {
        "topcoins": lambda base: pre_topcoins(markets, 10, base),
        "news": lambda base: pre_news(news, 12),
        "newsall": lambda base: pre_news(news, 60),
        "videos": lambda base: pre_videos(videos, 6, True).replace("{{base}}", base),
        "guides": lambda base: guide_cards(base),
        "guides6": lambda base: guide_cards(base, 6),
        "tools": lambda base: tool_cards(base),
        "tools8": lambda base: tool_cards(base, 8),
        "directory": directory_static,
        "glossary": glossary_html,
        "updated": lambda base: esc(load_json(DATA / "markets.json", {}).get("updated", TODAY) if isinstance(load_json(DATA / "markets.json", {}), dict) else TODAY),
        "blockcount": lambda base: f'{load_json(DATA / "blocklist" / "meta.json", {}).get("count", 0):,}',
        "verifiedcount": lambda base: f'{len(load_json(DATA / "verified.json", [])):,}',
        "coincount": lambda base: str(len(coins)),
    }
    # sitemap.html needs list of pages: two-pass
    pages_holder.extend(
        {"title": parse_partial(p)[0].get("title", ""), "url": parse_partial(p)[0].get("out", p.stem + ".html")} for p in sorted((SRC / "pages").glob("*.html"))
    )
    ctx["sitemaphtml"] = sitemap_html
    pages = build_pages(ctx)
    build_sitemaps(pages, guides, tools, coins)
    build_search_index(pages, guides, tools)
    print(f"Built {len(pages)} pages, {len(guides)} guides, {len(tools)} tools, {len(coins)} coin pages. assets v={VER}")


if __name__ == "__main__":
    main()

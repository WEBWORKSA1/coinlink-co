#!/usr/bin/env python3
"""
CoinLink.co data refresher — run by .github/workflows/refresh.yml.

Every source is optional: a failed request keeps the previous JSON file, so the
site never goes blank. Standard library only.

Optional secret: COINGECKO_API_KEY (CoinGecko demo key) raises rate limits.
"""
from __future__ import annotations

import datetime as dt
import email.utils
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CG = "https://api.coingecko.com/api/v3"
CG_KEY = os.environ.get("COINGECKO_API_KEY", "").strip()
UA = "Mozilla/5.0 (compatible; CoinLinkBot/1.0; +https://coinlink.co)"
NOW = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
ISO = NOW.isoformat().replace("+00:00", "Z")
LOG: list[str] = []


def log(*a):
    msg = " ".join(str(x) for x in a)
    LOG.append(msg)
    print(msg, flush=True)


def http(url: str, data: bytes | None = None, headers: dict | None = None, timeout: int = 30, raw: bool = False, tries: int = 3):
    h = {"User-Agent": UA, "Accept": "application/json, text/xml, application/xml, */*"}
    if CG_KEY and url.startswith(CG):
        h["x-cg-demo-api-key"] = CG_KEY
    h.update(headers or {})
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if raw else json.loads(b.decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 429:
                time.sleep(20 * (i + 1))
                continue
            if e.code in (500, 502, 503, 504):
                time.sleep(5 * (i + 1))
                continue
            break
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"{url} -> {last}")


def load(name, default):
    try:
        return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))
    except Exception:
        return default


def save(name, obj):
    p = DATA / f"{name}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def age_days(name) -> float:
    p = DATA / f"{name}.json"
    if not p.exists():
        return 1e9
    return (time.time() - p.stat().st_mtime) / 86400


# --------------------------------------------------------------- markets
def markets():
    coins = []
    try:
        for page in (1,):
            d = http(f"{CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={page}&sparkline=true&price_change_percentage=1h,24h,7d")
            for c in d:
                sp = (c.get("sparkline_in_7d") or {}).get("price") or []
                coins.append({
                    "id": c["id"], "symbol": c["symbol"], "name": c["name"], "image": c.get("image"),
                    "rank": c.get("market_cap_rank"), "price": c.get("current_price"), "mcap": c.get("market_cap"),
                    "fdv": c.get("fully_diluted_valuation"), "vol": c.get("total_volume"), "high24": c.get("high_24h"), "low24": c.get("low_24h"),
                    "ch1h": c.get("price_change_percentage_1h_in_currency"),
                    "ch24h": c.get("price_change_percentage_24h_in_currency", c.get("price_change_percentage_24h")),
                    "ch7d": c.get("price_change_percentage_7d_in_currency"),
                    "circ": c.get("circulating_supply"), "total": c.get("total_supply"), "max": c.get("max_supply"),
                    "ath": c.get("ath"), "athDate": c.get("ath_date"), "atl": c.get("atl"),
                    "spark": [round(x, 8) for x in sp[::4]] if sp else None,
                })
        source = "CoinGecko"
    except Exception as e:
        log("markets: coingecko failed:", e)
        prev = load("markets", {})
        by_sym = {c["symbol"]: c for c in prev.get("coins", [])}
        try:
            d = http("https://api.coinpaprika.com/v1/tickers?quotes=USD")
            for c in sorted([x for x in d if x.get("rank")], key=lambda x: x["rank"])[:250]:
                q = c["quotes"]["USD"]
                old = by_sym.get(c["symbol"].lower(), {})
                coins.append({"id": old.get("id") or re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-"), "symbol": c["symbol"].lower(), "name": c["name"], "image": old.get("image"),
                              "rank": c["rank"], "price": q["price"], "mcap": q["market_cap"], "vol": q["volume_24h"], "ch1h": q.get("percent_change_1h"),
                              "ch24h": q.get("percent_change_24h"), "ch7d": q.get("percent_change_7d"), "circ": c.get("circulating_supply"),
                              "total": c.get("total_supply"), "max": c.get("max_supply"), "ath": q.get("ath_price"), "athDate": q.get("ath_date"), "spark": old.get("spark")})
            source = "CoinPaprika"
        except Exception as e2:
            log("markets: coinpaprika failed:", e2)
            return False
    rates = load("markets", {}).get("rates", {})
    try:
        r = http(f"{CG}/exchange_rates")["rates"]
        usd = r["usd"]["value"]
        rates = {k: round(v["value"] / usd, 10) for k, v in r.items() if k in ("usd", "eur", "gbp", "cad", "inr", "aud", "jpy", "btc")}
    except Exception as e:
        log("rates failed:", e)
    save("markets", {"updated": ISO, "source": source, "rates": rates, "coins": coins})
    log(f"markets: {len(coins)} coins via {source}")
    return True


def global_stats():
    try:
        g = http(f"{CG}/global")["data"]
        save("global", {"updated": ISO, "mcap": g["total_market_cap"], "vol": g["total_volume"], "btcDom": g["market_cap_percentage"].get("btc"), "ethDom": g["market_cap_percentage"].get("eth"),
                        "ch24": g.get("market_cap_change_percentage_24h_usd"), "coins": g.get("active_cryptocurrencies"), "exchanges": g.get("markets")})
        log("global: ok")
    except Exception as e:
        log("global failed:", e)


def trending():
    try:
        t = http(f"{CG}/search/trending")
        save("trending", {"updated": ISO, "items": [{"id": x["item"]["id"], "name": x["item"]["name"], "symbol": x["item"]["symbol"], "thumb": x["item"].get("small") or x["item"].get("thumb"), "rank": x["item"].get("market_cap_rank")} for x in t.get("coins", [])]})
        log("trending: ok")
    except Exception as e:
        log("trending failed:", e)


def exchanges():
    try:
        d = http(f"{CG}/exchanges?per_page=100&page=1")
        out = []
        for x in d:
            dom = ""
            try:
                dom = urllib.parse.urlparse(x.get("url") or "").hostname or ""
                dom = dom[4:] if dom.startswith("www.") else dom
            except Exception:
                pass
            out.append({"name": x["name"], "image": x.get("image"), "url": x.get("url"), "domain": dom, "trust": x.get("trust_score"), "rank": x.get("trust_score_rank"),
                        "btcVol": x.get("trade_volume_24h_btc"), "country": x.get("country"), "year": x.get("year_established")})
        save("exchanges", out)
        log(f"exchanges: {len(out)}")
    except Exception as e:
        log("exchanges failed:", e)


def host_of(u: str) -> str:
    try:
        h = urllib.parse.urlparse(u).hostname or ""
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


def coins_meta(batch: int = 30):
    """Rotating fetch of official links for the top 100 coins."""
    mk = load("markets", {}).get("coins", [])[:100]
    meta = load("coins-meta", {})
    ids = [c["id"] for c in mk]
    todo = sorted(ids, key=lambda i: meta.get(i, {}).get("fetched", ""))[:batch]
    n = 0
    for cid in todo:
        try:
            d = http(f"{CG}/coins/{urllib.parse.quote(cid)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false", tries=2)
            L = d.get("links", {}) or {}
            home = [u for u in (L.get("homepage") or []) if u][:3]
            meta[cid] = {
                "name": d.get("name"), "symbol": d.get("symbol"),
                "homepage": home,
                "whitepaper": L.get("whitepaper") or "",
                "explorers": [u for u in (L.get("blockchain_site") or []) if u][:6],
                "repos": [u for u in ((L.get("repos_url") or {}).get("github") or []) if u][:3],
                "twitter": L.get("twitter_screen_name") or "",
                "subreddit": L.get("subreddit_url") if (L.get("subreddit_url") or "").count("/r/") else "",
                "chat": [u for u in (L.get("chat_url") or []) if u][:3],
                "categories": [c for c in (d.get("categories") or []) if c][:6],
                "domains": sorted({host_of(u) for u in home if host_of(u)}),
                "fetched": ISO,
            }
            n += 1
        except Exception as e:
            log("meta failed", cid, e)
        time.sleep(2.2 if CG_KEY else 6.5)
    # drop coins no longer in top 150
    keep = {c["id"] for c in load("markets", {}).get("coins", [])[:150]}
    meta = {k: v for k, v in meta.items() if k in keep}
    save("coins-meta", meta)
    log(f"coins-meta: refreshed {n}, total {len(meta)}")


def fng():
    try:
        d = http("https://api.alternative.me/fng/?limit=365")
        save("fng", {"updated": ISO, "data": d["data"]})
        log("fng: ok")
    except Exception as e:
        log("fng failed:", e)


def network():
    out = load("network", {})
    try:
        out["btcFees"] = http("https://mempool.space/api/v1/fees/recommended")
    except Exception as e:
        log("btc fees failed:", e)
    try:
        out["btcHeight"] = int(http("https://mempool.space/api/blocks/tip/height", raw=True).decode().strip())
    except Exception as e:
        log("btc height failed:", e)
    try:
        r = http("https://ethereum-rpc.publicnode.com", data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_gasPrice", "params": []}).encode(), headers={"Content-Type": "application/json"})
        out["ethGasGwei"] = round(int(r["result"], 16) / 1e9, 3)
    except Exception as e:
        log("eth gas failed:", e)
    out["updated"] = ISO
    save("network", out)
    log("network: ok")


# --------------------------------------------------------------- news
FEEDS = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Decrypt", "https://decrypt.co/feed"),
    ("The Block", "https://www.theblock.co/rss.xml"),
    ("Bitcoin Magazine", "https://bitcoinmagazine.com/.rss/full/"),
    ("CryptoSlate", "https://cryptoslate.com/feed/"),
    ("BeInCrypto", "https://beincrypto.com/feed/"),
    ("CryptoPotato", "https://cryptopotato.com/feed/"),
    ("U.Today", "https://u.today/rss"),
    ("Blockworks", "https://blockworks.co/feed"),
    ("DL News", "https://www.dlnews.com/arc/outboundfeeds/rss/"),
    ("Protos", "https://protos.com/feed/"),
]
CATS = [
    ("Security", r"\b(hack|exploit|phish|scam|drain|stolen|attack|breach|fraud|malware|rug)\w*"),
    ("Regulation", r"\b(sec|cftc|regulat|law|bill|senate|congress|court|lawsuit|ban|mica|tax|policy|government|fca|license)\w*"),
    ("Bitcoin", r"\b(bitcoin|btc|satoshi|halving|miner|mining|lightning)\b"),
    ("Ethereum", r"\b(ethereum|eth|vitalik|layer[- ]?2|rollup|arbitrum|optimism|base)\b"),
    ("DeFi", r"\b(defi|dex|uniswap|aave|lending|yield|liquidity|staking|tvl)\b"),
    ("Markets", r"\b(price|rally|surge|plunge|drop|market|etf|bull|bear|trader|liquidat)\w*"),
    ("Business", r"\b(fund|raise|acquir|partner|launch|ipo|company|bank|payment|stablecoin)\w*"),
]


def parse_date(s: str) -> str:
    if not s:
        return ISO
    try:
        d = email.utils.parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:
        try:
            return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except Exception:
            return ISO


def news():
    items, seen, ok = [], set(), 0
    for name, url in FEEDS:
        try:
            raw = http(url, raw=True, timeout=25, tries=2)
            root = ET.fromstring(raw)
            ns = {"a": "http://www.w3.org/2005/Atom"}
            entries = root.findall(".//item") or root.findall(".//a:entry", ns)
            for it in entries[:30]:
                title = (it.findtext("title") or it.findtext("a:title", namespaces=ns) or "").strip()
                link = (it.findtext("link") or "").strip()
                if not link:
                    le = it.find("a:link", ns)
                    link = le.get("href") if le is not None else ""
                date = it.findtext("pubDate") or it.findtext("a:updated", namespaces=ns) or it.findtext("a:published", namespaces=ns) or ""
                title = html.unescape(re.sub(r"<[^>]+>", "", title))
                if not title or not link.startswith("http"):
                    continue
                key = re.sub(r"\W+", "", title.lower())[:80]
                if key in seen:
                    continue
                seen.add(key)
                cat = next((c for c, rx in CATS if re.search(rx, title.lower())), "")
                items.append({"title": title[:220], "link": link, "source": name, "date": parse_date(date), "cat": cat})
            ok += 1
        except Exception as e:
            log("feed failed", name, e)
    if ok == 0:
        log("news: all feeds failed; keeping previous")
        return
    items.sort(key=lambda x: x["date"], reverse=True)
    cutoff = (NOW - dt.timedelta(days=10)).isoformat()
    items = [x for x in items if x["date"] >= cutoff[:19]][:300]
    save("news", {"updated": ISO, "feeds": ok, "items": items})
    log(f"news: {len(items)} items from {ok} feeds")


# --------------------------------------------------------------- videos
CHANNELS = ["CoinBureau", "aantonop", "Finematics", "WhiteboardCrypto", "Bankless", "intothecryptoverse", "CoinDesk", "99Bitcoins", "SimplyExplained", "Ledger"]


def videos():
    cache = load("youtube-channels", {})
    items, ok = [], 0
    for handle in CHANNELS:
        cid = cache.get(handle)
        if not cid:
            try:
                page = http(f"https://www.youtube.com/@{handle}", raw=True, timeout=25, headers={"Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1"}).decode("utf-8", "ignore")
                m = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"', page) or re.search(r'"(?:channelId|externalId)":"(UC[\w-]{22})"', page)
                if m:
                    cid = cache[handle] = m.group(1)
            except Exception as e:
                log("yt resolve failed", handle, e)
        if not cid:
            continue
        try:
            raw = http(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}", raw=True, timeout=25)
            root = ET.fromstring(raw)
            ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
            chan = root.findtext("a:title", namespaces=ns) or handle
            for e in root.findall("a:entry", ns)[:8]:
                vid = e.findtext("yt:videoId", namespaces=ns)
                title = e.findtext("a:title", namespaces=ns) or ""
                link = (e.find("a:link", ns).get("href") if e.find("a:link", ns) is not None else "") or ""
                if not vid or "/shorts/" in link:
                    continue
                items.append({"id": vid, "title": title[:200], "channel": chan, "date": parse_date(e.findtext("a:published", namespaces=ns) or "")})
            ok += 1
        except Exception as e:
            log("yt feed failed", handle, e)
    save("youtube-channels", cache)
    if ok == 0:
        log("videos: none fetched; keeping previous")
        return
    seen, uniq = set(), []
    for v in sorted(items, key=lambda x: x["date"], reverse=True):
        if v["id"] not in seen:
            seen.add(v["id"])
            uniq.append(v)
    items = uniq
    save("videos", {"updated": ISO, "channels": ok, "items": items[:80]})
    log(f"videos: {len(items)} from {ok} channels")


# --------------------------------------------------------------- history (monthly closes)
HIST = {"bitcoin": "BTC", "ethereum": "ETH", "solana": "SOL", "binancecoin": "BNB", "ripple": "XRP", "cardano": "ADA", "dogecoin": "DOGE", "tron": "TRX",
        "chainlink": "LINK", "avalanche-2": "AVAX", "litecoin": "LTC", "polkadot": "DOT", "bitcoin-cash": "BCH", "stellar": "XLM", "shiba-inu": "SHIB",
        "uniswap": "UNI", "near": "NEAR", "aptos": "APT", "sui": "SUI", "toncoin": "TON"}


def history():
    if age_days("history/bitcoin") < 6:
        log("history: fresh")
        return
    for cid, sym in HIST.items():
        try:
            k = http(f"https://data-api.binance.vision/api/v3/klines?symbol={sym}USDT&interval=1M&limit=1000", timeout=30)
            monthly = [[int(r[0]), float(r[4])] for r in k]
            if len(monthly) > 3:
                save(f"history/{cid}", {"symbol": sym, "source": "Binance spot USDT monthly close", "updated": ISO, "monthly": monthly})
                continue
        except Exception as e:
            log("history binance failed", cid, e)
        try:
            d = http(f"{CG}/coins/{cid}/market_chart?vs_currency=usd&days=365&interval=daily")
            by = {}
            for t, p in d["prices"]:
                by[dt.datetime.utcfromtimestamp(t / 1000).strftime("%Y-%m")] = [int(t), p]
            save(f"history/{cid}", {"symbol": sym, "source": "CoinGecko daily (365d)", "updated": ISO, "monthly": [by[k] for k in sorted(by)]})
            time.sleep(6)
        except Exception as e:
            log("history cg failed", cid, e)
    log("history: done")


def main():
    steps = [("markets", markets), ("global", global_stats), ("trending", trending), ("exchanges", exchanges), ("fng", fng), ("network", network),
             ("news", news), ("videos", videos), ("history", history), ("coins-meta", coins_meta)]
    only = set(sys.argv[1:])
    for name, fn in steps:
        if only and name not in only:
            continue
        try:
            fn()
        except Exception as e:  # never fail the workflow
            log(f"{name} crashed:", e)
    (DATA / "refresh-log.txt").write_text(ISO + "\n" + "\n".join(LOG) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

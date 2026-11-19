#!/usr/bin/env python3
"""
Build sharded phishing blocklist for the CoinLink link checker.

Sources (public, open):
  - ScamSniffer scam-database  (GPL-3.0)  blacklist/domains.json
  - MetaMask eth-phishing-detect (DBAD)   src/config.json (blacklist, whitelist, fuzzylist)

Output: data/blocklist/<00..ff>.txt  (sorted, newline separated)
        data/blocklist/meta.json     (count, updated, sources, whitelist, fuzzylist)
Shard = first byte of FNV-1a-32(utf-8 domain) as 2 hex chars (mirrors assets/js/checker.js).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "blocklist"
SS_URL = "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/domains.json"
MM_URL = "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json"
UA = {"User-Agent": "CoinLink.co blocklist builder (+https://coinlink.co)"}


def fnv1a_shard(domain: str) -> str:
    h = 0x811C9DC5
    for b in domain.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h >> 24:02x}"


def get_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def clean(d: str) -> str | None:
    d = (d or "").strip().lower().rstrip(".")
    if d.startswith("http://") or d.startswith("https://"):
        d = d.split("://", 1)[1]
    d = d.split("/", 1)[0].split(":", 1)[0]
    if d.startswith("*."):
        d = d[2:]
    if not d or "." not in d or " " in d or len(d) > 253:
        return None
    return d


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-age-days", type=float, default=0, help="skip rebuild if meta.json is newer than this")
    args = ap.parse_args()
    meta_path = OUT / "meta.json"
    if args.max_age_days and meta_path.exists():
        try:
            m = json.loads(meta_path.read_text())
            age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(m["updated"].replace("Z", "+00:00"))
            if age.total_seconds() < args.max_age_days * 86400:
                print(f"blocklist fresh ({age}), skipping")
                return 0
        except Exception:
            pass

    domains: set[str] = set()
    sources = []
    whitelist, fuzzy = [], []
    try:
        ss = get_json(SS_URL)
        n0 = len(domains)
        domains.update(filter(None, (clean(x) for x in ss)))
        sources.append({"name": "ScamSniffer scam-database", "license": "GPL-3.0", "url": "https://github.com/scamsniffer/scam-database", "count": len(domains) - n0})
    except Exception as e:
        print("ScamSniffer fetch failed:", e, file=sys.stderr)
    try:
        mm = get_json(MM_URL)
        n0 = len(domains)
        domains.update(filter(None, (clean(x) for x in mm.get("blacklist", []))))
        whitelist = sorted(filter(None, (clean(x) for x in mm.get("whitelist", []))))
        fuzzy = sorted(filter(None, (clean(x) for x in mm.get("fuzzylist", []))))
        sources.append({"name": "MetaMask eth-phishing-detect", "license": "DBAD", "url": "https://github.com/MetaMask/eth-phishing-detect", "count": len(domains) - n0})
    except Exception as e:
        print("MetaMask fetch failed:", e, file=sys.stderr)

    if len(domains) < 10000:
        print("Too few domains fetched; keeping existing blocklist.", file=sys.stderr)
        return 0

    # never block domains we list as verified/official
    safe = set(whitelist)
    try:
        directory = json.loads((ROOT / "_src" / "directory.json").read_text())
        for c in directory["categories"]:
            for i in c["items"]:
                safe.add(i["domain"].lower())
    except Exception:
        pass
    domains -= safe

    shards: dict[str, list[str]] = {f"{i:02x}": [] for i in range(256)}
    for d in domains:
        shards[fnv1a_shard(d)].append(d)
    OUT.mkdir(parents=True, exist_ok=True)
    for k, v in shards.items():
        (OUT / f"{k}.txt").write_text("\n".join(sorted(v)) + "\n", encoding="utf-8")
    meta = {
        "count": len(domains),
        "updated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sources": sources,
        "whitelist": whitelist,
        "fuzzylist": fuzzy,
        "shard": "fnv1a32-firstbyte-hex",
    }
    meta_path.write_text(json.dumps(meta, indent=1), encoding="utf-8")
    (OUT / "LICENSE-NOTICE.txt").write_text(
        "Derived from ScamSniffer scam-database (GNU GPL-3.0, https://github.com/scamsniffer/scam-database)\n"
        "and MetaMask eth-phishing-detect (https://github.com/MetaMask/eth-phishing-detect).\n"
        "Redistributed in sharded form for the CoinLink.co link checker. GPL-3.0 terms apply to the ScamSniffer-derived data.\n",
        encoding="utf-8",
    )
    print(f"blocklist: {len(domains):,} domains in 256 shards")
    return 0


if __name__ == "__main__":
    sys.exit(main())

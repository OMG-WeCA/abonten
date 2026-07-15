#!/usr/bin/env python3
"""Fetch free-licensed marketing imagery from Wikimedia Commons.

Usage: fetch_images.py <output-dir>

Requires a relevant city/country token in each file title (so loose Commons
search does not pull in unrelated "skyline"/"aerial" photos) and rejects files
larger than ~2 MB (so no oversized PNGs slip in). Server-resized to ~1600px;
writes SOURCES.md with attribution.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
UA = "Abonten-marketing-image-fetch/1.0 (https://abonten.com)"
MAX_BYTES = 2_000_000  # keep web sizes reasonable (well under 5 MB)

# (outfile, require_any tokens that MUST appear in the title, boost tokens, queries)
TARGETS = [
    ("hero-billboard.jpg", ["billboard", "hoarding", "advert"],
     ["nigeria", "lagos", "accra", "ghana", "billboard", "advert", "highway", "road"],
     ["billboard Nigeria", "billboard Lagos", "advertising hoarding Nigeria",
      "billboard Accra", "highway billboard Nigeria"]),
    ("partners-skyline.jpg", ["lagos", "eko", "nigeria"],
     ["skyline", "tower", "atlantic", "building", "city", "eko", "lekki", "highrise", "island"],
     ["Eko Atlantic Lagos skyline", "Lagos Island skyline", "Lagos Nigeria city skyline",
      "Lekki Lagos skyline", "Lagos cityscape"]),
    ("hero-street.jpg", ["lagos", "accra", "nigeria", "ghana", "douala", "cameroon"],
     ["lagos", "accra", "street", "traffic", "market", "nigeria", "ghana"],
     ["Lagos street", "Accra street", "Lagos traffic", "Lagos market street",
      "Accra Ghana street"]),
    ("hero-night.jpg", ["lagos", "nigeria", "nairobi", "accra", "douala"],
     ["night", "lagos", "nigeria", "nairobi", "lights", "dusk", "illumin"],
     ["Lagos night", "Lagos night skyline", "Nigeria night city",
      "Lagos at night", "Lagos night view"]),
    ("home-aerial.jpg", ["lagos", "nigeria", "eko"],
     ["aerial", "city", "urban", "skyline", "building", "view", "island", "cityscape"],
     ["Lagos city aerial", "Lagos urban aerial view", "Lagos Nigeria aerial city",
      "Lagos skyline aerial", "Lagos cityscape", "Lagos Nigeria city"]),
]

BLACKLIST = [".svg", "svg", "map", "logo", "coat_of_arms", "flag", "chart",
             "diagram", "locator", "location_", "outline", "district", "blank",
             ".gif", ".pdf", "orthophoto", "relief", "satellite", "portugal",
             "denmark", "mergozzo", "italy", "farmland", "farm", "agricult",
             "vegetation", "forest", "crop", "rural", "field", "grass"]


def api(query):
    qs = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": query, "gsrnamespace": "6", "gsrlimit": "30",
        "prop": "imageinfo", "iiprop": "url|mime|size|extmetadata", "iiurlwidth": "1600",
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(qs)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def candidates(query, require, boost):
    try:
        data = api(query)
    except Exception as e:  # noqa: BLE001
        print(f"  api error ({query}): {e}", file=sys.stderr)
        return []
    pages = data.get("query", {}).get("pages", {})
    out = []
    for pg in pages.values():
        ii = pg.get("imageinfo") or []
        if not ii:
            continue
        info = ii[0]
        if info.get("mime", "") not in ("image/jpeg", "image/png"):
            continue
        title = pg.get("title", "")
        tlow = title.lower()
        if any(b in tlow for b in BLACKLIST):
            continue
        if not any(tok in tlow for tok in require):
            continue
        w = info.get("width", 0) or 0
        if w < 1100:
            continue
        thumb = info.get("thumburl")
        if not thumb:
            continue
        score = sum(2 for b in boost if b in tlow)
        out.append((score, w, title, thumb, info))
    out.sort(key=lambda x: (-x[0], -x[1]))
    return out


def fetch(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


sources = []
for outfile, require, boost, queries in TARGETS:
    print(f"== {outfile} (require any of {require})")
    done = False
    path = os.path.join(OUT, outfile)
    for q in queries:
        for (score, w, title, thumb, info) in candidates(q, require, boost):
            try:
                n = fetch(thumb, path)
                if n > MAX_BYTES:
                    print(f"  too big ({n}B), trying next: {title}")
                    os.remove(path)
                    continue
                meta = info.get("extmetadata", {})
                lic = meta.get("LicenseShortName", {}).get("value", "")
                descurl = info.get("descriptionurl", "")
                sources.append((outfile, q, title, descurl, lic, n))
                print(f"  OK [{q}] {title} ({w}px, {n}B) {strip_html(lic)}")
                done = True
                break
            except Exception as e:  # noqa: BLE111
                print(f"  fetch fail {title}: {e}")
        if done:
            break
        time.sleep(0.4)
    if not done:
        print(f"  !! FAILED to source {outfile}")

with open(os.path.join(OUT, "SOURCES.md"), "w") as f:
    f.write("# Image sources\n\n")
    f.write("Photos used in the marketing-site demo, fetched from Wikimedia Commons "
            "(free-licensed). The tree is uncommitted pending operator review; see "
            "each Commons file page for full author and license details.\n\n")
    f.write("| File | Query | Commons file | License | Bytes |\n")
    f.write("| --- | --- | --- | --- | --- |\n")
    for (outfile, q, title, descurl, lic, n) in sources:
        t = title.replace("|", "/")
        f.write(f"| `{outfile}` | {q} | [{t}]({descurl}) | {strip_html(lic)} | {n} |\n")
print("Wrote SOURCES.md")
print("Sourced:", [s[0] for s in sources])
"""What readers did: the usage points `POST /api/e` writes, read back.

    python scripts/usage.py              # the last 14 days
    python scripts/usage.py --days 28

Reads the `wfsim` Analytics Engine dataset (wrangler.jsonc) through the SQL API.
Needs `CF_ACCOUNT` and `CF_TOKEN` — a token with Account Analytics: Read — from
the environment or from `private/cloudflare.env`. docs/ANALYTICS.md §Reading it.

VISITORS ARE COUNTED HERE, NOT IN SQL: every query returns (day, visitor, event)
rows and Python does the sets, so a number never depends on which aggregates
the SQL dialect has. The dataset keeps three months; a window past that is
silently shorter, so the script says what it actually covered.
"""

import argparse
import json
import os
import sys
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = "wfsim"
BOOT = "app.boot"
# A RESULT, as opposed to a page opened: anything but the boot.
# THE RELEASE a deploy check writes its one point under, never a reader.
CHECK_RELEASE = "deploy-check"
RESULTS = ("builder.weapon", "builder.warframe", "builder.operator", "simulator.run", "optimizer.run")


def credentials():
    env = {}
    f = ROOT / "private" / "cloudflare.env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            k, sep, v = line.partition("=")
            if sep and not k.strip().startswith("#"):
                env[k.strip()] = v.strip()
    account = os.environ.get("CF_ACCOUNT") or env.get("CF_ACCOUNT")
    token = os.environ.get("CF_TOKEN") or env.get("CF_TOKEN")
    if not account or not token:
        sys.exit("usage.py: set CF_ACCOUNT and CF_TOKEN (Account Analytics: Read), "
                 "in the environment or private/cloudflare.env")
    return account, token


def sql(account, token, query):
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/analytics_engine/sql",
        data=(query + " FORMAT JSON").encode(), headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)["data"]
    except urllib.error.HTTPError as e:
        sys.exit(f"usage.py: {e.code} {e.read().decode(errors='replace')[:400]}")


def pct(a, b):
    return f"{100 * a / b:5.1f}%" if b else "    -"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--top", type=int, default=15)
    args = ap.parse_args()
    account, token = credentials()
    since = f"timestamp > NOW() - INTERVAL '{args.days}' DAY AND blob7 != '{CHECK_RELEASE}'"

    rows = sql(account, token, f"""
        SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob2 AS cid, blob1 AS e,
               max(_sample_interval) AS si
        FROM {DATASET} WHERE {since} GROUP BY day, cid, e LIMIT 1000000""")
    if not rows:
        print(f"no usage points in the last {args.days} days")
        return
    if any(float(r["si"]) > 1 for r in rows):
        print("NOTE: the dataset is SAMPLED in this window; visitor counts below are a floor\n")

    by_day = defaultdict(lambda: defaultdict(set))
    for r in rows:
        by_day[r["day"][:10]][r["e"]].add(r["cid"])
    days = sorted(by_day)
    print(f"covered {days[0]} .. {days[-1]} ({len(days)} days)\n")

    head = f"{'day':10}  {'visitors':>8}  {'result':>7}  {'activ.':>6}  " + "  ".join(f"{e.split('.')[-1] if e.startswith('builder.') else e.split('.')[0]:>9}" for e in RESULTS)
    print(head)
    for d in days:
        ev = by_day[d]
        seen = set().union(*ev.values())
        got = set().union(*(ev.get(e, set()) for e in RESULTS))
        print(f"{d:10}  {len(seen):8}  {len(got):7}  {pct(len(got), len(seen)):>6}  "
              + "  ".join(f"{len(ev.get(e, ())):9}" for e in RESULTS))

    # RETURN: of the visitors in the week before last, how many came back last week.
    if len(days) >= 14:
        week = lambda ds: set().union(*(set().union(*by_day[d].values()) for d in ds))
        a, b = week(days[-14:-7]), week(days[-7:])
        print(f"\nweekly visitors {len(a)} -> {len(b)}; returned {len(a & b)} of {len(a)} ({pct(len(a & b), len(a)).strip()})")

    subjects = sql(account, token, f"""
        SELECT blob1 AS e, blob3 AS subject, SUM(_sample_interval) AS n
        FROM {DATASET} WHERE {since} AND blob1 != '{BOOT}' AND blob3 != ''
        GROUP BY e, subject ORDER BY n DESC LIMIT 2000""")
    per = defaultdict(list)
    for r in subjects:
        per[r["e"]].append((r["subject"], int(float(r["n"]))))
    for e in RESULTS:
        if per.get(e):
            print(f"\n{e}: " + ", ".join(f"{s} {n}" for s, n in per[e][:args.top]))

    boots = sql(account, token, f"""
        SELECT blob2 AS cid, blob4 AS route, blob5 AS lang, blob6 AS shell, blob8 AS country
        FROM {DATASET} WHERE {since} AND blob1 = '{BOOT}'
        GROUP BY cid, route, lang, shell, country LIMIT 1000000""")
    for dim in ("route", "lang", "shell", "country"):
        c = Counter()
        for value, cids in _group(boots, dim).items():
            c[value or "?"] = len(cids)
        print(f"\nvisitors by {dim}: " + ", ".join(f"{k} {v}" for k, v in c.most_common(args.top)))


def _group(rows, dim):
    out = defaultdict(set)
    for r in rows:
        out[r[dim]].add(r["cid"])
    return out


if __name__ == "__main__":
    main()

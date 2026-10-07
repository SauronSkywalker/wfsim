#!/usr/bin/env bash
# THE LIVE BOARDS — the site's, from `scores`, and the owner's, with what submitters' machines
# measured beside it, projected the moment either moves. Runs on the bot server
# (`deploy/wfsim-live.service`); `publish.yml` keeps a daily snapshot in git.
#
#   scripts/live_board.sh <work-dir> <bin-dir>
#
# It reads the inbox, the library and the scores; it files and settles claims
# (`live_claims.mjs`) — docs/BOARD.md §"The producer", §"The live board".
#
# TWO BOARDS. `verified/` is `scores` alone, pushed to R2 for the site to read;
# `board/` adds every claim no fact has answered, for the owner and the bot.
# Verified facts are read every cycle (`live_publish.mjs delta`), so a row a
# client or the scorer just settled moves both on the next one.
#
# Needs CF_ACCOUNT, CF_TOKEN (D1) and CF_D1_DATABASE, and BOARD_PUSH_TOKEN.
set -euo pipefail

WORK="${1:?usage: live_board.sh <work-dir> <bin-dir>}"
BIN="${2:?usage: live_board.sh <work-dir> <bin-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
POLL_SECONDS="${POLL_SECONDS:-20}"
REFRESH_SECONDS="${REFRESH_SECONDS:-3600}"
mkdir -p "$WORK"
cd "$WORK"
WORK="$(pwd)"
touch seen.txt produced.ndjson new-builds.ndjson produced-new.ndjson

d1() {
  curl -s --connect-timeout 15 --max-time 120 -o d1.json -w '%{http_code}' -X POST \
    -H "Authorization: Bearer ${CF_TOKEN:?}" \
    -H "content-type: application/json" \
    --data-binary "$1" \
    "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT:?}/d1/database/${CF_D1_DATABASE:?}/query"
}

# WHAT ARRIVED WITH A NUMBER, and has not been read yet. The inbox is drained
# hourly by `queue.yml`, so it is small; an id is remembered only while the
# inbox still holds it.
poll_inbox() {
  local code
  code=$(d1 '{"sql":"SELECT id, at, record FROM inbox WHERE record LIKE ?","params":["%\"produced\":%"]}') || code=000
  [ "$code" = "200" ] || { echo "live: inbox read refused [HTTP $code]" >&2; return 1; }
  jq -c '.result[0].results[]' < d1.json > inbox-all.ndjson
  jq -r '.id' < inbox-all.ndjson | sort -u > inbox-ids.txt
  sort -u seen.txt | comm -12 - inbox-ids.txt > seen.next
  jq -n -c --rawfile seen seen.next \
    '($seen | split("\n") | map({key: ., value: true}) | from_entries) as $s
     | inputs | select($s[.id] | not)' < inbox-all.ndjson > inbox-new.ndjson
  jq -r '.id' < inbox-new.ndjson >> seen.next
  mv seen.next seen.txt
  [ -s inbox-new.ndjson ]
}

# READ INTO A SPARE AND SWAPPED ON SUCCESS: a failed read truncates its output,
# and an empty facts file would project a board with every scored row gone.
refresh_store() {
  bash "$HERE/fetch_library.sh" library.fresh >&2 || return 1
  bash "$HERE/fetch_facts.sh" facts.fresh >&2 || return 1
  [ -s library.fresh ] && [ -s facts.fresh ] || return 1
  mv library.fresh library.json
  mv facts.fresh facts-known.ndjson
  # A BUILD THE HOURLY INTAKE HAS NOW STORED is in the library itself.
  : > new-builds.ndjson
}

# A PROJECTION, into a fresh directory swapped in whole, so a reader never sees
# a board half written. Every ruler writes into the same directory: a weapon's
# file carries its rows under every ruler (`write_pages`). Run from `<cwd>`, so
# a `data/board_state.yaml` there is the one `wfsim-board` stamps.
project_into() {
  local out="$1" facts="$2" cwd="$3" r code
  rm -rf "$out.next" && mkdir "$out.next"
  for r in $(cat "$HERE/rulers.txt"); do
    code=0
    (cd "$cwd" && "$BIN/wfsim-board" "$r" "$WORK/$out.next" --project --facts-in "$WORK/$facts" \
      < "$WORK/library-live.json" > /dev/null 2>> "$WORK/project.log") || code=$?
    if [ "$code" != "0" ] && [ "$code" != "2" ]; then
      echo "live: $r failed with $code" >&2
      return 1
    fi
  done
  rm -rf "$out.old"
  [ -d "$out" ] && mv "$out" "$out.old"
  mv "$out.next" "$out"
}

library_live() {
  jq -s '.[0] + [.[1][] | .record]' library.json <(jq -s . new-builds.ndjson) > library-live.json
}

# THE SITE'S BOARD: `scores` alone, stamped by `board_meta.py` and pushed to
# R2, file by file as they move (`live_publish.mjs`).
publish_verified() {
  mkdir -p pub/data
  [ -f pub/data/board_state.yaml ] || printf 'boards: {}\n' > pub/data/board_state.yaml
  project_into verified facts-known.ndjson pub || return 1
  python3 "$HERE/board_meta.py" verified pub/data/board_state.yaml verified/meta.json >&2
}

# THE OWNER'S BOARD: the facts, and every claim no fact has answered yet.
project_private() {
  jq -r '"\(.identity)|\(.ruler)|\(.mode)"' < facts-known.ndjson | sort -u > known-keys.txt
  jq -n -c --rawfile known known-keys.txt \
    '($known | split("\n") | map({key: ., value: true}) | from_entries) as $s
     | inputs | select($s["\(.identity)|\(.ruler)|\(.mode)"] | not)' \
    < produced.ndjson > produced-open.ndjson
  cat facts-known.ndjson produced-open.ndjson > facts-live.ndjson
  project_into board facts-live.ndjson . || return 1
  echo "live: projected $(wc -l < produced-open.ndjson) client row(s) beside $(wc -l < facts-known.ndjson) fact(s)" >&2
}

last_refresh=0
while true; do
  facts_moved=0
  claims_moved=0
  now=$(date +%s)
  if [ $((now - last_refresh)) -ge "$REFRESH_SECONDS" ] || [ ! -s library.json ]; then
    if refresh_store; then
      last_refresh=$now
      facts_moved=1
    else
      echo "live: the store could not be read; keeping the last copy" >&2
    fi
  fi
  # WHAT WAS VERIFIED SINCE THE LAST READ, without waiting for the hourly one.
  if [ -s facts-known.ndjson ]; then
    code=0
    node "$HERE/live_publish.mjs" delta "$WORK" || code=$?
    [ "$code" = 0 ] && facts_moved=1
  fi
  if poll_inbox; then
    "$BIN/wfsim-intake" --produced produced-pass.ndjson < inbox-new.ndjson >> new-builds.ndjson 2>> intake.log
    cat produced-pass.ndjson >> produced.ndjson
    cat produced-pass.ndjson >> produced-new.ndjson
    claims_moved=1
  fi
  if [ -s library.json ]; then
    library_live
    if [ "$facts_moved" = 1 ] || [ ! -d verified ]; then
      publish_verified || echo "live: the site's board did not publish; the last one stands" >&2
    fi
    # PUSHED EVERY CYCLE, and a file only when its bytes moved: a push the
    # worker refused is sent again on the next one rather than waiting for R2
    # to be asked by the next fact.
    if [ -f verified/meta.json ]; then
      node "$HERE/live_publish.mjs" push "$WORK" verified || echo "live: the push did not land; the next cycle sends it" >&2
    fi
    if [ "$facts_moved" = 1 ] || [ "$claims_moved" = 1 ] || [ ! -d board ]; then
      project_private || echo "live: the projection failed; the last board stands" >&2
    fi
  fi
  # CLAIMS ARE FILED AFTER THE PROJECTION, which is what ranks them, and the
  # server's own rows are settled every cycle — `live_claims.mjs`.
  if [ -s produced-new.ndjson ] && [ -d board ]; then
    node "$HERE/live_claims.mjs" file "$WORK" && : > produced-new.ndjson
  fi
  node "$HERE/live_claims.mjs" settle "$WORK" "$BIN" || echo "live: settling failed; the next cycle asks again" >&2
  # ONE CYCLE AND OUT, for a check run by hand.
  [ "${ONCE:-}" = 1 ] && break
  sleep "$POLL_SECONDS"
done

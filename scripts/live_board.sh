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
  # …AND WHICH BUILD IS WHICH WEAPON, which a subset pass is cut by.
  mv library.fresh.ndjson library-ids.ndjson
  mv facts.fresh facts-known.ndjson
  # A BUILD THE HOURLY INTAKE HAS NOW STORED is in the library itself.
  : > new-builds.ndjson
}

# A PROJECTION, into a directory swapped in whole, so a reader never sees a
# board half written. Every ruler writes into the same directory: a weapon's
# file carries its rows under every ruler (`write_pages`). Run from `<cwd>`, so
# a `data/board_state.yaml` there is the one `wfsim-board` stamps.
#
# WITH A SUBSET LIBRARY (`$4`) it starts from the board as it stands and
# re-ranks only the weapons that library holds (`--subset`); the hourly read
# still ranks everything, so nothing a subset missed outlives the hour.
project_into() {
  local out="$1" facts="$2" cwd="$3" lib="library-live.json" flag="" r code
  rm -rf "$out.next"
  if [ -n "${4:-}" ] && [ -d "$out" ]; then
    cp -a "$out" "$out.next" && rm -f "$out.next/meta.json"
    lib="$4"
    facts="$4.facts"
    flag="--subset"
  else
    mkdir "$out.next"
  fi
  for r in $(cat "$HERE/rulers.txt"); do
    code=0
    (cd "$cwd" && "$BIN/wfsim-board" "$r" "$WORK/$out.next" --project $flag --facts-in "$WORK/$facts" \
      < "$WORK/$lib" > /dev/null 2>> "$WORK/project.log") || code=$?
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

# THE BUILDS OF THE WEAPONS A LIST OF BUILD IDS TOUCHES, into `$2`, and their
# facts out of `$3` into `$2.facts` — or a failure when the list names none.
subset_of() {
  node "$HERE/live_publish.mjs" subset "$WORK" "$1" "$2" "$3" >&2
}

# THE SITE'S BOARD: `scores` alone, stamped by `board_meta.py` and pushed to
# R2, file by file as they move (`live_publish.mjs`). `$1` is a subset library.
publish_verified() {
  mkdir -p pub/data
  [ -f pub/data/board_state.yaml ] || printf 'boards: {}\n' > pub/data/board_state.yaml
  project_into verified facts-known.ndjson pub "${1:-}" || return 1
  python3 "$HERE/board_meta.py" verified pub/data/board_state.yaml verified/meta.json >&2
}

# THE OWNER'S BOARD: the facts, and every claim no fact has answered yet —
# `facts-live.ndjson`, which a subset pass also cuts its facts from.
open_claims() {
  jq -r '"\(.identity)|\(.ruler)|\(.mode)"' < facts-known.ndjson | sort -u > known-keys.txt
  jq -n -c --rawfile known known-keys.txt \
    '($known | split("\n") | map({key: ., value: true}) | from_entries) as $s
     | inputs | select($s["\(.identity)|\(.ruler)|\(.mode)"] | not)' \
    < produced.ndjson > produced-open.ndjson
  cat facts-known.ndjson produced-open.ndjson > facts-live.ndjson
}

project_private() {
  [ -n "${1:-}" ] || open_claims
  project_into board facts-live.ndjson . "${1:-}" || return 1
  echo "live: projected $(wc -l < produced-open.ndjson) client row(s) beside $(wc -l < facts-known.ndjson) fact(s)" >&2
}

last_refresh=0
while true; do
  whole=0
  facts_moved=0
  claims_moved=0
  : > touched-ids.txt
  now=$(date +%s)
  if [ $((now - last_refresh)) -ge "$REFRESH_SECONDS" ] || [ ! -s library.json ]; then
    if refresh_store; then
      last_refresh=$now
      whole=1
    else
      echo "live: the store could not be read; keeping the last copy" >&2
    fi
  fi
  # WHAT WAS VERIFIED SINCE THE LAST READ, without waiting for the hourly one.
  if [ -s facts-known.ndjson ]; then
    code=0
    node "$HERE/live_publish.mjs" delta "$WORK" || code=$?
    if [ "$code" = 0 ]; then
      facts_moved=1
      cat moved-ids.txt >> touched-ids.txt
    fi
  fi
  if poll_inbox; then
    "$BIN/wfsim-intake" --produced produced-pass.ndjson < inbox-new.ndjson >> new-builds.ndjson 2>> intake.log
    cat produced-pass.ndjson >> produced.ndjson
    cat produced-pass.ndjson >> produced-new.ndjson
    jq -r '.identity' < produced-pass.ndjson >> touched-ids.txt
    claims_moved=1
  fi
  if [ -s library.json ] && { [ "$whole" = 1 ] || [ "$facts_moved" = 1 ] || [ "$claims_moved" = 1 ] \
       || [ ! -d verified ] || [ ! -d board ]; }; then
    library_live
    # WHOLE ON THE HOUR AND ON A FIRST START; otherwise only the weapons this
    # cycle's facts touched.
    if [ "$whole" = 1 ] || [ ! -d verified ]; then
      publish_verified || echo "live: the site's board did not publish; the last one stands" >&2
    elif [ "$facts_moved" = 1 ] && subset_of moved-ids.txt verified-subset.json facts-known.ndjson; then
      publish_verified verified-subset.json || echo "live: the site's board did not publish; the last one stands" >&2
    fi
    if [ "$whole" = 1 ] || [ ! -d board ]; then
      project_private || echo "live: the projection failed; the last board stands" >&2
    elif [ -s touched-ids.txt ]; then
      open_claims
      if subset_of touched-ids.txt private-subset.json facts-live.ndjson; then
        project_private private-subset.json || echo "live: the projection failed; the last board stands" >&2
      fi
    fi
  fi
  # PUSHED EVERY CYCLE, and a file only when its bytes moved: a push the
  # worker refused is sent again on the next one rather than waiting for R2
  # to be asked by the next fact.
  if [ -f verified/meta.json ]; then
    node "$HERE/live_publish.mjs" push "$WORK" verified || echo "live: the push did not land; the next cycle sends it" >&2
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

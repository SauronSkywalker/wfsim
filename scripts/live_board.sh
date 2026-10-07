#!/usr/bin/env bash
# THE OWNER'S LIVE BOARD — the scorer's facts plus what submitters' machines
# measured, projected the moment a submission lands. Runs on the bot server
# (`deploy/wfsim-live.service`); the public board is still `publish.yml`'s.
#
#   scripts/live_board.sh <work-dir> <bin-dir>
#
# NOTHING HERE WRITES TO THE DATABASE. It reads the inbox, the library and the
# scores, and writes `<work-dir>/board/` only — docs/BOARD.md §"The producer".
#
# A CLIENT'S NUMBER NEVER BEATS A FACT. A produced line is projected only for a
# (build, ruler, mode) the scores table has no row for; the facts are re-read
# every hour, so a row the scorer measured replaces the client's on the next.
#
# Needs CF_ACCOUNT, CF_TOKEN (D1 read) and CF_D1_DATABASE in the environment.
set -euo pipefail

WORK="${1:?usage: live_board.sh <work-dir> <bin-dir>}"
BIN="${2:?usage: live_board.sh <work-dir> <bin-dir>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
POLL_SECONDS="${POLL_SECONDS:-20}"
REFRESH_SECONDS="${REFRESH_SECONDS:-3600}"
mkdir -p "$WORK"
cd "$WORK"
touch seen.txt produced.ndjson new-builds.ndjson

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

# THE PROJECTION, into a fresh directory swapped in whole, so a reader never
# sees a board half written. Every ruler writes into the same directory: a
# weapon's file carries its rows under every ruler (`write_pages`).
project() {
  jq -s '.[0] + [.[1][] | .record]' library.json <(jq -s . new-builds.ndjson) > library-live.json
  jq -r '"\(.identity)|\(.ruler)|\(.mode)"' < facts-known.ndjson | sort -u > known-keys.txt
  jq -n -c --rawfile known known-keys.txt \
    '($known | split("\n") | map({key: ., value: true}) | from_entries) as $s
     | inputs | select($s["\(.identity)|\(.ruler)|\(.mode)"] | not)' \
    < produced.ndjson > produced-open.ndjson
  cat facts-known.ndjson produced-open.ndjson > facts-live.ndjson
  rm -rf board.next && mkdir board.next
  local r code
  for r in $(cat "$HERE/rulers.txt"); do
    code=0
    "$BIN/wfsim-board" "$r" board.next --project --facts-in facts-live.ndjson \
      < library-live.json > /dev/null 2>> project.log || code=$?
    if [ "$code" != "0" ] && [ "$code" != "2" ]; then
      echo "live: $r failed with $code" >&2
      return 1
    fi
  done
  rm -rf board.old
  [ -d board ] && mv board board.old
  mv board.next board
  echo "live: projected $(wc -l < produced-open.ndjson) client row(s) beside $(wc -l < facts-known.ndjson) fact(s)" >&2
}

last_refresh=0
while true; do
  moved=0
  now=$(date +%s)
  if [ $((now - last_refresh)) -ge "$REFRESH_SECONDS" ] || [ ! -s library.json ]; then
    if refresh_store; then
      last_refresh=$now
      moved=1
    else
      echo "live: the store could not be read; keeping the last copy" >&2
    fi
  fi
  if poll_inbox; then
    "$BIN/wfsim-intake" --produced produced-new.ndjson < inbox-new.ndjson >> new-builds.ndjson 2>> intake.log
    cat produced-new.ndjson >> produced.ndjson
    moved=1
  fi
  if { [ "$moved" = 1 ] || [ ! -d board ]; } && [ -s library.json ]; then
    project || echo "live: the projection failed; the last board stands" >&2
  fi
  # ONE CYCLE AND OUT, for a check run by hand.
  [ "${ONCE:-}" = 1 ] && break
  sleep "$POLL_SECONDS"
done

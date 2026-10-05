#!/bin/sh
# KEEP THE BOT'S CHROME ON STABLE — docs/AGENT.md §"The QQ bot". Asks the
# Chrome for Testing mirror which version is Stable now, and when it is not the
# one installed, swaps it in and restarts the bot. The mirror is npmmirror's:
# Google's own host is unreliable from a mainland server.
set -eu
MIRROR=https://cdn.npmmirror.com/binaries/chrome-for-testing
DIR=/opt/chrome-headless-shell
want=$(curl -fsS --max-time 30 "$MIRROR/last-known-good-versions.json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["channels"]["Stable"]["version"])')
have=$(chrome-headless-shell --version 2>/dev/null | awk '{print $NF}')
[ "$want" = "$have" ] && exit 0
tmp=$(mktemp -d)
curl -fsS --max-time 600 -o "$tmp/chs.zip" "$MIRROR/$want/linux64/chrome-headless-shell-linux64.zip"
unzip -q "$tmp/chs.zip" -d "$tmp"
"$tmp/chrome-headless-shell-linux64/chrome-headless-shell" --version >/dev/null
rm -rf "$DIR.new" && mv "$tmp/chrome-headless-shell-linux64" "$DIR.new"
rm -rf "$DIR.old" && { [ -d "$DIR" ] && mv "$DIR" "$DIR.old" || true; } && mv "$DIR.new" "$DIR"
ln -sf "$DIR/chrome-headless-shell" /usr/local/bin/chrome-headless-shell
rm -rf "$tmp" "$DIR.old"
systemctl restart wfsim-bot
echo "chrome $have -> $want"

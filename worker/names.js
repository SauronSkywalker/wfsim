// SPDX-License-Identifier: AGPL-3.0-or-later
// A NAME SHOWN TO OTHERS passes this first: a username, a display name, a name
// thanked in a chat. Shown on public pages and relayed into QQ groups, a name
// is something WFSim publishes, so a name carrying a word from the bundled list
// (vendor/lexicon, MIT) is refused. Matched after folding case, width and every
// mark that is not a letter or a digit, so spacing a word out does not pass it.
import { WORDS } from "./vendor/lexicon/words.js";

export const foldName = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function nameBlocked(s) {
  const n = foldName(s);
  return !!n && WORDS.some((w) => n.includes(w));
}

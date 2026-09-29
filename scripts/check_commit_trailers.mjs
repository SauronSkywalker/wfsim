// A COMMIT NAMES ITS AUTHOR AND NO TOOL. No AI co-author, "generated with"
// line or robot marker, whichever agent wrote the change.
//
// Each agent product has its own setting for this and each defaults to ON, so a
// rule kept in one tool's settings holds only for that tool. This is the copy
// every tool meets.
//
//   node scripts/check_commit_trailers.mjs [<range>]   refuse (default origin/main..HEAD)
//   node scripts/check_commit_trailers.mjs --strip <msg-file>
//
// `--strip` is the commit-msg hook's half (`.githooks/commit-msg`, enabled per
// clone with `git config core.hooksPath .githooks`): it deletes the lines before
// the commit exists, so the refusal in CI is the backstop, not the workflow.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const NL = String.fromCharCode(10);
const TOOL = "copilot|claude|anthropic|openai|chatgpt|codex|cursor|gemini|devin|aider|windsurf|codeium|tabnine|jules|amazon q";
// A trailer naming an AI tool, a "generated with" credit line, or the marker
// emoji some tools prepend to one. Matched per line, case-insensitively.
const AI_LINE = [
  new RegExp(`^\\s*(co-authored-by|assisted-by|generated-by|signed-off-by)\\s*:.*\\b(${TOOL})\\b`, "i"),
  new RegExp(`^\\s*(🤖\\s*)?generated (with|by)\\b.*\\b(${TOOL})\\b`, "i"),
  /^\s*🤖/u,
];
const isAi = (line) => AI_LINE.some((rx) => rx.test(line));

if (process.argv[2] === "--strip") {
  const file = process.argv[3];
  const msg = readFileSync(file, "utf8");
  const lines = msg.split(NL);
  const kept = lines.filter((l) => !isAi(l));
  if (kept.length !== lines.length) writeFileSync(file, kept.join(NL).replace(/\s+$/, "") + NL);
  process.exit(0);
}

const range = process.argv[2] || "origin/main..HEAD";
const SEP = "\u0001";
const log = execFileSync("git", ["log", `--format=%H${SEP}%B${SEP}${SEP}`, range], { encoding: "utf8" });
const bad = [];
for (const entry of log.split(SEP + SEP)) {
  const [sha, body] = entry.replace(/^\s+/, "").split(SEP);
  if (!sha || body === undefined) continue;
  for (const line of body.split(NL)) if (isAi(line)) bad.push(`${sha.slice(0, 10)}  ${line.trim()}`);
}

console.log(`  ${bad.length ? "FAIL" : "ok  "}  no commit in ${range} credits an AI tool${bad.length ? NL + "        " + bad.join(NL + "        ") : ""}`);
if (bad.length) console.log(`\nremove the line with \`git commit --amend\` before pushing; enable the hook: git config core.hooksPath .githooks`);
process.exit(bad.length ? 1 : 0);

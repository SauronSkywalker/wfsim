// WEB BOT AUTH, offline (docs/AGENT.md §"Web Bot Auth"). The signer the data
// scripts use (`scripts/bot_auth.py`) is RFC 8032's Ed25519, held here to the
// RFC's own vectors, and a request it signs verifies under Node's verifier. The
// key directory the site worker serves (`worker/bot_auth.js`) holds the public
// key and never the private one, and its own signature verifies. No network.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, createPublicKey, verify, createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { botAuthDirectory, BOT_AUTH_DIRECTORY } from "../worker/bot_auth.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  — ${String(detail).slice(0, 300)}`}`);
  if (!ok) failed++;
};
const py = (...args) => execFileSync(process.platform === "win32" ? "python" : "python3",
  [join(ROOT, "scripts", "bot_auth.py"), ...args], { encoding: "utf8" }).trim();

// RFC 8032 §7.1, TEST 1 and TEST 2.
const vectors = [
  ["9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "",
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"],
  ["4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "72",
    "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"],
];
for (const [i, [secret, msg, want]] of vectors.entries()) {
  const got = py("--rfc8032", secret, ...(msg ? [msg] : []));
  check(`the signer gives RFC 8032 test ${i + 1}'s signature`, got === want, got);
}

const { privateKey } = generateKeyPairSync("ed25519");
const jwk = privateKey.export({ format: "jwk" });
const pub = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: "jwk" });
const kid = createHash("sha256").update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest("base64url");
const tmp = mkdtempSync(join(tmpdir(), "wba-"));
const keyFile = join(tmp, "key.jwk");
writeFileSync(keyFile, JSON.stringify(jwk));

// A REQUEST THE SCRIPTS SIGN verifies, over the components it names.
const h = JSON.parse(py("https://Wiki.Warframe.com:8443/w/Torid?action=raw", keyFile));
const params = (h["Signature-Input"] || "").replace(/^sig1=/, "");
const base = `"@authority": wiki.warframe.com:8443\n"signature-agent": ${h["Signature-Agent"]}\n"@signature-params": ${params}`;
const sig = Buffer.from((h.Signature || "").replace(/^sig1=:|:$/g, ""), "base64");
check("a signed request names the site's directory as its agent", h["Signature-Agent"] === '"https://wfsim.app"', h["Signature-Agent"]);
check("...covers the authority and the agent, under the web-bot-auth tag and the key's thumbprint",
  params.startsWith('("@authority" "signature-agent")') && params.includes(`keyid="${kid}"`)
    && params.includes('tag="web-bot-auth"') && /created=\d+/.test(params) && /expires=\d+/.test(params), params);
check("...and its signature verifies", sig.length === 64 && verify(null, Buffer.from(base), pub, sig));
const bare = JSON.parse(py("https://wiki.warframe.com/", join(tmp, "absent.jwk")));
check("without the key a request goes unsigned", Object.keys(bare).length === 0, JSON.stringify(bare));

// THE DIRECTORY the site worker serves.
const env = { WEB_BOT_AUTH_JWK: JSON.stringify(jwk) };
const res = await botAuthDirectory(new Request(`https://wfsim.app${BOT_AUTH_DIRECTORY}`), env);
const text = await res.text();
const doc = JSON.parse(text);
check("the directory is served with its media type", res.status === 200
  && res.headers.get("content-type") === "application/http-message-signatures-directory+json", res.headers.get("content-type"));
check("...holds the public key, and nothing of the private one",
  doc.keys.length === 1 && doc.keys[0].x === jwk.x && !text.includes(jwk.d) && !("d" in doc.keys[0]), text);
const dParams = (res.headers.get("signature-input") || "").replace(/^binding0=/, "");
const dSig = Buffer.from((res.headers.get("signature") || "").replace(/^binding0=:|:$/g, ""), "base64");
const dBase = `"@authority";req: wfsim.app\n"@signature-params": ${dParams}`;
check("...is signed by that key under the directory tag",
  dParams.includes('tag="http-message-signatures-directory"') && dParams.includes(`keyid="${kid}"`)
    && verify(null, Buffer.from(dBase), pub, dSig), dParams);
const none = await botAuthDirectory(new Request(`https://wfsim.app${BOT_AUTH_DIRECTORY}`), {});
check("with no key configured it is a 404, not an empty directory", none.status === 404);
rmSync(tmp, { recursive: true, force: true });

console.log(failed ? `\n${failed} failed` : "\nwfsim signs what its tooling sends, and says with which key");
process.exit(failed ? 1 : 0);

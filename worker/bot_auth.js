// WEB BOT AUTH — the key directory a site reads to verify a request WFSim's
// tooling signed (docs/AGENT.md §"Web Bot Auth"; IETF webbotauth,
// draft-meunier-http-message-signatures-directory). The key is the secret
// `WEB_BOT_AUTH_JWK`, an Ed25519 private JWK whose source is
// `private/web-bot-auth.jwk`; `scripts/bot_auth.py` signs with the same key.
export const BOT_AUTH_DIRECTORY = "/.well-known/http-message-signatures-directory";
const DIRECTORY_TYPE = "application/http-message-signatures-directory+json";
/// How long a signature on the directory holds, and how long a cache keeps it.
const SIGNATURE_SECONDS = 3600;
const CACHE_SECONDS = 300;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/// The RFC 7638 thumbprint, which the drafts use as the `keyid`.
export async function thumbprint(jwk) {
  const canon = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canon)));
}

/// THE PUBLIC HALF ONLY: every member but `d`, named rather than filtered, so a
/// private member added to the secret later cannot reach the directory.
const publicJwk = (jwk) => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x });

export async function botAuthDirectory(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
  let jwk;
  try { jwk = JSON.parse(env.WEB_BOT_AUTH_JWK || ""); } catch (_) { jwk = null; }
  if (!jwk || jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.x || !jwk.d) {
    return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
  const kid = await thumbprint(jwk);
  const created = Math.floor(Date.now() / 1000);
  const nonce = b64(crypto.getRandomValues(new Uint8Array(32)));
  const params = `("@authority";req);alg="ed25519";keyid="${kid}";nonce="${nonce}"`
    + `;tag="http-message-signatures-directory";created=${created};expires=${created + SIGNATURE_SECONDS}`;
  // RFC 9421 §2.5: one line per component, the parameters last, no trailing newline.
  const base = `"@authority";req: ${new URL(request.url).host.toLowerCase()}\n"@signature-params": ${params}`;
  const key = await crypto.subtle.importKey("jwk", { ...publicJwk(jwk), d: jwk.d }, { name: "Ed25519" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(base));
  return new Response(JSON.stringify({ keys: [publicJwk(jwk)] }), {
    headers: {
      "content-type": DIRECTORY_TYPE,
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
      "access-control-allow-origin": "*",
      "signature-input": `binding0=${params}`,
      "signature": `binding0=:${b64(sig)}:`,
    },
  });
}

"""WEB BOT AUTH for WFSim's own tooling: sign a request it sends to another
site, so that site can tell it is WFSim's (docs/AGENT.md §"Web Bot Auth").

    from bot_auth import bot_headers
    urllib.request.Request(url, headers=bot_headers(url, {"User-Agent": ...}))

The key is `private/web-bot-auth.jwk`, the one the site's key directory
publishes. A checkout without it sends the request unsigned, as before: a
signature is an identity, and only the key's holder has one.

Ed25519 is the RFC 8032 §6 reference algorithm, so the scripts keep to the
standard library; `check_bot_auth.mjs` holds it to the RFC's test vector and
to Node's own verifier.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit

KEY = Path(__file__).resolve().parent.parent / "private" / "web-bot-auth.jwk"
AGENT = '"https://wfsim.app"'
SIGNATURE_SECONDS = 300

# ---- Ed25519, RFC 8032 §6 -------------------------------------------------------
_P = 2 ** 255 - 19
_Q = 2 ** 252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_SQRT_M1 = pow(2, (_P - 1) // 4, _P)


def _inv(x: int) -> int:
    return pow(x, _P - 2, _P)


def _add(a, b):
    A, B = (a[1] - a[0]) * (b[1] - b[0]) % _P, (a[1] + a[0]) * (b[1] + b[0]) % _P
    C, D = 2 * a[3] * b[3] * _D % _P, 2 * a[2] * b[2] % _P
    E, F, G, H = B - A, D - C, D + C, B + A
    return (E * F % _P, G * H % _P, F * G % _P, E * H % _P)


def _mul(s: int, pt):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, pt)
        pt = _add(pt, pt)
        s >>= 1
    return q


def _compress(pt) -> bytes:
    z = _inv(pt[2])
    x, y = pt[0] * z % _P, pt[1] * z % _P
    return int.to_bytes(y | ((x & 1) << 255), 32, "little")


def _recover_x(y: int, sign: int) -> int:
    x2 = (y * y - 1) * _inv(_D * y * y + 1) % _P
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P:
        x = x * _SQRT_M1 % _P
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * _inv(5) % _P
_GX = _recover_x(_GY, 0)
_G = (_GX, _GY, 1, _GX * _GY % _P)


def _h(b: bytes) -> int:
    return int.from_bytes(hashlib.sha512(b).digest(), "little") % _Q


def ed25519_sign(secret: bytes, msg: bytes) -> bytes:
    h = hashlib.sha512(secret).digest()
    a = (int.from_bytes(h[:32], "little") & ((1 << 254) - 8)) | (1 << 254)
    pub = _compress(_mul(a, _G))
    r = _h(h[32:] + msg)
    big_r = _compress(_mul(r, _G))
    s = (r + _h(big_r + pub + msg) * a) % _Q
    return big_r + int.to_bytes(s, 32, "little")


# ---- the request signature ------------------------------------------------------
def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def thumbprint(jwk: dict) -> str:
    """RFC 7638, which the drafts use as the `keyid`."""
    canon = json.dumps({"crv": jwk["crv"], "kty": jwk["kty"], "x": jwk["x"]}, separators=(",", ":"))
    return base64.urlsafe_b64encode(hashlib.sha256(canon.encode()).digest()).decode().rstrip("=")


def _key(path: Path | None = None) -> dict | None:
    try:
        jwk = json.loads((path or KEY).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return jwk if jwk.get("kty") == "OKP" and jwk.get("crv") == "Ed25519" and jwk.get("d") else None


def bot_headers(url: str, headers: dict | None = None, *, key: Path | None = None,
                now: int | None = None, nonce: str | None = None) -> dict:
    """`headers` plus `Signature-Agent`, `Signature-Input` and `Signature` for a
    request to `url` — or `headers` unchanged when there is no key."""
    out = dict(headers or {})
    jwk = _key(key)
    if not jwk:
        return out
    parts = urlsplit(url)
    authority = (parts.hostname or "").lower()
    if parts.port and parts.port != {"http": 80, "https": 443}.get(parts.scheme):
        authority += f":{parts.port}"
    created = int(time.time()) if now is None else now
    nonce = nonce or base64.b64encode(os.urandom(32)).decode()
    params = (f'("@authority" "signature-agent");created={created};keyid="{thumbprint(jwk)}"'
              f';alg="ed25519";expires={created + SIGNATURE_SECONDS};nonce="{nonce}";tag="web-bot-auth"')
    # RFC 9421 §2.5: one line per component, the parameters last, no trailing newline.
    base = f'"@authority": {authority}\n"signature-agent": {AGENT}\n"@signature-params": {params}'
    sig = ed25519_sign(_b64url_decode(jwk["d"]), base.encode())
    out.update({
        "Signature-Agent": AGENT,
        "Signature-Input": f"sig1={params}",
        "Signature": f"sig1=:{base64.b64encode(sig).decode()}:",
    })
    return out


if __name__ == "__main__":
    # `python scripts/bot_auth.py <url> [key]` prints the headers and the base
    # they sign, for `check_bot_auth.mjs`.
    import sys
    url = sys.argv[1]
    k = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if url == "--rfc8032":
        print(ed25519_sign(bytes.fromhex(sys.argv[2]), bytes.fromhex(sys.argv[3]) if len(sys.argv) > 3 else b"").hex())
    else:
        print(json.dumps(bot_headers(url, key=k)))

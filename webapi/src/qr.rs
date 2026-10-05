// SPDX-License-Identifier: AGPL-3.0-or-later
//! `/api/qr`: a QR code as SVG, for a page that hands someone a link to scan —
//! the long images the bots send (docs/AGENT.md §"The QQ bot"). Error
//! correction M survives a phone screenshot of a chat image.

use qrcode::render::svg;
use qrcode::{EcLevel, QrCode};
use serde_json::{json, Value};

use crate::request::err_json;

/// The longest text a code is drawn for: a link, not a document.
const MAX_TEXT: usize = 512;

pub fn qr_json(v: &Value) -> Value {
    let text = v.get("text").and_then(Value::as_str).unwrap_or("");
    if text.is_empty() || text.len() > MAX_TEXT {
        return err_json(format!("text: 1 to {MAX_TEXT} bytes"));
    }
    match QrCode::with_error_correction_level(text.as_bytes(), EcLevel::M) {
        Ok(code) => json!({ "ok": true, "svg": code.render::<svg::Color>().quiet_zone(true).build() }),
        Err(e) => err_json(format!("no code for this text: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_link_draws_and_nothing_does_not() {
        let r = qr_json(&json!({ "text": "https://wfsim.app/weapons/Torid/riven-analyst" }));
        assert!(r["svg"].as_str().unwrap().starts_with("<?xml"), "{r}");
        assert_eq!(qr_json(&json!({ "text": "" }))["ok"], false);
    }
}

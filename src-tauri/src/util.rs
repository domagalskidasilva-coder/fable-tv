use unicode_normalization::UnicodeNormalization;

/// Lowercases, strips diacritics and collapses whitespace so LIKE searches
/// match regardless of accents ("São" matches "sao").
pub fn normalize_text(s: &str) -> String {
    let folded: String = s
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .flat_map(|c| c.to_lowercase())
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Escapes LIKE wildcards in user input; queries must use `ESCAPE '\'`.
pub fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

pub fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

/// FNV-1a hash used for stable cache file names.
pub fn stable_hash(s: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Extracts a release year (1900-2099) from a title, if present.
pub fn extract_year(name: &str) -> Option<i64> {
    let bytes = name.as_bytes();
    let mut i = 0;
    while i + 4 <= bytes.len() {
        let window = &bytes[i..i + 4];
        if window.iter().all(|b| b.is_ascii_digit()) {
            let before_ok = i == 0 || !bytes[i - 1].is_ascii_digit();
            let after_ok = i + 4 == bytes.len() || !bytes[i + 4].is_ascii_digit();
            if before_ok && after_ok {
                let year: i64 = std::str::from_utf8(window).ok()?.parse().ok()?;
                if (1900..2100).contains(&year) {
                    return Some(year);
                }
            }
        }
        i += 1;
    }
    None
}

/// Detects image type from magic bytes; falls back to png.
pub fn sniff_image_ext(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        "svg"
    } else {
        "png"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_accents_and_case() {
        assert_eq!(normalize_text("São Paulo HD"), "sao paulo hd");
        assert_eq!(normalize_text("  Ação   ÉPICA "), "acao epica");
    }

    #[test]
    fn escape_like_escapes_wildcards() {
        assert_eq!(escape_like("a%b_c\\d"), "a\\%b\\_c\\\\d");
    }

    #[test]
    fn extract_year_finds_isolated_years() {
        assert_eq!(extract_year("Inception (2010)"), Some(2010));
        assert_eq!(extract_year("Canal 24 Horas"), None);
        assert_eq!(extract_year("123456"), None);
        assert_eq!(extract_year("Filme 1999"), Some(1999));
    }
}

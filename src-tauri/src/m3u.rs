//! Robust M3U/M3U8 playlist parser and content classifier.
//!
//! The parser tolerates real-world playlists: attributes with or without
//! quotes, commas inside quoted values, `#EXTGRP` directives, BOM, CRLF,
//! and arbitrary extra attributes (kept in `attrs`).

use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq)]
pub struct M3uEntry {
    pub name: String,
    pub url: String,
    pub duration: f64,
    pub group: Option<String>,
    pub attrs: HashMap<String, String>,
}

impl M3uEntry {
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs.get(key).map(|s| s.as_str())
    }
    pub fn logo(&self) -> Option<&str> {
        self.attr("tvg-logo").filter(|s| !s.is_empty())
    }
    pub fn tvg_id(&self) -> Option<&str> {
        self.attr("tvg-id").filter(|s| !s.is_empty())
    }
    pub fn tvg_name(&self) -> Option<&str> {
        self.attr("tvg-name").filter(|s| !s.is_empty())
    }
}

#[derive(Debug, Default)]
pub struct M3uPlaylist {
    pub entries: Vec<M3uEntry>,
    /// EPG URL advertised in the header (`url-tvg` / `x-tvg-url`).
    pub tvg_url: Option<String>,
}

pub fn parse_m3u(content: &str) -> M3uPlaylist {
    let mut playlist = M3uPlaylist::default();
    let mut pending: Option<(String, f64, HashMap<String, String>)> = None;
    let mut current_group: Option<String> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim_start_matches('\u{feff}').trim();
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTM3U") {
            let attrs = parse_attributes(rest).0;
            playlist.tvg_url = attrs
                .get("url-tvg")
                .or_else(|| attrs.get("x-tvg-url"))
                .filter(|s| !s.is_empty())
                .cloned();
        } else if let Some(rest) = line.strip_prefix("#EXTINF:") {
            pending = Some(parse_extinf(rest));
        } else if let Some(rest) = line.strip_prefix("#EXTGRP:") {
            let g = rest.trim();
            current_group = if g.is_empty() { None } else { Some(g.to_string()) };
        } else if line.starts_with('#') {
            // Other directives (#EXTVLCOPT, comments, ...) are ignored.
        } else {
            // A non-comment line is the media URL for the pending EXTINF.
            if let Some((title, duration, attrs)) = pending.take() {
                let group = attrs
                    .get("group-title")
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .or_else(|| current_group.clone());
                let name = if title.is_empty() {
                    attrs
                        .get("tvg-name")
                        .filter(|s| !s.is_empty())
                        .cloned()
                        .unwrap_or_else(|| line.to_string())
                } else {
                    title
                };
                playlist.entries.push(M3uEntry {
                    name,
                    url: line.to_string(),
                    duration,
                    group,
                    attrs,
                });
            }
        }
    }
    playlist
}

/// Parses the EXTINF payload: `<duration> [key="value" ...],<title>`.
fn parse_extinf(rest: &str) -> (String, f64, HashMap<String, String>) {
    let rest = rest.trim_start();
    // Duration: leading token up to whitespace or comma.
    let dur_end = rest
        .find(|c: char| c.is_whitespace() || c == ',')
        .unwrap_or(rest.len());
    let duration: f64 = rest[..dur_end].trim().parse().unwrap_or(-1.0);
    let (attrs, title) = parse_attributes(&rest[dur_end..]);
    (title.trim().to_string(), duration, attrs)
}

/// Scans `key="value"` / `key=value` pairs; everything after the comma that
/// follows the attributes is the title. Commas inside quotes are preserved.
fn parse_attributes(input: &str) -> (HashMap<String, String>, String) {
    let mut attrs = HashMap::new();
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;
    let len = chars.len();

    loop {
        while i < len && (chars[i] == ' ' || chars[i] == '\t') {
            i += 1;
        }
        if i >= len {
            return (attrs, String::new());
        }
        if chars[i] == ',' {
            let title: String = chars[i + 1..].iter().collect();
            return (attrs, title);
        }
        // Read the key.
        let key_start = i;
        while i < len && chars[i] != '=' && chars[i] != ',' && !chars[i].is_whitespace() {
            i += 1;
        }
        if i >= len || chars[i] != '=' {
            // Stray token without '=': skip it (do not treat as title marker).
            continue;
        }
        let key: String = chars[key_start..i].iter().collect::<String>().to_lowercase();
        i += 1; // skip '='
        let value: String = if i < len && chars[i] == '"' {
            i += 1;
            let v_start = i;
            while i < len && chars[i] != '"' {
                i += 1;
            }
            let v: String = chars[v_start..i].iter().collect();
            if i < len {
                i += 1; // skip closing quote
            }
            v
        } else {
            let v_start = i;
            while i < len && chars[i] != ',' && !chars[i].is_whitespace() {
                i += 1;
            }
            chars[v_start..i].iter().collect()
        };
        attrs.insert(key, value);
    }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq)]
pub enum ItemKind {
    Live,
    Movie,
    Episode {
        series: String,
        season: u32,
        episode: u32,
    },
    Unknown,
}

static RE_SXXEXX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\bS(\d{1,2})\s*[\.\-_ ]?\s*E(?:P)?\.?\s*(\d{1,4})\b").unwrap()
});
static RE_NXN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b(\d{1,2})\s*x\s*(\d{1,4})\b").unwrap());
static RE_TEMPORADA: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\btemporada\s*(\d{1,2}).{0,20}?\b(?:epis[oó]dio|ep|cap[ií]tulo|cap)\.?\s*(\d{1,4})\b")
        .unwrap()
});
static RE_EP_ONLY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b(?:epis[oó]dio|cap[ií]tulo|ep|cap)\.?\s*(\d{1,4})\b").unwrap()
});

const VOD_EXTS: &[&str] = &["mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "m4v", "mpg", "mpeg"];
const LIVE_EXTS: &[&str] = &["ts", "m3u8", "m3u"];

const MOVIE_GROUP_HINTS: &[&str] = &["filme", "movie", "vod", "cinema", "lancamento"];
const SERIES_GROUP_HINTS: &[&str] = &["serie", "series", "novela", "anime", "desenho", "dorama"];
const LIVE_GROUP_HINTS: &[&str] = &[
    "canal", "canais", "channel", "tv ", " tv", "live", "ao vivo", "abert", "esporte", "sport",
    "news", "noticia", "infantil aberta", "24h", "radio",
];

/// Match `SxxExx` style markers and derive the series name from the text
/// before the marker.
pub fn series_match(name: &str) -> Option<(String, u32, u32)> {
    for re in [&*RE_SXXEXX, &*RE_NXN, &*RE_TEMPORADA] {
        if let Some(caps) = re.captures(name) {
            let season: u32 = caps.get(1)?.as_str().parse().ok()?;
            let episode: u32 = caps.get(2)?.as_str().parse().ok()?;
            let series = clean_series_name(&name[..caps.get(0)?.start()], name);
            return Some((series, season, episode));
        }
    }
    if let Some(caps) = RE_EP_ONLY.captures(name) {
        let episode: u32 = caps.get(1)?.as_str().parse().ok()?;
        let series = clean_series_name(&name[..caps.get(0)?.start()], name);
        return Some((series, 1, episode));
    }
    None
}

fn clean_series_name(prefix: &str, full: &str) -> String {
    let cleaned = prefix
        .trim()
        .trim_end_matches(['-', ':', '|', '–', '.', ','])
        .trim()
        .to_string();
    if cleaned.is_empty() {
        full.trim().to_string()
    } else {
        cleaned
    }
}

fn url_extension(url: &str) -> Option<String> {
    let no_query = url.split(['?', '#']).next().unwrap_or(url);
    let last_segment = no_query.rsplit('/').next().unwrap_or("");
    let ext = last_segment.rsplit_once('.')?.1;
    if ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
        Some(ext.to_ascii_lowercase())
    } else {
        None
    }
}

fn group_has(group: &Option<String>, hints: &[&str]) -> bool {
    match group {
        Some(g) => {
            let g = crate::util::normalize_text(g);
            hints.iter().any(|h| g.contains(h))
        }
        None => false,
    }
}

/// Classify a playlist entry as live channel, movie, series episode or
/// unknown, using URL shape, file extension, group hints and title patterns.
pub fn classify(entry: &M3uEntry) -> ItemKind {
    let url_lower = entry.url.to_ascii_lowercase();
    let ext = url_extension(&entry.url);
    let is_vod_ext = ext.as_deref().map(|e| VOD_EXTS.contains(&e)).unwrap_or(false);
    let is_live_ext = ext.as_deref().map(|e| LIVE_EXTS.contains(&e)).unwrap_or(false);

    let url_says_series = url_lower.contains("/series/") || url_lower.contains("/serie/");
    let url_says_movie = url_lower.contains("/movie/") || url_lower.contains("/movies/");
    let url_says_live = url_lower.contains("/live/");

    let group_movie = group_has(&entry.group, MOVIE_GROUP_HINTS);
    let group_series = group_has(&entry.group, SERIES_GROUP_HINTS);
    let group_live = group_has(&entry.group, LIVE_GROUP_HINTS);

    let series_hit = series_match(&entry.name);

    // Episodes: an explicit SxxExx pattern wins unless everything else
    // screams "live channel".
    if let Some((series, season, episode)) = series_hit {
        let looks_live = (is_live_ext || url_says_live || group_live)
            && !url_says_series
            && !group_series
            && !is_vod_ext;
        if !looks_live {
            return ItemKind::Episode { series, season, episode };
        }
    }

    if url_says_series && !is_live_ext {
        // Series URL without a recognizable episode marker: synthesize E1.
        let (series, season, episode) = series_match(&entry.name)
            .unwrap_or_else(|| (entry.name.trim().to_string(), 1, 1));
        return ItemKind::Episode { series, season, episode };
    }

    if url_says_movie || (is_vod_ext && !group_series && !group_live) || (group_movie && !is_live_ext) {
        return ItemKind::Movie;
    }

    if is_live_ext || url_says_live || group_live || ext.is_none() {
        return ItemKind::Live;
    }

    ItemKind::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"#EXTM3U url-tvg="http://example.com/epg.xml"
#EXTINF:-1 tvg-id="globo.br" tvg-name="Globo SP" tvg-logo="http://logo/globo.png" group-title="Canais | Abertos",Globo SP HD
http://example.com/live/user/pass/1001.m3u8
#EXTINF:-1 tvg-logo="http://logo/film.jpg" group-title="Filmes | Ação, Aventura",Inception (2010)
http://example.com/movie/user/pass/2002.mp4
#EXTINF:-1 group-title="Séries | Drama",Breaking Bad S01E03
http://example.com/series/user/pass/3003.mkv
#EXTGRP:Notícias
#EXTINF:0,CNN Internacional
http://example.com/live/user/pass/4004.ts
"#;

    #[test]
    fn parses_header_tvg_url() {
        let pl = parse_m3u(SAMPLE);
        assert_eq!(pl.tvg_url.as_deref(), Some("http://example.com/epg.xml"));
    }

    #[test]
    fn parses_entries_with_attributes() {
        let pl = parse_m3u(SAMPLE);
        assert_eq!(pl.entries.len(), 4);
        let first = &pl.entries[0];
        assert_eq!(first.name, "Globo SP HD");
        assert_eq!(first.tvg_id(), Some("globo.br"));
        assert_eq!(first.tvg_name(), Some("Globo SP"));
        assert_eq!(first.logo(), Some("http://logo/globo.png"));
        assert_eq!(first.group.as_deref(), Some("Canais | Abertos"));
        assert_eq!(first.url, "http://example.com/live/user/pass/1001.m3u8");
        assert_eq!(first.duration, -1.0);
    }

    #[test]
    fn preserves_commas_inside_quoted_attributes() {
        let pl = parse_m3u(SAMPLE);
        let movie = &pl.entries[1];
        assert_eq!(movie.group.as_deref(), Some("Filmes | Ação, Aventura"));
        assert_eq!(movie.name, "Inception (2010)");
    }

    #[test]
    fn extgrp_applies_to_following_entries() {
        let pl = parse_m3u(SAMPLE);
        let cnn = &pl.entries[3];
        assert_eq!(cnn.group.as_deref(), Some("Notícias"));
        assert_eq!(cnn.duration, 0.0);
    }

    #[test]
    fn parses_unquoted_attributes() {
        let pl = parse_m3u("#EXTM3U\n#EXTINF:-1 tvg-id=ch1 group-title=News,Channel One\nhttp://h/s.m3u8\n");
        let e = &pl.entries[0];
        assert_eq!(e.tvg_id(), Some("ch1"));
        assert_eq!(e.group.as_deref(), Some("News"));
        assert_eq!(e.name, "Channel One");
    }

    #[test]
    fn tolerates_url_without_extinf_and_blank_lines() {
        let pl = parse_m3u("#EXTM3U\n\nhttp://orphan/url.ts\n#EXTINF:-1,Ok\nhttp://h/ok.ts\n");
        assert_eq!(pl.entries.len(), 1);
        assert_eq!(pl.entries[0].name, "Ok");
    }

    #[test]
    fn classifies_live_channel() {
        let pl = parse_m3u(SAMPLE);
        assert_eq!(classify(&pl.entries[0]), ItemKind::Live);
        assert_eq!(classify(&pl.entries[3]), ItemKind::Live);
    }

    #[test]
    fn classifies_movie() {
        let pl = parse_m3u(SAMPLE);
        assert_eq!(classify(&pl.entries[1]), ItemKind::Movie);
    }

    #[test]
    fn classifies_episode_with_sxxexx() {
        let pl = parse_m3u(SAMPLE);
        match classify(&pl.entries[2]) {
            ItemKind::Episode { series, season, episode } => {
                assert_eq!(series, "Breaking Bad");
                assert_eq!(season, 1);
                assert_eq!(episode, 3);
            }
            other => panic!("expected episode, got {other:?}"),
        }
    }

    fn entry(name: &str, url: &str, group: Option<&str>) -> M3uEntry {
        M3uEntry {
            name: name.into(),
            url: url.into(),
            duration: -1.0,
            group: group.map(|s| s.to_string()),
            attrs: HashMap::new(),
        }
    }

    #[test]
    fn series_pattern_variants() {
        assert_eq!(
            series_match("Dark 2x08"),
            Some(("Dark".into(), 2, 8))
        );
        assert_eq!(
            series_match("Friends - Temporada 3 Episódio 12"),
            Some(("Friends".into(), 3, 12))
        );
        assert_eq!(
            series_match("One Piece Ep. 1071"),
            Some(("One Piece".into(), 1, 1071))
        );
        assert_eq!(series_match("ESPN 2"), None);
    }

    #[test]
    fn live_channel_with_number_is_not_episode() {
        let e = entry("ESPN 2 HD", "http://h/live/u/p/55.ts", Some("Esportes"));
        assert_eq!(classify(&e), ItemKind::Live);
    }

    #[test]
    fn vod_extension_without_hints_is_movie() {
        let e = entry("Algum Filme", "http://h/v/9.mp4", None);
        assert_eq!(classify(&e), ItemKind::Movie);
    }

    #[test]
    fn series_group_with_episode_in_title() {
        let e = entry(
            "La Casa de Papel S02E05",
            "http://h/x/123.mp4",
            Some("Séries Internacionais"),
        );
        match classify(&e) {
            ItemKind::Episode { series, season, episode } => {
                assert_eq!(series, "La Casa de Papel");
                assert_eq!(season, 2);
                assert_eq!(episode, 5);
            }
            other => panic!("expected episode, got {other:?}"),
        }
    }

    #[test]
    fn extensionless_url_defaults_to_live() {
        let e = entry("Canal 10", "http://h/u/p/88", None);
        assert_eq!(classify(&e), ItemKind::Live);
    }
}

//! Streaming XMLTV parser. Handles plain and gzip-compressed files and
//! filters programs by channel set and time window to keep the cache small.

use crate::error::{AppError, AppResult};
use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashSet;
use std::io::Read;

#[derive(Debug, Clone, PartialEq)]
pub struct EpgProgram {
    pub channel: String,
    pub title: String,
    pub description: Option<String>,
    pub start_ts: i64,
    pub stop_ts: i64,
}

/// Parses XMLTV bytes. `keep_channels` (lowercased ids) limits output to
/// channels that exist locally; `min_ts..max_ts` bounds the time window.
pub fn parse_xmltv(
    bytes: &[u8],
    keep_channels: Option<&HashSet<String>>,
    min_ts: i64,
    max_ts: i64,
) -> AppResult<Vec<EpgProgram>> {
    let decompressed;
    let data: &[u8] = if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut gz = flate2::read::GzDecoder::new(bytes);
        let mut out = Vec::new();
        gz.read_to_end(&mut out)
            .map_err(|e| AppError::Other(format!("falha ao descompactar EPG: {e}")))?;
        decompressed = out;
        &decompressed
    } else {
        bytes
    };

    let mut reader = Reader::from_reader(data);
    reader.config_mut().trim_text(true);

    let mut programs = Vec::new();
    let mut buf = Vec::new();

    let mut in_programme = false;
    let mut in_title = false;
    let mut in_desc = false;
    let mut channel = String::new();
    let mut title = String::new();
    let mut desc = String::new();
    let mut start_ts: i64 = 0;
    let mut stop_ts: i64 = 0;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => match e.name().as_ref() {
                b"programme" => {
                    in_programme = true;
                    channel.clear();
                    title.clear();
                    desc.clear();
                    start_ts = 0;
                    stop_ts = 0;
                    for attr in e.attributes().flatten() {
                        let value = String::from_utf8_lossy(&attr.value).into_owned();
                        match attr.key.as_ref() {
                            b"start" => start_ts = parse_xmltv_time(&value).unwrap_or(0),
                            b"stop" => stop_ts = parse_xmltv_time(&value).unwrap_or(0),
                            b"channel" => channel = value.to_lowercase(),
                            _ => {}
                        }
                    }
                }
                b"title" if in_programme => in_title = true,
                b"desc" if in_programme => in_desc = true,
                _ => {}
            },
            Ok(Event::Text(t)) => {
                if in_title || in_desc {
                    let text = t.unescape().unwrap_or_default();
                    if in_title {
                        title.push_str(&text);
                    } else {
                        desc.push_str(&text);
                    }
                }
            }
            Ok(Event::End(e)) => match e.name().as_ref() {
                b"title" => in_title = false,
                b"desc" => in_desc = false,
                b"programme" => {
                    in_programme = false;
                    let keep = !channel.is_empty()
                        && !title.is_empty()
                        && stop_ts > min_ts
                        && start_ts < max_ts
                        && stop_ts > start_ts
                        && keep_channels.map(|set| set.contains(&channel)).unwrap_or(true);
                    if keep {
                        programs.push(EpgProgram {
                            channel: channel.clone(),
                            title: title.trim().to_string(),
                            description: if desc.trim().is_empty() {
                                None
                            } else {
                                Some(desc.trim().to_string())
                            },
                            start_ts,
                            stop_ts,
                        });
                    }
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(e) => {
                return Err(AppError::Other(format!("XMLTV inválido: {e}")));
            }
        }
        buf.clear();
    }
    Ok(programs)
}

/// XMLTV times look like `20260612203000 +0000`, sometimes without zone or
/// without seconds. Unzoned times are treated as UTC.
pub fn parse_xmltv_time(s: &str) -> Option<i64> {
    let s = s.trim();
    if let Ok(dt) = DateTime::parse_from_str(s, "%Y%m%d%H%M%S %z") {
        return Some(dt.timestamp());
    }
    if let Ok(dt) = DateTime::parse_from_str(s, "%Y%m%d%H%M %z") {
        return Some(dt.timestamp());
    }
    let bare = s.split_whitespace().next()?;
    let naive = NaiveDateTime::parse_from_str(bare, "%Y%m%d%H%M%S")
        .or_else(|_| NaiveDateTime::parse_from_str(bare, "%Y%m%d%H%M"))
        .ok()?;
    Some(Utc.from_utc_datetime(&naive).timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test">
  <channel id="Globo.br"><display-name>Globo</display-name></channel>
  <programme start="20260612200000 +0000" stop="20260612210000 +0000" channel="Globo.br">
    <title lang="pt">Jornal Nacional</title>
    <desc lang="pt">Notícias do dia.</desc>
  </programme>
  <programme start="20260612210000 +0000" stop="20260612220000 +0000" channel="Globo.br">
    <title>Novela das Nove</title>
  </programme>
  <programme start="20260612200000 +0000" stop="20260612210000 +0000" channel="Outro.ch">
    <title>Outro Programa</title>
  </programme>
</tv>"#;

    fn ts(s: &str) -> i64 {
        parse_xmltv_time(s).unwrap()
    }

    #[test]
    fn parses_programs_with_title_and_desc() {
        let progs = parse_xmltv(XML.as_bytes(), None, 0, i64::MAX).unwrap();
        assert_eq!(progs.len(), 3);
        assert_eq!(progs[0].channel, "globo.br");
        assert_eq!(progs[0].title, "Jornal Nacional");
        assert_eq!(progs[0].description.as_deref(), Some("Notícias do dia."));
        assert_eq!(progs[1].description, None);
        assert_eq!(progs[0].start_ts, ts("20260612200000 +0000"));
        assert_eq!(progs[0].stop_ts, ts("20260612210000 +0000"));
    }

    #[test]
    fn filters_by_channel_set() {
        let mut keep = HashSet::new();
        keep.insert("globo.br".to_string());
        let progs = parse_xmltv(XML.as_bytes(), Some(&keep), 0, i64::MAX).unwrap();
        assert_eq!(progs.len(), 2);
        assert!(progs.iter().all(|p| p.channel == "globo.br"));
    }

    #[test]
    fn filters_by_time_window() {
        let min = ts("20260612203000 +0000");
        let progs = parse_xmltv(XML.as_bytes(), None, min, min + 1800).unwrap();
        // Window 20:30–21:00: the two 20:00–21:00 programs overlap it; the
        // 21:00–22:00 one starts exactly at the boundary and is excluded.
        assert_eq!(progs.len(), 2);
        assert!(progs.iter().all(|p| p.title != "Novela das Nove"));
        let progs = parse_xmltv(XML.as_bytes(), None, ts("20260612213000 +0000"), i64::MAX).unwrap();
        assert_eq!(progs.len(), 1);
        assert_eq!(progs[0].title, "Novela das Nove");
    }

    #[test]
    fn parses_gzipped_xmltv() {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;
        let mut enc = GzEncoder::new(Vec::new(), Compression::default());
        enc.write_all(XML.as_bytes()).unwrap();
        let gz = enc.finish().unwrap();
        let progs = parse_xmltv(&gz, None, 0, i64::MAX).unwrap();
        assert_eq!(progs.len(), 3);
    }

    #[test]
    fn time_parsing_variants() {
        assert!(parse_xmltv_time("20260612203000 +0000").is_some());
        assert!(parse_xmltv_time("20260612203000 -0300").is_some());
        assert!(parse_xmltv_time("20260612203000").is_some());
        assert!(parse_xmltv_time("202606122030").is_some());
        assert!(parse_xmltv_time("garbage").is_none());
        let with_tz = parse_xmltv_time("20260612200000 -0300").unwrap();
        let utc = parse_xmltv_time("20260612230000 +0000").unwrap();
        assert_eq!(with_tz, utc);
    }
}

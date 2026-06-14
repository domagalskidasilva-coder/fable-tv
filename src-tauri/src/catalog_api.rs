//! Client for user-configured sources that expose separated catalogs through
//! the common `player_api.php` convention (live / VOD / series / EPG).
//!
//! Only servers explicitly added by the user are contacted, with the
//! credentials the user provided. Nothing is discovered, scraped or bypassed.

use crate::error::{AppError, AppResult};
use serde_json::Value;
use url::Url;

pub struct CatalogApi<'a> {
    base: Url,
    username: String,
    password: String,
    http: &'a reqwest::Client,
}

#[derive(Debug, Clone)]
pub struct ApiCategory {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct ApiStream {
    pub id: i64,
    pub name: String,
    pub logo: Option<String>,
    pub category_id: Option<String>,
    pub epg_channel_id: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone)]
pub struct ApiVod {
    pub id: i64,
    pub name: String,
    pub icon: Option<String>,
    pub category_id: Option<String>,
    pub extension: String,
    pub rating: Option<String>,
    pub year: Option<i64>,
    pub plot: Option<String>,
    pub genre: Option<String>,
    pub duration_secs: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ApiSeries {
    pub id: i64,
    pub name: String,
    pub cover: Option<String>,
    pub category_id: Option<String>,
    pub plot: Option<String>,
    pub rating: Option<String>,
    pub year: Option<i64>,
    pub genre: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ApiEpisode {
    pub id: i64,
    pub season: i64,
    pub episode_num: i64,
    pub title: String,
    pub extension: String,
    pub duration_secs: Option<i64>,
    pub plot: Option<String>,
    pub cover: Option<String>,
}

/// Series-level metadata from `get_series_info` (the `info` object).
#[derive(Debug, Clone, Default)]
pub struct ApiSeriesExtra {
    pub plot: Option<String>,
    pub backdrop: Option<String>,
    pub cast: Option<String>,
    pub director: Option<String>,
    pub genre: Option<String>,
    pub trailer: Option<String>,
}

/// Full movie metadata from `get_vod_info`.
#[derive(Debug, Clone, Default)]
pub struct ApiVodInfo {
    pub plot: Option<String>,
    pub backdrop: Option<String>,
    pub cast: Option<String>,
    pub director: Option<String>,
    pub genre: Option<String>,
    pub trailer: Option<String>,
    pub country: Option<String>,
    pub duration_secs: Option<i64>,
    pub rating: Option<String>,
    pub year: Option<i64>,
}

impl<'a> CatalogApi<'a> {
    pub fn new(
        base_url: &str,
        username: &str,
        password: &str,
        http: &'a reqwest::Client,
    ) -> AppResult<Self> {
        let mut base = crate::security::validate_http_url(base_url)?;
        // Normalize: strip path/query so we can build endpoint URLs reliably.
        base.set_path("");
        base.set_query(None);
        base.set_fragment(None);
        if username.trim().is_empty() || password.is_empty() {
            return Err(AppError::Invalid(
                "fontes de catálogo separado exigem usuário e senha".into(),
            ));
        }
        Ok(Self {
            base,
            username: username.trim().to_string(),
            password: password.to_string(),
            http,
        })
    }

    fn api_url(&self, action: Option<&str>, extra: &[(&str, &str)]) -> Url {
        let mut u = self.base.clone();
        u.set_path("player_api.php");
        {
            let mut qp = u.query_pairs_mut();
            qp.append_pair("username", &self.username);
            qp.append_pair("password", &self.password);
            if let Some(a) = action {
                qp.append_pair("action", a);
            }
            for (k, v) in extra {
                qp.append_pair(k, v);
            }
        }
        u
    }

    async fn get_json(&self, action: Option<&str>, extra: &[(&str, &str)]) -> AppResult<Value> {
        let url = self.api_url(action, extra);
        let resp = self.http.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Other(format!(
                "o servidor respondeu com status {}",
                resp.status()
            )));
        }
        let body = resp.text().await?;
        serde_json::from_str(&body)
            .map_err(|_| AppError::Other("o servidor não retornou JSON válido".into()))
    }

    /// Verifies credentials. Returns the account status string.
    pub async fn handshake(&self) -> AppResult<String> {
        let v = self.get_json(None, &[]).await?;
        let user_info = v.get("user_info").unwrap_or(&Value::Null);
        let auth = j_i64(user_info, &["auth"]).unwrap_or(0);
        if auth != 1 {
            return Err(AppError::Invalid(
                "autenticação recusada pelo servidor (verifique usuário e senha)".into(),
            ));
        }
        Ok(j_str(user_info, &["status"]).unwrap_or_else(|| "Active".into()))
    }

    pub async fn live_categories(&self) -> AppResult<Vec<ApiCategory>> {
        self.categories("get_live_categories").await
    }
    pub async fn vod_categories(&self) -> AppResult<Vec<ApiCategory>> {
        self.categories("get_vod_categories").await
    }
    pub async fn series_categories(&self) -> AppResult<Vec<ApiCategory>> {
        self.categories("get_series_categories").await
    }

    async fn categories(&self, action: &str) -> AppResult<Vec<ApiCategory>> {
        let v = self.get_json(Some(action), &[]).await?;
        let mut out = Vec::new();
        if let Some(arr) = v.as_array() {
            for item in arr {
                let id = j_str(item, &["category_id"]).unwrap_or_default();
                let name = j_str(item, &["category_name"]).unwrap_or_default();
                if !id.is_empty() && !name.is_empty() {
                    out.push(ApiCategory { id, name });
                }
            }
        }
        Ok(out)
    }

    pub async fn live_streams(&self) -> AppResult<Vec<ApiStream>> {
        let v = self.get_json(Some("get_live_streams"), &[]).await?;
        let mut out = Vec::new();
        if let Some(arr) = v.as_array() {
            for (i, item) in arr.iter().enumerate() {
                let Some(id) = j_i64(item, &["stream_id"]) else { continue };
                let name = j_str(item, &["name"]).unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                out.push(ApiStream {
                    id,
                    name,
                    logo: j_str(item, &["stream_icon"]).filter(|s| !s.is_empty()),
                    category_id: j_str(item, &["category_id"]),
                    epg_channel_id: j_str(item, &["epg_channel_id"]).filter(|s| !s.is_empty()),
                    position: j_i64(item, &["num"]).unwrap_or(i as i64),
                });
            }
        }
        Ok(out)
    }

    pub async fn vod_streams(&self) -> AppResult<Vec<ApiVod>> {
        let v = self.get_json(Some("get_vod_streams"), &[]).await?;
        let mut out = Vec::new();
        if let Some(arr) = v.as_array() {
            for item in arr {
                let Some(id) = j_i64(item, &["stream_id"]) else { continue };
                let name = j_str(item, &["name"]).unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let year = j_i64(item, &["year"])
                    .or_else(|| crate::util::extract_year(&name))
                    .or_else(|| {
                        j_str(item, &["releaseDate", "release_date"])
                            .and_then(|d| d.get(..4).and_then(|y| y.parse().ok()))
                    });
                out.push(ApiVod {
                    id,
                    name,
                    icon: j_str(item, &["stream_icon", "cover"]).filter(|s| !s.is_empty()),
                    category_id: j_str(item, &["category_id"]),
                    extension: j_str(item, &["container_extension"])
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "mp4".into()),
                    rating: j_str(item, &["rating"]).filter(|s| !s.is_empty() && s != "0"),
                    year,
                    plot: j_str(item, &["plot"]).filter(|s| !s.is_empty()),
                    genre: j_str(item, &["genre"]).filter(|s| !s.is_empty()),
                    duration_secs: parse_duration(item),
                });
            }
        }
        Ok(out)
    }

    pub async fn series_list(&self) -> AppResult<Vec<ApiSeries>> {
        let v = self.get_json(Some("get_series"), &[]).await?;
        let mut out = Vec::new();
        if let Some(arr) = v.as_array() {
            for item in arr {
                let Some(id) = j_i64(item, &["series_id"]) else { continue };
                let name = j_str(item, &["name"]).unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                out.push(ApiSeries {
                    id,
                    name: name.clone(),
                    cover: j_str(item, &["cover"]).filter(|s| !s.is_empty()),
                    category_id: j_str(item, &["category_id"]),
                    plot: j_str(item, &["plot"]).filter(|s| !s.is_empty()),
                    rating: j_str(item, &["rating"]).filter(|s| !s.is_empty() && s != "0"),
                    year: j_i64(item, &["year"])
                        .or_else(|| crate::util::extract_year(&name))
                        .or_else(|| {
                            j_str(item, &["releaseDate", "release_date"])
                                .and_then(|d| d.get(..4).and_then(|y| y.parse().ok()))
                        }),
                    genre: j_str(item, &["genre"]).filter(|s| !s.is_empty()),
                });
            }
        }
        Ok(out)
    }

    /// Full series info: episodes (with thumbnails) plus series-level metadata
    /// (cast/director/backdrop/trailer), from a single `get_series_info` call.
    pub async fn series_info(&self, series_id: i64) -> AppResult<(Vec<ApiEpisode>, ApiSeriesExtra)> {
        let sid = series_id.to_string();
        let v = self
            .get_json(Some("get_series_info"), &[("series_id", &sid)])
            .await?;

        let info = v.get("info").unwrap_or(&Value::Null);
        let extra = ApiSeriesExtra {
            plot: j_str(info, &["plot", "description"]).filter(|s| !s.is_empty()),
            backdrop: first_backdrop(info),
            cast: j_str(info, &["cast", "actors"]).filter(|s| !s.is_empty()),
            director: j_str(info, &["director"]).filter(|s| !s.is_empty()),
            genre: j_str(info, &["genre"]).filter(|s| !s.is_empty()),
            trailer: j_str(info, &["youtube_trailer", "trailer"]).filter(|s| !s.is_empty()),
        };

        let mut out = Vec::new();
        let episodes = v.get("episodes").unwrap_or(&Value::Null);
        let season_lists: Vec<&Value> = match episodes {
            Value::Object(map) => map.values().collect(),
            Value::Array(arr) => arr.iter().collect(),
            _ => Vec::new(),
        };
        for season_list in season_lists {
            let Some(eps) = season_list.as_array() else { continue };
            for ep in eps {
                let Some(id) = j_i64(ep, &["id"]) else { continue };
                let ep_info = ep.get("info").unwrap_or(&Value::Null);
                out.push(ApiEpisode {
                    id,
                    season: j_i64(ep, &["season"]).unwrap_or(1).max(0),
                    episode_num: j_i64(ep, &["episode_num"]).unwrap_or(0),
                    title: j_str(ep, &["title"]).unwrap_or_else(|| format!("Episódio {id}")),
                    extension: j_str(ep, &["container_extension"])
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "mp4".into()),
                    duration_secs: parse_duration(ep).or_else(|| parse_duration(ep_info)),
                    plot: j_str(ep_info, &["plot"]).filter(|s| !s.is_empty()),
                    cover: j_str(ep_info, &["movie_image", "cover_big", "cover"])
                        .filter(|s| !s.is_empty()),
                });
            }
        }
        out.sort_by_key(|e| (e.season, e.episode_num));
        Ok((out, extra))
    }

    /// Full movie info from `get_vod_info` (`info` + `movie_data`).
    pub async fn vod_info(&self, vod_id: i64) -> AppResult<ApiVodInfo> {
        let id = vod_id.to_string();
        let v = self.get_json(Some("get_vod_info"), &[("vod_id", &id)]).await?;
        let info = v.get("info").unwrap_or(&Value::Null);
        let name = v
            .get("movie_data")
            .and_then(|m| j_str(m, &["name"]))
            .unwrap_or_default();
        Ok(ApiVodInfo {
            plot: j_str(info, &["plot", "description"]).filter(|s| !s.is_empty()),
            backdrop: first_backdrop(info),
            cast: j_str(info, &["cast", "actors"]).filter(|s| !s.is_empty()),
            director: j_str(info, &["director"]).filter(|s| !s.is_empty()),
            genre: j_str(info, &["genre"]).filter(|s| !s.is_empty()),
            trailer: j_str(info, &["youtube_trailer", "trailer"]).filter(|s| !s.is_empty()),
            country: j_str(info, &["country"]).filter(|s| !s.is_empty()),
            duration_secs: parse_duration(info),
            rating: j_str(info, &["rating"]).filter(|s| !s.is_empty() && s != "0"),
            year: j_i64(info, &["year"])
                .or_else(|| crate::util::extract_year(&name))
                .or_else(|| {
                    j_str(info, &["releasedate", "releaseDate", "release_date"])
                        .and_then(|d| d.get(..4).and_then(|y| y.parse().ok()))
                }),
        })
    }

    pub fn live_url(&self, stream_id: &str) -> String {
        format!(
            "{}live/{}/{}/{}.m3u8",
            self.base, self.username, self.password, stream_id
        )
    }

    pub fn movie_url(&self, stream_id: &str, ext: &str) -> String {
        format!(
            "{}movie/{}/{}/{}.{}",
            self.base, self.username, self.password, stream_id, ext
        )
    }

    pub fn episode_url(&self, episode_id: &str, ext: &str) -> String {
        format!(
            "{}series/{}/{}/{}.{}",
            self.base, self.username, self.password, episode_id, ext
        )
    }

    pub fn xmltv_url(&self) -> String {
        let mut u = self.base.clone();
        u.set_path("xmltv.php");
        u.query_pairs_mut()
            .append_pair("username", &self.username)
            .append_pair("password", &self.password);
        u.to_string()
    }
}

/// `backdrop_path` is usually an array of URLs, occasionally a bare string.
fn first_backdrop(info: &Value) -> Option<String> {
    match info.get("backdrop_path").or_else(|| info.get("backdrop")) {
        Some(Value::Array(arr)) => arr
            .iter()
            .find_map(|x| x.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string()),
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// Reads a string from the first present key, accepting numbers too
/// (these APIs return `"1"` and `1` interchangeably).
pub fn j_str(v: &Value, keys: &[&str]) -> Option<String> {
    for k in keys {
        match v.get(k) {
            Some(Value::String(s)) => return Some(s.clone()),
            Some(Value::Number(n)) => return Some(n.to_string()),
            Some(Value::Bool(b)) => return Some(b.to_string()),
            _ => continue,
        }
    }
    None
}

pub fn j_i64(v: &Value, keys: &[&str]) -> Option<i64> {
    for k in keys {
        match v.get(k) {
            Some(Value::Number(n)) => {
                if let Some(i) = n.as_i64() {
                    return Some(i);
                }
                if let Some(f) = n.as_f64() {
                    return Some(f as i64);
                }
            }
            Some(Value::String(s)) => {
                if let Ok(i) = s.trim().parse::<i64>() {
                    return Some(i);
                }
            }
            _ => continue,
        }
    }
    None
}

/// Accepts `duration_secs`, numeric `duration` or `"HH:MM:SS"`.
fn parse_duration(v: &Value) -> Option<i64> {
    if let Some(secs) = j_i64(v, &["duration_secs"]) {
        if secs > 0 {
            return Some(secs);
        }
    }
    if let Some(d) = j_str(v, &["duration"]) {
        let d = d.trim();
        if let Ok(secs) = d.parse::<i64>() {
            return (secs > 0).then_some(secs);
        }
        let parts: Vec<&str> = d.split(':').collect();
        if parts.len() == 3 {
            let h: i64 = parts[0].parse().ok()?;
            let m: i64 = parts[1].parse().ok()?;
            let s: i64 = parts[2].parse().ok()?;
            let total = h * 3600 + m * 60 + s;
            return (total > 0).then_some(total);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn j_helpers_accept_mixed_types() {
        let v: Value = serde_json::json!({"a": "12", "b": 12, "c": "texto"});
        assert_eq!(j_i64(&v, &["a"]), Some(12));
        assert_eq!(j_i64(&v, &["b"]), Some(12));
        assert_eq!(j_i64(&v, &["c"]), None);
        assert_eq!(j_str(&v, &["b"]), Some("12".into()));
        assert_eq!(j_str(&v, &["missing", "c"]), Some("texto".into()));
    }

    #[test]
    fn duration_parses_hms_and_seconds() {
        assert_eq!(parse_duration(&serde_json::json!({"duration": "01:30:00"})), Some(5400));
        assert_eq!(parse_duration(&serde_json::json!({"duration": "5400"})), Some(5400));
        assert_eq!(parse_duration(&serde_json::json!({"duration_secs": 60})), Some(60));
        assert_eq!(parse_duration(&serde_json::json!({"duration": "abc"})), None);
    }

    #[test]
    fn requires_credentials() {
        let http = reqwest::Client::new();
        assert!(CatalogApi::new("http://example.com", "", "", &http).is_err());
        assert!(CatalogApi::new("ftp://example.com", "u", "p", &http).is_err());
        assert!(CatalogApi::new("http://example.com:8080/some/path", "u", "p", &http).is_ok());
    }

    #[test]
    fn stream_urls_are_built_from_base() {
        let http = reqwest::Client::new();
        let api = CatalogApi::new("http://example.com:8080/ignored?x=1", "user", "pw", &http).unwrap();
        assert_eq!(api.live_url("9"), "http://example.com:8080/live/user/pw/9.m3u8");
        assert_eq!(api.movie_url("7", "mkv"), "http://example.com:8080/movie/user/pw/7.mkv");
        assert_eq!(api.episode_url("3", "mp4"), "http://example.com:8080/series/user/pw/3.mp4");
        assert!(api.xmltv_url().starts_with("http://example.com:8080/xmltv.php?"));
    }
}

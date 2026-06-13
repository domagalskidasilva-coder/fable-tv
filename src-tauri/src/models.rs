use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: i64,
    pub name: String,
    /// "m3u_url" | "m3u_file" | "xc_api"
    pub kind: String,
    pub url: String,
    pub username: Option<String>,
    pub has_password: bool,
    pub epg_url: Option<String>,
    pub sync_channels: bool,
    pub sync_movies: bool,
    pub sync_series: bool,
    pub sync_epg: bool,
    pub sync_logos: bool,
    pub created_at: i64,
    pub last_sync_at: Option<i64>,
    pub last_sync_status: Option<String>,
    pub channel_count: i64,
    pub movie_count: i64,
    pub series_count: i64,
    pub epg_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewSource {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub epg_url: Option<String>,
    pub sync_channels: bool,
    pub sync_movies: bool,
    pub sync_series: bool,
    pub sync_epg: bool,
    pub sync_logos: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOptions {
    pub channels: bool,
    pub movies: bool,
    pub series: bool,
    pub epg: bool,
    pub logos: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    pub job_id: u64,
    pub source_id: i64,
    /// "download" | "parse" | "channels" | "movies" | "series" | "epg" | "logos" | "done" | "error" | "cancelled"
    pub phase: String,
    pub processed: i64,
    pub total: Option<i64>,
    pub message: Option<String>,
    pub finished: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveJob {
    pub job_id: u64,
    pub source_id: i64,
}

/// Unified item used by home rows, favorites, history, search and grids.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCard {
    pub item_type: String,
    pub id: i64,
    pub name: String,
    pub image: Option<String>,
    pub subtitle: Option<String>,
    pub source_id: i64,
    pub favorite: bool,
    pub position_secs: Option<f64>,
    pub duration_secs: Option<f64>,
    pub series_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CatalogFilter {
    pub source_id: Option<i64>,
    pub category_id: Option<i64>,
    pub search: Option<String>,
    pub favorites_only: bool,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub source_id: i64,
    pub kind: String,
    pub name: String,
    pub item_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetail {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub cover: Option<String>,
    pub plot: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<String>,
    pub genre: Option<String>,
    pub favorite: bool,
    pub seasons: Vec<Season>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub season: i64,
    pub episodes: Vec<EpisodeOut>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeOut {
    pub id: i64,
    pub series_id: i64,
    pub season: i64,
    pub episode_num: i64,
    pub name: String,
    pub duration_secs: Option<i64>,
    pub plot: Option<String>,
    pub position_secs: Option<f64>,
    pub watched_duration_secs: Option<f64>,
    pub completed: bool,
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieDetail {
    pub id: i64,
    pub source_id: i64,
    pub name: String,
    pub image: Option<String>,
    pub year: Option<i64>,
    pub duration_secs: Option<i64>,
    pub rating: Option<String>,
    pub plot: Option<String>,
    pub genre: Option<String>,
    pub favorite: bool,
    pub position_secs: Option<f64>,
    pub watched_duration_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub url: String,
    /// "hls" | "direct"
    pub kind: String,
    pub item_type: String,
    pub item_id: i64,
    pub name: String,
    pub image: Option<String>,
    pub subtitle: Option<String>,
    pub position_secs: Option<f64>,
    pub series_id: Option<i64>,
    pub next_episode_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpgEntry {
    pub title: String,
    pub description: Option<String>,
    pub start_ts: i64,
    pub stop_ts: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowNext {
    pub channel_id: i64,
    pub now: Option<EpgEntry>,
    pub next: Option<EpgEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpgSearchHit {
    pub title: String,
    pub start_ts: i64,
    pub stop_ts: i64,
    pub channel_id: Option<i64>,
    pub channel_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub query: String,
    pub channels: Vec<MediaCard>,
    pub movies: Vec<MediaCard>,
    pub series: Vec<MediaCard>,
    pub episodes: Vec<MediaCard>,
    pub categories: Vec<Category>,
    pub epg: Vec<EpgSearchHit>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub last_sync_at: Option<i64>,
    pub last_sync_status: Option<String>,
    pub channel_count: i64,
    pub movie_count: i64,
    pub series_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeData {
    pub continue_watching: Vec<MediaCard>,
    pub favorites: Vec<MediaCard>,
    pub recent_channels: Vec<MediaCard>,
    pub latest_movies: Vec<MediaCard>,
    pub latest_series: Vec<MediaCard>,
    pub live_categories: Vec<Category>,
    pub sources: Vec<SourceStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub card: MediaCard,
    pub updated_at: i64,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStats {
    pub db_size_bytes: i64,
    pub logo_cache_bytes: i64,
    pub channel_count: i64,
    pub movie_count: i64,
    pub series_count: i64,
    pub episode_count: i64,
    pub epg_count: i64,
    pub history_count: i64,
    pub favorite_count: i64,
}

pub type Settings = HashMap<String, String>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub version: u32,
    pub exported_at: i64,
    pub sources: Vec<ExportSource>,
    pub settings: HashMap<String, String>,
    pub favorites: Vec<ExportFavorite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSource {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub epg_url: Option<String>,
    pub sync_channels: bool,
    pub sync_movies: bool,
    pub sync_series: bool,
    pub sync_epg: bool,
    pub sync_logos: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFavorite {
    pub item_type: String,
    pub name: String,
    pub stream_url: Option<String>,
    pub external_id: Option<String>,
    pub source_url: String,
}

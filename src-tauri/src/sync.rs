//! Synchronization engine. Each sync is an async job that reports progress
//! through the `sync://progress` event and can be cancelled at any chunk
//! boundary. "Sync" means caching catalogs/metadata in SQLite — media is
//! never downloaded.

use crate::catalog_api::CatalogApi;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::m3u::{self, ItemKind};
use crate::models::{SyncOptions, SyncProgress};
use crate::repo::{catalog, epg as epg_repo, settings, sources};
use crate::util::{normalize_text, sniff_image_ext, stable_hash};
use futures_util::StreamExt;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

const CHUNK: usize = 1000;
const MAX_PLAYLIST_BYTES: u64 = 512 * 1024 * 1024;
const MAX_EPG_BYTES: u64 = 256 * 1024 * 1024;
const MAX_LOGO_BYTES: usize = 2 * 1024 * 1024;
const LOGO_CONCURRENCY: usize = 6;

#[derive(Default)]
pub struct Jobs {
    next_id: AtomicU64,
    map: Mutex<HashMap<u64, (i64, Arc<AtomicBool>)>>,
}

impl Jobs {
    pub fn start(&self, source_id: i64) -> AppResult<(u64, Arc<AtomicBool>)> {
        let mut map = self.map.lock().unwrap();
        if map.values().any(|(sid, _)| *sid == source_id) {
            return Err(AppError::Invalid(
                "já existe uma sincronização em andamento para esta fonte".into(),
            ));
        }
        let id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(id, (source_id, flag.clone()));
        Ok((id, flag))
    }

    pub fn cancel(&self, job_id: u64) -> bool {
        let map = self.map.lock().unwrap();
        match map.get(&job_id) {
            Some((_, flag)) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    pub fn finish(&self, job_id: u64) {
        self.map.lock().unwrap().remove(&job_id);
    }

    pub fn active(&self) -> Vec<crate::models::ActiveJob> {
        self.map
            .lock()
            .unwrap()
            .iter()
            .map(|(job_id, (source_id, _))| crate::models::ActiveJob {
                job_id: *job_id,
                source_id: *source_id,
            })
            .collect()
    }
}

pub struct SyncContext {
    pub app: AppHandle,
    pub db: Arc<Db>,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
    pub job_id: u64,
    pub source_id: i64,
    pub cancel: Arc<AtomicBool>,
}

impl SyncContext {
    fn emit(&self, phase: &str, processed: i64, total: Option<i64>, message: Option<String>, finished: bool) {
        let _ = self.app.emit(
            "sync://progress",
            SyncProgress {
                job_id: self.job_id,
                source_id: self.source_id,
                phase: phase.to_string(),
                processed,
                total,
                message,
                finished,
            },
        );
    }

    fn check_cancel(&self) -> AppResult<()> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

/// Entry point: spawns the job and returns immediately.
pub fn spawn_sync(app: AppHandle, source_id: i64, opts: SyncOptions) -> AppResult<u64> {
    let state = app.state::<crate::AppState>();
    let (job_id, cancel) = state.jobs.start(source_id)?;
    let ctx = SyncContext {
        app: app.clone(),
        db: state.db.clone(),
        http: state.http.clone(),
        cache_dir: state.cache_dir.clone(),
        job_id,
        source_id,
        cancel,
    };
    tauri::async_runtime::spawn(async move {
        let result = run_sync(&ctx, opts).await;
        let jobs = &ctx.app.state::<crate::AppState>().jobs;
        jobs.finish(ctx.job_id);
        match result {
            Ok(summary) => {
                let _ = ctx
                    .db
                    .write_async({
                        let summary = summary.clone();
                        let sid = ctx.source_id;
                        move |c| sources::set_sync_status(c, sid, &format!("ok: {summary}"), true)
                    })
                    .await;
                ctx.emit("done", 0, None, Some(summary), true);
            }
            Err(AppError::Cancelled) => {
                let sid = ctx.source_id;
                let _ = ctx
                    .db
                    .write_async(move |c| sources::set_sync_status(c, sid, "cancelada", false))
                    .await;
                ctx.emit("cancelled", 0, None, None, true);
            }
            Err(e) => {
                let msg = e.to_string();
                let sid = ctx.source_id;
                let _ = ctx
                    .db
                    .write_async({
                        let msg = msg.clone();
                        move |c| sources::set_sync_status(c, sid, &format!("erro: {msg}"), false)
                    })
                    .await;
                ctx.emit("error", 0, None, Some(msg), true);
            }
        }
    });
    Ok(job_id)
}

async fn run_sync(ctx: &SyncContext, opts: SyncOptions) -> AppResult<String> {
    let sid = ctx.source_id;
    let source = ctx.db.read_async(move |c| sources::get_row(c, sid)).await?;
    let token = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_else(crate::util::now_ts);

    let mut parts: Vec<String> = Vec::new();
    match source.kind.as_str() {
        "m3u_url" | "m3u_file" => {
            let summary = sync_m3u(ctx, &source, token, opts).await?;
            parts.extend(summary);
        }
        "xc_api" => {
            let summary = sync_catalog_api(ctx, &source, token, opts).await?;
            parts.extend(summary);
        }
        other => return Err(AppError::Invalid(format!("tipo de fonte desconhecido: {other}"))),
    }

    if opts.epg {
        let count = sync_epg(ctx, &source).await?;
        parts.push(format!("{count} programas de EPG"));
    }
    if opts.logos {
        let count = sync_logos(ctx).await?;
        parts.push(format!("{count} logos"));
    }
    if parts.is_empty() {
        parts.push("nada selecionado".into());
    }
    Ok(parts.join(", "))
}

// ---------------------------------------------------------------------------
// M3U source
// ---------------------------------------------------------------------------

/// In-memory catalog produced by parsing+classifying a playlist.
pub struct CatalogBatch {
    pub tvg_url: Option<String>,
    pub channels: Vec<catalog::ChannelRec>,
    pub movies: Vec<catalog::MovieRec>,
    pub series: Vec<catalog::SeriesRec>,
}

/// Converts a parsed playlist into typed catalog records. Pure function,
/// exercised directly by tests.
pub fn build_catalog(playlist: m3u::M3uPlaylist) -> CatalogBatch {
    let mut channels = Vec::new();
    let mut movies = Vec::new();
    let mut series_map: HashMap<String, catalog::SeriesRec> = HashMap::new();
    let mut series_order: Vec<String> = Vec::new();

    for (i, entry) in playlist.entries.iter().enumerate() {
        let extra_json = if entry.attrs.is_empty() {
            None
        } else {
            serde_json::to_string(&entry.attrs).ok()
        };
        match m3u::classify(entry) {
            ItemKind::Episode { series, season, episode } => {
                let key = format!("m3u:{}", normalize_text(&series));
                let rec = series_map.entry(key.clone()).or_insert_with(|| {
                    series_order.push(key.clone());
                    catalog::SeriesRec {
                        external_id: key.clone(),
                        name: series.clone(),
                        cover_url: entry.logo().map(String::from),
                        plot: None,
                        year: crate::util::extract_year(&series),
                        rating: None,
                        genre: None,
                        category_key: entry.group.clone(),
                        episodes_synced: true,
                        episodes: Vec::new(),
                    }
                });
                if rec.cover_url.is_none() {
                    rec.cover_url = entry.logo().map(String::from);
                }
                rec.episodes.push(catalog::EpisodeRec {
                    season: season as i64,
                    episode_num: episode as i64,
                    name: entry.name.clone(),
                    stream_url: entry.url.clone(),
                    duration_secs: (entry.duration > 0.0).then(|| entry.duration as i64),
                    plot: None,
                });
            }
            ItemKind::Movie => movies.push(catalog::MovieRec {
                external_id: None,
                name: entry.name.clone(),
                logo_url: entry.logo().map(String::from),
                stream_url: entry.url.clone(),
                year: crate::util::extract_year(&entry.name),
                duration_secs: (entry.duration > 0.0).then(|| entry.duration as i64),
                rating: None,
                plot: None,
                genre: entry.group.clone(),
                extra_json,
                category_key: entry.group.clone(),
            }),
            // Unknown entries are kept as live channels so nothing the user
            // imported silently disappears.
            ItemKind::Live | ItemKind::Unknown => channels.push(catalog::ChannelRec {
                external_id: None,
                name: entry.name.clone(),
                logo_url: entry.logo().map(String::from),
                stream_url: entry.url.clone(),
                tvg_id: entry.tvg_id().map(String::from),
                tvg_name: entry.tvg_name().map(String::from),
                group_title: entry.group.clone(),
                extra_json,
                position: i as i64,
                category_key: entry.group.clone(),
            }),
        }
    }

    let series = series_order
        .into_iter()
        .filter_map(|k| series_map.remove(&k))
        .collect();
    CatalogBatch {
        tvg_url: playlist.tvg_url,
        channels,
        movies,
        series,
    }
}

async fn sync_m3u(
    ctx: &SyncContext,
    source: &sources::SourceRow,
    token: i64,
    opts: SyncOptions,
) -> AppResult<Vec<String>> {
    ctx.emit("download", 0, None, None, false);
    let content: String = match source.kind.as_str() {
        "m3u_file" => {
            let path = crate::security::validate_local_file(&source.url, &["m3u", "m3u8", "txt"])?;
            let bytes = tokio::fs::read(path).await?;
            String::from_utf8_lossy(&bytes).into_owned()
        }
        _ => {
            crate::security::validate_http_url(&source.url)?;
            download_with_progress(ctx, &source.url, MAX_PLAYLIST_BYTES, "download").await?
        }
    };
    ctx.check_cancel()?;

    ctx.emit("parse", 0, None, None, false);
    let batch = tauri::async_runtime::spawn_blocking(move || {
        build_catalog(m3u::parse_m3u(&content))
    })
    .await
    .map_err(|e| AppError::Other(format!("falha ao processar a lista: {e}")))?;
    ctx.check_cancel()?;

    if let Some(tvg) = &batch.tvg_url {
        if crate::security::validate_http_url(tvg).is_ok() {
            let (sid, tvg) = (ctx.source_id, tvg.clone());
            ctx.db
                .write_async(move |c| sources::set_epg_url_if_empty(c, sid, &tvg))
                .await?;
        }
    }

    let mut parts = Vec::new();
    let sid = ctx.source_id;

    if opts.channels {
        let cat_keys: Vec<(String, String)> = unique_keys(batch.channels.iter().filter_map(|c| c.category_key.clone()));
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "live", &cat_keys))
            .await?;
        let total = batch.channels.len() as i64;
        let mut processed = 0i64;
        for chunk in batch.channels.chunks(CHUNK) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_channels(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("channels", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "channels", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} canais"));
    }

    if opts.movies {
        let cat_keys: Vec<(String, String)> = unique_keys(batch.movies.iter().filter_map(|m| m.category_key.clone()));
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "movie", &cat_keys))
            .await?;
        let total = batch.movies.len() as i64;
        let mut processed = 0i64;
        for chunk in batch.movies.chunks(CHUNK) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_movies(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("movies", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "movies", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} filmes"));
    }

    if opts.series {
        let cat_keys: Vec<(String, String)> = unique_keys(batch.series.iter().filter_map(|s| s.category_key.clone()));
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "series", &cat_keys))
            .await?;
        let total = batch.series.len() as i64;
        let mut processed = 0i64;
        for chunk in batch.series.chunks(200) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_series(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("series", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "series", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} séries"));
    }

    Ok(parts)
}

fn unique_keys(iter: impl Iterator<Item = String>) -> Vec<(String, String)> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for key in iter {
        if seen.insert(key.clone()) {
            out.push((key.clone(), key));
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Separated-catalog API source
// ---------------------------------------------------------------------------

async fn sync_catalog_api(
    ctx: &SyncContext,
    source: &sources::SourceRow,
    token: i64,
    opts: SyncOptions,
) -> AppResult<Vec<String>> {
    let api = CatalogApi::new(
        &source.url,
        source.username.as_deref().unwrap_or(""),
        source.password.as_deref().unwrap_or(""),
        &ctx.http,
    )?;
    api.handshake().await?;
    let sid = ctx.source_id;
    let mut parts = Vec::new();

    if opts.channels {
        ctx.emit("channels", 0, None, None, false);
        let cats = api.live_categories().await.unwrap_or_default();
        let streams = api.live_streams().await?;
        ctx.check_cancel()?;
        let cat_items: Vec<(String, String)> =
            cats.iter().map(|c| (c.id.clone(), c.name.clone())).collect();
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "live", &cat_items))
            .await?;
        let cat_names: HashMap<String, String> =
            cats.into_iter().map(|c| (c.id, c.name)).collect();
        let recs: Vec<catalog::ChannelRec> = streams
            .iter()
            .map(|s| catalog::ChannelRec {
                external_id: Some(s.id.to_string()),
                name: s.name.clone(),
                logo_url: s.logo.clone(),
                stream_url: api.live_url(&s.id.to_string()),
                tvg_id: s.epg_channel_id.clone(),
                tvg_name: None,
                group_title: s.category_id.as_ref().and_then(|c| cat_names.get(c).cloned()),
                extra_json: None,
                position: s.position,
                category_key: s.category_id.clone(),
            })
            .collect();
        let total = recs.len() as i64;
        let mut processed = 0i64;
        for chunk in recs.chunks(CHUNK) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_channels(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("channels", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "channels", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} canais"));
    }

    if opts.movies {
        ctx.emit("movies", 0, None, None, false);
        let cats = api.vod_categories().await.unwrap_or_default();
        let vods = api.vod_streams().await?;
        ctx.check_cancel()?;
        let cat_items: Vec<(String, String)> =
            cats.iter().map(|c| (c.id.clone(), c.name.clone())).collect();
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "movie", &cat_items))
            .await?;
        let recs: Vec<catalog::MovieRec> = vods
            .iter()
            .map(|v| catalog::MovieRec {
                external_id: Some(v.id.to_string()),
                name: v.name.clone(),
                logo_url: v.icon.clone(),
                stream_url: api.movie_url(&v.id.to_string(), &v.extension),
                year: v.year,
                duration_secs: v.duration_secs,
                rating: v.rating.clone(),
                plot: v.plot.clone(),
                genre: v.genre.clone(),
                extra_json: None,
                category_key: v.category_id.clone(),
            })
            .collect();
        let total = recs.len() as i64;
        let mut processed = 0i64;
        for chunk in recs.chunks(CHUNK) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_movies(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("movies", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "movies", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} filmes"));
    }

    if opts.series {
        ctx.emit("series", 0, None, None, false);
        let cats = api.series_categories().await.unwrap_or_default();
        let list = api.series_list().await?;
        ctx.check_cancel()?;
        let cat_items: Vec<(String, String)> =
            cats.iter().map(|c| (c.id.clone(), c.name.clone())).collect();
        let cat_map = ctx
            .db
            .write_async(move |c| catalog::upsert_categories(c, sid, "series", &cat_items))
            .await?;
        // Episodes are fetched on demand (lightweight by design); only the
        // series catalog is cached here.
        let recs: Vec<catalog::SeriesRec> = list
            .iter()
            .map(|s| catalog::SeriesRec {
                external_id: s.id.to_string(),
                name: s.name.clone(),
                cover_url: s.cover.clone(),
                plot: s.plot.clone(),
                year: s.year,
                rating: s.rating.clone(),
                genre: s.genre.clone(),
                category_key: s.category_id.clone(),
                episodes_synced: false,
                episodes: Vec::new(),
            })
            .collect();
        let total = recs.len() as i64;
        let mut processed = 0i64;
        for chunk in recs.chunks(500) {
            ctx.check_cancel()?;
            let (chunk_vec, map) = (chunk.to_vec(), cat_map.clone());
            ctx.db
                .write_async(move |c| catalog::upsert_series(c, sid, token, &chunk_vec, &map))
                .await?;
            processed += chunk.len() as i64;
            ctx.emit("series", processed, Some(total), None, false);
        }
        ctx.db
            .write_async(move |c| catalog::delete_stale(c, "series", sid, token).map(|_| ()))
            .await?;
        parts.push(format!("{total} séries"));
    }

    Ok(parts)
}

/// Fetches and caches episodes for one series on demand (used by the series
/// detail screen for API sources).
pub async fn fetch_series_episodes(
    db: &Arc<Db>,
    http: &reqwest::Client,
    series_id: i64,
) -> AppResult<()> {
    let (source_id, external_id) = db
        .read_async(move |c| {
            Ok(c.query_row(
                "SELECT source_id, external_id FROM series WHERE id = ?1",
                rusqlite::params![series_id],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
            )?)
        })
        .await?;
    let source = db.read_async(move |c| sources::get_row(c, source_id)).await?;
    if source.kind != "xc_api" {
        return Ok(());
    }
    let api = CatalogApi::new(
        &source.url,
        source.username.as_deref().unwrap_or(""),
        source.password.as_deref().unwrap_or(""),
        http,
    )?;
    let ext_id: i64 = external_id
        .parse()
        .map_err(|_| AppError::Invalid("identificador de série inválido".into()))?;
    let episodes = api.series_episodes(ext_id).await?;
    let recs: Vec<(i64, i64, String, String, Option<i64>, Option<String>)> = episodes
        .iter()
        .map(|e| {
            (
                e.season,
                e.episode_num,
                e.title.clone(),
                api.episode_url(&e.id.to_string(), &e.extension),
                e.duration_secs,
                e.plot.clone(),
            )
        })
        .collect();
    db.write_async(move |c| {
        let tx = c.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO episodes (series_id, source_id, season, episode_num, name,
                    search_text, stream_url, duration_secs, plot, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(series_id, season, episode_num) DO UPDATE SET
                   name = excluded.name,
                   search_text = excluded.search_text,
                   stream_url = excluded.stream_url,
                   duration_secs = excluded.duration_secs,
                   plot = COALESCE(excluded.plot, episodes.plot)",
            )?;
            for (season, ep_num, name, url, dur, plot) in &recs {
                stmt.execute(rusqlite::params![
                    series_id,
                    source_id,
                    season,
                    ep_num,
                    name,
                    normalize_text(name),
                    url,
                    dur,
                    plot,
                    crate::util::now_ts(),
                ])?;
            }
        }
        tx.commit()?;
        catalog::mark_series_episodes_synced(c, series_id)
    })
    .await
}

// ---------------------------------------------------------------------------
// EPG
// ---------------------------------------------------------------------------

async fn sync_epg(ctx: &SyncContext, source: &sources::SourceRow) -> AppResult<usize> {
    ctx.emit("epg", 0, None, None, false);
    let sid = ctx.source_id;

    let epg_url = match source.kind.as_str() {
        "xc_api" => {
            let api = CatalogApi::new(
                &source.url,
                source.username.as_deref().unwrap_or(""),
                source.password.as_deref().unwrap_or(""),
                &ctx.http,
            )?;
            source
                .epg_url
                .clone()
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| api.xmltv_url())
        }
        _ => source
            .epg_url
            .clone()
            .filter(|u| !u.is_empty())
            .ok_or_else(|| {
                AppError::Invalid(
                    "esta fonte não tem URL de EPG (configure uma na edição da fonte)".into(),
                )
            })?,
    };
    crate::security::validate_http_url(&epg_url)?;

    let bytes = download_bytes(ctx, &epg_url, MAX_EPG_BYTES, "epg").await?;
    ctx.check_cancel()?;

    // Only keep programs for channels of this source, within the window.
    let keep: std::collections::HashSet<String> = ctx
        .db
        .read_async(move |c| {
            let mut stmt = c.prepare(
                "SELECT DISTINCT LOWER(tvg_id) FROM channels
                 WHERE source_id = ?1 AND tvg_id IS NOT NULL AND tvg_id != ''",
            )?;
            let rows = stmt
                .query_map(rusqlite::params![sid], |r| r.get::<_, String>(0))?
                .collect::<Result<std::collections::HashSet<_>, _>>()?;
            Ok(rows)
        })
        .await?;

    let (lightweight, epg_days) = ctx
        .db
        .read_async(|c| {
            Ok((
                settings::get_bool(c, "lightweight", false),
                settings::get_i64(c, "epg_days", 2),
            ))
        })
        .await?;
    let days = if lightweight { epg_days.min(1) } else { epg_days }.clamp(1, 14);
    let now = crate::util::now_ts();
    let (min_ts, max_ts) = (now - 6 * 3600, now + days * 86_400);

    let keep_for_parse = (!keep.is_empty()).then_some(keep);
    let programs = tauri::async_runtime::spawn_blocking(move || {
        crate::epg::parse_xmltv(&bytes, keep_for_parse.as_ref(), min_ts, max_ts)
    })
    .await
    .map_err(|e| AppError::Other(format!("falha ao processar EPG: {e}")))??;
    ctx.check_cancel()?;

    let total = programs.len();
    ctx.emit("epg", 0, Some(total as i64), None, false);
    ctx.db
        .write_async(move |c| {
            epg_repo::replace_for_source(c, sid, &programs)?;
            // Old programs from any source are dropped to keep the cache lean.
            epg_repo::prune_old(c, 6 * 3600)?;
            Ok(())
        })
        .await?;
    ctx.emit("epg", total as i64, Some(total as i64), None, false);
    Ok(total)
}

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------

async fn sync_logos(ctx: &SyncContext) -> AppResult<usize> {
    let sid = ctx.source_id;
    let limit = ctx
        .db
        .read_async(|c| {
            let lightweight = settings::get_bool(c, "lightweight", false);
            Ok(if lightweight {
                settings::get_i64(c, "logo_limit_lightweight", 300)
            } else {
                settings::get_i64(c, "logo_limit", 5000)
            })
        })
        .await?;
    let targets = ctx
        .db
        .read_async(move |c| catalog::logos_to_fetch(c, sid, limit))
        .await?;
    let total = targets.len() as i64;
    ctx.emit("logos", 0, Some(total), None, false);

    let logo_dir = ctx.cache_dir.join("logos");
    tokio::fs::create_dir_all(&logo_dir).await?;

    let http = ctx.http.clone();
    let dir = logo_dir.clone();
    let mut done = 0i64;
    let mut updates: Vec<(String, i64, String)> = Vec::new();

    let mut stream = futures_util::stream::iter(targets.into_iter().map(|(table, id, url)| {
        let http = http.clone();
        let dir = dir.clone();
        async move {
            let path = fetch_logo(&http, &dir, &url).await;
            (table, id, path)
        }
    }))
    .buffer_unordered(LOGO_CONCURRENCY);

    while let Some((table, id, path)) = stream.next().await {
        ctx.check_cancel()?;
        done += 1;
        if let Some(path) = path {
            updates.push((table, id, path));
        }
        if updates.len() >= 100 {
            let batch = std::mem::take(&mut updates);
            ctx.db
                .write_async(move |c| {
                    for (table, id, path) in &batch {
                        catalog::set_logo_path(c, table, *id, path)?;
                    }
                    Ok(())
                })
                .await?;
            ctx.emit("logos", done, Some(total), None, false);
        }
    }
    drop(stream);
    let fetched = done as usize;
    if !updates.is_empty() {
        ctx.db
            .write_async(move |c| {
                for (table, id, path) in &updates {
                    catalog::set_logo_path(c, table, *id, path)?;
                }
                Ok(())
            })
            .await?;
    }
    ctx.emit("logos", done, Some(total), None, false);
    Ok(fetched)
}

async fn fetch_logo(http: &reqwest::Client, dir: &std::path::Path, url: &str) -> Option<String> {
    if crate::security::validate_http_url(url).is_err() {
        return None;
    }
    let resp = http.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    if bytes.is_empty() || bytes.len() > MAX_LOGO_BYTES {
        return None;
    }
    let ext = sniff_image_ext(&bytes);
    let file = dir.join(format!("{}.{}", stable_hash(url), ext));
    tokio::fs::write(&file, &bytes).await.ok()?;
    Some(file.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

async fn download_bytes(
    ctx: &SyncContext,
    url: &str,
    max_bytes: u64,
    phase: &str,
) -> AppResult<Vec<u8>> {
    let resp = ctx.http.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Other(format!(
            "o servidor respondeu com status {}",
            resp.status()
        )));
    }
    let total = resp.content_length();
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut last_emit = 0u64;
    while let Some(chunk) = stream.next().await {
        ctx.check_cancel()?;
        let chunk = chunk?;
        buf.extend_from_slice(&chunk);
        let len = buf.len() as u64;
        if len > max_bytes {
            return Err(AppError::Other("arquivo grande demais".into()));
        }
        if len - last_emit > 512 * 1024 {
            last_emit = len;
            ctx.emit(phase, len as i64, total.map(|t| t as i64), None, false);
        }
    }
    Ok(buf)
}

async fn download_with_progress(
    ctx: &SyncContext,
    url: &str,
    max_bytes: u64,
    phase: &str,
) -> AppResult<String> {
    let bytes = download_bytes(ctx, url, max_bytes, phase).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::m3u::parse_m3u;

    #[test]
    fn build_catalog_splits_mixed_playlist() {
        let playlist = parse_m3u(
            r#"#EXTM3U
#EXTINF:-1 tvg-id="g.br" group-title="Canais",Globo
http://h/live/u/p/1.m3u8
#EXTINF:-1 group-title="Filmes",Matrix (1999)
http://h/movie/u/p/2.mp4
#EXTINF:-1 group-title="Séries",Dark S01E01
http://h/series/u/p/3.mp4
#EXTINF:-1 group-title="Séries",Dark S01E02
http://h/series/u/p/4.mp4
#EXTINF:-1 group-title="Séries",Dark S02E01
http://h/series/u/p/5.mp4
"#,
        );
        let batch = build_catalog(playlist);
        assert_eq!(batch.channels.len(), 1);
        assert_eq!(batch.movies.len(), 1);
        assert_eq!(batch.series.len(), 1);
        assert_eq!(batch.series[0].name, "Dark");
        assert_eq!(batch.series[0].episodes.len(), 3);
        assert_eq!(batch.movies[0].year, Some(1999));
        assert_eq!(batch.channels[0].tvg_id.as_deref(), Some("g.br"));
    }

    #[test]
    fn jobs_registry_prevents_concurrent_sync_of_same_source() {
        let jobs = Jobs::default();
        let (id1, flag) = jobs.start(7).unwrap();
        assert!(jobs.start(7).is_err(), "same source must be rejected");
        assert!(jobs.start(8).is_ok(), "other sources are fine");
        assert!(jobs.cancel(id1));
        assert!(flag.load(Ordering::SeqCst));
        jobs.finish(id1);
        assert!(jobs.start(7).is_ok(), "finished job frees the source");
        assert!(!jobs.cancel(999), "unknown job id");
    }
}

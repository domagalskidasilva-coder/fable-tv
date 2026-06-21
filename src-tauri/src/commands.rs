//! Tauri command surface. The frontend talks to the backend exclusively
//! through these commands (and listens to `sync://progress` events).

use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::repo::{
    catalog, epg as epg_repo, home, import_export, search, settings, sources, user_data,
};
use crate::AppState;
use tauri::State;

fn validate_new_source(s: &NewSource) -> AppResult<NewSource> {
    let mut out = s.clone();
    out.name = crate::security::sanitize_name(&s.name, "Minha fonte");
    match s.kind.as_str() {
        "m3u_url" => {
            crate::security::validate_http_url(&s.url)?;
        }
        "m3u_file" => {
            crate::security::validate_local_file(&s.url, &["m3u", "m3u8", "txt"])?;
        }
        "xc_api" => {
            crate::security::validate_http_url(&s.url)?;
            if s.username.as_deref().unwrap_or("").trim().is_empty()
                || s.password.as_deref().unwrap_or("").is_empty()
            {
                return Err(AppError::Invalid(
                    "fontes de catálogo separado exigem usuário e senha".into(),
                ));
            }
        }
        other => return Err(AppError::Invalid(format!("tipo de fonte inválido: {other}"))),
    }
    if let Some(epg) = s.epg_url.as_deref().filter(|u| !u.trim().is_empty()) {
        crate::security::validate_http_url(epg)?;
    } else {
        out.epg_url = None;
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/// Lists the playlists of one profile (defaults to the active profile).
#[tauri::command]
pub async fn list_sources(
    state: State<'_, AppState>,
    profile_id: Option<i64>,
) -> AppResult<Vec<Source>> {
    state
        .db
        .read_async(move |c| {
            let pid = profile_id.unwrap_or_else(|| settings::active_profile(c));
            sources::list_for_profile(c, pid)
        })
        .await
}

/// Adds a playlist to a profile (defaults to the active profile).
#[tauri::command]
pub async fn add_source(
    state: State<'_, AppState>,
    source: NewSource,
    profile_id: Option<i64>,
) -> AppResult<i64> {
    let source = validate_new_source(&source)?;
    state
        .db
        .write_async(move |c| {
            let pid = profile_id.unwrap_or_else(|| settings::active_profile(c));
            sources::add(c, pid, &source)
        })
        .await
}

#[tauri::command]
pub async fn update_source(
    state: State<'_, AppState>,
    id: i64,
    source: NewSource,
) -> AppResult<()> {
    let source = validate_new_source(&source)?;
    state
        .db
        .write_async(move |c| sources::update(c, id, &source))
        .await
}

#[tauri::command]
pub async fn delete_source(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.db.write_async(move |c| sources::delete(c, id)).await
}

/// Quick connectivity check before saving a source. Nothing is persisted.
#[tauri::command]
pub async fn test_source(state: State<'_, AppState>, source: NewSource) -> AppResult<String> {
    let source = validate_new_source(&source)?;
    match source.kind.as_str() {
        "m3u_file" => {
            let path = crate::security::validate_local_file(&source.url, &["m3u", "m3u8", "txt"])?;
            let mut head = vec![0u8; 1024];
            use tokio::io::AsyncReadExt;
            let mut file = tokio::fs::File::open(path).await?;
            let n = file.read(&mut head).await?;
            let text = String::from_utf8_lossy(&head[..n]);
            if text.trim_start().starts_with("#EXTM3U") {
                Ok("arquivo M3U válido".into())
            } else {
                Err(AppError::Invalid("o arquivo não parece ser uma lista M3U".into()))
            }
        }
        "xc_api" => {
            let api = crate::catalog_api::CatalogApi::new(
                &source.url,
                source.username.as_deref().unwrap_or(""),
                source.password.as_deref().unwrap_or(""),
                &state.http,
            )?;
            let status = api.handshake().await?;
            Ok(format!("conectado (status da conta: {status})"))
        }
        _ => {
            use futures_util::StreamExt;
            let resp = state.http.get(&source.url).send().await?;
            if !resp.status().is_success() {
                return Err(AppError::Other(format!(
                    "o servidor respondeu com status {}",
                    resp.status()
                )));
            }
            let mut stream = resp.bytes_stream();
            let first = stream
                .next()
                .await
                .ok_or_else(|| AppError::Other("resposta vazia do servidor".into()))??;
            let text = String::from_utf8_lossy(&first);
            if text.trim_start().starts_with("#EXTM3U") {
                Ok("lista M3U acessível".into())
            } else {
                Err(AppError::Invalid(
                    "a URL respondeu, mas o conteúdo não parece ser uma lista M3U".into(),
                ))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_sync(
    app: tauri::AppHandle,
    source_id: i64,
    options: SyncOptions,
) -> AppResult<u64> {
    crate::sync::spawn_sync(app, source_id, options)
}

#[tauri::command]
pub fn cancel_sync(state: State<'_, AppState>, job_id: u64) -> bool {
    state.jobs.cancel(job_id)
}

#[tauri::command]
pub fn list_active_jobs(state: State<'_, AppState>) -> Vec<ActiveJob> {
    state.jobs.active()
}

// ---------------------------------------------------------------------------
// Catalog browsing
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_categories(state: State<'_, AppState>, kind: String) -> AppResult<Vec<Category>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            catalog::list_categories_filtered(c, &kind, Some(profile), block_adult)
        })
        .await
}

#[tauri::command]
pub async fn list_channels(
    state: State<'_, AppState>,
    mut filter: CatalogFilter,
) -> AppResult<Paged<MediaCard>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            filter.profile_id = Some(profile);
            catalog::list_channels_filtered(c, profile, &filter, block_adult)
        })
        .await
}

#[tauri::command]
pub async fn list_movies(
    state: State<'_, AppState>,
    mut filter: CatalogFilter,
) -> AppResult<Paged<MediaCard>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            filter.profile_id = Some(profile);
            catalog::list_movies_filtered(c, profile, &filter, block_adult)
        })
        .await
}

#[tauri::command]
pub async fn list_series(
    state: State<'_, AppState>,
    mut filter: CatalogFilter,
) -> AppResult<Paged<MediaCard>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            filter.profile_id = Some(profile);
            catalog::list_series_filtered(c, profile, &filter, block_adult)
        })
        .await
}

/// Movie detail; for API sources the full metadata (cast/director/backdrop)
/// is fetched and cached on demand the first time the user opens the movie.
#[tauri::command]
pub async fn get_movie_detail(state: State<'_, AppState>, id: i64) -> AppResult<MovieDetail> {
    let synced: bool = state
        .db
        .read_async(move |c| {
            if settings::get_bool(c, "block_adult_content", false)
                && catalog::is_adult_item(c, "movie", id)?
            {
                return Err(AppError::Invalid(catalog::ADULT_BLOCKED_MESSAGE.into()));
            }
            Ok(c.query_row(
                "SELECT info_synced FROM movies WHERE id = ?1",
                rusqlite::params![id],
                |r| r.get::<_, i64>(0),
            )? != 0)
        })
        .await?;
    if !synced {
        crate::sync::fetch_movie_info(&state.db, &state.http, id).await?;
    }
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            catalog::movie_detail(c, profile, id)
        })
        .await
}

/// Series detail; for API sources the episode list is fetched and cached on
/// demand the first time the user opens the series.
#[tauri::command]
pub async fn get_series_detail(state: State<'_, AppState>, id: i64) -> AppResult<SeriesDetail> {
    let synced: bool = state
        .db
        .read_async(move |c| {
            if settings::get_bool(c, "block_adult_content", false)
                && catalog::is_adult_item(c, "series", id)?
            {
                return Err(AppError::Invalid(catalog::ADULT_BLOCKED_MESSAGE.into()));
            }
            Ok(c.query_row(
                "SELECT episodes_synced FROM series WHERE id = ?1",
                rusqlite::params![id],
                |r| r.get::<_, i64>(0),
            )? != 0)
        })
        .await?;
    if !synced {
        crate::sync::fetch_series_episodes(&state.db, &state.http, id).await?;
    }
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            catalog::series_detail(c, profile, id)
        })
        .await
}

/// Resolves the playable URL for an item. Built in Rust so credentials are
/// never assembled in the frontend.
#[tauri::command]
pub async fn resolve_stream(
    state: State<'_, AppState>,
    item_type: String,
    item_id: i64,
) -> AppResult<StreamInfo> {
    crate::security::validate_item_type(&item_type)?;
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            if settings::get_bool(c, "block_adult_content", false)
                && catalog::is_adult_item(c, &item_type, item_id)?
            {
                return Err(AppError::Invalid(catalog::ADULT_BLOCKED_MESSAGE.into()));
            }
            let row = catalog::playable_row(c, &item_type, item_id)?;
            let remember = settings::get_bool(c, "player_remember_position", true);
            let position_secs = if remember && item_type != "channel" {
                c.query_row(
                    "SELECT position_secs FROM history
                     WHERE profile_id = ?1 AND item_type = ?2 AND item_id = ?3 AND completed = 0",
                    rusqlite::params![profile, item_type, item_id],
                    |r| r.get::<_, f64>(0),
                )
                .ok()
                .filter(|p| *p > 10.0)
            } else {
                None
            };
            let next_episode_id = if item_type == "episode" {
                catalog::next_episode_id(c, item_id)?
            } else {
                None
            };
            let lower = row.stream_url.to_ascii_lowercase();
            let kind = if lower.contains(".m3u8") { "hls" } else { "direct" };
            Ok(StreamInfo {
                url: row.stream_url,
                kind: kind.into(),
                item_type,
                item_id,
                name: row.name,
                image: row.image,
                subtitle: row.subtitle,
                position_secs,
                series_id: row.series_id,
                next_episode_id,
            })
        })
        .await
}

// ---------------------------------------------------------------------------
// EPG
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn epg_now_next(
    state: State<'_, AppState>,
    channel_ids: Vec<i64>,
) -> AppResult<Vec<NowNext>> {
    state
        .db
        .read_async(move |c| epg_repo::now_next(c, &channel_ids))
        .await
}

#[tauri::command]
pub async fn epg_for_channel(
    state: State<'_, AppState>,
    channel_id: i64,
    from_ts: i64,
    to_ts: i64,
) -> AppResult<Vec<EpgEntry>> {
    state
        .db
        .read_async(move |c| epg_repo::for_channel(c, channel_id, from_ts, to_ts))
        .await
}

// ---------------------------------------------------------------------------
// Favorites & history
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn toggle_favorite(
    state: State<'_, AppState>,
    item_type: String,
    item_id: i64,
) -> AppResult<bool> {
    state
        .db
        .write_async(move |c| {
            let profile = settings::active_profile(c);
            if settings::get_bool(c, "block_adult_content", false)
                && catalog::is_adult_item(c, &item_type, item_id)?
            {
                return Err(AppError::Invalid(catalog::ADULT_BLOCKED_MESSAGE.into()));
            }
            user_data::toggle_favorite(c, profile, &item_type, item_id)
        })
        .await
}

#[tauri::command]
pub async fn list_favorites(
    state: State<'_, AppState>,
    item_type: Option<String>,
    limit: Option<usize>,
) -> AppResult<Vec<MediaCard>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            user_data::list_favorites_filtered(c, profile, item_type.as_deref(), limit, block_adult)
        })
        .await
}

#[tauri::command]
pub async fn report_playback(
    state: State<'_, AppState>,
    item_type: String,
    item_id: i64,
    position_secs: f64,
    duration_secs: f64,
) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            if !settings::get_bool(c, "history_enabled", true) {
                return Ok(());
            }
            let profile = settings::active_profile(c);
            user_data::report_playback(c, profile, &item_type, item_id, position_secs, duration_secs)
        })
        .await
}

#[tauri::command]
pub async fn list_history(
    state: State<'_, AppState>,
    item_type: Option<String>,
    limit: i64,
    offset: i64,
) -> AppResult<Vec<HistoryEntry>> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            user_data::list_history_filtered(
                c,
                profile,
                item_type.as_deref(),
                limit,
                offset,
                block_adult,
            )
        })
        .await
}

#[tauri::command]
pub async fn delete_history_entry(
    state: State<'_, AppState>,
    item_type: String,
    item_id: i64,
) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            let profile = settings::active_profile(c);
            user_data::delete_history_entry(c, profile, &item_type, item_id)
        })
        .await
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            let profile = settings::active_profile(c);
            user_data::clear_history(c, profile)
        })
        .await
}

// ---------------------------------------------------------------------------
// Home & search
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_home_data(state: State<'_, AppState>) -> AppResult<HomeData> {
    state
        .db
        .read_async(|c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            home::get_home_data(c, profile, block_adult)
        })
        .await
}

#[tauri::command]
pub async fn global_search(state: State<'_, AppState>, query: String) -> AppResult<SearchResults> {
    state
        .db
        .read_async(move |c| {
            let profile = settings::active_profile(c);
            let block_adult = settings::get_bool(c, "block_adult_content", false);
            search::global_search(c, profile, &query, block_adult)
        })
        .await
}

// ---------------------------------------------------------------------------
// Settings & profiles
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    state.db.read_async(settings::get_all).await
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> AppResult<()> {
    state
        .db
        .write_async(move |c| settings::set(c, &key, &value))
        .await
}

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> AppResult<Vec<Profile>> {
    state
        .db
        .read_async(|c| {
            let active = settings::active_profile(c);
            user_data::list_profiles(c, active)
        })
        .await
}

#[tauri::command]
pub async fn create_profile(state: State<'_, AppState>, profile: NewProfile) -> AppResult<i64> {
    state
        .db
        .write_async(move |c| {
            let id = user_data::create_profile(
                c,
                &profile.name,
                profile.color.as_deref(),
                profile.image.as_deref(),
            )?;
            // On a clean first run there are no profiles yet; the first one
            // created becomes the active profile so the app enters it directly.
            let count: i64 = c.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
            if count == 1 {
                settings::set(c, "active_profile", &id.to_string())?;
            }
            Ok(id)
        })
        .await
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    id: i64,
    profile: NewProfile,
) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            user_data::update_profile(c, id, &profile.name, profile.color.as_deref(), profile.image.as_deref())
        })
        .await
}

/// Copies a user-chosen image into the app cache and returns the stored path,
/// used as a custom profile avatar. Validates it is a real image first.
#[tauri::command]
pub async fn import_profile_image(state: State<'_, AppState>, path: String) -> AppResult<String> {
    let src = crate::security::validate_local_file(&path, &["png", "jpg", "jpeg", "webp", "gif"])?;
    let bytes = tokio::fs::read(&src).await?;
    if bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 {
        return Err(AppError::Invalid("imagem inválida ou grande demais (máx. 8 MB)".into()));
    }
    let ext = crate::util::sniff_image_ext(&bytes);
    let dir = state.cache_dir.join("avatars");
    tokio::fs::create_dir_all(&dir).await?;
    let dest = dir.join(format!("{}.{}", crate::util::stable_hash(&path), ext));
    tokio::fs::write(&dest, &bytes).await?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn delete_profile(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            user_data::delete_profile(c, id)?;
            if settings::active_profile(c) == id {
                let first: i64 =
                    c.query_row("SELECT id FROM profiles ORDER BY created_at ASC", [], |r| {
                        r.get(0)
                    })?;
                settings::set(c, "active_profile", &first.to_string())?;
            }
            Ok(())
        })
        .await
}

#[tauri::command]
pub async fn set_active_profile(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state
        .db
        .write_async(move |c| {
            let exists: i64 = c.query_row(
                "SELECT COUNT(*) FROM profiles WHERE id = ?1",
                rusqlite::params![id],
                |r| r.get(0),
            )?;
            if exists == 0 {
                return Err(AppError::NotFound(format!("perfil {id}")));
            }
            settings::set(c, "active_profile", &id.to_string())
        })
        .await
}

// ---------------------------------------------------------------------------
// Data management
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn export_data(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let dest = crate::security::validate_export_path(&path)?;
    let bundle = state
        .db
        .read_async(|c| {
            let profile = settings::active_profile(c);
            import_export::build_bundle(c, profile)
        })
        .await?;
    let json = serde_json::to_string_pretty(&bundle)?;
    tokio::fs::write(dest, json).await?;
    Ok(())
}

#[tauri::command]
pub async fn import_data(
    state: State<'_, AppState>,
    path: String,
) -> AppResult<import_export::ImportReport> {
    let file = crate::security::validate_local_file(&path, &["json"])?;
    let raw = tokio::fs::read_to_string(file).await?;
    let bundle: ExportBundle = serde_json::from_str(&raw)
        .map_err(|_| AppError::Invalid("arquivo de importação inválido".into()))?;
    state
        .db
        .write_async(move |c| {
            let profile = settings::active_profile(c);
            import_export::apply_bundle(c, profile, &bundle)
        })
        .await
}

#[tauri::command]
pub async fn get_app_stats(state: State<'_, AppState>) -> AppResult<AppStats> {
    let db_size = std::fs::metadata(state.db.path()).map(|m| m.len() as i64).unwrap_or(0);
    let logo_dir = state.cache_dir.join("logos");
    let logo_bytes = dir_size(&logo_dir);
    state
        .db
        .read_async(move |c| {
            let count = |sql: &str| -> AppResult<i64> {
                Ok(c.query_row(sql, [], |r| r.get(0))?)
            };
            Ok(AppStats {
                db_size_bytes: db_size,
                logo_cache_bytes: logo_bytes,
                channel_count: count("SELECT COUNT(*) FROM channels")?,
                movie_count: count("SELECT COUNT(*) FROM movies")?,
                series_count: count("SELECT COUNT(*) FROM series")?,
                episode_count: count("SELECT COUNT(*) FROM episodes")?,
                epg_count: count("SELECT COUNT(*) FROM epg_programs")?,
                history_count: count("SELECT COUNT(*) FROM history")?,
                favorite_count: count("SELECT COUNT(*) FROM favorites")?,
            })
        })
        .await
}

fn dir_size(dir: &std::path::Path) -> i64 {
    let Ok(entries) = std::fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len() as i64)
        .sum()
}

/// Checks GitHub Releases for a newer version. Read-only and unauthenticated
/// (public API); a missing/empty release list simply reports "up to date".
const UPDATE_REPO: &str = "domagalskidasilva-coder/fable-tv";

#[tauri::command]
pub async fn check_for_update(state: State<'_, AppState>) -> AppResult<UpdateInfo> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("https://api.github.com/repos/{UPDATE_REPO}/releases/latest");
    let resp = state
        .http
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;

    if !resp.status().is_success() {
        // 404 = no releases published yet → nothing to update to.
        return Ok(UpdateInfo {
            current_version: current,
            latest_version: None,
            available: false,
            url: None,
            notes: None,
        });
    }

    let v: serde_json::Value = resp.json().await?;
    let tag = v.get("tag_name").and_then(|t| t.as_str()).unwrap_or("");
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    let html_url = v.get("html_url").and_then(|u| u.as_str()).map(String::from);
    let notes = v
        .get("body")
        .and_then(|b| b.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.chars().take(2000).collect::<String>());
    // Prefer a Windows installer asset; otherwise the release page.
    let asset = v.get("assets").and_then(|a| a.as_array()).and_then(|arr| {
        arr.iter().find_map(|a| {
            let name = a.get("name")?.as_str()?.to_lowercase();
            if name.ends_with(".exe") || name.ends_with(".msi") {
                a.get("browser_download_url")?.as_str().map(String::from)
            } else {
                None
            }
        })
    });
    let available = !latest.is_empty() && crate::util::version_gt(&latest, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: (!latest.is_empty()).then_some(latest),
        available,
        url: asset.or(html_url),
        notes,
    })
}

/// Clears selected local caches: "logos", "epg" or "all".
#[tauri::command]
pub async fn clear_cache(state: State<'_, AppState>, kind: String) -> AppResult<()> {
    match kind.as_str() {
        "logos" => {
            let dir = state.cache_dir.join("logos");
            if dir.is_dir() {
                let _ = tokio::fs::remove_dir_all(&dir).await;
            }
            state
                .db
                .write_async(|c| {
                    c.execute("UPDATE channels SET logo_path = NULL", [])?;
                    c.execute("UPDATE movies SET logo_path = NULL", [])?;
                    c.execute("UPDATE series SET cover_path = NULL", [])?;
                    Ok(())
                })
                .await
        }
        "epg" => {
            state
                .db
                .write_async(|c| epg_repo::clear_all(c))
                .await
        }
        "all" => {
            let dir = state.cache_dir.join("logos");
            if dir.is_dir() {
                let _ = tokio::fs::remove_dir_all(&dir).await;
            }
            state
                .db
                .write_async(|c| {
                    c.execute("DELETE FROM epg_programs", [])?;
                    c.execute("DELETE FROM episodes", [])?;
                    c.execute("DELETE FROM series", [])?;
                    c.execute("DELETE FROM movies", [])?;
                    c.execute("DELETE FROM channels", [])?;
                    c.execute("DELETE FROM categories", [])?;
                    c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")?;
                    Ok(())
                })
                .await
        }
        other => Err(AppError::Invalid(format!("tipo de cache inválido: {other}"))),
    }
}

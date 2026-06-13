//! Builds the home screen payload in one backend call.

use crate::error::AppResult;
use crate::models::{HomeData, MediaCard, SourceStatus};
use crate::repo::{catalog, user_data};
use rusqlite::{params, Connection};

pub fn get_home_data(conn: &Connection, profile: i64) -> AppResult<HomeData> {
    let continue_watching = user_data::continue_watching(conn, profile, 20)?;
    let favorites = user_data::list_favorites(conn, profile, None, Some(20))?;
    let recent_channels = user_data::recent_channels(conn, profile, 15)?;
    let latest_movies = latest(conn, profile, "movie", 20)?;
    let latest_series = latest(conn, profile, "series", 20)?;

    let mut live_categories = catalog::list_categories(conn, "live", Some(profile))?;
    live_categories.sort_by(|a, b| b.item_count.cmp(&a.item_count));
    live_categories.truncate(12);

    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.kind, s.last_sync_at, s.last_sync_status,
                (SELECT COUNT(*) FROM channels c WHERE c.source_id = s.id),
                (SELECT COUNT(*) FROM movies m WHERE m.source_id = s.id),
                (SELECT COUNT(*) FROM series se WHERE se.source_id = s.id)
         FROM sources s WHERE s.profile_id = ?1 ORDER BY s.created_at ASC",
    )?;
    let sources = stmt
        .query_map(params![profile], |r| {
            Ok(SourceStatus {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                last_sync_at: r.get(3)?,
                last_sync_status: r.get(4)?,
                channel_count: r.get(5)?,
                movie_count: r.get(6)?,
                series_count: r.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(HomeData {
        continue_watching,
        favorites,
        recent_channels,
        latest_movies,
        latest_series,
        live_categories,
        sources,
    })
}

fn latest(conn: &Connection, profile: i64, kind: &str, limit: i64) -> AppResult<Vec<MediaCard>> {
    let sql = match kind {
        "movie" => {
            "SELECT m.id, m.name, COALESCE(m.logo_path, m.logo_url), m.year, m.source_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?1 AND f.item_type='movie' AND f.item_id = m.id)
             FROM movies m WHERE m.source_id IN (SELECT id FROM sources WHERE profile_id = ?1)
             ORDER BY m.created_at DESC, m.id DESC LIMIT ?2"
        }
        _ => {
            "SELECT se.id, se.name, COALESCE(se.cover_path, se.cover_url), se.year, se.source_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?1 AND f.item_type='series' AND f.item_id = se.id)
             FROM series se WHERE se.source_id IN (SELECT id FROM sources WHERE profile_id = ?1)
             ORDER BY se.created_at DESC, se.id DESC LIMIT ?2"
        }
    };
    let mut stmt = conn.prepare(sql)?;
    let kind_owned = kind.to_string();
    let rows = stmt
        .query_map(params![profile, limit], move |r| {
            let year: Option<i64> = r.get(3)?;
            let id: i64 = r.get(0)?;
            Ok(MediaCard {
                item_type: kind_owned.clone(),
                id,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: year.map(|y| y.to_string()),
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(5)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: if kind_owned == "series" { Some(id) } else { None },
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

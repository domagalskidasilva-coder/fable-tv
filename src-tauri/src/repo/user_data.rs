//! Favorites, playback history and profiles.

use crate::error::{AppError, AppResult};
use crate::models::{HistoryEntry, MediaCard, Profile};
use crate::repo::catalog;
use crate::util::now_ts;
use rusqlite::{params, Connection};

const COMPLETION_THRESHOLD: f64 = 0.95;
const MAX_FAVORITES: usize = 1000;

pub fn toggle_favorite(
    conn: &Connection,
    profile: i64,
    item_type: &str,
    item_id: i64,
) -> AppResult<bool> {
    crate::security::validate_item_type(item_type)?;
    let deleted = conn.execute(
        "DELETE FROM favorites WHERE profile_id = ?1 AND item_type = ?2 AND item_id = ?3",
        params![profile, item_type, item_id],
    )?;
    if deleted > 0 {
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO favorites (profile_id, item_type, item_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![profile, item_type, item_id, now_ts()],
    )?;
    Ok(true)
}

pub fn list_favorites_filtered(
    conn: &Connection,
    profile: i64,
    item_type: Option<&str>,
    limit: Option<usize>,
    block_adult: bool,
) -> AppResult<Vec<MediaCard>> {
    if let Some(t) = item_type {
        crate::security::validate_item_type(t)?;
    }
    let mut stmt = conn.prepare(
        "SELECT item_type, item_id FROM favorites
         WHERE profile_id = ?1 AND (?2 IS NULL OR item_type = ?2)
         ORDER BY created_at DESC LIMIT ?3",
    )?;
    let cap = limit.unwrap_or(MAX_FAVORITES).min(MAX_FAVORITES) as i64;
    let refs = stmt
        .query_map(params![profile, item_type, cap], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut out = Vec::with_capacity(refs.len());
    for (t, id) in refs {
        // Items can disappear after a resync; skip dangling favorites.
        if block_adult && catalog::is_adult_item(conn, &t, id)? {
            continue;
        }
        if let Some(card) = catalog::card_for(conn, profile, &t, id)? {
            out.push(card);
        }
    }
    Ok(out)
}

pub fn report_playback(
    conn: &Connection,
    profile: i64,
    item_type: &str,
    item_id: i64,
    position_secs: f64,
    duration_secs: f64,
) -> AppResult<()> {
    crate::security::validate_item_type(item_type)?;
    if !position_secs.is_finite() || !duration_secs.is_finite() || position_secs < 0.0 {
        return Err(AppError::Invalid("posição de reprodução inválida".into()));
    }
    let completed = duration_secs > 0.0 && (position_secs / duration_secs) >= COMPLETION_THRESHOLD;
    conn.execute(
        "INSERT INTO history (profile_id, item_type, item_id, position_secs, duration_secs, completed, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(profile_id, item_type, item_id) DO UPDATE SET
           position_secs = excluded.position_secs,
           duration_secs = excluded.duration_secs,
           completed = excluded.completed,
           updated_at = excluded.updated_at",
        params![profile, item_type, item_id, position_secs, duration_secs, completed as i64, now_ts()],
    )?;
    Ok(())
}

pub fn list_history_filtered(
    conn: &Connection,
    profile: i64,
    item_type: Option<&str>,
    limit: i64,
    offset: i64,
    block_adult: bool,
) -> AppResult<Vec<HistoryEntry>> {
    if let Some(t) = item_type {
        crate::security::validate_item_type(t)?;
    }
    let mut stmt = conn.prepare(
        "SELECT item_type, item_id, position_secs, duration_secs, completed, updated_at
         FROM history
         WHERE profile_id = ?1 AND (?2 IS NULL OR item_type = ?2)
         ORDER BY updated_at DESC LIMIT ?3 OFFSET ?4",
    )?;
    let rows = stmt
        .query_map(
            params![profile, item_type, limit.clamp(1, 500), offset.max(0)],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, f64>(2)?,
                    r.get::<_, f64>(3)?,
                    r.get::<_, i64>(4)? != 0,
                    r.get::<_, i64>(5)?,
                ))
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let mut out = Vec::with_capacity(rows.len());
    for (t, id, pos, dur, completed, updated_at) in rows {
        if block_adult && catalog::is_adult_item(conn, &t, id)? {
            continue;
        }
        if let Some(mut card) = catalog::card_for(conn, profile, &t, id)? {
            card.position_secs = Some(pos);
            card.duration_secs = Some(dur);
            out.push(HistoryEntry {
                card,
                updated_at,
                completed,
            });
        }
    }
    Ok(out)
}

pub fn continue_watching_filtered(
    conn: &Connection,
    profile: i64,
    limit: i64,
    block_adult: bool,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT item_type, item_id, position_secs, duration_secs FROM history
         WHERE profile_id = ?1 AND completed = 0 AND position_secs > 30
           AND item_type IN ('movie', 'episode')
         ORDER BY updated_at DESC LIMIT ?2",
    )?;
    let rows = stmt
        .query_map(params![profile, limit.clamp(1, 100)], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut out = Vec::with_capacity(rows.len());
    for (t, id, pos, dur) in rows {
        if block_adult && catalog::is_adult_item(conn, &t, id)? {
            continue;
        }
        if let Some(mut card) = catalog::card_for(conn, profile, &t, id)? {
            card.position_secs = Some(pos);
            card.duration_secs = Some(dur);
            out.push(card);
        }
    }
    Ok(out)
}

pub fn recent_channels_filtered(
    conn: &Connection,
    profile: i64,
    limit: i64,
    block_adult: bool,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT item_id FROM history
         WHERE profile_id = ?1 AND item_type = 'channel'
         ORDER BY updated_at DESC LIMIT ?2",
    )?;
    let ids = stmt
        .query_map(params![profile, limit.clamp(1, 100)], |r| {
            r.get::<_, i64>(0)
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if block_adult && catalog::is_adult_item(conn, "channel", id)? {
            continue;
        }
        if let Some(card) = catalog::channel_card(conn, profile, id)? {
            out.push(card);
        }
    }
    Ok(out)
}

pub fn delete_history_entry(
    conn: &Connection,
    profile: i64,
    item_type: &str,
    item_id: i64,
) -> AppResult<()> {
    crate::security::validate_item_type(item_type)?;
    conn.execute(
        "DELETE FROM history WHERE profile_id = ?1 AND item_type = ?2 AND item_id = ?3",
        params![profile, item_type, item_id],
    )?;
    Ok(())
}

pub fn clear_history(conn: &Connection, profile: i64) -> AppResult<()> {
    conn.execute(
        "DELETE FROM history WHERE profile_id = ?1",
        params![profile],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const DEFAULT_COLOR: &str = "#e8b65a";

pub fn list_profiles(conn: &Connection, active_id: i64) -> AppResult<Vec<Profile>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.name, p.color, p.image,
                (SELECT COUNT(*) FROM sources s WHERE s.profile_id = p.id),
                (SELECT COUNT(*) FROM channels c JOIN sources s ON s.id = c.source_id WHERE s.profile_id = p.id),
                (SELECT COUNT(*) FROM movies m JOIN sources s ON s.id = m.source_id WHERE s.profile_id = p.id),
                (SELECT COUNT(*) FROM series se JOIN sources s ON s.id = se.source_id WHERE s.profile_id = p.id)
         FROM profiles p ORDER BY p.created_at ASC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Profile {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                image: r.get(3)?,
                active: r.get::<_, i64>(0)? == active_id,
                source_count: r.get(4)?,
                channel_count: r.get(5)?,
                movie_count: r.get(6)?,
                series_count: r.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn create_profile(
    conn: &Connection,
    name: &str,
    color: Option<&str>,
    image: Option<&str>,
) -> AppResult<i64> {
    let name = crate::security::sanitize_name(name, "Perfil");
    let color = sanitize_color(color);
    conn.execute(
        "INSERT INTO profiles (name, color, image, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![name, color, image, now_ts()],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AppError::Invalid("já existe um perfil com esse nome".into())
        }
        other => AppError::Db(other),
    })?;
    Ok(conn.last_insert_rowid())
}

pub fn update_profile(
    conn: &Connection,
    id: i64,
    name: &str,
    color: Option<&str>,
    image: Option<&str>,
) -> AppResult<()> {
    let name = crate::security::sanitize_name(name, "Perfil");
    let color = sanitize_color(color);
    conn.execute(
        "UPDATE profiles SET name = ?1, color = ?2, image = ?3 WHERE id = ?4",
        params![name, color, image, id],
    )
    .map_err(|e| match e {
        rusqlite::Error::SqliteFailure(err, _)
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AppError::Invalid("já existe um perfil com esse nome".into())
        }
        other => AppError::Db(other),
    })?;
    Ok(())
}

pub fn delete_profile(conn: &Connection, id: i64) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
    if count <= 1 {
        return Err(AppError::Invalid(
            "não é possível excluir o único perfil".into(),
        ));
    }
    // Remove the profile's playlists first (cascading their cached catalog),
    // then the profile itself (cascading its favorites/history).
    conn.execute("DELETE FROM sources WHERE profile_id = ?1", params![id])?;
    conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])?;
    Ok(())
}

/// Accepts only `#rrggbb`; falls back to the brand amber otherwise.
fn sanitize_color(color: Option<&str>) -> String {
    match color {
        Some(c)
            if c.len() == 7
                && c.starts_with('#')
                && c[1..].chars().all(|ch| ch.is_ascii_hexdigit()) =>
        {
            c.to_lowercase()
        }
        _ => DEFAULT_COLOR.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;
    use crate::models::{CatalogFilter, NewSource};
    use crate::repo::{catalog as cat, sources};
    use std::collections::HashMap;

    fn seed(db: &std::sync::Arc<crate::db::Db>) -> (i64, i64) {
        // Fresh installs no longer seed a profile, so create the one these
        // tests operate on (the first profile gets id 1).
        db.write(|c| create_profile(c, "Principal", None, None)).unwrap();
        let sid = db
            .write(|c| {
                sources::add(
                    c,
                    1,
                    &NewSource {
                        name: "F".into(),
                        kind: "m3u_url".into(),
                        url: "http://e/x.m3u".into(),
                        username: None,
                        password: None,
                        epg_url: None,
                        sync_channels: true,
                        sync_movies: true,
                        sync_series: true,
                        sync_epg: false,
                        sync_logos: false,
                    },
                )
            })
            .unwrap();
        db.write(move |c| {
            cat::upsert_movies(
                c,
                sid,
                1,
                &[cat::MovieRec {
                    external_id: None,
                    name: "Filme X".into(),
                    logo_url: None,
                    stream_url: "http://h/x.mp4".into(),
                    year: Some(2020),
                    duration_secs: Some(7200),
                    rating: None,
                    plot: None,
                    genre: None,
                    extra_json: None,
                    category_key: None,
                }],
                &HashMap::new(),
            )
        })
        .unwrap();
        let movie_id: i64 = db
            .read(|c| Ok(c.query_row("SELECT id FROM movies", [], |r| r.get(0))?))
            .unwrap();
        (sid, movie_id)
    }

    #[test]
    fn favorite_toggle_roundtrip() {
        let db = temp_db();
        let (_sid, movie_id) = seed(&db);
        let on = db
            .write(move |c| toggle_favorite(c, 1, "movie", movie_id))
            .unwrap();
        assert!(on);
        let favs = db
            .read(|c| list_favorites_filtered(c, 1, None, None, false))
            .unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].name, "Filme X");
        assert!(favs[0].favorite);

        let off = db
            .write(move |c| toggle_favorite(c, 1, "movie", movie_id))
            .unwrap();
        assert!(!off);
        assert!(db
            .read(|c| list_favorites_filtered(c, 1, None, None, false))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn favorite_rejects_invalid_type() {
        let db = temp_db();
        assert!(db.write(|c| toggle_favorite(c, 1, "nope", 1)).is_err());
    }

    #[test]
    fn adult_block_hides_saved_favorites() {
        let db = temp_db();
        let (sid, normal_movie_id) = seed(&db);
        db.write(move |c| {
            cat::upsert_movies(
                c,
                sid,
                2,
                &[cat::MovieRec {
                    external_id: None,
                    name: "Filme XXX".into(),
                    logo_url: None,
                    stream_url: "http://h/adulto.mp4".into(),
                    year: None,
                    duration_secs: None,
                    rating: None,
                    plot: None,
                    genre: None,
                    extra_json: None,
                    category_key: None,
                }],
                &HashMap::new(),
            )
        })
        .unwrap();
        let adult_movie_id: i64 = db
            .read(|c| {
                Ok(
                    c.query_row("SELECT id FROM movies WHERE name = 'Filme XXX'", [], |r| {
                        r.get(0)
                    })?,
                )
            })
            .unwrap();

        db.write(move |c| toggle_favorite(c, 1, "movie", normal_movie_id))
            .unwrap();
        db.write(move |c| toggle_favorite(c, 1, "movie", adult_movie_id))
            .unwrap();

        let all = db
            .read(|c| list_favorites_filtered(c, 1, Some("movie"), None, false))
            .unwrap();
        assert_eq!(all.len(), 2);

        let blocked = db
            .read(|c| list_favorites_filtered(c, 1, Some("movie"), None, true))
            .unwrap();
        assert_eq!(blocked.len(), 1);
        assert_eq!(blocked[0].name, "Filme X");
    }

    #[test]
    fn history_upsert_and_continue_watching() {
        let db = temp_db();
        let (_sid, movie_id) = seed(&db);

        db.write(move |c| report_playback(c, 1, "movie", movie_id, 120.0, 7200.0))
            .unwrap();
        db.write(move |c| report_playback(c, 1, "movie", movie_id, 300.0, 7200.0))
            .unwrap();

        let hist = db
            .read(|c| list_history_filtered(c, 1, None, 50, 0, false))
            .unwrap();
        assert_eq!(hist.len(), 1, "upsert must not duplicate entries");
        assert_eq!(hist[0].card.position_secs, Some(300.0));
        assert!(!hist[0].completed);

        let cw = db
            .read(|c| continue_watching_filtered(c, 1, 10, false))
            .unwrap();
        assert_eq!(cw.len(), 1);

        // Watching past 95% marks as completed and leaves continue watching.
        db.write(move |c| report_playback(c, 1, "movie", movie_id, 7100.0, 7200.0))
            .unwrap();
        assert!(db
            .read(|c| continue_watching_filtered(c, 1, 10, false))
            .unwrap()
            .is_empty());
        let hist = db
            .read(|c| list_history_filtered(c, 1, None, 50, 0, false))
            .unwrap();
        assert!(hist[0].completed);

        db.write(|c| clear_history(c, 1)).unwrap();
        assert!(db
            .read(|c| list_history_filtered(c, 1, None, 50, 0, false))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn favorites_filter_in_catalog_queries() {
        let db = temp_db();
        let (_sid, movie_id) = seed(&db);
        db.write(move |c| toggle_favorite(c, 1, "movie", movie_id))
            .unwrap();
        let page = db
            .read(|c| {
                cat::list_movies_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        favorites_only: true,
                        limit: 10,
                        ..Default::default()
                    },
                    false,
                )
            })
            .unwrap();
        assert_eq!(page.total, 1);
        assert!(page.items[0].favorite);
    }

    #[test]
    fn profiles_create_switch_delete() {
        let db = temp_db();
        // Fresh installs start with no profiles; create the base one first.
        db.write(|c| create_profile(c, "Principal", None, None)).unwrap();
        let pid = db
            .write(|c| create_profile(c, "Crianças", Some("#3aa0ff"), Some("preset:nebula")))
            .unwrap();
        let profiles = db.read(move |c| list_profiles(c, pid)).unwrap();
        assert_eq!(profiles.len(), 2);
        assert!(profiles.iter().any(|p| p.name == "Crianças"
            && p.active
            && p.color == "#3aa0ff"
            && p.image.as_deref() == Some("preset:nebula")));

        assert!(db
            .write(|c| create_profile(c, "Crianças", None, None))
            .is_err());

        db.write(move |c| delete_profile(c, pid)).unwrap();
        let profiles = db.read(|c| list_profiles(c, 1)).unwrap();
        assert_eq!(profiles.len(), 1);
        assert!(
            db.write(|c| delete_profile(c, 1)).is_err(),
            "last profile is protected"
        );
    }
}

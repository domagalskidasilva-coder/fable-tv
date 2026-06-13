//! Local JSON export/import of sources, settings and favorites.
//! Files are written/read only at paths the user picked via native dialogs.

use crate::error::{AppError, AppResult};
use crate::models::{ExportBundle, ExportFavorite, ExportSource, NewSource};
use crate::repo::{settings, sources};
use crate::util::now_ts;
use rusqlite::{params, Connection, OptionalExtension};

pub const BUNDLE_VERSION: u32 = 1;

pub fn build_bundle(conn: &Connection, profile: i64) -> AppResult<ExportBundle> {
    let mut stmt = conn.prepare(
        "SELECT name, kind, url, username, password, epg_url,
                sync_channels, sync_movies, sync_series, sync_epg, sync_logos
         FROM sources ORDER BY created_at ASC",
    )?;
    let export_sources = stmt
        .query_map([], |r| {
            Ok(ExportSource {
                name: r.get(0)?,
                kind: r.get(1)?,
                url: r.get(2)?,
                username: r.get(3)?,
                password: r.get(4)?,
                epg_url: r.get(5)?,
                sync_channels: r.get::<_, i64>(6)? != 0,
                sync_movies: r.get::<_, i64>(7)? != 0,
                sync_series: r.get::<_, i64>(8)? != 0,
                sync_epg: r.get::<_, i64>(9)? != 0,
                sync_logos: r.get::<_, i64>(10)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Favorites are exported with stable identifiers (stream URL / external
    // id + source URL) so they can be re-matched after reimport + resync.
    let mut fav_stmt = conn.prepare(
        "SELECT f.item_type, f.item_id FROM favorites f
         WHERE f.profile_id = ?1 ORDER BY f.created_at ASC",
    )?;
    let refs = fav_stmt
        .query_map(params![profile], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut favorites = Vec::new();
    for (item_type, item_id) in refs {
        if let Some(fav) = favorite_identity(conn, &item_type, item_id)? {
            favorites.push(fav);
        }
    }

    Ok(ExportBundle {
        version: BUNDLE_VERSION,
        exported_at: now_ts(),
        sources: export_sources,
        settings: settings::get_all(conn)?,
        favorites,
    })
}

fn favorite_identity(
    conn: &Connection,
    item_type: &str,
    item_id: i64,
) -> AppResult<Option<ExportFavorite>> {
    let row = match item_type {
        "channel" => conn
            .query_row(
                "SELECT ch.name, ch.stream_url, ch.external_id, s.url
                 FROM channels ch JOIN sources s ON s.id = ch.source_id WHERE ch.id = ?1",
                params![item_id],
                map_identity(item_type),
            )
            .optional()?,
        "movie" => conn
            .query_row(
                "SELECT m.name, m.stream_url, m.external_id, s.url
                 FROM movies m JOIN sources s ON s.id = m.source_id WHERE m.id = ?1",
                params![item_id],
                map_identity(item_type),
            )
            .optional()?,
        "series" => conn
            .query_row(
                "SELECT se.name, NULL, se.external_id, s.url
                 FROM series se JOIN sources s ON s.id = se.source_id WHERE se.id = ?1",
                params![item_id],
                map_identity(item_type),
            )
            .optional()?,
        "episode" => conn
            .query_row(
                "SELECT e.name, e.stream_url, NULL, s.url
                 FROM episodes e JOIN sources s ON s.id = e.source_id WHERE e.id = ?1",
                params![item_id],
                map_identity(item_type),
            )
            .optional()?,
        _ => None,
    };
    Ok(row)
}

fn map_identity(
    item_type: &str,
) -> impl Fn(&rusqlite::Row<'_>) -> rusqlite::Result<ExportFavorite> + '_ {
    move |r| {
        Ok(ExportFavorite {
            item_type: item_type.to_string(),
            name: r.get(0)?,
            stream_url: r.get(1)?,
            external_id: r.get(2)?,
            source_url: r.get(3)?,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub sources_added: usize,
    pub sources_skipped: usize,
    pub settings_applied: usize,
    pub favorites_matched: usize,
    pub favorites_pending: usize,
}

pub fn apply_bundle(
    conn: &Connection,
    profile: i64,
    bundle: &ExportBundle,
) -> AppResult<ImportReport> {
    if bundle.version > BUNDLE_VERSION {
        return Err(AppError::Invalid(
            "este arquivo foi exportado por uma versão mais nova do aplicativo".into(),
        ));
    }
    let mut report = ImportReport {
        sources_added: 0,
        sources_skipped: 0,
        settings_applied: 0,
        favorites_matched: 0,
        favorites_pending: 0,
    };

    for src in &bundle.sources {
        let exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sources WHERE url = ?1 AND COALESCE(username,'') = COALESCE(?2,'')",
            params![src.url, src.username],
            |r| r.get(0),
        )?;
        if exists > 0 {
            report.sources_skipped += 1;
            continue;
        }
        crate::security::validate_http_url(&src.url).or_else(|e| {
            if src.kind == "m3u_file" { Ok(url::Url::parse("http://local.invalid").unwrap()) } else { Err(e) }
        })?;
        sources::add(
            conn,
            profile,
            &NewSource {
                name: crate::security::sanitize_name(&src.name, "Fonte importada"),
                kind: src.kind.clone(),
                url: src.url.clone(),
                username: src.username.clone(),
                password: src.password.clone(),
                epg_url: src.epg_url.clone(),
                sync_channels: src.sync_channels,
                sync_movies: src.sync_movies,
                sync_series: src.sync_series,
                sync_epg: src.sync_epg,
                sync_logos: src.sync_logos,
            },
        )?;
        report.sources_added += 1;
    }

    for (k, v) in &bundle.settings {
        if settings::set(conn, k, v).is_ok() {
            report.settings_applied += 1;
        }
    }

    for fav in &bundle.favorites {
        if crate::security::validate_item_type(&fav.item_type).is_err() {
            continue;
        }
        match match_favorite(conn, fav)? {
            Some(item_id) => {
                conn.execute(
                    "INSERT OR IGNORE INTO favorites (profile_id, item_type, item_id, created_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![profile, fav.item_type, item_id, now_ts()],
                )?;
                report.favorites_matched += 1;
            }
            None => report.favorites_pending += 1,
        }
    }

    Ok(report)
}

fn match_favorite(conn: &Connection, fav: &ExportFavorite) -> AppResult<Option<i64>> {
    let by_stream = |table: &str| -> AppResult<Option<i64>> {
        let Some(stream) = &fav.stream_url else { return Ok(None) };
        let sql = format!("SELECT id FROM {table} WHERE stream_url = ?1 LIMIT 1");
        Ok(conn
            .query_row(&sql, params![stream], |r| r.get(0))
            .optional()?)
    };
    match fav.item_type.as_str() {
        "channel" => by_stream("channels"),
        "movie" => by_stream("movies"),
        "episode" => by_stream("episodes"),
        "series" => {
            let Some(ext) = &fav.external_id else { return Ok(None) };
            Ok(conn
                .query_row(
                    "SELECT se.id FROM series se JOIN sources s ON s.id = se.source_id
                     WHERE se.external_id = ?1 AND s.url = ?2 LIMIT 1",
                    params![ext, fav.source_url],
                    |r| r.get(0),
                )
                .optional()?)
        }
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;
    use crate::repo::{catalog, user_data};
    use std::collections::HashMap;

    #[test]
    fn export_then_import_into_fresh_db() {
        let db = temp_db();
        let sid = db
            .write(|c| {
                sources::add(
                    c,
                    1,
                    &NewSource {
                        name: "Origem".into(),
                        kind: "m3u_url".into(),
                        url: "http://example.com/l.m3u".into(),
                        username: Some("u".into()),
                        password: Some("p".into()),
                        epg_url: None,
                        sync_channels: true,
                        sync_movies: true,
                        sync_series: false,
                        sync_epg: false,
                        sync_logos: false,
                    },
                )
            })
            .unwrap();
        db.write(move |c| {
            catalog::upsert_channels(
                c,
                sid,
                1,
                &[catalog::ChannelRec {
                    external_id: None,
                    name: "Canal 1".into(),
                    logo_url: None,
                    stream_url: "http://h/c1.ts".into(),
                    tvg_id: None,
                    tvg_name: None,
                    group_title: None,
                    extra_json: None,
                    position: 0,
                    category_key: None,
                }],
                &HashMap::new(),
            )
        })
        .unwrap();
        let ch_id: i64 = db
            .read(|c| Ok(c.query_row("SELECT id FROM channels", [], |r| r.get(0))?))
            .unwrap();
        db.write(move |c| user_data::toggle_favorite(c, 1, "channel", ch_id)).unwrap();

        let bundle = db.read(|c| build_bundle(c, 1)).unwrap();
        assert_eq!(bundle.sources.len(), 1);
        assert_eq!(bundle.favorites.len(), 1);
        assert_eq!(bundle.favorites[0].stream_url.as_deref(), Some("http://h/c1.ts"));

        // Import into a fresh database: source added, favorite pending
        // (catalog not synced yet there).
        let db2 = temp_db();
        let bundle2 = bundle.clone();
        let report = db2.write(move |c| apply_bundle(c, 1, &bundle2)).unwrap();
        assert_eq!(report.sources_added, 1);
        assert_eq!(report.favorites_matched, 0);
        assert_eq!(report.favorites_pending, 1);

        // Importing again skips the duplicate source.
        let report = db2.write(move |c| apply_bundle(c, 1, &bundle)).unwrap();
        assert_eq!(report.sources_added, 0);
        assert_eq!(report.sources_skipped, 1);
    }
}

use crate::error::{AppError, AppResult};
use crate::models::{NewSource, Source};
use crate::util::now_ts;
use rusqlite::{params, Connection, OptionalExtension};

/// Internal row including credentials; never serialized to the frontend.
/// Some fields are mapped for completeness even where sync reads only a few.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SourceRow {
    pub id: i64,
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

pub fn get_row(conn: &Connection, id: i64) -> AppResult<SourceRow> {
    conn.query_row(
        "SELECT id, name, kind, url, username, password, epg_url,
                sync_channels, sync_movies, sync_series, sync_epg, sync_logos
         FROM sources WHERE id = ?1",
        params![id],
        |r| {
            Ok(SourceRow {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                url: r.get(3)?,
                username: r.get(4)?,
                password: r.get(5)?,
                epg_url: r.get(6)?,
                sync_channels: r.get::<_, i64>(7)? != 0,
                sync_movies: r.get::<_, i64>(8)? != 0,
                sync_series: r.get::<_, i64>(9)? != 0,
                sync_epg: r.get::<_, i64>(10)? != 0,
                sync_logos: r.get::<_, i64>(11)? != 0,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("fonte {id}")))
}

/// Lists the playlists belonging to one profile.
pub fn list_for_profile(conn: &Connection, profile_id: i64) -> AppResult<Vec<Source>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.profile_id, s.name, s.kind, s.url, s.username,
                s.password IS NOT NULL AND s.password != '',
                s.epg_url, s.sync_channels, s.sync_movies, s.sync_series,
                s.sync_epg, s.sync_logos, s.created_at, s.last_sync_at, s.last_sync_status,
                (SELECT COUNT(*) FROM channels c WHERE c.source_id = s.id),
                (SELECT COUNT(*) FROM movies m WHERE m.source_id = s.id),
                (SELECT COUNT(*) FROM series se WHERE se.source_id = s.id),
                (SELECT COUNT(*) FROM epg_programs p WHERE p.source_id = s.id)
         FROM sources s WHERE s.profile_id = ?1 ORDER BY s.created_at ASC",
    )?;
    let rows = stmt.query_map(params![profile_id], |r| {
        Ok(Source {
            id: r.get(0)?,
            profile_id: r.get(1)?,
            name: r.get(2)?,
            kind: r.get(3)?,
            url: r.get(4)?,
            username: r.get(5)?,
            has_password: r.get::<_, i64>(6)? != 0,
            epg_url: r.get(7)?,
            sync_channels: r.get::<_, i64>(8)? != 0,
            sync_movies: r.get::<_, i64>(9)? != 0,
            sync_series: r.get::<_, i64>(10)? != 0,
            sync_epg: r.get::<_, i64>(11)? != 0,
            sync_logos: r.get::<_, i64>(12)? != 0,
            created_at: r.get(13)?,
            last_sync_at: r.get(14)?,
            last_sync_status: r.get(15)?,
            channel_count: r.get(16)?,
            movie_count: r.get(17)?,
            series_count: r.get(18)?,
            epg_count: r.get(19)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn add(conn: &Connection, profile_id: i64, s: &NewSource) -> AppResult<i64> {
    conn.execute(
        "INSERT INTO sources (profile_id, name, kind, url, username, password, epg_url,
            sync_channels, sync_movies, sync_series, sync_epg, sync_logos, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            profile_id,
            s.name,
            s.kind,
            s.url,
            s.username,
            s.password,
            s.epg_url,
            s.sync_channels as i64,
            s.sync_movies as i64,
            s.sync_series as i64,
            s.sync_epg as i64,
            s.sync_logos as i64,
            now_ts(),
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Updates a source. An empty/absent password keeps the stored one.
pub fn update(conn: &Connection, id: i64, s: &NewSource) -> AppResult<()> {
    let existing = get_row(conn, id)?;
    let password = match &s.password {
        Some(p) if !p.is_empty() => Some(p.clone()),
        _ => existing.password,
    };
    conn.execute(
        "UPDATE sources SET name=?1, kind=?2, url=?3, username=?4, password=?5, epg_url=?6,
            sync_channels=?7, sync_movies=?8, sync_series=?9, sync_epg=?10, sync_logos=?11
         WHERE id=?12",
        params![
            s.name,
            s.kind,
            s.url,
            s.username,
            password,
            s.epg_url,
            s.sync_channels as i64,
            s.sync_movies as i64,
            s.sync_series as i64,
            s.sync_epg as i64,
            s.sync_logos as i64,
            id,
        ],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM sources WHERE id = ?1", params![id])?;
    if n == 0 {
        return Err(AppError::NotFound(format!("fonte {id}")));
    }
    Ok(())
}

pub fn set_sync_status(conn: &Connection, id: i64, status: &str, success: bool) -> AppResult<()> {
    if success {
        conn.execute(
            "UPDATE sources SET last_sync_status = ?1, last_sync_at = ?2 WHERE id = ?3",
            params![status, now_ts(), id],
        )?;
    } else {
        conn.execute(
            "UPDATE sources SET last_sync_status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
    }
    Ok(())
}

/// Stores the EPG URL advertised by an M3U header, unless the user already
/// configured one manually.
pub fn set_epg_url_if_empty(conn: &Connection, id: i64, url: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE sources SET epg_url = ?1
         WHERE id = ?2 AND (epg_url IS NULL OR epg_url = '')",
        params![url, id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;

    fn new_source(name: &str) -> NewSource {
        NewSource {
            name: name.into(),
            kind: "m3u_url".into(),
            url: "http://example.com/list.m3u".into(),
            username: None,
            password: Some("secret".into()),
            epg_url: None,
            sync_channels: true,
            sync_movies: true,
            sync_series: false,
            sync_epg: false,
            sync_logos: false,
        }
    }

    #[test]
    fn crud_roundtrip() {
        let db = temp_db();
        let id = db.write(|c| add(c, 1, &new_source("Fonte A"))).unwrap();
        let listed = db.read(|c| list_for_profile(c, 1)).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Fonte A");
        assert_eq!(listed[0].profile_id, 1);
        assert!(listed[0].has_password);
        assert!(!listed[0].sync_series);

        let mut upd = new_source("Fonte B");
        upd.password = None; // keep stored password
        db.write(|c| update(c, id, &upd)).unwrap();
        let row = db.read(|c| get_row(c, id)).unwrap();
        assert_eq!(row.name, "Fonte B");
        assert_eq!(row.password.as_deref(), Some("secret"));

        db.write(|c| delete(c, id)).unwrap();
        assert!(db.read(|c| get_row(c, id)).is_err());
    }

    #[test]
    fn epg_url_only_set_when_empty() {
        let db = temp_db();
        let id = db.write(|c| add(c, 1, &new_source("F"))).unwrap();
        db.write(|c| set_epg_url_if_empty(c, id, "http://a/epg.xml")).unwrap();
        db.write(|c| set_epg_url_if_empty(c, id, "http://b/epg.xml")).unwrap();
        let row = db.read(|c| get_row(c, id)).unwrap();
        assert_eq!(row.epg_url.as_deref(), Some("http://a/epg.xml"));
    }
}

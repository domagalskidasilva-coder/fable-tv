//! Global search across channels, movies, series, episodes, categories and
//! the EPG window. Runs entirely in Rust over indexed/normalized columns.

use crate::error::AppResult;
use crate::models::{Category, EpgSearchHit, MediaCard, SearchResults};
use crate::util::{escape_like, normalize_text, now_ts};
use rusqlite::{params, Connection};

const GROUP_LIMIT: i64 = 24;

pub fn global_search(conn: &Connection, profile: i64, query: &str) -> AppResult<SearchResults> {
    let normalized = normalize_text(query);
    let mut results = SearchResults {
        query: query.to_string(),
        channels: Vec::new(),
        movies: Vec::new(),
        series: Vec::new(),
        episodes: Vec::new(),
        categories: Vec::new(),
        epg: Vec::new(),
    };
    if normalized.len() < 2 {
        return Ok(results);
    }
    let contains = format!("%{}%", escape_like(&normalized));
    let prefix = format!("{}%", escape_like(&normalized));

    results.channels = search_channels(conn, profile, &contains, &prefix)?;
    results.movies = search_movies(conn, profile, &contains, &prefix)?;
    results.series = search_series(conn, profile, &contains, &prefix)?;
    results.episodes = search_episodes(conn, profile, &contains, &prefix)?;
    results.categories = search_categories(conn, profile, &contains)?;
    results.epg = search_epg(conn, profile, &contains)?;
    Ok(results)
}

fn search_channels(
    conn: &Connection,
    profile: i64,
    contains: &str,
    prefix: &str,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT ch.id, ch.name, COALESCE(ch.logo_path, ch.logo_url), ch.group_title, ch.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='channel' AND f.item_id = ch.id)
         FROM channels ch
         WHERE ch.search_text LIKE ?1 ESCAPE '\\'
           AND ch.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)
         ORDER BY (ch.search_text LIKE ?3 ESCAPE '\\') DESC, LENGTH(ch.name) ASC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![contains, profile, prefix, GROUP_LIMIT], |r| {
            Ok(MediaCard {
                item_type: "channel".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: r.get(3)?,
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(5)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn search_movies(
    conn: &Connection,
    profile: i64,
    contains: &str,
    prefix: &str,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT m.id, m.name, COALESCE(m.logo_path, m.logo_url), m.year, m.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='movie' AND f.item_id = m.id)
         FROM movies m
         WHERE m.search_text LIKE ?1 ESCAPE '\\'
           AND m.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)
         ORDER BY (m.search_text LIKE ?3 ESCAPE '\\') DESC, LENGTH(m.name) ASC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![contains, profile, prefix, GROUP_LIMIT], |r| {
            let year: Option<i64> = r.get(3)?;
            Ok(MediaCard {
                item_type: "movie".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: year.map(|y| y.to_string()),
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(5)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn search_series(
    conn: &Connection,
    profile: i64,
    contains: &str,
    prefix: &str,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT se.id, se.name, COALESCE(se.cover_path, se.cover_url), se.year, se.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='series' AND f.item_id = se.id)
         FROM series se
         WHERE se.search_text LIKE ?1 ESCAPE '\\'
           AND se.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)
         ORDER BY (se.search_text LIKE ?3 ESCAPE '\\') DESC, LENGTH(se.name) ASC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![contains, profile, prefix, GROUP_LIMIT], |r| {
            let year: Option<i64> = r.get(3)?;
            let id: i64 = r.get(0)?;
            Ok(MediaCard {
                item_type: "series".into(),
                id,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: year.map(|y| y.to_string()),
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(5)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: Some(id),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn search_episodes(
    conn: &Connection,
    profile: i64,
    contains: &str,
    prefix: &str,
) -> AppResult<Vec<MediaCard>> {
    let mut stmt = conn.prepare(
        "SELECT e.id, e.name, COALESCE(se.cover_path, se.cover_url),
                se.name || ' · T' || e.season || ' E' || e.episode_num,
                e.source_id, e.series_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='episode' AND f.item_id = e.id)
         FROM episodes e JOIN series se ON se.id = e.series_id
         WHERE e.search_text LIKE ?1 ESCAPE '\\'
           AND e.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)
         ORDER BY (e.search_text LIKE ?3 ESCAPE '\\') DESC, LENGTH(e.name) ASC
         LIMIT ?4",
    )?;
    let rows = stmt
        .query_map(params![contains, profile, prefix, GROUP_LIMIT], |r| {
            Ok(MediaCard {
                item_type: "episode".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: r.get(3)?,
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(6)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: Some(r.get(5)?),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn search_categories(conn: &Connection, profile: i64, contains: &str) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare(
        "SELECT cat.id, cat.source_id, cat.kind, cat.name,
                (CASE cat.kind
                   WHEN 'live' THEN (SELECT COUNT(*) FROM channels t WHERE t.category_id = cat.id)
                   WHEN 'movie' THEN (SELECT COUNT(*) FROM movies t WHERE t.category_id = cat.id)
                   ELSE (SELECT COUNT(*) FROM series t WHERE t.category_id = cat.id)
                 END) AS cnt
         FROM categories cat
         WHERE cat.search_text LIKE ?1 ESCAPE '\\'
           AND cat.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)
         ORDER BY cnt DESC
         LIMIT 12",
    )?;
    let rows = stmt
        .query_map(params![contains, profile], |r| {
            Ok(Category {
                id: r.get(0)?,
                source_id: r.get(1)?,
                kind: r.get(2)?,
                name: r.get(3)?,
                item_count: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows.into_iter().filter(|c| c.item_count > 0).collect())
}

/// EPG hits limited to programs airing in the next 24h, mapped back to a
/// local channel when possible.
fn search_epg(conn: &Connection, profile: i64, contains: &str) -> AppResult<Vec<EpgSearchHit>> {
    let now = now_ts();
    let mut stmt = conn.prepare(
        "SELECT p.title, p.start_ts, p.stop_ts, ch.id, ch.name
         FROM epg_programs p
         LEFT JOIN channels ch ON ch.source_id = p.source_id AND LOWER(COALESCE(ch.tvg_id,'')) = p.channel_key
         WHERE LOWER(p.title) LIKE ?1 ESCAPE '\\' AND p.stop_ts > ?2 AND p.start_ts < ?3
           AND p.source_id IN (SELECT id FROM sources WHERE profile_id = ?4)
         ORDER BY p.start_ts ASC
         LIMIT 16",
    )?;
    let rows = stmt
        .query_map(params![contains, now, now + 86_400, profile], |r| {
            Ok(EpgSearchHit {
                title: r.get(0)?,
                start_ts: r.get(1)?,
                stop_ts: r.get(2)?,
                channel_id: r.get(3)?,
                channel_name: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;
    use crate::models::NewSource;
    use crate::repo::{catalog, sources};
    use std::collections::HashMap;

    #[test]
    fn search_groups_results_by_type() {
        let db = temp_db();
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
            let cats = catalog::upsert_categories(
                c,
                sid,
                "live",
                &[("Esportes Brasil".into(), "Esportes Brasil".into())],
            )?;
            catalog::upsert_channels(
                c,
                sid,
                1,
                &[catalog::ChannelRec {
                    external_id: None,
                    name: "Brasil News HD".into(),
                    logo_url: None,
                    stream_url: "http://h/bn.ts".into(),
                    tvg_id: None,
                    tvg_name: None,
                    group_title: Some("Esportes Brasil".into()),
                    extra_json: None,
                    position: 0,
                    category_key: Some("Esportes Brasil".into()),
                }],
                &cats,
            )?;
            catalog::upsert_movies(
                c,
                sid,
                1,
                &[catalog::MovieRec {
                    external_id: None,
                    name: "Central do Brasil".into(),
                    logo_url: None,
                    stream_url: "http://h/cdb.mp4".into(),
                    year: Some(1998),
                    duration_secs: None,
                    rating: None,
                    plot: None,
                    genre: None,
                    extra_json: None,
                    category_key: None,
                }],
                &HashMap::new(),
            )?;
            catalog::upsert_series(
                c,
                sid,
                1,
                &[catalog::SeriesRec {
                    external_id: "m3u:brasil a bordo".into(),
                    name: "Brasil a Bordo".into(),
                    cover_url: None,
                    plot: None,
                    year: None,
                    rating: None,
                    genre: None,
                    category_key: None,
                    episodes_synced: true,
                    episodes: vec![catalog::EpisodeRec {
                        season: 1,
                        episode_num: 1,
                        name: "Brasil a Bordo S01E01".into(),
                        stream_url: "http://h/bab1.mp4".into(),
                        duration_secs: None,
                        plot: None,
                    }],
                }],
                &HashMap::new(),
            )?;
            Ok(())
        })
        .unwrap();

        let res = db.read(|c| global_search(c, 1, "brasil")).unwrap();
        assert_eq!(res.channels.len(), 1);
        assert_eq!(res.movies.len(), 1);
        assert_eq!(res.series.len(), 1);
        assert_eq!(res.episodes.len(), 1);
        assert_eq!(res.categories.len(), 1);

        // Accent-insensitive: "açao" should not be needed; "brasil" with
        // different case still hits.
        let res = db.read(|c| global_search(c, 1, "BRASIL")).unwrap();
        assert_eq!(res.movies.len(), 1);

        // Too-short queries return nothing.
        let res = db.read(|c| global_search(c, 1, "b")).unwrap();
        assert!(res.channels.is_empty() && res.movies.is_empty());
    }
}

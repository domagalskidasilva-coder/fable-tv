//! Catalog persistence: categories, channels, movies, series and episodes.
//! Writes use batch upserts keyed on stable identifiers so internal ids
//! (referenced by favorites/history) survive re-synchronization.

use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::util::{escape_like, normalize_text, now_ts};
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use std::collections::HashMap;

const ADULT_SUBSTRING_TERMS: &[&str] = &[
    "18+", "+18", "adult", "adulto", "adultos", "brazzers", "erotic", "erotica", "erotico",
    "erótica", "erótico", "hardcore", "hentai", "onlyfans", "porn", "porno", "redtube", "xvideos",
    "xxx",
];

const ADULT_WORD_TERMS: &[&str] = &["nude", "nudes", "nudez", "sex", "sexo", "sexy"];
const ADULT_SQL_TOKEN_DELIMITERS: &[char] = &[
    '-', '_', '.', '/', '\\', '|', ':', ';', ',', '(', ')', '[', ']', '{', '}',
];

pub(crate) fn is_adult_text(text: &str) -> bool {
    let normalized = normalize_text(text);
    if ADULT_SUBSTRING_TERMS
        .iter()
        .any(|term| normalized.contains(term))
    {
        return true;
    }

    let tokenized = normalized
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect::<String>();
    let padded = format!(" {tokenized} ");
    ADULT_WORD_TERMS
        .iter()
        .any(|term| padded.contains(&format!(" {term} ")))
}

fn quote_sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

pub(crate) fn adult_match_sql(expr: &str) -> String {
    let lower = format!("LOWER(COALESCE(({expr}), ''))");
    let mut conditions: Vec<String> = ADULT_SUBSTRING_TERMS
        .iter()
        .map(|term| format!("{lower} LIKE '%{}%'", quote_sql_literal(term)))
        .collect();

    let mut token_expr = lower.clone();
    for delimiter in ADULT_SQL_TOKEN_DELIMITERS {
        token_expr = format!(
            "REPLACE({token_expr}, '{}', ' ')",
            quote_sql_literal(&delimiter.to_string())
        );
    }
    let padded = format!("(' ' || {token_expr} || ' ')");
    conditions.extend(
        ADULT_WORD_TERMS
            .iter()
            .map(|term| format!("{padded} LIKE '% {} %'", quote_sql_literal(term))),
    );

    format!("({})", conditions.join(" OR "))
}

fn concat_sql(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| format!("COALESCE({part}, '')"))
        .collect::<Vec<_>>()
        .join(" || ' ' || ")
}

fn category_haystack_for_alias(alias: &str) -> String {
    format!("(SELECT cat.search_text || ' ' || cat.name FROM categories cat WHERE cat.id = {alias}.category_id)")
}

fn category_haystack(category_alias: &str) -> String {
    format!("{category_alias}.search_text || ' ' || {category_alias}.name")
}

fn item_haystack(alias: &str, item_type: &str, category: Option<String>) -> String {
    let mut parts = match item_type {
        "channel" => vec![
            format!("{alias}.search_text"),
            format!("{alias}.name"),
            format!("{alias}.group_title"),
            format!("{alias}.tvg_name"),
        ],
        "movie" => vec![
            format!("{alias}.search_text"),
            format!("{alias}.name"),
            format!("{alias}.genre"),
            format!("{alias}.rating"),
        ],
        "series" => vec![
            format!("{alias}.search_text"),
            format!("{alias}.name"),
            format!("{alias}.genre"),
            format!("{alias}.rating"),
        ],
        "episode" => vec![
            format!("{alias}.search_text"),
            format!("{alias}.name"),
            format!("{alias}.plot"),
        ],
        _ => vec![format!("{alias}.search_text"), format!("{alias}.name")],
    };
    if let Some(category) = category {
        parts.push(category);
    }
    concat_sql(&parts)
}

pub(crate) fn adult_exclusion_sql(alias: &str, item_type: &str) -> String {
    let category = matches!(item_type, "channel" | "movie" | "series")
        .then(|| category_haystack_for_alias(alias));
    format!(
        "NOT {}",
        adult_match_sql(&item_haystack(alias, item_type, category))
    )
}

pub(crate) fn adult_exclusion_with_category_sql(
    alias: &str,
    item_type: &str,
    category_alias: &str,
) -> String {
    format!(
        "NOT {}",
        adult_match_sql(&item_haystack(
            alias,
            item_type,
            Some(category_haystack(category_alias)),
        ))
    )
}

pub(crate) fn adult_category_exclusion_sql(category_alias: &str) -> String {
    format!(
        "NOT {}",
        adult_match_sql(&category_haystack(category_alias))
    )
}

pub(crate) const ADULT_BLOCKED_MESSAGE: &str =
    "conteúdo bloqueado pela configuração de conteúdo adulto";

// ---------------------------------------------------------------------------
// Batch records produced by the sync engine
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ChannelRec {
    pub external_id: Option<String>,
    pub name: String,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub group_title: Option<String>,
    pub extra_json: Option<String>,
    pub position: i64,
    pub category_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct MovieRec {
    pub external_id: Option<String>,
    pub name: String,
    pub logo_url: Option<String>,
    pub stream_url: String,
    pub year: Option<i64>,
    pub duration_secs: Option<i64>,
    pub rating: Option<String>,
    pub plot: Option<String>,
    pub genre: Option<String>,
    pub extra_json: Option<String>,
    pub category_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EpisodeRec {
    pub season: i64,
    pub episode_num: i64,
    pub name: String,
    pub stream_url: String,
    pub duration_secs: Option<i64>,
    pub plot: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SeriesRec {
    pub external_id: String,
    pub name: String,
    pub cover_url: Option<String>,
    pub plot: Option<String>,
    pub year: Option<i64>,
    pub rating: Option<String>,
    pub genre: Option<String>,
    pub category_key: Option<String>,
    pub episodes: Vec<EpisodeRec>,
    pub episodes_synced: bool,
}

// ---------------------------------------------------------------------------
// Upserts
// ---------------------------------------------------------------------------

/// Upserts categories and returns a map of caller key -> category row id.
pub fn upsert_categories(
    conn: &mut Connection,
    source_id: i64,
    kind: &str,
    items: &[(String, String)], // (key, display name)
) -> AppResult<HashMap<String, i64>> {
    let tx = conn.transaction()?;
    let mut map = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "INSERT INTO categories (source_id, kind, external_id, name, search_text)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(source_id, kind, name) DO UPDATE SET
               external_id = excluded.external_id,
               search_text = excluded.search_text
             RETURNING id",
        )?;
        for (key, name) in items {
            let id: i64 = stmt.query_row(
                params![source_id, kind, key, name, normalize_text(name)],
                |r| r.get(0),
            )?;
            map.insert(key.clone(), id);
        }
    }
    tx.commit()?;
    Ok(map)
}

pub fn upsert_channels(
    conn: &mut Connection,
    source_id: i64,
    token: i64,
    recs: &[ChannelRec],
    cat_map: &HashMap<String, i64>,
) -> AppResult<usize> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO channels (source_id, category_id, external_id, name, search_text,
                logo_url, stream_url, tvg_id, tvg_name, group_title, extra_json,
                position, sync_token, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(source_id, stream_url) DO UPDATE SET
               category_id = excluded.category_id,
               external_id = excluded.external_id,
               name = excluded.name,
               search_text = excluded.search_text,
               logo_url = excluded.logo_url,
               tvg_id = excluded.tvg_id,
               tvg_name = excluded.tvg_name,
               group_title = excluded.group_title,
               extra_json = excluded.extra_json,
               position = excluded.position,
               sync_token = excluded.sync_token",
        )?;
        for rec in recs {
            let category_id = rec.category_key.as_ref().and_then(|k| cat_map.get(k));
            stmt.execute(params![
                source_id,
                category_id,
                rec.external_id,
                rec.name,
                normalize_text(&rec.name),
                rec.logo_url,
                rec.stream_url,
                rec.tvg_id,
                rec.tvg_name,
                rec.group_title,
                rec.extra_json,
                rec.position,
                token,
                now_ts(),
            ])?;
        }
    }
    tx.commit()?;
    Ok(recs.len())
}

pub fn upsert_movies(
    conn: &mut Connection,
    source_id: i64,
    token: i64,
    recs: &[MovieRec],
    cat_map: &HashMap<String, i64>,
) -> AppResult<usize> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO movies (source_id, category_id, external_id, name, search_text,
                logo_url, stream_url, year, duration_secs, rating, plot, genre, extra_json,
                sync_token, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(source_id, stream_url) DO UPDATE SET
               category_id = excluded.category_id,
               external_id = excluded.external_id,
               name = excluded.name,
               search_text = excluded.search_text,
               logo_url = excluded.logo_url,
               year = excluded.year,
               duration_secs = excluded.duration_secs,
               rating = excluded.rating,
               plot = excluded.plot,
               genre = excluded.genre,
               extra_json = excluded.extra_json,
               sync_token = excluded.sync_token",
        )?;
        for rec in recs {
            let category_id = rec.category_key.as_ref().and_then(|k| cat_map.get(k));
            stmt.execute(params![
                source_id,
                category_id,
                rec.external_id,
                rec.name,
                normalize_text(&rec.name),
                rec.logo_url,
                rec.stream_url,
                rec.year,
                rec.duration_secs,
                rec.rating,
                rec.plot,
                rec.genre,
                rec.extra_json,
                token,
                now_ts(),
            ])?;
        }
    }
    tx.commit()?;
    Ok(recs.len())
}

/// Upserts series and their episodes. Returns number of series written.
pub fn upsert_series(
    conn: &mut Connection,
    source_id: i64,
    token: i64,
    recs: &[SeriesRec],
    cat_map: &HashMap<String, i64>,
) -> AppResult<usize> {
    let tx = conn.transaction()?;
    {
        let mut series_stmt = tx.prepare(
            "INSERT INTO series (source_id, category_id, external_id, name, search_text,
                cover_url, plot, year, rating, genre, episodes_synced, sync_token, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(source_id, external_id) DO UPDATE SET
               category_id = excluded.category_id,
               name = excluded.name,
               search_text = excluded.search_text,
               cover_url = COALESCE(excluded.cover_url, series.cover_url),
               plot = COALESCE(excluded.plot, series.plot),
               year = COALESCE(excluded.year, series.year),
               rating = COALESCE(excluded.rating, series.rating),
               genre = COALESCE(excluded.genre, series.genre),
               episodes_synced = MAX(excluded.episodes_synced, series.episodes_synced),
               sync_token = excluded.sync_token
             RETURNING id",
        )?;
        let mut ep_stmt = tx.prepare(
            "INSERT INTO episodes (series_id, source_id, season, episode_num, name,
                search_text, stream_url, duration_secs, plot, thumbnail_url, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(series_id, season, episode_num) DO UPDATE SET
               name = excluded.name,
               search_text = excluded.search_text,
               stream_url = excluded.stream_url,
               duration_secs = excluded.duration_secs,
               plot = COALESCE(excluded.plot, episodes.plot),
               thumbnail_url = COALESCE(excluded.thumbnail_url, episodes.thumbnail_url)",
        )?;
        for rec in recs {
            let category_id = rec.category_key.as_ref().and_then(|k| cat_map.get(k));
            let series_id: i64 = series_stmt.query_row(
                params![
                    source_id,
                    category_id,
                    rec.external_id,
                    rec.name,
                    normalize_text(&rec.name),
                    rec.cover_url,
                    rec.plot,
                    rec.year,
                    rec.rating,
                    rec.genre,
                    rec.episodes_synced as i64,
                    token,
                    now_ts(),
                ],
                |r| r.get(0),
            )?;
            for ep in &rec.episodes {
                ep_stmt.execute(params![
                    series_id,
                    source_id,
                    ep.season,
                    ep.episode_num,
                    ep.name,
                    normalize_text(&ep.name),
                    ep.stream_url,
                    ep.duration_secs,
                    ep.plot,
                    ep.thumbnail_url,
                    now_ts(),
                ])?;
            }
        }
    }
    tx.commit()?;
    Ok(recs.len())
}

/// Removes rows that were not touched by the latest sync of a catalog.
pub fn delete_stale(
    conn: &Connection,
    table: &str,
    source_id: i64,
    token: i64,
) -> AppResult<usize> {
    let sql = match table {
        "channels" => "DELETE FROM channels WHERE source_id = ?1 AND sync_token != ?2",
        "movies" => "DELETE FROM movies WHERE source_id = ?1 AND sync_token != ?2",
        "series" => "DELETE FROM series WHERE source_id = ?1 AND sync_token != ?2",
        _ => return Err(AppError::Invalid(format!("tabela desconhecida: {table}"))),
    };
    Ok(conn.execute(sql, params![source_id, token])?)
}

pub fn mark_series_episodes_synced(conn: &Connection, series_id: i64) -> AppResult<()> {
    conn.execute(
        "UPDATE series SET episodes_synced = 1 WHERE id = ?1",
        params![series_id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Paged listing queries
// ---------------------------------------------------------------------------

struct FilterSql {
    where_clause: String,
    values: Vec<SqlValue>,
}

fn build_filter(
    filter: &CatalogFilter,
    table_alias: &str,
    item_type: &str,
    profile: i64,
    block_adult: bool,
) -> FilterSql {
    let mut conds: Vec<String> = vec!["1=1".into()];
    let mut values: Vec<SqlValue> = Vec::new();
    if let Some(pid) = filter.profile_id {
        values.push(SqlValue::Integer(pid));
        conds.push(format!(
            "{table_alias}.source_id IN (SELECT id FROM sources WHERE profile_id = ?{})",
            values.len()
        ));
    }
    if let Some(sid) = filter.source_id {
        values.push(SqlValue::Integer(sid));
        conds.push(format!("{table_alias}.source_id = ?{}", values.len()));
    }
    if let Some(cid) = filter.category_id {
        values.push(SqlValue::Integer(cid));
        conds.push(format!("{table_alias}.category_id = ?{}", values.len()));
    }
    if let Some(q) = filter
        .search
        .as_ref()
        .map(|s| normalize_text(s))
        .filter(|s| !s.is_empty())
    {
        values.push(SqlValue::Text(format!("%{}%", escape_like(&q))));
        conds.push(format!(
            "{table_alias}.search_text LIKE ?{} ESCAPE '\\'",
            values.len()
        ));
    }
    if filter.favorites_only {
        values.push(SqlValue::Integer(profile));
        values.push(SqlValue::Text(item_type.to_string()));
        conds.push(format!(
            "EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?{} AND f.item_type = ?{} AND f.item_id = {table_alias}.id)",
            values.len() - 1,
            values.len()
        ));
    }
    if block_adult {
        conds.push(adult_exclusion_sql(table_alias, item_type));
    }
    FilterSql {
        where_clause: conds.join(" AND "),
        values,
    }
}

fn clamp_page(filter: &CatalogFilter) -> (i64, i64) {
    let limit = filter.limit.clamp(1, 500);
    let offset = filter.offset.max(0);
    (limit, offset)
}

pub fn list_channels_filtered(
    conn: &Connection,
    profile: i64,
    filter: &CatalogFilter,
    block_adult: bool,
) -> AppResult<Paged<MediaCard>> {
    let f = build_filter(filter, "ch", "channel", profile, block_adult);
    let (limit, offset) = clamp_page(filter);

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM channels ch WHERE {}", f.where_clause),
        params_from_iter(f.values.iter()),
        |r| r.get(0),
    )?;

    let mut values = f.values.clone();
    values.push(SqlValue::Integer(profile));
    let fav_idx = values.len();
    values.push(SqlValue::Integer(limit));
    values.push(SqlValue::Integer(offset));
    let sql = format!(
        "SELECT ch.id, ch.name, COALESCE(ch.logo_path, ch.logo_url),
                COALESCE(ch.group_title, ''), ch.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?{fav_idx} AND f.item_type = 'channel' AND f.item_id = ch.id)
         FROM channels ch WHERE {}
         ORDER BY ch.position ASC, ch.name COLLATE NOCASE ASC
         LIMIT ?{} OFFSET ?{}",
        f.where_clause,
        fav_idx + 1,
        fav_idx + 2
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(values.iter()), |r| {
            Ok(MediaCard {
                item_type: "channel".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: {
                    let g: String = r.get(3)?;
                    if g.is_empty() {
                        None
                    } else {
                        Some(g)
                    }
                },
                source_id: r.get(4)?,
                favorite: r.get::<_, i64>(5)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Paged {
        items,
        total,
        offset,
        limit,
    })
}

pub fn list_movies_filtered(
    conn: &Connection,
    profile: i64,
    filter: &CatalogFilter,
    block_adult: bool,
) -> AppResult<Paged<MediaCard>> {
    let f = build_filter(filter, "m", "movie", profile, block_adult);
    let (limit, offset) = clamp_page(filter);

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM movies m WHERE {}", f.where_clause),
        params_from_iter(f.values.iter()),
        |r| r.get(0),
    )?;

    let mut values = f.values.clone();
    values.push(SqlValue::Integer(profile));
    let fav_idx = values.len();
    values.push(SqlValue::Integer(limit));
    values.push(SqlValue::Integer(offset));
    let sql = format!(
        "SELECT m.id, m.name, COALESCE(m.logo_path, m.logo_url), m.year, m.genre, m.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?{fav_idx} AND f.item_type = 'movie' AND f.item_id = m.id)
         FROM movies m WHERE {}
         ORDER BY m.name COLLATE NOCASE ASC
         LIMIT ?{} OFFSET ?{}",
        f.where_clause,
        fav_idx + 1,
        fav_idx + 2
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(values.iter()), |r| {
            let year: Option<i64> = r.get(3)?;
            let genre: Option<String> = r.get(4)?;
            Ok(MediaCard {
                item_type: "movie".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: year.map(|y| y.to_string()).or(genre),
                source_id: r.get(5)?,
                favorite: r.get::<_, i64>(6)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Paged {
        items,
        total,
        offset,
        limit,
    })
}

pub fn list_series_filtered(
    conn: &Connection,
    profile: i64,
    filter: &CatalogFilter,
    block_adult: bool,
) -> AppResult<Paged<MediaCard>> {
    let f = build_filter(filter, "se", "series", profile, block_adult);
    let (limit, offset) = clamp_page(filter);

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM series se WHERE {}", f.where_clause),
        params_from_iter(f.values.iter()),
        |r| r.get(0),
    )?;

    let mut values = f.values.clone();
    values.push(SqlValue::Integer(profile));
    let fav_idx = values.len();
    values.push(SqlValue::Integer(limit));
    values.push(SqlValue::Integer(offset));
    let sql = format!(
        "SELECT se.id, se.name, COALESCE(se.cover_path, se.cover_url), se.year, se.genre, se.source_id,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?{fav_idx} AND f.item_type = 'series' AND f.item_id = se.id)
         FROM series se WHERE {}
         ORDER BY se.name COLLATE NOCASE ASC
         LIMIT ?{} OFFSET ?{}",
        f.where_clause,
        fav_idx + 1,
        fav_idx + 2
    );
    let mut stmt = conn.prepare(&sql)?;
    let items = stmt
        .query_map(params_from_iter(values.iter()), |r| {
            let year: Option<i64> = r.get(3)?;
            let genre: Option<String> = r.get(4)?;
            Ok(MediaCard {
                item_type: "series".into(),
                id: r.get(0)?,
                name: r.get(1)?,
                image: r.get(2)?,
                subtitle: year.map(|y| y.to_string()).or(genre),
                source_id: r.get(5)?,
                favorite: r.get::<_, i64>(6)? != 0,
                position_secs: None,
                duration_secs: None,
                series_id: Some(r.get(0)?),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Paged {
        items,
        total,
        offset,
        limit,
    })
}

pub fn list_categories_filtered(
    conn: &Connection,
    kind: &str,
    profile_id: Option<i64>,
    block_adult: bool,
) -> AppResult<Vec<Category>> {
    let count_table = match kind {
        "live" => "channels",
        "movie" => "movies",
        "series" => "series",
        other => {
            return Err(AppError::Invalid(format!(
                "tipo de categoria inválido: {other}"
            )))
        }
    };
    let mut sql = format!(
        "SELECT cat.id, cat.source_id, cat.kind, cat.name,
                (SELECT COUNT(*) FROM {count_table} t WHERE t.category_id = cat.id{count_filter}) AS cnt
         FROM categories cat WHERE cat.kind = ?1"
        ,
        count_filter = if block_adult {
            format!(
                " AND {}",
                adult_exclusion_with_category_sql(
                    "t",
                    if kind == "live" { "channel" } else { kind },
                    "cat",
                )
            )
        } else {
            String::new()
        }
    );
    let mut values: Vec<SqlValue> = vec![SqlValue::Text(kind.to_string())];
    if let Some(pid) = profile_id {
        values.push(SqlValue::Integer(pid));
        sql.push_str(" AND cat.source_id IN (SELECT id FROM sources WHERE profile_id = ?2)");
    }
    if block_adult {
        sql.push_str(&format!(" AND {}", adult_category_exclusion_sql("cat")));
    }
    sql.push_str(" ORDER BY cat.name COLLATE NOCASE ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params_from_iter(values.iter()), |r| {
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

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

/// Splits a comma/pipe/slash-separated people or genre string into a list.
pub fn split_list(s: Option<String>) -> Vec<String> {
    s.map(|v| {
        v.split([',', '|', '/'])
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect()
    })
    .unwrap_or_default()
}

pub fn movie_detail(conn: &Connection, profile: i64, id: i64) -> AppResult<MovieDetail> {
    conn.query_row(
        "SELECT m.id, m.source_id, m.name, COALESCE(m.logo_path, m.logo_url), m.backdrop_url, m.year,
                m.duration_secs, m.rating, m.plot, m.genre, m.actors, m.director, m.trailer, m.country,
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='movie' AND f.item_id = m.id),
                h.position_secs, h.duration_secs
         FROM movies m
         LEFT JOIN history h ON h.profile_id = ?2 AND h.item_type='movie' AND h.item_id = m.id
         WHERE m.id = ?1",
        params![id, profile],
        |r| {
            Ok(MovieDetail {
                id: r.get(0)?,
                source_id: r.get(1)?,
                name: r.get(2)?,
                image: r.get(3)?,
                backdrop: r.get(4)?,
                year: r.get(5)?,
                duration_secs: r.get(6)?,
                rating: r.get(7)?,
                plot: r.get(8)?,
                genre: r.get(9)?,
                cast: split_list(r.get(10)?),
                director: r.get(11)?,
                trailer: r.get(12)?,
                country: r.get(13)?,
                favorite: r.get::<_, i64>(14)? != 0,
                position_secs: r.get(15)?,
                watched_duration_secs: r.get(16)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("filme {id}")))
}

pub fn series_detail(conn: &Connection, profile: i64, id: i64) -> AppResult<SeriesDetail> {
    let head = conn
        .query_row(
            "SELECT se.id, se.source_id, se.name, COALESCE(se.cover_path, se.cover_url), se.backdrop_url,
                    se.plot, se.year, se.rating, se.genre, se.actors, se.director, se.trailer,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='series' AND f.item_id = se.id)
             FROM series se WHERE se.id = ?1",
            params![id, profile],
            |r| {
                Ok(SeriesDetail {
                    id: r.get(0)?,
                    source_id: r.get(1)?,
                    name: r.get(2)?,
                    cover: r.get(3)?,
                    backdrop: r.get(4)?,
                    plot: r.get(5)?,
                    year: r.get(6)?,
                    rating: r.get(7)?,
                    genre: r.get(8)?,
                    cast: split_list(r.get(9)?),
                    director: r.get(10)?,
                    trailer: r.get(11)?,
                    favorite: r.get::<_, i64>(12)? != 0,
                    seasons: Vec::new(),
                })
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("série {id}")))?;

    let mut stmt = conn.prepare(
        "SELECT e.id, e.series_id, e.season, e.episode_num, e.name, e.duration_secs, e.plot,
                e.thumbnail_url,
                h.position_secs, h.duration_secs, COALESCE(h.completed, 0),
                EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='episode' AND f.item_id = e.id)
         FROM episodes e
         LEFT JOIN history h ON h.profile_id = ?2 AND h.item_type='episode' AND h.item_id = e.id
         WHERE e.series_id = ?1
         ORDER BY e.season ASC, e.episode_num ASC",
    )?;
    let episodes = stmt
        .query_map(params![id, profile], |r| {
            Ok(EpisodeOut {
                id: r.get(0)?,
                series_id: r.get(1)?,
                season: r.get(2)?,
                episode_num: r.get(3)?,
                name: r.get(4)?,
                duration_secs: r.get(5)?,
                plot: r.get(6)?,
                thumbnail: r.get(7)?,
                position_secs: r.get(8)?,
                watched_duration_secs: r.get(9)?,
                completed: r.get::<_, i64>(10)? != 0,
                favorite: r.get::<_, i64>(11)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut seasons: Vec<Season> = Vec::new();
    for ep in episodes {
        match seasons.last_mut() {
            Some(season) if season.season == ep.season => season.episodes.push(ep),
            _ => seasons.push(Season {
                season: ep.season,
                episodes: vec![ep],
            }),
        }
    }

    Ok(SeriesDetail { seasons, ..head })
}

// ---------------------------------------------------------------------------
// Card builders (shared by favorites / history / home / search)
// ---------------------------------------------------------------------------

pub fn channel_card(conn: &Connection, profile: i64, id: i64) -> AppResult<Option<MediaCard>> {
    Ok(conn
        .query_row(
            "SELECT ch.id, ch.name, COALESCE(ch.logo_path, ch.logo_url), ch.group_title, ch.source_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='channel' AND f.item_id = ch.id)
             FROM channels ch WHERE ch.id = ?1",
            params![id, profile],
            |r| {
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
            },
        )
        .optional()?)
}

pub fn movie_card(conn: &Connection, profile: i64, id: i64) -> AppResult<Option<MediaCard>> {
    Ok(conn
        .query_row(
            "SELECT m.id, m.name, COALESCE(m.logo_path, m.logo_url), m.year, m.source_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='movie' AND f.item_id = m.id)
             FROM movies m WHERE m.id = ?1",
            params![id, profile],
            |r| {
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
            },
        )
        .optional()?)
}

pub fn series_card(conn: &Connection, profile: i64, id: i64) -> AppResult<Option<MediaCard>> {
    Ok(conn
        .query_row(
            "SELECT se.id, se.name, COALESCE(se.cover_path, se.cover_url), se.year, se.source_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='series' AND f.item_id = se.id)
             FROM series se WHERE se.id = ?1",
            params![id, profile],
            |r| {
                let year: Option<i64> = r.get(3)?;
                Ok(MediaCard {
                    item_type: "series".into(),
                    id: r.get(0)?,
                    name: r.get(1)?,
                    image: r.get(2)?,
                    subtitle: year.map(|y| y.to_string()),
                    source_id: r.get(4)?,
                    favorite: r.get::<_, i64>(5)? != 0,
                    position_secs: None,
                    duration_secs: None,
                    series_id: Some(r.get(0)?),
                })
            },
        )
        .optional()?)
}

pub fn episode_card(conn: &Connection, profile: i64, id: i64) -> AppResult<Option<MediaCard>> {
    Ok(conn
        .query_row(
            "SELECT e.id, se.name || ' · T' || e.season || ' E' || e.episode_num,
                    COALESCE(se.cover_path, se.cover_url), e.name, e.source_id, e.series_id,
                    EXISTS(SELECT 1 FROM favorites f WHERE f.profile_id = ?2 AND f.item_type='episode' AND f.item_id = e.id)
             FROM episodes e JOIN series se ON se.id = e.series_id
             WHERE e.id = ?1",
            params![id, profile],
            |r| {
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
            },
        )
        .optional()?)
}

pub fn card_for(
    conn: &Connection,
    profile: i64,
    item_type: &str,
    id: i64,
) -> AppResult<Option<MediaCard>> {
    match item_type {
        "channel" => channel_card(conn, profile, id),
        "movie" => movie_card(conn, profile, id),
        "series" => series_card(conn, profile, id),
        "episode" => episode_card(conn, profile, id),
        other => Err(AppError::Invalid(format!("tipo de item inválido: {other}"))),
    }
}

pub fn is_adult_item(conn: &Connection, item_type: &str, id: i64) -> AppResult<bool> {
    crate::security::validate_item_type(item_type)?;
    let text = match item_type {
        "channel" => conn
            .query_row(
                "SELECT ch.name || ' ' || COALESCE(ch.search_text, '') || ' ' ||
                        COALESCE(ch.group_title, '') || ' ' || COALESCE(ch.tvg_name, '') || ' ' ||
                        COALESCE(cat.name, '') || ' ' || COALESCE(cat.search_text, '')
                 FROM channels ch
                 LEFT JOIN categories cat ON cat.id = ch.category_id
                 WHERE ch.id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()?,
        "movie" => conn
            .query_row(
                "SELECT m.name || ' ' || COALESCE(m.search_text, '') || ' ' ||
                        COALESCE(m.genre, '') || ' ' || COALESCE(m.rating, '') || ' ' ||
                        COALESCE(cat.name, '') || ' ' || COALESCE(cat.search_text, '')
                 FROM movies m
                 LEFT JOIN categories cat ON cat.id = m.category_id
                 WHERE m.id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()?,
        "series" => conn
            .query_row(
                "SELECT se.name || ' ' || COALESCE(se.search_text, '') || ' ' ||
                        COALESCE(se.genre, '') || ' ' || COALESCE(se.rating, '') || ' ' ||
                        COALESCE(cat.name, '') || ' ' || COALESCE(cat.search_text, '')
                 FROM series se
                 LEFT JOIN categories cat ON cat.id = se.category_id
                 WHERE se.id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()?,
        "episode" => conn
            .query_row(
                "SELECT e.name || ' ' || COALESCE(e.search_text, '') || ' ' ||
                        COALESCE(e.plot, '') || ' ' || se.name || ' ' ||
                        COALESCE(se.search_text, '') || ' ' || COALESCE(se.genre, '') || ' ' ||
                        COALESCE(cat.name, '') || ' ' || COALESCE(cat.search_text, '')
                 FROM episodes e
                 JOIN series se ON se.id = e.series_id
                 LEFT JOIN categories cat ON cat.id = se.category_id
                 WHERE e.id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()?,
        _ => None,
    };
    Ok(text.as_deref().is_some_and(is_adult_text))
}

// ---------------------------------------------------------------------------
// Stream resolution (URLs with credentials never leave Rust except to play)
// ---------------------------------------------------------------------------

pub struct PlayableRow {
    pub stream_url: String,
    pub name: String,
    pub image: Option<String>,
    pub subtitle: Option<String>,
    pub series_id: Option<i64>,
}

pub fn playable_row(conn: &Connection, item_type: &str, id: i64) -> AppResult<PlayableRow> {
    let row = match item_type {
        "channel" => conn
            .query_row(
                "SELECT stream_url, name, COALESCE(logo_path, logo_url), group_title FROM channels WHERE id = ?1",
                params![id],
                |r| {
                    Ok(PlayableRow {
                        stream_url: r.get(0)?,
                        name: r.get(1)?,
                        image: r.get(2)?,
                        subtitle: r.get(3)?,
                        series_id: None,
                    })
                },
            )
            .optional()?,
        "movie" => conn
            .query_row(
                "SELECT stream_url, name, COALESCE(logo_path, logo_url), genre FROM movies WHERE id = ?1",
                params![id],
                |r| {
                    Ok(PlayableRow {
                        stream_url: r.get(0)?,
                        name: r.get(1)?,
                        image: r.get(2)?,
                        subtitle: r.get(3)?,
                        series_id: None,
                    })
                },
            )
            .optional()?,
        "episode" => conn
            .query_row(
                "SELECT e.stream_url, se.name || ' · T' || e.season || ' E' || e.episode_num,
                        COALESCE(se.cover_path, se.cover_url), e.name, e.series_id
                 FROM episodes e JOIN series se ON se.id = e.series_id WHERE e.id = ?1",
                params![id],
                |r| {
                    Ok(PlayableRow {
                        stream_url: r.get(0)?,
                        name: r.get(1)?,
                        image: r.get(2)?,
                        subtitle: r.get(3)?,
                        series_id: r.get(4)?,
                    })
                },
            )
            .optional()?,
        other => return Err(AppError::Invalid(format!("tipo não reproduzível: {other}"))),
    };
    row.ok_or_else(|| AppError::NotFound(format!("{item_type} {id}")))
}

/// Next episode of the same series, in (season, episode) order.
pub fn next_episode_id(conn: &Connection, episode_id: i64) -> AppResult<Option<i64>> {
    Ok(conn
        .query_row(
            "SELECT n.id FROM episodes cur
             JOIN episodes n ON n.series_id = cur.series_id
               AND (n.season > cur.season OR (n.season = cur.season AND n.episode_num > cur.episode_num))
             WHERE cur.id = ?1
             ORDER BY n.season ASC, n.episode_num ASC
             LIMIT 1",
            params![episode_id],
            |r| r.get(0),
        )
        .optional()?)
}

/// Items still missing a locally cached logo (for selective logo sync).
pub fn logos_to_fetch(
    conn: &Connection,
    source_id: i64,
    limit: i64,
) -> AppResult<Vec<(String, i64, String)>> {
    let mut out = Vec::new();
    let queries = [
        ("channels", "SELECT id, logo_url FROM channels WHERE source_id = ?1 AND logo_url IS NOT NULL AND logo_url != '' AND logo_path IS NULL LIMIT ?2"),
        ("movies", "SELECT id, logo_url FROM movies WHERE source_id = ?1 AND logo_url IS NOT NULL AND logo_url != '' AND logo_path IS NULL LIMIT ?2"),
        ("series", "SELECT id, cover_url FROM series WHERE source_id = ?1 AND cover_url IS NOT NULL AND cover_url != '' AND cover_path IS NULL LIMIT ?2"),
    ];
    for (table, sql) in queries {
        let remaining = limit - out.len() as i64;
        if remaining <= 0 {
            break;
        }
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![source_id, remaining], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, url) = row?;
            out.push((table.to_string(), id, url));
        }
    }
    Ok(out)
}

pub fn set_logo_path(conn: &Connection, table: &str, id: i64, path: &str) -> AppResult<()> {
    let sql = match table {
        "channels" => "UPDATE channels SET logo_path = ?1 WHERE id = ?2",
        "movies" => "UPDATE movies SET logo_path = ?1 WHERE id = ?2",
        "series" => "UPDATE series SET cover_path = ?1 WHERE id = ?2",
        other => return Err(AppError::Invalid(format!("tabela desconhecida: {other}"))),
    };
    conn.execute(sql, params![path, id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;
    use crate::models::NewSource;
    use crate::repo::sources;

    fn seed_source(db: &std::sync::Arc<crate::db::Db>) -> i64 {
        db.write(|c| {
            sources::add(
                c,
                1,
                &NewSource {
                    name: "Teste".into(),
                    kind: "m3u_url".into(),
                    url: "http://example.com/x.m3u".into(),
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
        .unwrap()
    }

    fn ch(name: &str, url: &str, group: Option<&str>) -> ChannelRec {
        ChannelRec {
            external_id: None,
            name: name.into(),
            logo_url: None,
            stream_url: url.into(),
            tvg_id: None,
            tvg_name: None,
            group_title: group.map(String::from),
            extra_json: None,
            position: 0,
            category_key: group.map(String::from),
        }
    }

    #[test]
    fn channel_upsert_keeps_ids_stable_and_removes_stale() {
        let db = temp_db();
        let sid = seed_source(&db);

        let cats = db
            .write(|c| upsert_categories(c, sid, "live", &[("Esportes".into(), "Esportes".into())]))
            .unwrap();

        db.write(|c| {
            upsert_channels(
                c,
                sid,
                1,
                &[
                    ch("Canal A", "http://h/a.ts", Some("Esportes")),
                    ch("Canal B", "http://h/b.ts", None),
                ],
                &cats,
            )
        })
        .unwrap();

        let first = db
            .read(move |c| {
                list_channels_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        limit: 50,
                        ..Default::default()
                    },
                    false,
                )
            })
            .unwrap();
        assert_eq!(first.total, 2);
        let id_a = first.items.iter().find(|i| i.name == "Canal A").unwrap().id;

        // Second sync: Canal A renamed, Canal B gone.
        db.write(|c| {
            upsert_channels(
                c,
                sid,
                2,
                &[ch("Canal A HD", "http://h/a.ts", Some("Esportes"))],
                &cats,
            )
        })
        .unwrap();
        db.write(move |c| {
            delete_stale(c, "channels", sid, 2)?;
            Ok(())
        })
        .unwrap();

        let second = db
            .read(move |c| {
                list_channels_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        limit: 50,
                        ..Default::default()
                    },
                    false,
                )
            })
            .unwrap();
        assert_eq!(second.total, 1);
        assert_eq!(second.items[0].name, "Canal A HD");
        assert_eq!(second.items[0].id, id_a, "id must survive resync");
    }

    #[test]
    fn series_upsert_with_episodes_and_detail() {
        let db = temp_db();
        let sid = seed_source(&db);
        let rec = SeriesRec {
            external_id: "m3u:dark".into(),
            name: "Dark".into(),
            cover_url: Some("http://img/dark.jpg".into()),
            plot: None,
            year: Some(2017),
            rating: None,
            genre: None,
            category_key: None,
            episodes_synced: true,
            episodes: vec![
                EpisodeRec {
                    season: 1,
                    episode_num: 2,
                    name: "Dark S01E02".into(),
                    stream_url: "http://h/d2.mp4".into(),
                    duration_secs: None,
                    plot: None,
                    thumbnail_url: None,
                },
                EpisodeRec {
                    season: 1,
                    episode_num: 1,
                    name: "Dark S01E01".into(),
                    stream_url: "http://h/d1.mp4".into(),
                    duration_secs: None,
                    plot: None,
                    thumbnail_url: None,
                },
                EpisodeRec {
                    season: 2,
                    episode_num: 1,
                    name: "Dark S02E01".into(),
                    stream_url: "http://h/d3.mp4".into(),
                    duration_secs: None,
                    plot: None,
                    thumbnail_url: None,
                },
            ],
        };
        db.write(move |c| upsert_series(c, sid, 1, &[rec], &HashMap::new()))
            .unwrap();

        let series_id: i64 = db
            .read(|c| Ok(c.query_row("SELECT id FROM series", [], |r| r.get(0))?))
            .unwrap();
        let detail = db.read(move |c| series_detail(c, 1, series_id)).unwrap();
        assert_eq!(detail.name, "Dark");
        assert_eq!(detail.seasons.len(), 2);
        assert_eq!(detail.seasons[0].episodes.len(), 2);
        assert_eq!(detail.seasons[0].episodes[0].episode_num, 1);

        let first_ep = detail.seasons[0].episodes[0].id;
        let next = db.read(move |c| next_episode_id(c, first_ep)).unwrap();
        assert_eq!(next, Some(detail.seasons[0].episodes[1].id));
        let last_ep = detail.seasons[1].episodes[0].id;
        let after_last = db.read(move |c| next_episode_id(c, last_ep)).unwrap();
        assert_eq!(after_last, None);
    }

    #[test]
    fn search_filter_is_accent_insensitive_and_paged() {
        let db = temp_db();
        let sid = seed_source(&db);
        let recs: Vec<ChannelRec> = (0..30)
            .map(|i| {
                ch(
                    &format!("Canal Ação {i}"),
                    &format!("http://h/{i}.ts"),
                    None,
                )
            })
            .chain(std::iter::once(ch("Outro", "http://h/outro.ts", None)))
            .collect();
        db.write(move |c| upsert_channels(c, sid, 1, &recs, &HashMap::new()))
            .unwrap();

        let page = db
            .read(|c| {
                list_channels_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        search: Some("acao".into()),
                        limit: 10,
                        offset: 10,
                        ..Default::default()
                    },
                    false,
                )
            })
            .unwrap();
        assert_eq!(page.total, 30);
        assert_eq!(page.items.len(), 10);
    }

    #[test]
    fn adult_text_classifier_uses_word_boundaries() {
        assert!(is_adult_text("Canais Adultos"));
        assert!(is_adult_text("Filmes XXX"));
        assert!(is_adult_text("Cinema 18+"));
        assert!(is_adult_text("Categoria [sex]"));
        assert!(!is_adult_text("Sexta Cultural"));
        assert!(!is_adult_text("Canal infantil"));
    }

    #[test]
    fn adult_block_filters_catalog_items_and_categories() {
        let db = temp_db();
        let sid = seed_source(&db);

        let cats = db
            .write(|c| {
                upsert_categories(
                    c,
                    sid,
                    "live",
                    &[
                        ("Familia".into(), "Família".into()),
                        ("Adultos".into(), "Adultos".into()),
                    ],
                )
            })
            .unwrap();

        db.write(|c| {
            upsert_channels(
                c,
                sid,
                1,
                &[
                    ch("Canal Familia", "http://h/familia.ts", Some("Familia")),
                    ch("Sexta Cultural", "http://h/sexta.ts", Some("Familia")),
                    ch("Canal Adulto", "http://h/adulto.ts", Some("Adultos")),
                ],
                &cats,
            )
        })
        .unwrap();

        let unblocked = db
            .read(|c| {
                list_channels_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        limit: 50,
                        ..Default::default()
                    },
                    false,
                )
            })
            .unwrap();
        assert_eq!(unblocked.total, 3);

        let blocked = db
            .read(|c| {
                list_channels_filtered(
                    c,
                    1,
                    &CatalogFilter {
                        limit: 50,
                        ..Default::default()
                    },
                    true,
                )
            })
            .unwrap();
        let names = blocked
            .items
            .iter()
            .map(|item| item.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(blocked.total, 2);
        assert_eq!(names, vec!["Canal Familia", "Sexta Cultural"]);

        let categories = db
            .read(|c| list_categories_filtered(c, "live", Some(1), true))
            .unwrap();
        assert_eq!(categories.len(), 1);
        assert_eq!(categories[0].name, "Família");
        assert_eq!(categories[0].item_count, 2);

        let adult_id = unblocked
            .items
            .iter()
            .find(|item| item.name == "Canal Adulto")
            .unwrap()
            .id;
        assert!(db
            .read(move |c| is_adult_item(c, "channel", adult_id))
            .unwrap());
    }
}

//! EPG program cache: bulk replace per source plus now/next lookups.

use crate::epg::EpgProgram;
use crate::error::AppResult;
use crate::models::{EpgEntry, NowNext};
use crate::util::now_ts;
use rusqlite::{params, Connection};

pub fn replace_for_source(
    conn: &mut Connection,
    source_id: i64,
    programs: &[EpgProgram],
) -> AppResult<usize> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM epg_programs WHERE source_id = ?1", params![source_id])?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO epg_programs (source_id, channel_key, title, description, start_ts, stop_ts)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for p in programs {
            stmt.execute(params![
                source_id,
                p.channel,
                p.title,
                p.description,
                p.start_ts,
                p.stop_ts
            ])?;
        }
    }
    tx.commit()?;
    Ok(programs.len())
}

/// Current and next program for up to 200 channels at once.
pub fn now_next(conn: &Connection, channel_ids: &[i64]) -> AppResult<Vec<NowNext>> {
    let now = now_ts();
    let mut out = Vec::new();
    let mut chan_stmt =
        conn.prepare("SELECT source_id, LOWER(COALESCE(tvg_id, '')) FROM channels WHERE id = ?1")?;
    let mut prog_stmt = conn.prepare(
        "SELECT title, description, start_ts, stop_ts FROM epg_programs
         WHERE source_id = ?1 AND channel_key = ?2 AND stop_ts > ?3
         ORDER BY start_ts ASC LIMIT 2",
    )?;
    for &id in channel_ids.iter().take(200) {
        let Ok((source_id, key)) =
            chan_stmt.query_row(params![id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        else {
            continue;
        };
        if key.is_empty() {
            out.push(NowNext { channel_id: id, now: None, next: None });
            continue;
        }
        let progs = prog_stmt
            .query_map(params![source_id, key, now], |r| {
                Ok(EpgEntry {
                    title: r.get(0)?,
                    description: r.get(1)?,
                    start_ts: r.get(2)?,
                    stop_ts: r.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let mut iter = progs.into_iter();
        let first = iter.next();
        let second = iter.next();
        // The first program is "now" only if it already started.
        let (now_prog, next_prog) = match first {
            Some(p) if p.start_ts <= now => (Some(p), second),
            Some(p) => (None, Some(p)),
            None => (None, None),
        };
        out.push(NowNext { channel_id: id, now: now_prog, next: next_prog });
    }
    Ok(out)
}

pub fn for_channel(
    conn: &Connection,
    channel_id: i64,
    from_ts: i64,
    to_ts: i64,
) -> AppResult<Vec<EpgEntry>> {
    let (source_id, key) = conn.query_row(
        "SELECT source_id, LOWER(COALESCE(tvg_id, '')) FROM channels WHERE id = ?1",
        params![channel_id],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)),
    )?;
    if key.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT title, description, start_ts, stop_ts FROM epg_programs
         WHERE source_id = ?1 AND channel_key = ?2 AND stop_ts > ?3 AND start_ts < ?4
         ORDER BY start_ts ASC LIMIT 200",
    )?;
    let rows = stmt
        .query_map(params![source_id, key, from_ts, to_ts], |r| {
            Ok(EpgEntry {
                title: r.get(0)?,
                description: r.get(1)?,
                start_ts: r.get(2)?,
                stop_ts: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Drops programs that ended more than `keep_past_secs` ago.
pub fn prune_old(conn: &Connection, keep_past_secs: i64) -> AppResult<usize> {
    let cutoff = now_ts() - keep_past_secs;
    Ok(conn.execute("DELETE FROM epg_programs WHERE stop_ts < ?1", params![cutoff])?)
}

pub fn clear_all(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM epg_programs", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;
    use crate::models::NewSource;
    use crate::repo::{catalog, sources};
    use std::collections::HashMap;

    #[test]
    fn now_next_resolves_via_tvg_id() {
        let db = temp_db();
        let sid = db
            .write(|c| {
                sources::add(
                    c,
                    &NewSource {
                        name: "F".into(),
                        kind: "m3u_url".into(),
                        url: "http://e/x.m3u".into(),
                        username: None,
                        password: None,
                        epg_url: None,
                        sync_channels: true,
                        sync_movies: false,
                        sync_series: false,
                        sync_epg: true,
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
                    name: "Globo".into(),
                    logo_url: None,
                    stream_url: "http://h/g.ts".into(),
                    tvg_id: Some("Globo.br".into()),
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

        let now = now_ts();
        let programs = vec![
            EpgProgram {
                channel: "globo.br".into(),
                title: "Agora".into(),
                description: None,
                start_ts: now - 600,
                stop_ts: now + 600,
            },
            EpgProgram {
                channel: "globo.br".into(),
                title: "Depois".into(),
                description: Some("desc".into()),
                start_ts: now + 600,
                stop_ts: now + 1200,
            },
        ];
        db.write(move |c| replace_for_source(c, sid, &programs)).unwrap();

        let nn = db.read(move |c| now_next(c, &[ch_id])).unwrap();
        assert_eq!(nn.len(), 1);
        assert_eq!(nn[0].now.as_ref().unwrap().title, "Agora");
        assert_eq!(nn[0].next.as_ref().unwrap().title, "Depois");

        let listing = db
            .read(move |c| for_channel(c, ch_id, now - 3600, now + 86400))
            .unwrap();
        assert_eq!(listing.len(), 2);
    }
}

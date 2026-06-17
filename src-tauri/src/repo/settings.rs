//! Key/value settings with sane defaults. Everything stays local.

use crate::error::{AppError, AppResult};
use crate::models::Settings;
use rusqlite::{params, Connection, OptionalExtension};

pub fn defaults() -> Vec<(&'static str, String)> {
    let lightweight = cfg!(target_os = "android");
    vec![
        ("theme", "dark".to_string()),
        ("language", "pt-BR".to_string()),
        ("lightweight", lightweight.to_string()),
        ("epg_days", "2".to_string()),
        ("logo_limit", "5000".to_string()),
        ("logo_limit_lightweight", "300".to_string()),
        ("player_autoplay_next", "true".to_string()),
        ("player_volume", "1".to_string()),
        ("player_remember_position", "true".to_string()),
        ("history_enabled", "true".to_string()),
        ("block_adult_content", "false".to_string()),
        ("active_profile", "1".to_string()),
        ("auto_sync_on_start", "false".to_string()),
    ]
}

pub fn ensure_defaults(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)")?;
    for (k, v) in defaults() {
        stmt.execute(params![k, v])?;
    }
    Ok(())
}

pub fn get_all(conn: &Connection) -> AppResult<Settings> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let mut map = Settings::new();
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn get(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()?)
}

#[allow(dead_code)] // handy helper, currently exercised by tests
pub fn get_or(conn: &Connection, key: &str, fallback: &str) -> String {
    get(conn, key)
        .ok()
        .flatten()
        .unwrap_or_else(|| fallback.to_string())
}

pub fn get_bool(conn: &Connection, key: &str, fallback: bool) -> bool {
    match get(conn, key).ok().flatten() {
        Some(v) => v == "true" || v == "1",
        None => fallback,
    }
}

pub fn get_i64(conn: &Connection, key: &str, fallback: i64) -> i64 {
    get(conn, key)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(fallback)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    if key.is_empty()
        || key.len() > 64
        || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(AppError::Invalid("chave de configuração inválida".into()));
    }
    if value.len() > 10_000 {
        return Err(AppError::Invalid(
            "valor de configuração longo demais".into(),
        ));
    }
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn active_profile(conn: &Connection) -> i64 {
    get_i64(conn, "active_profile", 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_support::temp_db;

    #[test]
    fn defaults_then_override() {
        let db = temp_db();
        db.write(|c| ensure_defaults(c)).unwrap();
        let all = db.read(|c| get_all(c)).unwrap();
        assert_eq!(all.get("language").map(String::as_str), Some("pt-BR"));
        assert_eq!(all.get("theme").map(String::as_str), Some("dark"));
        assert_eq!(
            all.get("block_adult_content").map(String::as_str),
            Some("false")
        );

        db.write(|c| set(c, "theme", "light")).unwrap();
        db.write(|c| ensure_defaults(c)).unwrap(); // must not reset
        let theme = db.read(|c| Ok(get_or(c, "theme", "dark"))).unwrap();
        assert_eq!(theme, "light");
    }

    #[test]
    fn rejects_bad_keys() {
        let db = temp_db();
        assert!(db.write(|c| set(c, "ok_key", "v")).is_ok());
        assert!(db.write(|c| set(c, "bad key!", "v")).is_err());
        assert!(db.write(|c| set(c, "", "v")).is_err());
    }
}

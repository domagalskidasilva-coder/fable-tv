use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const MAX_READERS: usize = 4;

/// SQLite handle: one serialized writer plus a small pool of reader
/// connections (WAL mode lets readers run while a sync writes).
pub struct Db {
    path: PathBuf,
    writer: Mutex<Connection>,
    readers: Mutex<Vec<Connection>>,
}

impl Db {
    pub fn open(path: PathBuf) -> AppResult<Arc<Self>> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Self::connect(&path)?;
        let db = Db {
            path,
            writer: Mutex::new(conn),
            readers: Mutex::new(Vec::new()),
        };
        db.migrate()?;
        Ok(Arc::new(db))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn connect(path: &Path) -> AppResult<Connection> {
        let conn = Connection::open(path)?;
        let _mode: String =
            conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
        conn.execute_batch(
            "PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA temp_store = MEMORY;
             PRAGMA cache_size = -8000;",
        )?;
        conn.busy_timeout(std::time::Duration::from_secs(15))?;
        Ok(conn)
    }

    pub fn read<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T> {
        let pooled = { self.readers.lock().unwrap().pop() };
        let conn = match pooled {
            Some(c) => c,
            None => Self::connect(&self.path)?,
        };
        let out = f(&conn);
        let mut pool = self.readers.lock().unwrap();
        if pool.len() < MAX_READERS {
            pool.push(conn);
        }
        out
    }

    pub fn write<T>(&self, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
        let mut conn = self.writer.lock().unwrap();
        f(&mut conn)
    }

    /// Runs a read query on a blocking thread so async commands never block
    /// the runtime.
    pub async fn read_async<T, F>(self: &Arc<Self>, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> AppResult<T> + Send + 'static,
    {
        let db = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || db.read(f))
            .await
            .map_err(|e| AppError::Other(format!("tarefa interrompida: {e}")))?
    }

    pub async fn write_async<T, F>(self: &Arc<Self>, f: F) -> AppResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> AppResult<T> + Send + 'static,
    {
        let db = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || db.write(f))
            .await
            .map_err(|e| AppError::Other(format!("tarefa interrompida: {e}")))?
    }

    fn migrate(&self) -> AppResult<()> {
        let conn = self.writer.lock().unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version < 1 {
            conn.execute_batch(SCHEMA_V1)?;
        }
        if version < 2 {
            conn.execute_batch(MIGRATION_V2)?;
        }
        if version < 3 {
            conn.execute_batch(MIGRATION_V3)?;
        }
        Ok(())
    }
}

/// v3: profile avatars + richer content metadata (episode thumbnails, plus
/// backdrop/cast/director/trailer for movies and series, fetched on demand).
const MIGRATION_V3: &str = r#"
BEGIN;
ALTER TABLE profiles ADD COLUMN image TEXT;
ALTER TABLE episodes ADD COLUMN thumbnail_url TEXT;
ALTER TABLE movies ADD COLUMN backdrop_url TEXT;
ALTER TABLE movies ADD COLUMN actors TEXT;
ALTER TABLE movies ADD COLUMN director TEXT;
ALTER TABLE movies ADD COLUMN trailer TEXT;
ALTER TABLE movies ADD COLUMN country TEXT;
ALTER TABLE movies ADD COLUMN info_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE series ADD COLUMN backdrop_url TEXT;
ALTER TABLE series ADD COLUMN actors TEXT;
ALTER TABLE series ADD COLUMN director TEXT;
ALTER TABLE series ADD COLUMN trailer TEXT;
-- Re-enrich existing series on next open so they pick up episode thumbnails
-- and cast/director/backdrop from the richer get_series_info parsing.
UPDATE series SET episodes_synced = 0;
PRAGMA user_version = 3;
COMMIT;
"#;

/// v2: profiles become isolated libraries. A profile owns its playlists
/// (sources); the active profile scopes the whole catalog. Non-destructive:
/// existing playlists and content are kept and assigned to the first profile.
const MIGRATION_V2: &str = r#"
BEGIN;
ALTER TABLE profiles ADD COLUMN color TEXT NOT NULL DEFAULT '#e8b65a';
ALTER TABLE sources ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1;
UPDATE sources SET profile_id = (SELECT MIN(id) FROM profiles) WHERE profile_id NOT IN (SELECT id FROM profiles);
CREATE INDEX IF NOT EXISTS idx_sources_profile ON sources(profile_id);
PRAGMA user_version = 2;
COMMIT;
"#;

const SCHEMA_V1: &str = r#"
BEGIN;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  username TEXT,
  password TEXT,
  epg_url TEXT,
  user_agent TEXT,
  sync_channels INTEGER NOT NULL DEFAULT 1,
  sync_movies INTEGER NOT NULL DEFAULT 1,
  sync_series INTEGER NOT NULL DEFAULT 1,
  sync_epg INTEGER NOT NULL DEFAULT 0,
  sync_logos INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_sync_at INTEGER,
  last_sync_status TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',
  UNIQUE(source_id, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_source ON categories(source_id, kind);

CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  logo_url TEXT,
  logo_path TEXT,
  stream_url TEXT NOT NULL,
  tvg_id TEXT,
  tvg_name TEXT,
  group_title TEXT,
  extra_json TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  sync_token INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, stream_url)
);
CREATE INDEX IF NOT EXISTS idx_channels_source ON channels(source_id);
CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_channels_tvg ON channels(source_id, tvg_id);

CREATE TABLE IF NOT EXISTS movies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  external_id TEXT,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  logo_url TEXT,
  logo_path TEXT,
  stream_url TEXT NOT NULL,
  year INTEGER,
  duration_secs INTEGER,
  rating TEXT,
  plot TEXT,
  genre TEXT,
  extra_json TEXT,
  sync_token INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, stream_url)
);
CREATE INDEX IF NOT EXISTS idx_movies_source ON movies(source_id);
CREATE INDEX IF NOT EXISTS idx_movies_category ON movies(category_id);
CREATE INDEX IF NOT EXISTS idx_movies_name ON movies(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_movies_created ON movies(created_at DESC);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  cover_url TEXT,
  cover_path TEXT,
  plot TEXT,
  year INTEGER,
  rating TEXT,
  genre TEXT,
  episodes_synced INTEGER NOT NULL DEFAULT 0,
  sync_token INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_series_source ON series(source_id);
CREATE INDEX IF NOT EXISTS idx_series_category ON series(category_id);
CREATE INDEX IF NOT EXISTS idx_series_created ON series(created_at DESC);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  episode_num INTEGER NOT NULL,
  name TEXT NOT NULL,
  search_text TEXT NOT NULL,
  stream_url TEXT NOT NULL,
  duration_secs INTEGER,
  plot TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(series_id, season, episode_num)
);
CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(series_id);

CREATE TABLE IF NOT EXISTS epg_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  channel_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_ts INTEGER NOT NULL,
  stop_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_epg_channel ON epg_programs(source_id, channel_key, start_ts);
CREATE INDEX IF NOT EXISTS idx_epg_start ON epg_programs(start_ts);

CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(profile_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  position_secs REAL NOT NULL DEFAULT 0,
  duration_secs REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(profile_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_history_updated ON history(profile_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- No profile is seeded: a fresh install starts with zero profiles and the app
-- guides the user to create their own on first run (the first one created
-- becomes the active profile).

PRAGMA user_version = 1;

COMMIT;
"#;

#[cfg(test)]
pub mod test_support {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Opens a throwaway DB file in the OS temp dir (multiple connections
    /// must see the same database, so :memory: is not an option here).
    pub fn temp_db() -> Arc<Db> {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!(
            "fable_tv_test_{}_{}.db",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_file(&path);
        Db::open(path).expect("open temp db")
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::temp_db;

    #[test]
    fn migration_creates_schema_without_seed_profile() {
        let db = temp_db();
        // A fresh install ships with no profiles — the user creates their own.
        let profile_count: i64 = db
            .read(|c| Ok(c.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(profile_count, 0);
        let version: i64 = db
            .read(|c| Ok(c.query_row("PRAGMA user_version", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(version, 3);

        // v2/v3 columns exist (profiles carry an avatar color/image; sources are
        // bound to a profile).
        let count_col = |table: &'static str, col: &'static str| -> i64 {
            db.read(move |c| {
                Ok(c.query_row(
                    &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = '{col}'"),
                    [],
                    |r| r.get(0),
                )?)
            })
            .unwrap()
        };
        assert_eq!(count_col("sources", "profile_id"), 1);
        // v3: avatar + richer metadata columns exist.
        assert_eq!(count_col("profiles", "image"), 1);
        assert_eq!(count_col("episodes", "thumbnail_url"), 1);
        assert_eq!(count_col("movies", "backdrop_url"), 1);
        assert_eq!(count_col("movies", "actors"), 1);
        assert_eq!(count_col("series", "director"), 1);
    }

    #[test]
    fn read_and_write_share_the_same_database() {
        let db = temp_db();
        db.write(|c| {
            c.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params!["theme", "dark"],
            )?;
            Ok(())
        })
        .unwrap();
        let value: String = db
            .read(|c| {
                Ok(c.query_row(
                    "SELECT value FROM settings WHERE key = 'theme'",
                    [],
                    |r| r.get(0),
                )?)
            })
            .unwrap();
        assert_eq!(value, "dark");
    }
}

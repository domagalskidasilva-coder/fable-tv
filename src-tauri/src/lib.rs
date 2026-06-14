mod catalog_api;
mod commands;
mod db;
mod epg;
mod error;
mod m3u;
mod models;
mod repo;
mod security;
mod sync;
mod util;

use db::Db;
use std::path::PathBuf;
use std::sync::Arc;
use sync::Jobs;
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Db>,
    pub jobs: Arc<Jobs>,
    pub http: reqwest::Client,
    pub cache_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            std::fs::create_dir_all(&cache_dir)?;

            let db = Db::open(data_dir.join("fabletv.db"))?;
            db.write(|c| repo::settings::ensure_defaults(c))
                .map_err(|e| std::io::Error::other(e.to_string()))?;

            let http = reqwest::Client::builder()
                .user_agent(format!("FableTV/{}", env!("CARGO_PKG_VERSION")))
                .connect_timeout(std::time::Duration::from_secs(12))
                .timeout(std::time::Duration::from_secs(600))
                .build()
                .map_err(|e| std::io::Error::other(e.to_string()))?;

            app.manage(AppState {
                db,
                jobs: Arc::new(Jobs::default()),
                http,
                cache_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sources,
            commands::add_source,
            commands::update_source,
            commands::delete_source,
            commands::test_source,
            commands::start_sync,
            commands::cancel_sync,
            commands::list_active_jobs,
            commands::list_categories,
            commands::list_channels,
            commands::list_movies,
            commands::list_series,
            commands::get_movie_detail,
            commands::get_series_detail,
            commands::resolve_stream,
            commands::epg_now_next,
            commands::epg_for_channel,
            commands::toggle_favorite,
            commands::list_favorites,
            commands::report_playback,
            commands::list_history,
            commands::delete_history_entry,
            commands::clear_history,
            commands::get_home_data,
            commands::global_search,
            commands::get_settings,
            commands::set_setting,
            commands::list_profiles,
            commands::create_profile,
            commands::update_profile,
            commands::delete_profile,
            commands::import_profile_image,
            commands::set_active_profile,
            commands::export_data,
            commands::import_data,
            commands::get_app_stats,
            commands::clear_cache,
            commands::check_for_update,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Fable TV");
}

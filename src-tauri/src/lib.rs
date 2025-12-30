#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod app;
mod chess;
mod db;
mod error;
mod fide;
mod fs;
mod lexer;
mod oauth;
mod opening;
mod package_manager;
mod pgn;
mod puzzle;
mod telemetry;
mod variant_positions;

use std::sync::Arc;

use chess::{BestMovesPayload, EngineProcess, ReportProgress};
use dashmap::DashMap;
use db::{DatabaseProgress, GameQueryJs, NormalizedGame, PositionStats};
use derivative::Derivative;
use fide::FidePlayer;
use oauth::AuthState;
#[cfg(all(debug_assertions, not(target_os = "android")))]
use specta_typescript::{BigIntExportBehavior, Typescript};
use sysinfo::SystemExt;
use tauri::AppHandle;

use crate::chess::{
    get_best_moves, analyze_game, get_engine_config, get_engine_logs, kill_engine, kill_engines, stop_engine
};
use crate::db::{
    clear_games, convert_pgn, create_indexes, delete_database, delete_db_game, delete_empty_games,
    delete_indexes, export_to_pgn, export_position_games_to_pgn, export_selected_games_to_pgn, get_player, get_players_game_info, get_tournaments,
    precache_openings, search_position, download_position_cache,
};
use crate::fide::{download_fide_db, find_fide_player, fetch_fide_profile_html, save_fide_photo};
use crate::fs::{set_file_as_executable, DownloadProgress};
use crate::lexer::lex_pgn;
use crate::oauth::authenticate;
use crate::package_manager::{
    check_package_installed, check_package_manager_available, find_executable_path, install_package,
};
use crate::pgn::{count_pgn_games, delete_game, read_games, write_game};
use crate::puzzle::{get_puzzle, get_puzzle_db_info, get_puzzle_rating_range, import_puzzle_file, check_puzzle_db_columns, get_puzzle_themes, get_puzzle_opening_tags, validate_puzzle_database};
use crate::telemetry::{get_telemetry_config, get_telemetry_enabled, set_telemetry_enabled, get_user_country_api, get_user_country_locale, get_user_id_command, get_platform_info_command};
use crate::variant_positions::{get_variant_position, upsert_variant_position};
use crate::{
    db::{
        delete_duplicated_games, edit_db_info, get_db_info, get_games, get_game, get_players, merge_players, update_game
    },
    fs::{download_file, file_exists, get_file_metadata},
    opening::{get_opening_from_fen, get_opening_from_name, get_opening_info_from_fen, search_opening_name},
};
use tokio::sync::{RwLock, Semaphore};

pub type GameData = (
    i32,
    i32,
    i32,
    Option<String>,
    Option<String>,
    Vec<u8>,
    Option<String>,
    i32,
    i32,
    i32,
);

#[derive(Derivative)]
#[derivative(Default)]
pub struct AppState {
    connection_pool: DashMap<
        String,
        diesel::r2d2::Pool<diesel::r2d2::ConnectionManager<diesel::SqliteConnection>>,
    >,
    line_cache: DashMap<(GameQueryJs, std::path::PathBuf), (Vec<PositionStats>, Vec<NormalizedGame>)>,
    // Cache for games loaded from database (en-croissant approach - more efficient)
    db_cache: std::sync::Mutex<Vec<GameData>>,
    #[derivative(Default(value = "Arc::new(Semaphore::new(10))"))]
    new_request: Arc<Semaphore>,
    pgn_offsets: DashMap<String, Vec<u64>>,
    fide_players: RwLock<Vec<FidePlayer>>,
    engine_processes: DashMap<(String, String), Arc<tokio::sync::Mutex<EngineProcess>>>,
    auth: AuthState,
}

// ============================================================================
// MAIN APPLICATION ENTRY POINT
// ============================================================================

#[tokio::main]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
    let specta_builder = tauri_specta::Builder::new()
        .commands(tauri_specta::collect_commands!(
            app::platform::screen_capture,
            find_fide_player,
            fetch_fide_profile_html,
            save_fide_photo,
            get_best_moves,
            analyze_game,
            stop_engine,
            kill_engine,
            kill_engines,
            get_engine_logs,
            memory_size,
            get_puzzle,
            search_opening_name,
            get_opening_from_fen,
            get_opening_from_name,
            get_opening_info_from_fen,
            get_players_game_info,
            get_engine_config,
            file_exists,
            get_file_metadata,
            merge_players,
            convert_pgn,
            get_player,
            count_pgn_games,
            read_games,
            lex_pgn,
            is_bmi2_compatible,
            delete_game,
            delete_duplicated_games,
            delete_empty_games,
            clear_games,
            set_file_as_executable,
            delete_indexes,
            create_indexes,
            edit_db_info,
            delete_db_game,
            delete_database,
            export_to_pgn,
            export_position_games_to_pgn,
            export_selected_games_to_pgn,
            authenticate,
            write_game,
            download_fide_db,
            download_file,
            get_tournaments,
            get_db_info,
            get_games,
            get_game,
            update_game,
            search_position,
            precache_openings,
            download_position_cache,
            get_players,
            get_puzzle_db_info,
            get_puzzle_rating_range,
            import_puzzle_file,
            check_puzzle_db_columns,
            get_puzzle_themes,
            get_puzzle_opening_tags,
            validate_puzzle_database,
            get_telemetry_enabled,
            set_telemetry_enabled,
            get_telemetry_config,
            get_user_country_api,
            get_user_country_locale,
            get_user_id_command,
            get_platform_info_command,
            check_package_manager_available,
            install_package,
            check_package_installed,
            find_executable_path,
            get_variant_position,
            upsert_variant_position,
            open_external_link
        ))
        .events(tauri_specta::collect_events!(
            BestMovesPayload,
            DatabaseProgress,
            DownloadProgress,
            ReportProgress
        ));

    #[cfg(all(debug_assertions, not(target_os = "android")))]
    specta_builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::BigInt),
            "../src/bindings/generated.ts",
        )
        .expect("Failed to export types");

    let builder = tauri::Builder::default();    
    let builder = app::platform::setup_tauri_plugins(builder, &specta_builder);
    
    builder
        .setup(move |app| {
            app::setup::setup_tauri_app(app, &specta_builder)
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ============================================================================
// SHARED COMMANDS (Available on all platforms)
// ============================================================================

#[tauri::command]
#[specta::specta]
fn is_bmi2_compatible() -> bool {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    if is_x86_feature_detected!("bmi2") {
        return true;
    }
    false
}

#[tauri::command]
#[specta::specta]
fn memory_size() -> u64 {
    sysinfo::System::new_all().total_memory() / (1024 * 1024)
}

#[tauri::command]
#[specta::specta]
async fn open_external_link(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url)
        .map_err(|e| format!("Invalid URL: {}", e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only http/https URLs are allowed".to_string()),
    }

    if let Some(host) = parsed.host_str() {
        if is_private_or_localhost(host) {
            return Err("Refusing to open private/local URLs".to_string());
        }
    }

    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<String>)
        .map_err(|e| format!("Failed to open external link: {}", e))
}

fn is_private_or_localhost(host: &str) -> bool {
    use std::net::IpAddr;

    if host == "localhost" || host == "::1" {
        return true;
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        match ip {
            IpAddr::V4(ipv4) => {
                let o = ipv4.octets();
                o[0] == 127
                    || o[0] == 10
                    || o[0] == 0
                    || (o[0] == 172 && (16..=31).contains(&o[1]))
                    || (o[0] == 192 && o[1] == 168)
            }
            IpAddr::V6(ipv6) => ipv6.is_loopback() || ipv6.is_unspecified(),
        }
    } else {
        false
    }
}


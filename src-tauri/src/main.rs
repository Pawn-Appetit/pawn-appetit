#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod chess_bridge;
mod db;
mod engine;
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

// Alias for backward compatibility
use chess_bridge as chess;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::{fs::create_dir_all};

use fs_extra::dir::{copy, CopyOptions};

use chess::{BestMovesPayload, ReportProgress};
use dashmap::DashMap;
use db::{DatabaseProgress, GameQueryJs, NormalizedGame, PositionStats};
use derivative::Derivative;
use engine::{EngineManager, EngineProcess};
use fide::FidePlayer;
use log::LevelFilter;
use oauth::AuthState;
use specta_typescript::{BigIntExportBehavior, Typescript};
use sysinfo::SystemExt;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Window};

use crate::chess::{
    analyze_game, get_engine_config, get_engine_logs, kill_engine, kill_engines, stop_engine,
    diagnose_multipv, test_engine_capabilities, generate_debug_steps,
};
use crate::db::{
    clear_games, convert_pgn, create_indexes, delete_database, delete_db_game, delete_empty_games,
    delete_indexes, export_to_pgn, get_player, get_players_game_info, get_tournaments,
    search_position,
};
use crate::fide::{download_fide_db, find_fide_player};
use crate::fs::{set_file_as_executable, DownloadProgress};
use crate::lexer::lex_pgn;
use crate::oauth::authenticate;
use crate::package_manager::{
    check_package_installed, check_package_manager_available, find_executable_path, install_package,
};
use crate::pgn::{count_pgn_games, delete_game, read_games, write_game};
use crate::puzzle::{get_puzzle, get_puzzle_db_info, get_puzzle_rating_range};
use crate::telemetry::{get_telemetry_config, get_telemetry_enabled, handle_initial_run_telemetry, set_telemetry_enabled, get_user_country_api, get_user_country_locale, get_user_id_command, get_platform_info_command};
use crate::{
    chess::get_best_moves,
    db::{
        delete_duplicated_games, edit_db_info, get_db_info, get_games, get_game, get_players, merge_players, update_game
    },
    fs::{download_file, file_exists, get_file_metadata},
    opening::{get_opening_from_fen, get_opening_from_name, search_opening_name},
};
use tokio::sync::{RwLock, Semaphore, Mutex as TokioMutex};

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
    line_cache: DashMap<(GameQueryJs, PathBuf), (Vec<PositionStats>, Vec<NormalizedGame>)>,
    db_cache: Mutex<Vec<GameData>>,
    #[derivative(Default(value = "Arc::new(Semaphore::new(2))"))]
    new_request: Arc<Semaphore>,
    pgn_offsets: DashMap<String, Vec<u64>>,
    fide_players: RwLock<Vec<FidePlayer>>,
    engine_processes: DashMap<(String, String), Arc<tokio::sync::Mutex<EngineProcess>>>,
    #[derivative(Default(value = "Arc::new(TokioMutex::new(EngineManager::new()))"))]
    engine_manager: Arc<TokioMutex<EngineManager>>,
    auth: AuthState,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            connection_pool: self.connection_pool.clone(),
            line_cache: self.line_cache.clone(),
            db_cache: Mutex::new(Vec::new()), // Can't clone Mutex contents, start with empty
            new_request: self.new_request.clone(),
            pgn_offsets: self.pgn_offsets.clone(),
            fide_players: RwLock::new(Vec::new()), // Can't clone RwLock contents, start with empty
            engine_processes: self.engine_processes.clone(),
            engine_manager: self.engine_manager.clone(),
            auth: self.auth.clone(),
        }
    }
}

const REQUIRED_DIRS: &[(BaseDirectory, &str)] = &[
    (BaseDirectory::AppData, "engines"),
    (BaseDirectory::AppData, "db"),
    (BaseDirectory::AppData, "presets"),
    (BaseDirectory::AppData, "puzzles"),
    (BaseDirectory::AppData, "documents"),
    (BaseDirectory::Document, "Pawn Appetit"),
];

const REQUIRED_FILES: &[(BaseDirectory, &str, &str)] =
    &[(BaseDirectory::AppData, "engines/engines.json", "[]")];

/// Legacy app identifiers that we need to migrate from
const LEGACY_IDENTIFIERS: &[&str] = &[
    "org.encroissant.app",
];

/// Migrates user data from old app directories to the new one
///
/// This function checks for existing data directories from previous app identifiers
/// and copies all their contents to the new app data directory. It only runs if
/// the new directory doesn't already exist (first run).
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if migration completed successfully or was skipped
/// * `Err(String)` if there was an error during migration
fn migrate_from_legacy_apps(app: &AppHandle) -> Result<(), String> {
    log::info!("Checking for legacy app data migration");
    
    // Get the current app data directory
    let current_app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get current app data directory: {e}"))?;
    
    // Skip migration if current directory already exists and has content
    if current_app_data.exists() && current_app_data.read_dir().map_or(false, |mut dir| dir.next().is_some()) {
        log::info!("Current app data directory already exists with content, skipping migration");
        return Ok(());
    }
    
    // Look for legacy app directories to migrate from
    for &legacy_identifier in LEGACY_IDENTIFIERS {
        let legacy_path = get_legacy_app_data_path(legacy_identifier)
            .map_err(|e| format!("Failed to get legacy path for {legacy_identifier}: {e}"))?;
        
        if legacy_path.exists() && legacy_path.is_dir() {
            log::info!("Found legacy app data at: {}", legacy_path.display());
            log::info!("Migrating to: {}", current_app_data.display());
            
            // Ensure the parent directory of the current app data exists
            if let Some(parent) = current_app_data.parent() {
                create_dir_all(parent).map_err(|e| {
                    format!("Failed to create parent directory {}: {e}", parent.display())
                })?;
            }
            
            // Copy options for fs_extra
            let mut options = CopyOptions::new();
            options.overwrite = true;
            options.copy_inside = true;
            
            // Copy all contents from legacy directory to new directory
            copy(&legacy_path, &current_app_data, &options).map_err(|e| {
                format!("Failed to copy from {} to {}: {e}", 
                    legacy_path.display(), current_app_data.display())
            })?;
            
            log::info!("Successfully migrated data from {}", legacy_identifier);
            return Ok(());
        } else {
            log::info!("No legacy data found for identifier: {}", legacy_identifier);
        }
    }
    
    log::info!("No legacy app data found to migrate");
    Ok(())
}

/// Gets the app data directory path for a legacy identifier
///
/// This function constructs the path where the app data would be stored
/// for a given app identifier on the current platform.
///
/// # Arguments
/// * `identifier` - The legacy app identifier
///
/// # Returns
/// * `Ok(PathBuf)` with the legacy app data path
/// * `Err(String)` if the path cannot be determined
fn get_legacy_app_data_path(identifier: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "Could not get HOME environment variable".to_string())?;
        Ok(PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(identifier))
    }
    
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "Could not get APPDATA environment variable".to_string())?;
        Ok(PathBuf::from(appdata).join(identifier))
    }
    
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME")
            .map_err(|_| "Could not get HOME environment variable".to_string())?;
        let config_dir = std::env::var("XDG_CONFIG_HOME")
            .unwrap_or_else(|_| format!("{}/.config", home));
        Ok(PathBuf::from(config_dir).join(identifier))
    }
}

/// Ensures that all required directories exist, creating them if necessary
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if all directories were created or already exist
/// * `Err(String)` if there was an error creating a directory
fn ensure_required_directories(app: &AppHandle) -> Result<(), String> {
    log::info!("Checking for required directories");
    for &(dir, path) in REQUIRED_DIRS {
        let resolved_path = app.path().resolve(path, dir)
            .map_err(|e| format!("Failed to resolve path {path}: {e}"))?;
        
        if !resolved_path.exists() {
            log::info!("Creating directory {}", resolved_path.display());
            create_dir_all(&resolved_path).map_err(|e| {
                format!("Failed to create directory {}: {e}", resolved_path.display())
            })?;
        } else {
            log::info!("Directory already exists: {}", resolved_path.display());
        }
    }
    Ok(())
}

/// Ensures that all required files exist, creating them with default content if necessary
///
/// # Arguments
/// * `app` - The Tauri app handle used to resolve paths
///
/// # Returns
/// * `Ok(())` if all files were created or already exist
/// * `Err(String)` if there was an error creating a file
fn ensure_required_files(app: &AppHandle) -> Result<(), String> {
    log::info!("Checking for required files");
    for &(dir, path, contents) in REQUIRED_FILES {
        let resolved_path = app
            .path()
            .resolve(path, dir)
            .map_err(|e| format!("Failed to resolve path {path}: {e}"))?;

        if !resolved_path.exists() {
            log::info!("Creating file {}", resolved_path.display());
            std::fs::write(&resolved_path, contents).map_err(|e| {
                format!("Failed to write file {}: {e}", resolved_path.display())
            })?;
        } else {
            log::info!("File already exists: {}", resolved_path.display());
        }
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn close_splashscreen(window: Window) -> Result<(), String> {
    log::info!("close_splashscreen command called");
    
    let main_window = window
        .get_webview_window("main")
        .ok_or_else(|| {
            let error_msg = "No window labeled 'main' found";
            log::error!("{}", error_msg);
            String::from(error_msg)
        })?;

    let splash_window = window.get_webview_window("splash");

    log::info!("Showing main window");

    main_window
        .show()
        .map_err(|e| {
            let error_msg = format!("Failed to show main window: {}", e);
            log::error!("{}", error_msg);
            error_msg
        })?;

    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    log::info!("Bringing main window to front");
    if let Err(e) = main_window.set_focus() {
        log::warn!("Failed to focus main window: {}", e);
    }

    if let Some(splash) = splash_window {
        log::info!("Closing splash screen");
        if let Err(e) = splash.close() {
            log::warn!("Failed to close splash window: {}", e);
        }
    } else {
        log::warn!("Splash window not found - may have already been closed");
    }

    log::info!("Window transition completed successfully");
    Ok(())
}

/// Gets the log level from environment variable or defaults to Info
fn get_log_level() -> LevelFilter {
    match std::env::var("RUST_LOG").as_deref() {
        Ok("trace") => LevelFilter::Trace,
        Ok("debug") => LevelFilter::Debug,
        Ok("info") => LevelFilter::Info,
        Ok("warn") => LevelFilter::Warn,
        Ok("error") => LevelFilter::Error,
        Ok("off") => LevelFilter::Off,
        _ => {
            // Check for more specific patterns like "debug", "app=debug", etc.
            if let Ok(rust_log) = std::env::var("RUST_LOG") {
                if rust_log.contains("debug") {
                    return LevelFilter::Debug;
                } else if rust_log.contains("trace") {
                    return LevelFilter::Trace;
                } else if rust_log.contains("warn") {
                    return LevelFilter::Warn;
                } else if rust_log.contains("error") {
                    return LevelFilter::Error;
                }
            }
            // Default to Debug in debug builds, Info in release builds
            #[cfg(debug_assertions)]
            return LevelFilter::Debug;
            #[cfg(not(debug_assertions))]
            return LevelFilter::Info;
        }
    }
}

#[tokio::main]
async fn main() {
    
    let specta_builder = tauri_specta::Builder::new()
        .commands(tauri_specta::collect_commands!(
            close_splashscreen,
            find_fide_player,
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
            get_players_game_info,
            get_engine_config,
            diagnose_multipv,
            test_engine_capabilities,
            generate_debug_steps,
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
            get_players,
            get_puzzle_db_info,
            get_puzzle_rating_range,
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
            open_external_link
        ))
        .events(tauri_specta::collect_events!(
            BestMovesPayload,
            DatabaseProgress,
            DownloadProgress,
            ReportProgress
        ));

    #[cfg(debug_assertions)]
    specta_builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::BigInt),
            "../src/bindings/generated.ts",
        )
        .expect("Failed to export types");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::LogDir {
                            file_name: Some("pawn-appetit".to_string()),
                        },
                    ),
                    tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Stdout,
                    ),
                ])
                .level(get_log_level()).build())
        .invoke_handler(specta_builder.invoke_handler())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(move |app| {
            log::info!("Setting up application");

            let main_window = &app.get_webview_window("main").unwrap();
            main_window.hide().unwrap();

            // Migrate data from legacy app identifiers (first run only)
            migrate_from_legacy_apps(&app.handle())?;

            // Ensure required directories exist
            ensure_required_directories(&app.handle())?;

            // Ensure required files exist
            ensure_required_files(&app.handle())?;

            // #[cfg(any(windows, target_os = "macos"))]
            // set_shadow(&app.get_webview_window("main").unwrap(), true).unwrap();

            specta_builder.mount_events(app);

            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_cli::init())?;

            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let _ = log::info!("Finished rust initialization");
            // Handle initial-run telemetry based on user preferences
            let _ = handle_initial_run_telemetry(&app.handle());
            Ok(())
        })
        .manage(AppState::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

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
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<String>)
        .map_err(|e| format!("Failed to open external link: {}", e))
}

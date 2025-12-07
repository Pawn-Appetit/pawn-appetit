//! Tauri command handlers for chess engine management and analysis.
//!
//! This module exposes async functions as Tauri commands for engine process control, game analysis, and engine configuration.
//! It acts as the bridge between the frontend and backend chess logic.

use std::path::PathBuf;

use vampirc_uci::parse_one;

use crate::error::Error;
use crate::AppState;

use super::analysis::GameAnalysisService;
use super::manager::EngineManager;
use super::types::*;

/// Kill all engine processes associated with a given tab.
/// FIXED: Proper error handling to prevent zombie processes
#[tauri::command]
#[specta::specta]
pub async fn kill_engines(tab: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    let keys: Vec<_> = state.engine_processes.iter().map(|x| x.key().clone()).collect();
    for key in keys {
        if key.0.starts_with(&tab) {
            // FIXED: Safe cleanup even if kill fails
            if let Some(process_arc) = state.engine_processes.get(&key) {
                let mut process = process_arc.lock().await;
                // Attempt to kill, but always remove from map
                let _ = process.kill().await; // Ignore errors, ensure cleanup
            }
            state.engine_processes.remove(&key);
        }
    }
    Ok(())
}

/// Kill a specific engine process by engine name and tab.
/// FIXED: Always remove from map to prevent memory leaks
#[tauri::command]
#[specta::specta]
pub async fn kill_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process_arc) = state.engine_processes.get(&key) {
        let mut process = process_arc.lock().await;
        // Attempt to kill, but always remove from map
        let _ = process.kill().await; // Ignore errors, ensure cleanup
    }
    // FIXED: Always remove to prevent memory leak
    state.engine_processes.remove(&key);
    Ok(())
}

/// Stop a specific engine process (without killing it) by engine name and tab.
#[tauri::command]
#[specta::specta]
pub async fn stop_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        process.stop().await?;
    }
    Ok(())
}

/// Retrieve logs for a specific engine process.
#[tauri::command]
#[specta::specta]
pub async fn get_engine_logs(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EngineLog>, Error> {
    let key = (tab, engine);
    if let Some(process) = state.engine_processes.get(&key) {
        let process = process.lock().await;
        Ok(process.logs.clone())
    } else {
        Ok(Vec::new())
    }
}

/// Get best moves from the engine for a given position and options.
#[tauri::command]
#[specta::specta]
pub async fn get_best_moves(
    id: String,
    engine: String,
    tab: String,
    go_mode: GoMode,
    options: EngineOptions,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Option<(f32, Vec<BestMoves>)>, Error> {
    EngineManager::new(state).get_best_moves(id, engine, tab, go_mode, options, app).await
}

/// Analyze a game using the engine, returning move-by-move analysis.
#[tauri::command]
#[specta::specta]
pub async fn analyze_game(
    id: String,
    engine: String,
    go_mode: GoMode,
    options: AnalysisOptions,
    uci_options: Vec<EngineOption>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Vec<MoveAnalysis>, Error> {
    GameAnalysisService::analyze_game(id, engine, go_mode, options, uci_options, state, app).await
}

/// Query a UCI engine for its configuration (name and options).
/// FIXED: Proper process cleanup with timeout to prevent zombie processes
#[tauri::command]
#[specta::specta]
pub async fn get_engine_config(path: PathBuf) -> Result<EngineConfig, Error> {
    use tokio::io::AsyncBufReadExt;
    use tokio::time::{timeout, Duration};

    let mut command = tokio::process::Command::new(&path);
    // FIXED: Safe parent path handling
    if let Some(parent) = path.parent() {
        command.current_dir(parent);
    }
    command.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(super::process::CREATE_NO_WINDOW);
    
    let mut child = command.spawn()?;
    let mut stdin = child.stdin.take().ok_or(Error::NoStdin)?;
    let stdout = child.stdout.take().ok_or(Error::NoStdout)?;
    let mut stdout = tokio::io::BufReader::new(stdout).lines();

    use tokio::io::AsyncWriteExt;
    stdin.write_all(b"uci\n").await?;

    let mut config = EngineConfig::default();
    
    // FIXED: Add timeout to prevent hanging on unresponsive engines
    let config_future = async {
    loop {
        if let Some(line) = stdout.next_line().await? {
                if let vampirc_uci::UciMessage::Id { name: Some(name), author: _ } = parse_one(&line) { 
                    config.name = name; 
                }
                if let vampirc_uci::UciMessage::Option(opt) = parse_one(&line) { 
                    config.options.push(opt); 
                }
                if let vampirc_uci::UciMessage::UciOk = parse_one(&line) { 
                    break; 
                }
        }
    }
        Ok::<_, Error>(config)
    };
    
    // FIXED: 5 second timeout and ensure process cleanup
    let result = timeout(Duration::from_secs(5), config_future).await;
    
    // FIXED: Always kill the child process to prevent zombies
    let _ = child.kill().await;
    
    match result {
        Ok(Ok(cfg)) => Ok(cfg),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(Error::EngineTimeout),
    }
}



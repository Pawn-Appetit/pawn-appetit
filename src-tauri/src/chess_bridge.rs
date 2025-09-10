// =============================================================================
// Chess Engine Bridge Module
// =============================================================================
//
// This module provides backward compatibility by implementing the original
// chess engine API using the new modular engine architecture. It serves as
// a bridge between the existing Tauri commands and the refactored engine
// modules.
//
// The implementation delegates to the new modular components while maintaining
// the exact same external API to ensure existing frontend code continues to work.

use std::path::PathBuf;

use log::{error, info, warn};
use crate::AppState;

use crate::error::Error;

// Re-export types from the new engine module for API compatibility
pub use crate::engine::{
    BestMoves, BestMovesPayload, EngineConfig, EngineLog, EngineOptions, GoMode, 
    MoveAnalysis, ReportProgress, AnalysisOptions, EngineOption, PlayersTime,
    MultiPvDiagnostic, EngineCapabilityTest,
};

// Re-export the process type for compatibility
pub use crate::engine::EngineProcess;

/// Bridge function to convert new EngineError to legacy Error
fn convert_engine_error(engine_error: crate::engine::EngineError) -> Error {
    match engine_error {
        crate::engine::EngineError::Io(e) => Error::Io(e),
        crate::engine::EngineError::InitTimeout => Error::EngineTimeout,
        crate::engine::EngineError::StopTimeout => Error::EngineStopTimeout,
        crate::engine::EngineError::Timeout => Error::EngineTimeout,
        crate::engine::EngineError::NoStdin => Error::NoStdin,
        crate::engine::EngineError::NoStdout => Error::NoStdout,
        crate::engine::EngineError::InvalidState { expected, actual } => {
            Error::UnexpectedState { expected, actual }
        }
        crate::engine::EngineError::InvalidTransition { from, to } => {
            Error::InvalidStateTransition { from, to }
        }
        crate::engine::EngineError::EventEmissionFailed => Error::EventEmissionFailed,
        crate::engine::EngineError::NoMovesFound => Error::NoMovesFound,
        crate::engine::EngineError::MissingReferenceDatabase => Error::MissingReferenceDatabase,
        crate::engine::EngineError::FenParsing(e) => Error::FenError(e.to_string()),
        crate::engine::EngineError::PositionSetup(e) => Error::PositionError(e.to_string()),
        crate::engine::EngineError::UciMoveParsing(e) => Error::UciMoveError(e.to_string()),
        crate::engine::EngineError::IllegalMove(e) => Error::IllegalMoveError(e),
        crate::engine::EngineError::BrokenPipe => Error::EventEmissionFailed,
        crate::engine::EngineError::TooManyFailures => Error::EngineTimeout,
    }
}

// =============================================================================
// Tauri Commands - Bridge Implementation
// =============================================================================

#[tauri::command]
#[specta::specta]
pub async fn kill_engines(tab: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    info!("Killing all engines for tab: {}", tab);
    
    let engine_manager = state.engine_manager.lock().await;
    engine_manager.kill_engines_for_tab(tab).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    info!("Killing engine: tab={}, engine={}", tab, engine);
    
    let engine_manager = state.engine_manager.lock().await;
    engine_manager.kill_engine(engine, tab).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn stop_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    info!("Stopping engine: tab={}, engine={}", tab, engine);
    
    let engine_manager = state.engine_manager.lock().await;
    engine_manager.stop_engine(engine, tab).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_logs(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EngineLog>, Error> {
    let engine_manager = state.engine_manager.lock().await;
    let logs = engine_manager.get_engine_logs(engine, tab).await;
    Ok(logs)
}

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
    info!("Getting best moves: id={}, engine={}, tab={}", id, engine, tab);
    
    let engine_manager = state.engine_manager.lock().await;
    engine_manager.start_analysis(id, engine, tab, go_mode, options, app).await
        .map_err(convert_engine_error)
}

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
    info!("Starting game analysis: id={}, engine={}", id, engine);
    
    let path = PathBuf::from(&engine);
    let analyzer = crate::engine::GameAnalyzer::new(path);
    
    analyzer.analyze_game(id, go_mode, options, uci_options, state, app).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_config(path: PathBuf) -> Result<EngineConfig, Error> {
    info!("Getting engine configuration from: {:?}", path);
    
    crate::engine::EngineConfigurator::get_engine_config(path).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn diagnose_multipv(
    engine_path: PathBuf,
    options: EngineOptions,
) -> Result<MultiPvDiagnostic, Error> {
    info!("Diagnosing MultiPV for engine: {:?}", engine_path);
    
    crate::engine::UciProtocolDebugger::diagnose_multipv(engine_path, options).await
        .map_err(convert_engine_error)
}

#[tauri::command]
#[specta::specta]
pub async fn test_engine_capabilities(
    engine_path: PathBuf,
) -> Result<EngineCapabilityTest, Error> {
    info!("Testing engine capabilities: {:?}", engine_path);
    
    let test = crate::engine::UciProtocolDebugger::test_engine_capabilities(engine_path).await;
    Ok(test)
}

#[tauri::command]
#[specta::specta]
pub async fn generate_debug_steps(
    diagnostic: MultiPvDiagnostic,
) -> Result<Vec<String>, Error> {
    let steps = crate::engine::UciProtocolDebugger::generate_debug_steps(&diagnostic);
    Ok(steps)
}

// =============================================================================
// Legacy Support Functions
// =============================================================================

/// For backward compatibility, maintain the old DashMap-based engine tracking
/// while delegating actual work to the new EngineManager
pub async fn ensure_legacy_compatibility(state: &AppState) {
    // This function can be used to sync state between old and new systems
    // if needed during the transition period
    
    // For now, we'll rely on the new EngineManager entirely
    // The old engine_processes DashMap in AppState is kept for compilation
    // but will be gradually phased out
}

// Re-export evaluation functions for compatibility
pub use crate::engine::evaluation::naive_eval;

// =============================================================================
// Module Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_conversion() {
        let engine_error = crate::engine::EngineError::Timeout;
        let converted_error = convert_engine_error(engine_error);
        
        match converted_error {
            Error::EngineTimeout => {}, // Expected
            _ => panic!("Error conversion failed"),
        }
    }
}

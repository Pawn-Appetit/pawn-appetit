//! Engine process management for UCI chess engines.
//!
//! This module provides the `EngineManager` struct, which manages engine processes, handles best-move queries,
//! and spawns background tasks for engine output parsing and progress reporting.

use std::path::PathBuf;
use std::sync::Arc;

use tauri_specta::Event;
use log::{info, debug};
use tokio::sync::Mutex;

use crate::error::Error;
use crate::AppState;

use super::process::EngineProcess;
use super::types::{EngineLog, EngineOptions, GoMode};

/// Manager for UCI engine processes, handling best-move queries and process lifecycle.
pub struct EngineManager<'a> {
    state: tauri::State<'a, AppState>,
}

impl<'a> EngineManager<'a> {
    /// Create a new `EngineManager` with the given application state.
    pub fn new(state: tauri::State<'a, AppState>) -> Self {
        Self { state }
    }

    /// Get best moves from the engine for a given position and options.
    ///
    /// If an engine process is already running for the given key, it will reuse or update it as needed.
    /// Otherwise, it spawns a new process and background reader task.
    ///
    /// # Arguments
    /// * `id` - Unique analysis session identifier.
    /// * `engine` - Path to the UCI engine binary.
    /// * `tab` - Tab identifier for engine process grouping.
    /// * `go_mode` - Engine search mode (depth, time, etc).
    /// * `options` - Engine options (FEN, moves, etc).
    /// * `app` - Tauri app handle for event emission.
    ///
    /// # Returns
    /// Optionally returns the last progress and best moves if already available.
    ///
    /// # Errors
    /// Returns `Error` if engine operations fail.
    pub async fn get_best_moves(
        &self,
        id: String,
        engine: String,
        tab: String,
        go_mode: GoMode,
        options: EngineOptions,
        app: tauri::AppHandle,
    ) -> Result<Option<(f32, Vec<super::types::BestMoves>)>, Error> {
        let path = PathBuf::from(&engine);
        let key = (tab.clone(), engine.clone());

        // If an engine process already exists for this key, reuse or update it.
        if self.state.engine_processes.contains_key(&key) {
            {
                let process = self.state.engine_processes.get_mut(&key).unwrap();
                let mut process = process.lock().await;
                // If options and mode match and engine is running, return cached result.
                if options == process.options && go_mode == process.go_mode && process.running {
                    return Ok(Some((process.last_progress, process.last_best_moves.clone())));
                }
                // Otherwise, stop and reconfigure the engine.
                process.stop().await?;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            {
                let process = self.state.engine_processes.get_mut(&key).unwrap();
                let mut process = process.lock().await;
                process.set_options(options.clone()).await?;
                process.go(&go_mode).await?;
            }
            return Ok(None);
        }

        let (mut process, mut reader) = EngineProcess::new(path).await?;
        process.set_options(options.clone()).await?;
        process.go(&go_mode).await?;

        let process = Arc::new(Mutex::new(process));
        self.state.engine_processes.insert(key.clone(), process.clone());

        // Spawn background reader task so multiple engines can run concurrently.
        let app_cloned = app.clone();
        let id_cloned = id.clone();
        let tab_cloned = tab.clone();
        let key_cloned = key.clone();
        let engines_map = self.state.engine_processes.clone();
        tokio::spawn(async move {
            info!("Engine loop started: tab={} engine={}", key_cloned.0, key_cloned.1);
            // Limit event emission rate to avoid UI flooding.
            let lim = governor::RateLimiter::direct(governor::Quota::per_second(nonzero_ext::nonzero!(5u32)));
            while let Ok(Some(line)) = reader.next_line().await {
                debug!("[engine-stdout tab={} engine={}] {}", key_cloned.0, key_cloned.1, line);
                if let Some(proc_arc) = engines_map.get(&key_cloned) {
                    let mut proc = proc_arc.lock().await;
                    match vampirc_uci::parse_one(&line) {
                        vampirc_uci::UciMessage::Info(attrs) => {
                            if let Ok(best_moves) = super::process::parse_uci_attrs(attrs, &proc.options.fen.parse().unwrap(), &proc.options.moves) {
                                let multipv = best_moves.multipv;
                                let cur_depth = best_moves.depth;
                                let cur_nodes = best_moves.nodes;
                                if multipv as usize == proc.best_moves.len() + 1 {
                                    proc.best_moves.push(best_moves);
                                    if multipv == proc.real_multipv {
                                        // Only emit if all lines are at the same depth and rate limit allows.
                                        if proc.best_moves.iter().all(|x| x.depth == cur_depth) && cur_depth >= proc.last_depth && lim.check().is_ok() {
                                            let progress = match proc.go_mode {
                                                GoMode::Depth(depth) => (cur_depth as f64 / depth as f64) * 100.0,
                                                GoMode::Time(time) => (proc.start.elapsed().as_millis() as f64 / time as f64) * 100.0,
                                                GoMode::Nodes(nodes) => (cur_nodes as f64 / nodes as f64) * 100.0,
                                                GoMode::PlayersTime(_) => 99.99,
                                                GoMode::Infinite => 99.99,
                                            };
                                            super::types::BestMovesPayload { best_lines: proc.best_moves.clone(), engine: id_cloned.clone(), tab: tab_cloned.clone(), fen: proc.options.fen.clone(), moves: proc.options.moves.clone(), progress }.emit(&app_cloned).ok();
                                            proc.last_depth = cur_depth;
                                            proc.last_best_moves = proc.best_moves.clone();
                                            proc.last_progress = progress as f32;
                                        }
                                        proc.best_moves.clear();
                                    }
                                }
                            }
                        }
                        vampirc_uci::UciMessage::BestMove { .. } => {
                            // Emit final result when engine signals best move.
                            super::types::BestMovesPayload { best_lines: proc.last_best_moves.clone(), engine: id_cloned.clone(), tab: tab_cloned.clone(), fen: proc.options.fen.clone(), moves: proc.options.moves.clone(), progress: 100.0 }.emit(&app_cloned).ok();
                            proc.last_progress = 100.0;
                        }
                        _ => {}
                    }
                    proc.logs.push(EngineLog::Engine(line));
                }
            }
            info!("Engine process finished: tab: {}, engine: {}", key_cloned.0, key_cloned.1);
            engines_map.remove(&key_cloned);
        });

        Ok(None)
    }
}



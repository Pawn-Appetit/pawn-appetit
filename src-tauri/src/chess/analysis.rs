//! Game analysis logic for evaluating chess games using UCI engines.
//!
//! This module provides the `GameAnalysisService` struct, which exposes methods to analyze chess games move-by-move using a UCI-compatible engine.
//! It integrates with the database for novelty detection and annotates sacrifices, supporting progress reporting for UI updates.

use std::path::PathBuf;

use shakmaty::{fen::Fen, uci::UciMove, CastlingMode, Chess, EnPassantMode, Position};
use vampirc_uci::parse_one;

use crate::db::{is_position_in_db, GameQueryJs, PositionQueryJs};
use crate::error::Error;
use crate::AppState;

use super::evaluation::naive_eval;
use super::process::{parse_uci_attrs, EngineProcess};
use super::types::{AnalysisOptions, EngineOption, MoveAnalysis, ReportProgress};
use tauri_specta::Event;

/// Service for analyzing chess games using a UCI engine.
pub struct GameAnalysisService;

impl GameAnalysisService {
    /// Analyze a chess game move-by-move using a UCI engine.
    ///
    /// # Arguments
    /// * `id` - Unique analysis session identifier.
    /// * `engine` - Path to the UCI engine binary.
    /// * `go_mode` - Engine search mode (depth, time, etc).
    /// * `options` - Analysis options (FEN, moves, etc).
    /// * `uci_options` - Extra UCI engine options.
    /// * `state` - Application state for DB and engine process management.
    /// * `app` - Tauri app handle for event emission.
    ///
    /// # Returns
    /// Vector of `MoveAnalysis` for each position in the game.
    ///
    /// # Errors
    /// Returns `Error` if engine or DB operations fail.
    pub async fn analyze_game(
        id: String,
        engine: String,
        go_mode: super::types::GoMode,
        options: AnalysisOptions,
        uci_options: Vec<EngineOption>,
        state: tauri::State<'_, AppState>,
        app: tauri::AppHandle,
    ) -> Result<Vec<MoveAnalysis>, Error> {
        let path = PathBuf::from(&engine);
        let mut analysis: Vec<MoveAnalysis> = Vec::new();

        let (mut proc, mut reader) = EngineProcess::new(path).await?;

        let fen = Fen::from_ascii(options.fen.as_bytes())?;

        // Build a list of FENs and moves for each position in the game, tracking sacrifices.
        let mut chess: Chess = fen.clone().into_position(CastlingMode::Chess960)?;
        let mut fens: Vec<(Fen, Vec<String>, bool)> = vec![(fen, vec![], false)];

        options.moves.iter().enumerate().for_each(|(i, m)| {
            let uci = UciMove::from_ascii(m.as_bytes()).unwrap();
            let m = uci.to_move(&chess).unwrap();
            let previous_pos = chess.clone();
            chess.play_unchecked(&m);
            let current_pos = chess.clone();
            if !chess.is_game_over() {
                // Detect sacrifices by comparing naive evals before and after the move.
                let prev_eval = naive_eval(&previous_pos);
                let cur_eval = -naive_eval(&current_pos);
                fens.push((
                    Fen::from_position(current_pos, EnPassantMode::Legal),
                    options.moves.clone().into_iter().take(i + 1).collect(),
                    prev_eval > cur_eval + 100, // Mark as sacrifice if eval drops by > 100.
                ));
            }
        });

        if options.reversed {
            fens.reverse();
        }

        let mut novelty_found = false;

        // Analyze each position using the engine, reporting progress.
        for (i, (_, moves, _)) in fens.iter().enumerate() {
            ReportProgress { progress: (i as f64 / fens.len() as f64) * 100.0, id: id.clone(), finished: false }.emit(&app)?;

            // Ensure MultiPV=2 for principal variation analysis.
            let mut extra_options = uci_options.clone();
            if !extra_options.iter().any(|x| x.name == "MultiPV") {
                extra_options.push(EngineOption { name: "MultiPV".to_string(), value: "2".to_string() });
            } else {
                extra_options.iter_mut().for_each(|x| { if x.name == "MultiPV" { x.value = "2".to_string(); } });
            }

            proc.set_options(super::types::EngineOptions { fen: options.fen.clone(), moves: moves.clone(), extra_options }).await?;
            proc.go(&go_mode).await?;

            let mut current_analysis = MoveAnalysis::default();
            // Read engine output and parse best moves for this position.
            while let Ok(Some(line)) = reader.next_line().await {
                match parse_one(&line) {
                    vampirc_uci::UciMessage::Info(attrs) => {
                        if let Ok(best_moves) = parse_uci_attrs(attrs, &proc.options.fen.parse()?, moves) {
                            let multipv = best_moves.multipv;
                            let cur_depth = best_moves.depth;
                            if multipv as usize == proc.best_moves.len() + 1 {
                                proc.best_moves.push(best_moves);
                                if multipv == proc.real_multipv {
                                    if proc.best_moves.iter().all(|x| x.depth == cur_depth) && cur_depth >= proc.last_depth {
                                        current_analysis.best = proc.best_moves.clone();
                                        proc.last_depth = cur_depth;
                                    }
                                    // FIXED: Replace assert with safe check to prevent panic in production
                                    if proc.best_moves.len() != proc.real_multipv as usize {
                                        log::warn!("Engine returned {} moves but expected {} (MultiPV mismatch)", 
                                                  proc.best_moves.len(), proc.real_multipv);
                                    }
                                    proc.best_moves.clear();
                                }
                            }
                        }
                    }
                    vampirc_uci::UciMessage::BestMove { .. } => { break; }
                    _ => {}
                }
            }
            analysis.push(current_analysis);
        }

        if options.reversed {
            analysis.reverse();
            fens.reverse();
        }

        // Annotate sacrifices and novelties for each analyzed position.
        for (i, analysis) in analysis.iter_mut().enumerate() {
            let fen = &fens[i].0;
            let query = PositionQueryJs { fen: fen.to_string(), type_: "exact".to_string() };

            analysis.is_sacrifice = fens[i].2;
            if options.annotate_novelties && !novelty_found {
                if let Some(reference) = options.reference_db.clone() {
                    analysis.novelty = !is_position_in_db(reference, GameQueryJs::new().position(query.clone()).clone(), state.clone()).await?;
                    if analysis.novelty { novelty_found = true; }
                } else {
                    return Err(Error::MissingReferenceDatabase);
                }
            }
        }

        ReportProgress { progress: 100.0, id: id.clone(), finished: true }.emit(&app)?;
        Ok(analysis)
    }
}



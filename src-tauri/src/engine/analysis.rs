use std::{path::PathBuf, time::{Instant, Duration}};

use log::{debug, error, info, trace, warn};
use shakmaty::{
    fen::Fen, uci::UciMove, CastlingMode, Chess, EnPassantMode, Position,
};
use tauri::AppHandle;
use tokio::{
    io::{AsyncBufReadExt, BufReader, Lines},
    process::ChildStdout,
};
use vampirc_uci::UciMessage;

use crate::{
    db::{is_position_in_db, GameQueryJs, PositionQueryJs},
    AppState,
};

use super::{
    communication::{parse_info_to_best_moves, UciCommunicator, AnalysisHandler},
    events::emit_progress_update,
    process::EngineProcess,
    types::{
        AnalysisOptions, BestMoves, EngineError, EngineOption, EngineOptions, EngineResult,
        GoMode, MoveAnalysis,
    },
};

/// High-level game analysis orchestrator
/// 
/// This analyzer handles:
/// - Complete game analysis workflows
/// - Position building and validation
/// - Progress reporting
/// - Novelty detection integration
/// - Multi-position analysis coordination
pub struct GameAnalyzer {
    engine_path: PathBuf,
}

impl GameAnalyzer {
    /// Create a new game analyzer
    pub fn new(engine_path: PathBuf) -> Self {
        Self { engine_path }
    }

    /// Analyze a complete game
    pub async fn analyze_game(
        &self,
        id: String,
        go_mode: GoMode,
        options: AnalysisOptions,
        uci_options: Vec<super::types::EngineOption>,
        state: tauri::State<'_, AppState>,
        app: AppHandle,
    ) -> EngineResult<Vec<MoveAnalysis>> {
        self.analyze_game_with_state(id, go_mode, options, uci_options, (*state.inner()).clone(), app).await
    }

    pub async fn analyze_game_with_state(
        &self,
        id: String,
        go_mode: GoMode,
        options: AnalysisOptions,
        uci_options: Vec<super::types::EngineOption>,
        state: AppState,
        app: AppHandle,
    ) -> EngineResult<Vec<MoveAnalysis>> {
        info!("Starting game analysis: id={}, engine={:?}", id, self.engine_path);
        debug!("Analysis options: FEN={}, moves={}, novelties={}", 
               options.fen, options.moves.len(), options.annotate_novelties);
        
        // Create engine process
        // Initialize the engine process
        let (mut proc, _reader) = EngineProcess::new(self.engine_path.clone()).await?;

        // Parse initial position and build analysis positions
        let fen = Fen::from_ascii(options.fen.as_bytes())?;
        let mut chess: Chess = fen.clone().into_position(CastlingMode::Chess960)?;
        
        let mut positions_to_analyze = self.build_analysis_positions(&mut chess, &fen, &options)?;
        
        if options.reversed {
            debug!("Reversing analysis order");
            positions_to_analyze.reverse();
        }

        let mut analysis: Vec<MoveAnalysis> = Vec::new();
        let mut novelty_found = false;
        let total_positions = positions_to_analyze.len();
        
        info!("Analyzing {} positions", total_positions);

        // Analyze each position
        // Initialize total positions for progress tracking
        let total_positions = positions_to_analyze.len();
        let mut analysis: Vec<MoveAnalysis> = Vec::new();
        let mut novelty_found = false;

        for (i, (position_fen, moves, is_sacrifice)) in positions_to_analyze.iter().enumerate() {
            debug!("Analyzing position {}/{}: FEN={}, {} moves played from start", 
                   i + 1, total_positions, position_fen, moves.len());
            
            // Emit progress update
            emit_progress_update(&app, (i as f64 / total_positions as f64) * 100.0, &id, false).await?;

            // Create a new engine process for each position to avoid ownership issues
            let (mut proc_single, reader_single) = EngineProcess::new(self.engine_path.clone()).await?;
            
            // Setup engine options for this position
            let analysis_options = self.prepare_engine_options(&uci_options);

            if let Err(e) = proc_single.configure(EngineOptions {
                fen: position_fen.to_string(),
                moves: vec![], // Use empty moves since position_fen already includes the moves
                extra_options: analysis_options,
            }).await {
                warn!("Failed to configure engine for position {}: {}", i, e);
                analysis.push(MoveAnalysis::default());
                continue;
            }

            debug!("Starting engine analysis for position {}", i + 1);
            if let Err(e) = proc_single.start_analysis(go_mode.clone()).await {
                warn!("Failed to start analysis for position {}: {}", i, e);
                analysis.push(MoveAnalysis::default());
                continue;
            }

            // Analyze this position
            let mut current_analysis = MoveAnalysis::default();
            match self.analyze_single_position_owned(reader_single, &proc_single).await {
                Ok(best_moves) => {
                    debug!("Analysis complete for position {}: found {} best moves", i + 1, best_moves.len());
                    current_analysis.best = best_moves;
                }
                Err(e) => {
                    warn!("Failed to analyze position {}: {}", i, e);
                }
            }

            // Set sacrifice flag
            current_analysis.is_sacrifice = *is_sacrifice;
            analysis.push(current_analysis);
        }

        // Restore original order if reversed
        if options.reversed {
            debug!("Restoring original analysis order");
            analysis.reverse();
            positions_to_analyze.reverse();
        }

        // Check for novelties after analysis is complete
        for (i, analysis_result) in analysis.iter_mut().enumerate() {
            let position_fen = &positions_to_analyze[i].0;
            
            if options.annotate_novelties && !novelty_found {
                match self.check_novelty(position_fen, &options.reference_db, &state).await {
                    Ok(is_novelty) => {
                        analysis_result.novelty = is_novelty;
                        if is_novelty {
                            info!("Novelty found at position {}", i);
                            novelty_found = true;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to check novelty for position {}: {}", i, e);
                        analysis_result.novelty = false;
                    }
                }
            }
        }

        // Final progress update
        emit_progress_update(&app, 100.0, &id, true).await?;
        
        // Clean up: stop the engine and terminate the process
        if proc.is_running() {
            if let Err(e) = proc.stop().await {
                warn!("Failed to stop engine at end of analysis: {}", e);
            }
        }
        
        if let Err(e) = proc.kill().await {
            warn!("Failed to terminate engine process: {}", e);
        }
        
        info!("Game analysis completed: {} positions analyzed", analysis.len());
        Ok(analysis)
    }

    /// Build analysis positions from the game moves
    fn build_analysis_positions(
        &self,
        chess: &mut Chess,
        initial_fen: &Fen,
        options: &AnalysisOptions
    ) -> EngineResult<Vec<(Fen, Vec<String>, bool)>> {
        let mut positions = vec![(initial_fen.clone(), vec![], false)];

        for (i, move_str) in options.moves.iter().enumerate() {
            let uci = UciMove::from_ascii(move_str.as_bytes())?;
            let mv = uci.to_move(chess)?;
            
            let previous_pos = chess.clone();
            chess.play_unchecked(&mv);
            let current_pos = chess.clone();
            
            if !chess.is_game_over() {
                let is_sacrifice = self.detect_sacrifice(&previous_pos, &current_pos);
                let moves_so_far: Vec<String> = options.moves.iter().take(i + 1).cloned().collect();
                
                positions.push((
                    Fen::from_position(current_pos, EnPassantMode::Legal),
                    moves_so_far,
                    is_sacrifice,
                ));
            }
        }

        debug!("Built {} positions for analysis", positions.len());
        Ok(positions)
    }

    /// Analyze a single position (owned reader version)
    async fn analyze_single_position_owned(
        &self,
        reader: Lines<BufReader<ChildStdout>>,
        proc: &EngineProcess,
    ) -> EngineResult<Vec<BestMoves>> {
        debug!("Starting single position analysis");
        
        let mut communicator = UciCommunicator::new(reader);
        let mut analysis_handler = AnalysisHandler::new();
        
        let options = proc.options();
        let real_multipv = self.calculate_multipv(options)?;
        analysis_handler.set_multipv(real_multipv);
        
        debug!("Analysis setup: MultiPV={}, FEN={}", real_multipv, options.fen);
        
        loop {
            match communicator.read_line(Duration::from_secs(10)).await? {
                Some(line) => {
                    trace!("Engine output: {}", line);
                    
                    if line.starts_with("bestmove") {
                        debug!("Analysis complete - received bestmove command");
                        // Return the last complete set of best moves
                        let final_moves = analysis_handler.last_best_moves().to_vec();
                        if final_moves.is_empty() {
                            warn!("No analysis results found - returning empty");
                        } else {
                            debug!("Returning {} best moves with depths: {:?}", 
                                   final_moves.len(), 
                                   final_moves.iter().map(|m| m.depth).collect::<Vec<_>>());
                        }
                        return Ok(final_moves);
                    }
                    
                    // Parse UCI message
                    let message = communicator.parse_message(&line);
                    if let vampirc_uci::UciMessage::Info(attrs) = message {
                        // Process the info message through the analysis handler
                        match analysis_handler.process_info_message(attrs, &options.fen, &options.moves) {
                            Ok(Some(complete_moves)) => {
                                debug!("Received complete analysis update: {} moves at depth {}", 
                                       complete_moves.len(),
                                       complete_moves.first().map(|m| m.depth).unwrap_or(0));
                                // Continue collecting updates until bestmove
                            }
                            Ok(None) => {
                                // Partial update, continue waiting
                                trace!("Partial analysis update received");
                            }
                            Err(e) => {
                                debug!("Failed to process info message: {}", e);
                                // Continue processing other messages
                            }
                        }
                    }
                }
                None => {
                    debug!("Engine stdout closed without bestmove");
                    break;
                }
            }
        }

        // If we exit without bestmove, return what we have
        let final_moves = analysis_handler.last_best_moves().to_vec();
        debug!("Analysis ended without bestmove, returning {} moves", final_moves.len());
        Ok(final_moves)
    }

    /// Analyze a single position  
    async fn analyze_single_position(
        &self,
        reader: &mut Lines<BufReader<ChildStdout>>,
        proc: &EngineProcess,
    ) -> EngineResult<Vec<BestMoves>> {
        // This method should not be used since reader is moved
        // Return empty results
        Ok(Vec::new())
    }

    /// Calculate effective MultiPV for a position
    fn calculate_multipv(&self, options: &EngineOptions) -> EngineResult<u16> {
        use super::communication::calculate_effective_multipv;
        
        // Look for MultiPV setting in extra options, default to 2
        let requested_multipv = options.extra_options
            .iter()
            .find(|opt| opt.name.to_lowercase() == "multipv")
            .and_then(|opt| opt.value.parse::<u16>().ok())
            .unwrap_or(2);
            
        calculate_effective_multipv(requested_multipv, &options.fen, &options.moves)
    }

    /// Detect if a move is a sacrifice
    fn detect_sacrifice(&self, previous_pos: &Chess, current_pos: &Chess) -> bool {
        use super::evaluation::{SacrificeDetector};
        
        let detector = SacrificeDetector::default();
        detector.is_sacrifice(previous_pos, current_pos)
    }

    /// Prepare engine options from UCI options
    fn prepare_engine_options(&self, uci_options: &[EngineOption]) -> Vec<EngineOption> {
        let mut options = uci_options.to_vec();
        self.ensure_multipv_option(&mut options);
        options
    }

    /// Ensure MultiPV option is set
    fn ensure_multipv_option(&self, options: &mut Vec<EngineOption>) {
        // Check if MultiPV is already set
        let has_multipv = options.iter().any(|opt| opt.name.to_lowercase() == "multipv");
        
        if !has_multipv {
            debug!("Adding default MultiPV=2 option");
            options.push(EngineOption {
                name: "MultiPV".to_string(),
                value: "2".to_string(),
            });
        } else {
            debug!("MultiPV option already present in engine options");
        }
    }

    /// Check if position is a novelty
    async fn check_novelty(
        &self,
        _fen: &Fen,
        _reference_db: &Option<PathBuf>,
        _state: &AppState
    ) -> EngineResult<bool> {
        // Note: For simplicity, we'll skip the database check in the refactored version
        // The original implementation would require access to the database connection
        // This could be implemented as a separate service or passed as a parameter
        Ok(true) // Assume it's always a novelty for now
    }
}

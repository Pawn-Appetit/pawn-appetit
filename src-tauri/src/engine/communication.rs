use std::time::{Duration, Instant};

use log::{debug, error, trace, warn};
use shakmaty::{
    fen::Fen, san::SanPlus, uci::UciMove, CastlingMode, Chess, Color, Position,
};
use tokio::{
    io::{AsyncBufReadExt, BufReader, Lines},
    process::ChildStdout,
    sync::oneshot,
    time::timeout,
};
use vampirc_uci::{
    parse_one,
    UciInfoAttribute, UciMessage,
};

use super::types::{
    AnalysisState, BestMoves, EngineError, EngineLog, EngineResult, 
    invert_score, MIN_EVENT_INTERVAL,
};

/// Handles UCI message parsing and communication
/// 
/// This struct is responsible for:
/// - Reading and parsing UCI messages from engine stdout
/// - Converting UCI info messages to BestMoves structures
/// - Managing the communication loop with rate limiting
#[derive(Debug)]
pub struct UciCommunicator {
    reader: Lines<BufReader<ChildStdout>>,
}

impl UciCommunicator {
    /// Create a new UCI communicator with the given stdout reader
    pub fn new(reader: Lines<BufReader<ChildStdout>>) -> Self {
        Self { reader }
    }

    /// Read the next line from the engine with timeout
    pub async fn read_line(&mut self, timeout_duration: Duration) -> EngineResult<Option<String>> {
        match timeout(timeout_duration, self.reader.next_line()).await {
            Ok(Ok(line)) => Ok(line),
            Ok(Err(e)) => {
                error!("Error reading from engine stdout: {}", e);
                
                // Check for broken pipe specifically
                if let Some(os_error) = e.raw_os_error() {
                    if os_error == 32 { // EPIPE on Unix systems
                        warn!("Broken pipe detected (os error 32)");
                        return Err(EngineError::BrokenPipe);
                    }
                }
                
                // Check error kind for connection issues
                match e.kind() {
                    std::io::ErrorKind::BrokenPipe => {
                        warn!("Broken pipe detected via ErrorKind");
                        Err(EngineError::BrokenPipe)
                    }
                    std::io::ErrorKind::ConnectionAborted | 
                    std::io::ErrorKind::ConnectionReset => {
                        warn!("Connection issue detected: {:?}", e.kind());
                        Err(EngineError::BrokenPipe)
                    }
                    std::io::ErrorKind::UnexpectedEof => {
                        warn!("Unexpected EOF, engine process may have died");
                        Err(EngineError::BrokenPipe)
                    }
                    _ => {
                        Err(EngineError::Io(e))
                    }
                }
            }
            Err(_) => {
                // Timeout is not an error in communication loop
                Ok(None)
            }
        }
    }

    /// Parse a UCI message from a line
    pub fn parse_message(&self, line: &str) -> UciMessage {
        parse_one(line)
    }
}

/// Manages analysis state separately from process state
/// 
/// This handler maintains the analysis-specific state and processes
/// UCI info messages to build complete analysis results.
#[derive(Debug)]
pub struct AnalysisHandler {
    state: AnalysisState,
    last_event_sent: Option<Instant>,
}

impl AnalysisHandler {
    /// Create a new analysis handler
    pub fn new() -> Self {
        Self {
            state: AnalysisState::default(),
            last_event_sent: None,
        }
    }

    /// Get reference to current analysis state
    pub fn state(&self) -> &AnalysisState {
        &self.state
    }

    /// Get mutable reference to analysis state
    pub fn state_mut(&mut self) -> &mut AnalysisState {
        &mut self.state
    }

    /// Reset analysis state for new analysis
    pub fn reset(&mut self) {
        self.state.reset();
        self.last_event_sent = None;
    }

    /// Set the effective MultiPV for this analysis
    pub fn set_multipv(&mut self, multipv: u16) {
        self.state.real_multipv = multipv;
    }

    /// Process a UCI info message and update analysis state
    /// 
    /// Returns true if a complete set of best moves is ready for emission
    pub fn process_info_message(
        &mut self,
        attrs: Vec<UciInfoAttribute>,
        fen: &str,
        moves: &[String],
    ) -> EngineResult<Option<Vec<BestMoves>>> {
        let best_moves = parse_info_to_best_moves(attrs, fen, moves)?;
        
        let multipv = best_moves.multipv;
        let cur_depth = best_moves.depth;
        
        debug!("Received info: depth={}, multipv={}/{}, nodes={}, last_depth={}", 
               cur_depth, multipv, self.state.real_multipv, best_moves.nodes, self.state.last_depth);
        
        // Always emit single-line results immediately if MultiPV=1
        if self.state.real_multipv == 1 {
            debug!("Single-line analysis (MultiPV=1), emitting immediately");
            let result = vec![best_moves];
            self.state.last_best_moves = result.clone();
            self.state.last_depth = cur_depth;
            return Ok(Some(result));
        }
        
        // Handle MultiPV > 1: collect all lines for the same depth
        // Check if this is the next expected MultiPV line
        if multipv as usize == self.state.best_moves.len() + 1 {
            self.state.best_moves.push(best_moves);
            debug!("Added move to collection: total={}/{} for depth {}", 
                   self.state.best_moves.len(), self.state.real_multipv, cur_depth);
            
            // Check if we have a complete set
            if multipv == self.state.real_multipv {
                let all_same_depth = self.state.best_moves.iter()
                    .all(|x| x.depth == cur_depth);
                
                debug!("Complete multipv set received: all_same_depth={}, cur_depth={}, last_depth={}", 
                       all_same_depth, cur_depth, self.state.last_depth);
                
                if all_same_depth && cur_depth >= self.state.last_depth {
                    let complete_moves = self.state.best_moves.clone();
                    self.state.last_best_moves = complete_moves.clone();
                    
                    // Only update last_depth when we have a complete set for a new depth
                    if cur_depth > self.state.last_depth {
                        self.state.last_depth = cur_depth;
                        debug!("Updated last_depth to: {} with {} variations", 
                               self.state.last_depth, complete_moves.len());
                    }
                    
                    // Clear for next multipv collection
                    self.state.best_moves.clear();
                    
                    return Ok(Some(complete_moves));
                } else {
                    debug!("Incomplete multipv set: different depths or older depth, clearing");
                    // Clear incomplete set (different depths or older depth)
                    self.state.best_moves.clear();
                }
            }
        } else {
            debug!("Unexpected MultiPV order: expected {}, got {}. Clearing and starting over.", 
                   self.state.best_moves.len() + 1, multipv);
            // Unexpected order, clear and start over
            self.state.best_moves.clear();
            if multipv == 1 {
                self.state.best_moves.push(best_moves);
                debug!("Restarted collection with multipv=1");
            }
        }
        
        Ok(None)
    }

    /// Check if enough time has passed since last event for rate limiting
    pub fn should_emit_based_on_timing(&self) -> bool {
        self.last_event_sent
            .map_or(true, |t| t.elapsed() >= MIN_EVENT_INTERVAL)
    }

    /// Mark that an event was sent
    pub fn mark_event_sent(&mut self) {
        self.last_event_sent = Some(Instant::now());
    }

    /// Get the last complete best moves
    pub fn last_best_moves(&self) -> &[BestMoves] {
        &self.state.last_best_moves
    }

    /// Update progress
    pub fn set_progress(&mut self, progress: f32) {
        self.state.last_progress = progress;
    }

    /// Get current progress
    pub fn progress(&self) -> f32 {
        self.state.last_progress
    }
}

impl Default for AnalysisHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse UCI info attributes into BestMoves structure
pub fn parse_info_to_best_moves(
    attrs: Vec<UciInfoAttribute>,
    fen: &str,
    moves: &[String],
) -> EngineResult<BestMoves> {
    trace!("Parsing UCI info attributes: {} attributes", attrs.len());
    
    let mut best_moves = BestMoves::default();
    let mut has_pv = false;

    let fen: Fen = fen.parse()?;
    let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
        Ok(p) => p,
        Err(e) => {
            warn!("Position error in parse_info_to_best_moves, attempting to ignore extra material");
            e.ignore_too_much_material()?
        }
    };
    
    // Apply moves to get current position
    for (i, move_str) in moves.iter().enumerate() {
        let uci = UciMove::from_ascii(move_str.as_bytes())
            .map_err(|e| {
                error!("Invalid UCI move in parse_info_to_best_moves at index {}: {}", i, move_str);
                e
            })?;
        let mv = uci.to_move(&pos)?;
        pos.play_unchecked(&mv);
    }
    
    let turn = pos.turn();

    for attr in attrs {
        match attr {
            UciInfoAttribute::Pv(moves) => {
                trace!("Processing PV with {} moves", moves.len());
                has_pv = true;
                let mut temp_pos = pos.clone();
                
                for mv in moves {
                    let uci: UciMove = mv.to_string().parse()?;
                    let m = uci.to_move(&temp_pos)?;
                    let san = SanPlus::from_move_and_play_unchecked(&mut temp_pos, &m);
                    best_moves.san_moves.push(san.to_string());
                    best_moves.uci_moves.push(uci.to_string());
                }
            }
            UciInfoAttribute::Nps(nps) => {
                best_moves.nps = nps as u32;
            }
            UciInfoAttribute::Nodes(nodes) => {
                best_moves.nodes = nodes as u32;
            }
            UciInfoAttribute::Depth(depth) => {
                best_moves.depth = depth;
                trace!("Found depth: {}", depth);
            }
            UciInfoAttribute::MultiPv(multipv) => {
                best_moves.multipv = multipv;
                trace!("Found multipv: {}", multipv);
            }
            UciInfoAttribute::Score(score) => {
                trace!("Found score: {:?}", score);
                best_moves.score = score;
            }
            _ => {}
        }
    }

    if !has_pv || best_moves.san_moves.is_empty() {
        trace!("No PV found in UCI info (has_pv={}, moves={})", 
               has_pv, best_moves.san_moves.len());
        return Err(EngineError::NoMovesFound);
    }

    // Invert score for black to move
    if turn == Color::Black {
        best_moves.score = invert_score(best_moves.score);
    }

    debug!("Successfully parsed UCI info: depth={}, multipv={}, moves={}", 
           best_moves.depth, best_moves.multipv, best_moves.san_moves.len());
    
    Ok(best_moves)
}

/// Event queue for managing backpressure in event emission
#[derive(Debug)]
pub struct EventQueue<T> {
    pending_events: Vec<T>,
    acknowledgment_receiver: Option<oneshot::Receiver<()>>,
    max_queue_size: usize,
}

impl<T> EventQueue<T> {
    /// Create a new event queue
    pub fn new() -> Self {
        Self {
            pending_events: Vec::new(),
            acknowledgment_receiver: None,
            max_queue_size: 10, // Prevent unbounded growth
        }
    }

    /// Queue an event, dropping oldest if queue is full
    pub fn queue_event(&mut self, event: T) -> bool {
        if self.pending_events.len() >= self.max_queue_size {
            debug!("Event queue full, dropping oldest event");
            self.pending_events.remove(0);
        }
        self.pending_events.push(event);
        true
    }

    /// Check if there are pending events or waiting for acknowledgment
    pub fn has_pending(&self) -> bool {
        !self.pending_events.is_empty() || self.acknowledgment_receiver.is_some()
    }

    /// Try to get the next event to send
    pub fn try_get_next(&mut self) -> Option<T> {
        // Check if we're waiting for acknowledgment
        if let Some(mut rx) = self.acknowledgment_receiver.take() {
            match rx.try_recv() {
                Ok(()) => {
                    debug!("Event acknowledged, can send next");
                }
                Err(oneshot::error::TryRecvError::Empty) => {
                    // Still waiting, put it back
                    self.acknowledgment_receiver = Some(rx);
                    return None;
                }
                Err(oneshot::error::TryRecvError::Closed) => {
                    debug!("Acknowledgment channel closed, proceeding");
                }
            }
        }

        // Return next event if available
        if !self.pending_events.is_empty() {
            Some(self.pending_events.remove(0))
        } else {
            None
        }
    }

    /// Set acknowledgment receiver for backpressure
    pub fn set_acknowledgment_receiver(&mut self, receiver: oneshot::Receiver<()>) {
        self.acknowledgment_receiver = Some(receiver);
    }
}

impl<T> Default for EventQueue<T> {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate analysis progress based on go mode and current state
pub fn calculate_progress(
    go_mode: &super::types::GoMode,
    depth: u32,
    nodes: u32,
    elapsed: Duration,
) -> f64 {
    use super::types::GoMode;
    
    match go_mode {
        GoMode::Depth(target_depth) => {
            (depth as f64 / *target_depth as f64) * 100.0
        }
        GoMode::Time(target_time) => {
            (elapsed.as_millis() as f64 / *target_time as f64) * 100.0
        }
        GoMode::Nodes(target_nodes) => {
            (nodes as f64 / *target_nodes as f64) * 100.0
        }
        GoMode::PlayersTime(_) => {
            (depth as f64 / 20.0).min(0.99) * 100.0 // Assume ~20 depth target
        }
        GoMode::Infinite => {
            // Use time-based estimation for infinite analysis
            let time_factor = (elapsed.as_secs() as f64 / 30.0).min(0.99); // 30 second estimation
            time_factor * 100.0
        }
    }
}

/// Determine effective MultiPV based on position and requested value
pub fn calculate_effective_multipv(
    requested_multipv: u16,
    fen: &str,
    moves: &[String],
) -> EngineResult<u16> {
    let fen: Fen = fen.parse()?;
    let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
        Ok(p) => p,
        Err(e) => {
            warn!("Position error in calculate_effective_multipv, attempting to ignore extra material");
            e.ignore_too_much_material()?
        }
    };
    
    // Apply moves to get current position
    for (i, move_str) in moves.iter().enumerate() {
        let uci = UciMove::from_ascii(move_str.as_bytes())
            .map_err(|e| {
                error!("Invalid UCI move in calculate_effective_multipv at index {}: {}", i, move_str);
                e
            })?;
        let mv = uci.to_move(&pos)?;
        pos.play_unchecked(&mv);
    }
    
    let legal_moves_count = pos.legal_moves().len();
    let effective_multipv = requested_multipv.min(legal_moves_count as u16).max(1);
    
    debug!("Calculated MultiPV: {} (legal moves: {})", effective_multipv, legal_moves_count);
    Ok(effective_multipv)
}

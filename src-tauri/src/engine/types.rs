use std::{path::PathBuf, time::Duration};

use derivative::Derivative;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;
use vampirc_uci::{uci::Score, UciOptionConfig};

use shakmaty::fen::ParseFenError;
use shakmaty::uci::ParseUciMoveError;
use shakmaty::{PositionError, Chess};

// =============================================================================
// Constants
// =============================================================================

/// Timeout for engine initialization phase
pub const ENGINE_INIT_TIMEOUT: Duration = Duration::from_secs(10);

/// Timeout for engine stop command (increased for better reliability)
pub const ENGINE_STOP_TIMEOUT: Duration = Duration::from_secs(8);

/// Quick stop timeout for first attempt
pub const ENGINE_QUICK_STOP_TIMEOUT: Duration = Duration::from_millis(500);

/// Delay between stop command retries
pub const STOP_RETRY_DELAY: Duration = Duration::from_millis(100);

/// Maximum number of stop command retries
pub const MAX_STOP_RETRIES: u32 = 3;

/// Timeout for engine state transitions
pub const ENGINE_STATE_TRANSITION_TIMEOUT: Duration = Duration::from_secs(2);

/// Minimum interval between events to prevent flooding
pub const MIN_EVENT_INTERVAL: Duration = Duration::from_millis(50);

/// Maximum events per second for rate limiting
pub const EVENTS_PER_SECOND: u32 = 15;

// =============================================================================
// Error Types
// =============================================================================

/// Comprehensive error type for chess engine operations
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Engine initialization timeout")]
    InitTimeout,
    
    #[error("Engine stop timeout")]
    StopTimeout,
    
    #[error("Engine general timeout")]
    Timeout,
    
    #[error("No stdin handle available")]
    NoStdin,
    
    #[error("No stdout handle available")]
    NoStdout,
    
    #[error("Invalid engine state: expected {expected:?}, got {actual:?}")]
    InvalidState { expected: EngineState, actual: EngineState },
    
    #[error("Invalid state transition: from {from:?} to {to:?}")]
    InvalidTransition { from: EngineState, to: EngineState },
    
    #[error("Event emission failed")]
    EventEmissionFailed,
    
    #[error("Broken pipe")]
    BrokenPipe,
    
    #[error("Too many consecutive failures")]
    TooManyFailures,
    
    #[error("No moves found in analysis")]
    NoMovesFound,
    
    #[error("Missing reference database")]
    MissingReferenceDatabase,
    
    #[error("FEN parsing error: {0}")]
    FenParsing(#[from] shakmaty::fen::ParseFenError),
    
    #[error("Position setup error: {0}")]
    PositionSetup(#[from] shakmaty::PositionError<shakmaty::Chess>),
    
    #[error("UCI move parsing error: {0}")]
    UciMoveParsing(#[from] shakmaty::uci::ParseUciMoveError),
    
    #[error("Illegal move: {0}")]
    IllegalMove(String),
}

pub type EngineResult<T> = Result<T, EngineError>;

// =============================================================================
// Core Engine Types
// =============================================================================

/// Engine operational states
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EngineState {
    /// Engine is ready to receive commands
    Idle,
    /// Engine is starting up and initializing
    Initializing,
    /// Engine is actively analyzing a position
    Analyzing,
    /// Engine is in the process of stopping analysis
    Stopping,
    /// Engine process has been terminated
    Terminated,
}

/// Analysis modes for engine operation
#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum GoMode {
    /// Analyze to a specific depth
    Depth(u32),
    /// Analyze for a specific time in milliseconds
    Time(u32),
    /// Analyze until a specific number of nodes
    Nodes(u32),
    /// Time control with player times and increments
    PlayersTime(PlayersTime),
    /// Infinite analysis (manual stop required)
    Infinite,
}

/// Time control for both players
#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct PlayersTime {
    pub white: u32,
    pub black: u32,
    pub winc: u32,
    pub binc: u32,
}

/// Engine configuration options
#[derive(Deserialize, Debug, Clone, Type, Derivative, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
#[derivative(Default)]
pub struct EngineOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub extra_options: Vec<EngineOption>,
}

/// Individual engine UCI option
#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct EngineOption {
    pub name: String,
    pub value: String,
}

// =============================================================================
// Analysis Results
// =============================================================================

/// Best move information from engine analysis
#[derive(Clone, Serialize, Debug, Derivative, Type)]
#[derivative(Default)]
pub struct BestMoves {
    pub nodes: u32,
    pub depth: u32,
    pub score: Score,
    #[serde(rename = "uciMoves")]
    pub uci_moves: Vec<String>,
    #[serde(rename = "sanMoves")]
    pub san_moves: Vec<String>,
    #[derivative(Default(value = "1"))]
    pub multipv: u16,
    pub nps: u32,
}

/// Complete analysis result for a single move
#[derive(Serialize, Debug, Default, Type)]
pub struct MoveAnalysis {
    pub best: Vec<BestMoves>,
    pub novelty: bool,
    pub is_sacrifice: bool,
}

/// Options for complete game analysis
#[derive(Deserialize, Debug, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub annotate_novelties: bool,
    pub reference_db: Option<PathBuf>,
    pub reversed: bool,
}

// =============================================================================
// Event Payloads
// =============================================================================

/// Payload for best moves updates during analysis
#[derive(Serialize, Debug, Clone, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct BestMovesPayload {
    pub best_lines: Vec<BestMoves>,
    pub engine: String,
    pub tab: String,
    pub fen: String,
    pub moves: Vec<String>,
    pub progress: f64,
}

/// Progress reporting for long-running operations
#[derive(Clone, Type, serde::Serialize, Event, Debug)]
pub struct ReportProgress {
    pub progress: f64,
    pub id: String,
    pub finished: bool,
}

// =============================================================================
// Engine Configuration
// =============================================================================

/// Complete engine configuration including UCI options
#[derive(Type, Default, Serialize, Debug, Clone)]
pub struct EngineConfig {
    pub name: String,
    pub options: Vec<UciOptionConfig>,
}

/// Engine logging for debugging and monitoring
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum EngineLog {
    Gui(String),
    Engine(String),
}

// =============================================================================
// Cache and State Management
// =============================================================================

/// Cache key for analysis results
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AnalysisCacheKey {
    pub tab: String,
    pub fen: String,
    pub engine: String,
    pub multipv: u16,
}

/// Analysis state separate from process state
#[derive(Debug, Clone)]
pub struct AnalysisState {
    pub last_depth: u32,
    pub best_moves: Vec<BestMoves>,
    pub last_best_moves: Vec<BestMoves>,
    pub last_progress: f32,
    pub real_multipv: u16,
}

impl Default for AnalysisState {
    fn default() -> Self {
        Self {
            last_depth: 0,
            best_moves: Vec::new(),
            last_best_moves: Vec::new(),
            last_progress: 0.0,
            real_multipv: 1,
        }
    }
}

impl AnalysisState {
    /// Reset analysis state for new analysis
    pub fn reset(&mut self) {
        self.last_depth = 0;
        self.best_moves.clear();
        self.last_best_moves.clear();
        self.last_progress = 0.0;
    }
}

// =============================================================================
// Platform-specific Constants
// =============================================================================

#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;

// =============================================================================
// Helper Functions
// =============================================================================

/// Calculate effective MultiPV based on legal moves
pub fn calculate_effective_multipv(requested_multipv: u16, legal_moves_count: usize) -> u16 {
    requested_multipv.min(legal_moves_count as u16).max(1)
}

/// Get piece value for material calculation
pub const fn piece_value(role: shakmaty::Role) -> i32 {
    match role {
        shakmaty::Role::Pawn => 100,
        shakmaty::Role::Knight => 300,
        shakmaty::Role::Bishop => 300,
        shakmaty::Role::Rook => 500,
        shakmaty::Role::Queen => 900,
        shakmaty::Role::King => 0, // King value not relevant for material count
    }
}

/// Invert score for opposite perspective (black to move)
pub fn invert_score(score: Score) -> Score {
    use vampirc_uci::uci::ScoreValue;
    
    let new_value = match score.value {
        ScoreValue::Cp(x) => ScoreValue::Cp(-x),
        ScoreValue::Mate(x) => ScoreValue::Mate(-x),
    };
    let new_wdl = score.wdl.map(|(w, d, l)| (l, d, w));
    Score {
        value: new_value,
        wdl: new_wdl,
        ..score
    }
}

// From trait implementations for error conversions
impl From<shakmaty::uci::IllegalUciMoveError> for EngineError {
    fn from(err: shakmaty::uci::IllegalUciMoveError) -> Self {
        EngineError::IllegalMove(err.to_string())
    }
}

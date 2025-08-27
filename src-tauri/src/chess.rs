use std::{
    fmt::Display,
    path::PathBuf,
    process::Stdio,
    sync::Arc,
    time::{Duration, Instant},
};

use dashmap::DashMap;
use derivative::Derivative;
use governor::{Quota, RateLimiter};
use log::{debug, error, info, trace, warn};
use nonzero_ext::*;
use serde::{Deserialize, Serialize};
use shakmaty::{
    fen::Fen, san::SanPlus, uci::UciMove, ByColor, CastlingMode, Chess, Color, EnPassantMode,
    Position, Role,
};
use specta::Type;
use tauri_specta::Event;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::{Mutex, oneshot},
    time::timeout,
};
use vampirc_uci::{
    parse_one,
    uci::{Score, ScoreValue},
    UciInfoAttribute, UciMessage, UciOptionConfig,
};

use crate::{
    db::{is_position_in_db, GameQueryJs, PositionQueryJs},
    error::Error,
    AppState,
};

// Constants for proper timeouts (not arbitrary delays)
const ENGINE_INIT_TIMEOUT: Duration = Duration::from_secs(10);
const ENGINE_STOP_TIMEOUT: Duration = Duration::from_secs(5);
const ENGINE_STATE_TRANSITION_TIMEOUT: Duration = Duration::from_secs(2);
const MIN_EVENT_INTERVAL: Duration = Duration::from_millis(50);
const EVENTS_PER_SECOND: u32 = 15;

// Engine state management
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EngineState {
    Idle,
    Initializing,
    Analyzing,
    Stopping,
    Terminated,
}

// Event management for backpressure
#[derive(Debug)]
pub struct EventQueue {
    pending_events: Vec<BestMovesPayload>,
    acknowledgment_receiver: Option<oneshot::Receiver<()>>,
    max_queue_size: usize,
}

impl EventQueue {
    fn new() -> Self {
        Self {
            pending_events: Vec::new(),
            acknowledgment_receiver: None,
            max_queue_size: 10, // Prevent unbounded growth
        }
    }

    fn queue_event(&mut self, event: BestMovesPayload) -> bool {
        if self.pending_events.len() >= self.max_queue_size {
            debug!("Event queue full, dropping oldest event");
            self.pending_events.remove(0);
        }
        self.pending_events.push(event);
        true
    }

    fn has_pending(&self) -> bool {
        !self.pending_events.is_empty() || self.acknowledgment_receiver.is_some()
    }

    async fn try_send_next(&mut self, app: &tauri::AppHandle) -> Result<bool, Error> {
        // Check if we're waiting for acknowledgment
        if let Some(mut rx) = self.acknowledgment_receiver.take() {
            match rx.try_recv() {
                Ok(()) => {
                    debug!("Event acknowledged, can send next");
                }
                Err(oneshot::error::TryRecvError::Empty) => {
                    // Still waiting, put it back
                    self.acknowledgment_receiver = Some(rx);
                    return Ok(false);
                }
                Err(oneshot::error::TryRecvError::Closed) => {
                    debug!("Acknowledgment channel closed, proceeding");
                }
            }
        }

        // Send next event if available
        if let Some(event) = self.pending_events.pop() {
            match event.emit(app) {
                Ok(()) => {
                    debug!("Event sent successfully");
                    Ok(true)
                }
                Err(e) => {
                    error!("Failed to emit event: {:?}", e);
                    Err(Error::EventEmissionFailed)
                }
            }
        } else {
            Ok(false)
        }
    }
}

#[derive(Debug)]
pub struct EngineProcess {
    stdin: ChildStdin,
    state: EngineState,
    last_depth: u32,
    best_moves: Vec<BestMoves>,
    last_best_moves: Vec<BestMoves>,
    last_progress: f32,
    last_event_sent: Option<Instant>,
    options: EngineOptions,
    go_mode: GoMode,
    real_multipv: u16,
    logs: Vec<EngineLog>,
    start: Instant,
    state_change_notify: Option<oneshot::Sender<EngineState>>,
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum EngineLog {
    Gui(String),
    Engine(String),
}

impl EngineProcess {
    async fn new(path: PathBuf) -> Result<(Self, Lines<BufReader<ChildStdout>>), Error> {
        info!("Initializing engine from path: {:?}", path);
        
        let mut child = Self::spawn_engine_process(&path)?;
        let (mut stdin, mut lines) = Self::get_io_handles(&mut child)?;
        
        let mut logs = Vec::new();
        
        // Initialize UCI communication with timeout
        match timeout(ENGINE_INIT_TIMEOUT, Self::initialize_uci(&mut stdin, &mut lines, &mut logs)).await {
            Ok(Ok(())) => {
                info!("Engine initialized successfully: {:?}", path);
            }
            Ok(Err(e)) => {
                error!("Failed to initialize engine {:?}: {}", path, e);
                let _ = child.kill().await;
                return Err(e);
            }
            Err(_) => {
                error!("Engine initialization timeout: {:?}", path);
                let _ = child.kill().await;
                return Err(Error::EngineTimeout);
            }
        }

        // Spawn stderr handler
        Self::spawn_stderr_handler(child.stderr.take());

        Ok((
            Self {
                stdin,
                state: EngineState::Idle,
                last_depth: 0,
                best_moves: Vec::new(),
                last_best_moves: Vec::new(),
                last_progress: 0.0,
                last_event_sent: None,
                logs,
                options: EngineOptions::default(),
                real_multipv: 0,
                go_mode: GoMode::Infinite,
                start: Instant::now(),
                state_change_notify: None,
            },
            lines,
        ))
    }

    async fn wait_for_state(&mut self, expected_state: EngineState, timeout_duration: Duration) -> Result<(), Error> {
        if self.state == expected_state {
            return Ok(());
        }

        let start = Instant::now();
        while start.elapsed() < timeout_duration {
            if self.state == expected_state {
                return Ok(());
            }
            
            // Small delay to prevent busy waiting
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        Err(Error::InvalidEngineState {
            expected: expected_state,
            actual: self.state.clone(),
        })
    }

    fn transition_state(&mut self, new_state: EngineState) -> Result<(), Error> {
        let valid_transition = match (&self.state, &new_state) {
            (EngineState::Idle, EngineState::Analyzing) => true,
            (EngineState::Analyzing, EngineState::Stopping) => true,
            (EngineState::Stopping, EngineState::Idle) => true,
            (EngineState::Analyzing, EngineState::Idle) => true, // Direct stop
            (_, EngineState::Terminated) => true,
            _ => false,
        };

        if !valid_transition {
            return Err(Error::InvalidStateTransition {
                from: self.state.clone(),
                to: new_state,
            });
        }

        debug!("Engine state transition: {:?} -> {:?}", self.state, new_state);
        self.state = new_state.clone();
        
        // Notify waiting tasks of state change
        if let Some(tx) = self.state_change_notify.take() {
            let _ = tx.send(new_state);
        }

        Ok(())
    }

    fn is_running(&self) -> bool {
        matches!(self.state, EngineState::Analyzing)
    }

    fn is_idle(&self) -> bool {
        matches!(self.state, EngineState::Idle)
    }

    fn spawn_engine_process(path: &PathBuf) -> Result<Child, Error> {
        debug!("Spawning engine process: {:?}", path);
        
        let mut command = Command::new(path);
        command.current_dir(path.parent().unwrap_or_else(|| std::path::Path::new(".")));
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("TERM", "dumb"); // Prevent terminal feature usage

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let child = command.spawn()
            .map_err(|e| {
                error!("Failed to spawn engine process {:?}: {}", path, e);
                Error::Io(e)
            })?;

        debug!("Engine process spawned successfully");
        Ok(child)
    }

    fn get_io_handles(child: &mut Child) -> Result<(ChildStdin, Lines<BufReader<ChildStdout>>), Error> {
        let stdin = child.stdin.take().ok_or_else(|| {
            error!("Failed to get stdin handle from engine process");
            Error::NoStdin
        })?;
        
        let stdout = child.stdout.take().ok_or_else(|| {
            error!("Failed to get stdout handle from engine process");
            Error::NoStdout
        })?;
        
        // Use a smaller buffer for more responsive reading
        let reader = BufReader::with_capacity(1024, stdout);
        let lines = reader.lines();
        Ok((stdin, lines))
    }

    async fn initialize_uci(
        stdin: &mut ChildStdin,
        lines: &mut Lines<BufReader<ChildStdout>>,
        logs: &mut Vec<EngineLog>
    ) -> Result<(), Error> {
        debug!("Starting UCI initialization");
        
        // Send UCI command
        Self::send_command_with_log(stdin, "uci\n", logs).await?;
        
        // Wait for uciok
        while let Some(line) = lines.next_line().await? {
            trace!("Engine response: {}", line);
            logs.push(EngineLog::Engine(line.clone()));
            
            if line == "uciok" {
                debug!("Received uciok, sending isready");
                Self::send_command_with_log(stdin, "isready\n", logs).await?;
                
                // Wait for readyok
                while let Some(ready_line) = lines.next_line().await? {
                    trace!("Engine ready response: {}", ready_line);
                    logs.push(EngineLog::Engine(ready_line.clone()));
                    
                    if ready_line == "readyok" {
                        debug!("Engine is ready");
                        return Ok(());
                    }
                }
                break;
            }
        }
        
        Err(Error::EngineTimeout)
    }

    fn spawn_stderr_handler(stderr: Option<tokio::process::ChildStderr>) {
        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut stderr_lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = stderr_lines.next_line().await {
                    warn!("Engine stderr: {}", line);
                }
            });
        }
    }

    async fn send_command_with_log(
        stdin: &mut ChildStdin,
        command: &str,
        logs: &mut Vec<EngineLog>
    ) -> Result<(), Error> {
        trace!("Sending command: {}", command.trim());
        
        stdin.write_all(command.as_bytes()).await
            .map_err(|e| {
                error!("Failed to send command '{}': {}", command.trim(), e);
                Error::Io(e)
            })?;
        
        // Flush stdin immediately to ensure command is sent to engine without delay
        stdin.flush().await
            .map_err(|e| {
                error!("Failed to flush command '{}': {}", command.trim(), e);
                Error::Io(e)
            })?;
        
        debug!("Command sent and flushed: {}", command.trim());
        logs.push(EngineLog::Gui(command.to_string()));
        Ok(())
    }

    async fn set_option<T>(&mut self, name: &str, value: T) -> Result<(), Error>
    where
        T: Display,
    {
        let msg = format!("setoption name {} value {}\n", name, value);
        debug!("Setting engine option: {} = {}", name, value);
        
        Self::send_command_with_log(&mut self.stdin, &msg, &mut self.logs).await
    }

    async fn set_options(&mut self, options: EngineOptions) -> Result<(), Error> {
        debug!("Setting engine options for position: {}", options.fen);
        
        // Parse and validate position
        let fen: Fen = options.fen.parse()
            .map_err(|e| {
                error!("Invalid FEN: {}", options.fen);
                e
            })?;
        
        let mut pos: Chess = match fen.into_position(CastlingMode::Chess960) {
            Ok(p) => p,
            Err(e) => {
                warn!("Position error, attempting to ignore extra material: {}", e);
                e.ignore_too_much_material()?
            }
        };
        
        // Apply moves and validate
        for (i, move_str) in options.moves.iter().enumerate() {
            let uci = UciMove::from_ascii(move_str.as_bytes())
                .map_err(|e| {
                    error!("Invalid UCI move at index {}: {}", i, move_str);
                    e
                })?;
            
            let mv = uci.to_move(&pos)
                .map_err(|e| {
                    error!("Illegal move at index {}: {} in position {}", i, move_str, pos.board());
                    e
                })?;
            
            pos.play_unchecked(&mv);
        }
        
        // Calculate effective MultiPV
        let multipv = self.calculate_multipv(&options, &pos);
        self.real_multipv = multipv;
        
        debug!("Calculated MultiPV: {} (legal moves: {})", multipv, pos.legal_moves().len());

        // Set options that have changed
        let changed_options: Vec<_> = options.extra_options.iter()
            .filter(|new_opt| {
                self.options.extra_options.iter()
                    .find(|current_opt| current_opt.name == new_opt.name)
                    .map_or(true, |current_opt| current_opt.value != new_opt.value)
            })
            .collect();

        for option in changed_options {
            self.set_option(&option.name, &option.value).await?;
        }

        // Update position if needed
        if options.fen != self.options.fen || options.moves != self.options.moves {
            self.set_position(&options.fen, &options.moves).await?;
        }
        
        // Reset analysis state
        self.reset_analysis_state();
        self.options = options;
        
        debug!("Engine options set successfully");
        Ok(())
    }

    fn calculate_multipv(&self, options: &EngineOptions, pos: &Chess) -> u16 {
        options
            .extra_options
            .iter()
            .find(|x| x.name == "MultiPV")
            .and_then(|x| x.value.parse().ok())
            .unwrap_or(1)
            .min(pos.legal_moves().len() as u16)
    }

    fn reset_analysis_state(&mut self) {
        self.last_depth = 0;
        self.best_moves.clear();
        self.last_best_moves.clear();
    }

    async fn set_position(&mut self, fen: &str, moves: &[String]) -> Result<(), Error> {
        let msg = if moves.is_empty() {
            format!("position fen {fen}\n")
        } else {
            format!("position fen {fen} moves {}\n", moves.join(" "))
        };

        debug!("Setting position: FEN={}, moves={}", fen, moves.len());
        Self::send_command_with_log(&mut self.stdin, &msg, &mut self.logs).await?;
        
        self.options.fen = fen.to_string();
        self.options.moves = moves.to_vec();
        Ok(())
    }

    fn format_go_command(&self, mode: &GoMode) -> String {
        match mode {
            GoMode::Depth(depth) => format!("go depth {depth}\n"),
            GoMode::Time(time) => format!("go movetime {time}\n"),
            GoMode::Nodes(nodes) => format!("go nodes {nodes}\n"),
            GoMode::PlayersTime(PlayersTime { white, black, winc, binc }) => {
                format!("go wtime {white} btime {black} winc {winc} binc {binc} movetime 1000\n")
            }
            GoMode::Infinite => "go infinite\n".to_string(),
        }
    }

    async fn stop(&mut self) -> Result<(), Error> {
        if !self.is_running() {
            debug!("Engine not running, stop request ignored");
            return Ok(());
        }

        info!("Stopping engine analysis");
        
        // Transition to stopping state
        self.transition_state(EngineState::Stopping)?;
        
        // Send stop command
        Self::send_command_with_log(&mut self.stdin, "stop\n", &mut self.logs).await?;
        
        // Wait for engine to actually stop (bestmove response or timeout)
        let stop_timeout = timeout(
            ENGINE_STOP_TIMEOUT, 
            self.wait_for_state(EngineState::Idle, ENGINE_STOP_TIMEOUT)
        ).await;
        
        match stop_timeout {
            Ok(Ok(())) => {
                info!("Engine stopped successfully");
                Ok(())
            }
            Ok(Err(e)) => {
                warn!("Engine stop state wait failed: {}", e);
                // Force transition to idle if state wait failed
                self.transition_state(EngineState::Idle)?;
                Ok(())
            }
            Err(_) => {
                error!("Engine stop timeout");
                // Force transition to idle after timeout
                self.transition_state(EngineState::Idle)?;
                Err(Error::EngineStopTimeout)
            }
        }
    }

    async fn go(&mut self, mode: &GoMode) -> Result<(), Error> {
        if !self.is_idle() {
            return Err(Error::InvalidEngineState {
                expected: EngineState::Idle,
                actual: self.state.clone(),
            });
        }

        self.go_mode = mode.clone();
        let msg = self.format_go_command(mode);
        
        // Transition to analyzing state before sending command
        self.transition_state(EngineState::Analyzing)?;
        
        info!("Starting engine analysis: {}", msg.trim());
        Self::send_command_with_log(&mut self.stdin, &msg, &mut self.logs).await?;
        
        self.start = Instant::now();
        self.last_event_sent = None;
        Ok(())
    }

    async fn kill(&mut self) -> Result<(), Error> {
        info!("Terminating engine process");
        self.transition_state(EngineState::Terminated)?;
        Self::send_command_with_log(&mut self.stdin, "quit\n", &mut self.logs).await?;
        Ok(())
    }
}

// Rest of the structs remain the same...
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AnalysisCacheKey {
    pub tab: String,
    pub fen: String,
    pub engine: String,
    pub multipv: u16,
}

#[derive(Clone, Serialize, Debug, Derivative, Type)]
#[derivative(Default)]
pub struct BestMoves {
    nodes: u32,
    depth: u32,
    score: Score,
    #[serde(rename = "uciMoves")]
    uci_moves: Vec<String>,
    #[serde(rename = "sanMoves")]
    san_moves: Vec<String>,
    #[derivative(Default(value = "1"))]
    multipv: u16,
    nps: u32,
}

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

fn invert_score(score: Score) -> Score {
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

fn parse_uci_info(
    attrs: Vec<UciInfoAttribute>,
    fen: &Fen,
    moves: &[String],
) -> Result<BestMoves, Error> {
    trace!("Parsing UCI info attributes: {} attributes", attrs.len());
    
    let mut best_moves = BestMoves::default();
    let mut has_depth = false;
    let mut has_multipv = false;
    let mut has_pv = false;

    let mut pos: Chess = match fen.clone().into_position(CastlingMode::Chess960) {
        Ok(p) => p,
        Err(e) => {
            warn!("Position error in parse_uci_info, attempting to ignore extra material");
            e.ignore_too_much_material()?
        }
    };
    
    // Apply moves to get current position
    for (i, move_str) in moves.iter().enumerate() {
        let uci = UciMove::from_ascii(move_str.as_bytes())
            .map_err(|e| {
                error!("Invalid UCI move in parse_uci_info at index {}: {}", i, move_str);
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
                has_depth = true;
                trace!("Found depth: {}", depth);
            }
            UciInfoAttribute::MultiPv(multipv) => {
                best_moves.multipv = multipv;
                has_multipv = true;
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
        trace!("No PV found in UCI info (has_pv={}, moves={})", has_pv, best_moves.san_moves.len());
        return Err(Error::NoMovesFound);
    }

    // Invert score for black to move
    if turn == Color::Black {
        best_moves.score = invert_score(best_moves.score);
    }

    debug!("Successfully parsed UCI info: depth={} (has_depth={}), multipv={} (has_multipv={}), moves={}", 
           best_moves.depth, has_depth, best_moves.multipv, has_multipv, best_moves.san_moves.len());
    
    Ok(best_moves)
}

// Engine management commands
#[tauri::command]
#[specta::specta]
pub async fn kill_engines(tab: String, state: tauri::State<'_, AppState>) -> Result<(), Error> {
    info!("Killing all engines for tab: {}", tab);
    
    let keys: Vec<_> = state
        .engine_processes
        .iter()
        .filter(|entry| entry.key().0.starts_with(&tab))
        .map(|entry| entry.key().clone())
        .collect();

    debug!("Found {} engines to kill for tab: {}", keys.len(), tab);
    
    for key in keys {
        if let Some(process_guard) = state.engine_processes.get(&key) {
            let mut process = process_guard.lock().await;
            if let Err(e) = process.kill().await {
                warn!("Failed to kill engine {:?}: {}", key, e);
            }
        }
        state.engine_processes.remove(&key);
    }
    
    info!("Completed killing engines for tab: {}", tab);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kill_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab.clone(), engine.clone());
    info!("Killing engine: tab={}, engine={}", tab, engine);
    
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        if let Err(e) = process.kill().await {
            warn!("Failed to kill engine {:?}: {}", key, e);
        }
    }
    
    state.engine_processes.remove(&key);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn stop_engine(
    engine: String,
    tab: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), Error> {
    let key = (tab.clone(), engine.clone());
    debug!("Stopping engine: tab={}, engine={}", tab, engine);
    
    if let Some(process) = state.engine_processes.get(&key) {
        let mut process = process.lock().await;
        if let Err(e) = process.stop().await {
            warn!("Failed to stop engine {:?}: {}", key, e);
        }
    } else {
        debug!("Engine not found: {:?}", key);
    }
    Ok(())
}

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
    let path = PathBuf::from(&engine);
    let key = (tab.clone(), engine.clone());

    info!("Getting best moves: id={}, engine={}, tab={}", id, engine, tab);
    debug!("Analysis options: FEN={}, moves={}", options.fen, options.moves.len());

    // Check if engine is already running with same parameters
    if let Some(process_guard) = state.engine_processes.get(&key) {
        let mut process = process_guard.lock().await;
        
        if options == process.options && go_mode == process.go_mode && process.is_running() {
            debug!("Engine already running with same parameters, returning cached results");
            return Ok(Some((process.last_progress, process.last_best_moves.clone())));
        }
        
        info!("Stopping existing engine for parameter change");
        if let Err(e) = process.stop().await {
            warn!("Failed to stop existing engine: {}", e);
        }
        
        // Wait for engine to be idle before proceeding
        if let Err(e) = process.wait_for_state(EngineState::Idle, ENGINE_STATE_TRANSITION_TIMEOUT).await {
            warn!("Engine did not return to idle state: {}", e);
            // Continue anyway, but the next operations might fail
        }
        
        if let Err(e) = process.set_options(options.clone()).await {
            error!("Failed to set engine options: {}", e);
            return Err(e);
        }
        
        if let Err(e) = process.go(&go_mode).await {
            error!("Failed to start engine analysis: {}", e);
            return Err(e);
        }
        
        return Ok(None);
    }

    // Create new engine process
    info!("Creating new engine process");
    let (mut process, reader) = match EngineProcess::new(path.clone()).await {
        Ok((proc, reader)) => (proc, reader),
        Err(e) => {
            error!("Failed to create engine process for {:?}: {}", path, e);
            return Err(e);
        }
    };

    if let Err(e) = process.set_options(options.clone()).await {
        error!("Failed to set initial options: {}", e);
        return Err(e);
    }

    if let Err(e) = process.go(&go_mode).await {
        error!("Failed to start initial analysis: {}", e);
        return Err(e);
    }

    let process = Arc::new(Mutex::new(process));
    state.engine_processes.insert(key.clone(), process.clone());

    // Start engine communication loop
    let engine_processes_ref = state.engine_processes.clone();
    tokio::spawn(engine_communication_loop(
        process.clone(),
        reader,
        key.clone(),
        id,
        tab.clone(),
        app,
        engine_processes_ref,
    ));

    Ok(None)
}

async fn engine_communication_loop(
    process: Arc<Mutex<EngineProcess>>,
    mut reader: Lines<BufReader<ChildStdout>>,
    key: (String, String),
    id: String,
    tab: String,
    app: tauri::AppHandle,
    engine_processes: DashMap<(String, String), Arc<tokio::sync::Mutex<EngineProcess>>>,
) {
    info!("Starting engine communication loop for: {:?}", key);
    
    let rate_limiter = RateLimiter::direct(Quota::per_second(nonzero!(EVENTS_PER_SECOND)));
    let mut event_queue = EventQueue::new();
    let mut first_result_sent = false;

    let result = async {
        loop {
            // Try to send any queued events first
            match event_queue.try_send_next(&app).await {
                Ok(true) => {
                    debug!("Sent queued event successfully");
                }
                Ok(false) => {
                    // No events to send or waiting for acknowledgment
                }
                Err(e) => {
                    warn!("Failed to send queued event: {}", e);
                }
            }

            // Read from engine with a reasonable timeout
            match timeout(Duration::from_millis(100), reader.next_line()).await {
                Ok(Ok(Some(line))) => {
                    debug!("Raw engine output: {}", line);
                    
                    let mut proc = process.lock().await;
                    proc.logs.push(EngineLog::Engine(line.clone()));
                    
                    match parse_one(&line) {
                        UciMessage::Info(attrs) => {
                            debug!("Parsed UCI Info message with {} attributes", attrs.len());
                            if let Err(e) = handle_info_message(
                                &mut proc,
                                attrs,
                                &rate_limiter,
                                &mut event_queue,
                                &mut first_result_sent,
                                &id,
                                &tab,
                                &app
                            ).await {
                                warn!("Failed to handle info message: {}", e);
                            }
                        }
                        UciMessage::BestMove { .. } => {
                            debug!("Received bestmove, analysis complete");
                            
                            // Transition to idle state
                            if let Err(e) = proc.transition_state(EngineState::Idle) {
                                warn!("Failed to transition to idle state: {}", e);
                            }
                            
                            let payload = BestMovesPayload {
                                best_lines: proc.last_best_moves.clone(),
                                engine: id.clone(),
                                tab: tab.clone(),
                                fen: proc.options.fen.clone(),
                                moves: proc.options.moves.clone(),
                                progress: 100.0,
                            };

                            info!("Emitting final bestmove payload for engine {} on tab {}", id, tab);

                            // For final bestmove, send immediately without queuing
                            match payload.emit(&app) {
                                Ok(_) => {
                                    debug!("Successfully emitted bestmove payload");
                                }
                                Err(e) => {
                                    error!("Failed to emit final bestmove payload: {:?}", e);
                                }
                            }

                            info!("Analysis complete, engine now idle");
                            proc.last_progress = 100.0;
                        }
                        _ => {
                            trace!("Unhandled UCI message: {}", line);
                        }
                    }
                }
                Ok(Ok(None)) => {
                    debug!("Engine closed stdout");
                    break;
                }
                Ok(Err(e)) => {
                    error!("Error reading from engine stdout: {}", e);
                    break;
                }
                Err(_) => {
                    // Timeout - check if we can send any pending events
                    if event_queue.has_pending() {
                        // Try to send with a more permissive rate limit during timeouts
                        if let Err(e) = event_queue.try_send_next(&app).await {
                            debug!("Could not send pending event during timeout: {}", e);
                        }
                    }
                }
            }
        }
        Ok::<_, Error>(())
    }.await;

    if let Err(e) = result {
        error!("Engine communication loop error for {:?}: {}", key, e);
    }
    
    // Ensure engine is marked as terminated
    if let Some(process_guard) = engine_processes.get(&key) {
        let mut proc = process_guard.lock().await;
        let _ = proc.transition_state(EngineState::Terminated);
    }
    
    info!("Engine communication loop finished for: {:?}", key);
    engine_processes.remove(&key);
}

async fn handle_info_message(
    proc: &mut EngineProcess,
    attrs: Vec<UciInfoAttribute>,
    rate_limiter: &RateLimiter<
        governor::state::direct::NotKeyed,
        governor::state::InMemoryState,
        governor::clock::DefaultClock,
        governor::middleware::NoOpMiddleware
    >,
    event_queue: &mut EventQueue,
    first_result_sent: &mut bool,
    id: &str,
    tab: &str,
    app: &tauri::AppHandle,
) -> Result<(), Error> {
    let best_moves = parse_uci_info(attrs, &proc.options.fen.parse()?, &proc.options.moves)?;
    
    let multipv = best_moves.multipv;
    let cur_depth = best_moves.depth;
    let cur_nodes = best_moves.nodes;
    
    debug!("Received info: depth={}, multipv={}, nodes={}, last_depth={}", 
           cur_depth, multipv, cur_nodes, proc.last_depth);
    
    if multipv as usize == proc.best_moves.len() + 1 {
        proc.best_moves.push(best_moves);
        debug!("Added move to collection: total={}/{}", proc.best_moves.len(), proc.real_multipv);
        
        if multipv == proc.real_multipv {
            let all_same_depth = proc.best_moves.iter().all(|x| x.depth == cur_depth);
            debug!("Complete multipv set: all_same_depth={}, cur_depth={}, last_depth={}", 
                   all_same_depth, cur_depth, proc.last_depth);
            
            if all_same_depth && cur_depth >= proc.last_depth {
                let progress = calculate_progress(&proc.go_mode, cur_depth, cur_nodes, proc.start.elapsed());
                
                let payload = BestMovesPayload {
                    best_lines: proc.best_moves.clone(),
                    engine: id.to_string(),
                    tab: tab.to_string(),
                    fen: proc.options.fen.clone(),
                    moves: proc.options.moves.clone(),
                    progress,
                };
                
                let should_emit_immediately = if !*first_result_sent {
                    debug!("Emitting first analysis result: depth={}, multipv={}", cur_depth, multipv);
                    true
                } else if cur_depth > proc.last_depth {
                    // Always emit when we progress to a new depth
                    debug!("Depth progression detected: {} -> {}", proc.last_depth, cur_depth);
                    true
                } else if proc.last_event_sent.map_or(false, |t| t.elapsed() >= MIN_EVENT_INTERVAL) && rate_limiter.check().is_ok() {
                    debug!("Emitting update for same depth due to time interval: depth={}", cur_depth);
                    true
                } else {
                    false
                };
                
                if should_emit_immediately {
                    debug!("Emitting analysis result immediately: depth={}, progress={:.2}%", cur_depth, progress);
                    proc.last_event_sent = Some(Instant::now());
                    
                    match payload.emit(app) {
                        Ok(()) => {
                            *first_result_sent = true;
                            
                            // Only update last_depth when we actually emit a result for a new depth
                            if cur_depth > proc.last_depth {
                                proc.last_depth = cur_depth;
                                debug!("Updated last_depth to: {}", proc.last_depth);
                            }
                        }
                        Err(e) => {
                            error!("Failed to emit event immediately: {:?}", e);
                            // Queue the event for later
                            event_queue.queue_event(payload);
                        }
                    }
                } else {
                    // Queue event for potential delayed emission
                    debug!("Queueing event for potential delayed emission: depth={}", cur_depth);
                    event_queue.queue_event(payload);
                }

                proc.last_best_moves = proc.best_moves.clone();
                proc.last_progress = progress as f32;
            }
            proc.best_moves.clear();
        }
    }
    
    Ok(())
}

fn calculate_progress(go_mode: &GoMode, depth: u32, nodes: u32, elapsed: Duration) -> f64 {
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

// Rest of the original structs and implementations
#[derive(Deserialize, Debug, Clone, Type, Derivative, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
#[derivative(Default)]
pub struct EngineOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub extra_options: Vec<EngineOption>,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct EngineOption {
    name: String,
    value: String,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum GoMode {
    PlayersTime(PlayersTime),
    Depth(u32),
    Time(u32),
    Nodes(u32),
    Infinite,
}

#[derive(Deserialize, Debug, Clone, Type, PartialEq, Eq)]
pub struct PlayersTime {
    white: u32,
    black: u32,
    winc: u32,
    binc: u32,
}

#[derive(Serialize, Debug, Default, Type)]
pub struct MoveAnalysis {
    best: Vec<BestMoves>,
    novelty: bool,
    is_sacrifice: bool,
}

#[derive(Deserialize, Debug, Default, Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisOptions {
    pub fen: String,
    pub moves: Vec<String>,
    pub annotate_novelties: bool,
    pub reference_db: Option<PathBuf>,
    pub reversed: bool,
}

#[derive(Clone, Type, serde::Serialize, Event)]
pub struct ReportProgress {
    pub progress: f64,
    pub id: String,
    pub finished: bool,
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
    debug!("Analysis options: FEN={}, moves={}, novelties={}", 
           options.fen, options.moves.len(), options.annotate_novelties);
    
    let path = PathBuf::from(&engine);
    let mut analysis: Vec<MoveAnalysis> = Vec::new();

    let (mut proc, mut reader) = match EngineProcess::new(path.clone()).await {
        Ok((p, r)) => (p, r),
        Err(e) => {
            error!("Failed to create engine for game analysis: {}", e);
            return Err(e);
        }
    };

    // Parse initial position
    let fen = Fen::from_ascii(options.fen.as_bytes())
        .map_err(|e| {
            error!("Invalid FEN in analyze_game: {}", options.fen);
            e
        })?;

    let mut chess: Chess = fen.clone().into_position(CastlingMode::Chess960)
        .map_err(|e| {
            error!("Failed to create position from FEN: {}", e);
            e
        })?;
    
    // Build positions to analyze
    let mut positions_to_analyze = build_analysis_positions(&mut chess, &fen, &options)?;
    
    if options.reversed {
        debug!("Reversing analysis order");
        positions_to_analyze.reverse();
    }

    let mut novelty_found = false;
    let total_positions = positions_to_analyze.len();
    
    info!("Analyzing {} positions", total_positions);

    for (i, (position_fen, moves, is_sacrifice)) in positions_to_analyze.iter().enumerate() {
        debug!("Analyzing position {}/{}: {} moves", i + 1, total_positions, moves.len());
        
        // Emit progress update
        ReportProgress {
            progress: (i as f64 / total_positions as f64) * 100.0,
            id: id.clone(),
            finished: false,
        }.emit(&app)?;

        // Setup engine options for this position
        let mut analysis_options = uci_options.clone();
        ensure_multipv_option(&mut analysis_options);

        if let Err(e) = proc.set_options(EngineOptions {
            fen: options.fen.clone(),
            moves: moves.clone(),
            extra_options: analysis_options,
        }).await {
            warn!("Failed to set options for position {}: {}", i, e);
            continue;
        }

        if let Err(e) = proc.go(&go_mode).await {
            warn!("Failed to start analysis for position {}: {}", i, e);
            continue;
        }

        // Analyze this position
        let mut current_analysis = MoveAnalysis::default();
        match analyze_single_position(&mut proc, &mut reader).await {
            Ok(best_moves) => {
                current_analysis.best = best_moves;
            }
            Err(e) => {
                warn!("Failed to analyze position {}: {}", i, e);
                continue;
            }
        }

        // Set sacrifice flag
        current_analysis.is_sacrifice = *is_sacrifice;

        // Check for novelty if requested
        if options.annotate_novelties && !novelty_found {
            current_analysis.novelty = check_novelty(
                position_fen, 
                &options.reference_db, 
                &state
            ).await.unwrap_or_else(|e| {
                warn!("Failed to check novelty for position {}: {}", i, e);
                false
            });
            
            if current_analysis.novelty {
                info!("Novelty found at position {}", i);
                novelty_found = true;
            }
        }

        analysis.push(current_analysis);
    }

    if options.reversed {
        debug!("Reversing analysis results back to original order");
        analysis.reverse();
    }

    // Final progress update
    ReportProgress {
        progress: 100.0,
        id: id.clone(),
        finished: true,
    }.emit(&app)?;
    
    info!("Game analysis completed: {} positions analyzed", analysis.len());
    Ok(analysis)
}

fn build_analysis_positions(
    chess: &mut Chess,
    initial_fen: &Fen,
    options: &AnalysisOptions
) -> Result<Vec<(Fen, Vec<String>, bool)>, Error> {
    let mut positions = vec![(initial_fen.clone(), vec![], false)];

    for (i, move_str) in options.moves.iter().enumerate() {
        let uci = UciMove::from_ascii(move_str.as_bytes())
            .map_err(|e| {
                error!("Invalid move at index {}: {}", i, move_str);
                e
            })?;
        
        let mv = uci.to_move(chess)
            .map_err(|e| {
                error!("Illegal move at index {}: {} in position {}", i, move_str, chess.board());
                e
            })?;
        
        let previous_pos = chess.clone();
        chess.play_unchecked(&mv);
        let current_pos = chess.clone();
        
        if !chess.is_game_over() {
            let is_sacrifice = detect_sacrifice(&previous_pos, &current_pos);
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

fn ensure_multipv_option(options: &mut Vec<EngineOption>) {
    const DEFAULT_MULTIPV: &str = "2";
    
    if let Some(multipv_option) = options.iter_mut().find(|x| x.name == "MultiPV") {
        multipv_option.value = DEFAULT_MULTIPV.to_string();
    } else {
        options.push(EngineOption {
            name: "MultiPV".to_string(),
            value: DEFAULT_MULTIPV.to_string(),
        });
    }
}

async fn analyze_single_position(
    proc: &mut EngineProcess,
    reader: &mut Lines<BufReader<ChildStdout>>
) -> Result<Vec<BestMoves>, Error> {
    trace!("Starting single position analysis");
    
    while let Ok(Some(line)) = reader.next_line().await {
        trace!("Engine line: {}", line);
        
        match parse_one(&line) {
            UciMessage::Info(attrs) => {
                if let Ok(best_moves) = parse_uci_info(attrs, &proc.options.fen.parse()?, &proc.options.moves) {
                    let multipv = best_moves.multipv;
                    let cur_depth = best_moves.depth;
                    
                    if multipv as usize == proc.best_moves.len() + 1 {
                        proc.best_moves.push(best_moves);
                        
                        if multipv == proc.real_multipv {
                            if proc.best_moves.iter().all(|x| x.depth == cur_depth) && cur_depth >= proc.last_depth {
                                proc.last_depth = cur_depth;
                                // Don't clear here, wait for bestmove
                            }
                            
                            if proc.best_moves.len() == proc.real_multipv as usize {
                                proc.best_moves.clear();
                            }
                        }
                    }
                }
            }
            UciMessage::BestMove { .. } => {
                trace!("Received bestmove, analysis complete");
                
                // Update engine state
                if let Err(e) = proc.transition_state(EngineState::Idle) {
                    warn!("Failed to transition to idle state after bestmove: {}", e);
                }
                
                return Ok(proc.best_moves.clone());
            }
            _ => {}
        }
    }

    Err(Error::EngineTimeout)
}

fn detect_sacrifice(previous_pos: &Chess, current_pos: &Chess) -> bool {
    let prev_eval = naive_eval(previous_pos);
    let cur_eval = -naive_eval(current_pos);
    
    // Consider it a sacrifice if evaluation drops by more than a pawn
    prev_eval > cur_eval + 100
}

async fn check_novelty(
    fen: &Fen,
    reference_db: &Option<PathBuf>,
    state: &tauri::State<'_, AppState>
) -> Result<bool, Error> {
    if let Some(db_path) = reference_db {
        let query = PositionQueryJs {
            fen: fen.to_string(),
            type_: "exact".to_string(),
        };
        
        let is_in_db = is_position_in_db(
            db_path.clone(),
            GameQueryJs::new().position(query),
            state.clone(),
        ).await?;
        
        Ok(!is_in_db)
    } else {
        Err(Error::MissingReferenceDatabase)
    }
}

// Chess evaluation functions (kept from original but with better structure)
fn count_material(position: &Chess) -> i32 {
    if position.is_checkmate() {
        return -10000;
    }
    
    let material: ByColor<i32> = position.board().material().map(|piece_counts| {
        piece_counts.pawn as i32 * piece_value(Role::Pawn)
            + piece_counts.knight as i32 * piece_value(Role::Knight)
            + piece_counts.bishop as i32 * piece_value(Role::Bishop)
            + piece_counts.rook as i32 * piece_value(Role::Rook)
            + piece_counts.queen as i32 * piece_value(Role::Queen)
    });
    
    if position.turn() == Color::White {
        material.white - material.black
    } else {
        material.black - material.white
    }
}

const fn piece_value(role: Role) -> i32 {
    match role {
        Role::Pawn => 100,
        Role::Knight => 300,
        Role::Bishop => 300,
        Role::Rook => 500,
        Role::Queen => 900,
        Role::King => 0, // King value not relevant for material count
    }
}

fn qsearch(position: &Chess, mut alpha: i32, beta: i32) -> i32 {
    let stand_pat = count_material(position);

    if stand_pat >= beta {
        return beta;
    }
    if alpha < stand_pat {
        alpha = stand_pat;
    }

    let legal_moves = position.legal_moves();
    let mut captures: Vec<_> = legal_moves.iter().filter(|m| m.is_capture()).collect();

    // Sort captures by MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
    captures.sort_by(|a, b| {
        let a_value = a.capture().map_or(0, piece_value);
        let b_value = b.capture().map_or(0, piece_value);
        b_value.cmp(&a_value)
    });

    for capture in captures {
        let mut new_position = position.clone();
        new_position.play_unchecked(capture);
        let score = -qsearch(&new_position, -beta, -alpha);
        
        if score >= beta {
            return beta; // Beta cutoff
        }
        if score > alpha {
            alpha = score;
        }
    }

    alpha
}

fn naive_eval(pos: &Chess) -> i32 {
    if pos.is_game_over() {
        return if pos.is_checkmate() { i32::MIN } else { 0 };
    }
    
    pos.legal_moves()
        .iter()
        .map(|mv| {
            let mut new_position = pos.clone();
            new_position.play_unchecked(mv);
            -qsearch(&new_position, i32::MIN, i32::MAX)
        })
        .max()
        .unwrap_or(0)
}

// Engine configuration
#[derive(Type, Default, Serialize, Debug)]
pub struct EngineConfig {
    pub name: String,
    pub options: Vec<UciOptionConfig>,
}

#[tauri::command]
#[specta::specta]
pub async fn get_engine_config(path: PathBuf) -> Result<EngineConfig, Error> {
    info!("Getting engine configuration from: {:?}", path);
    
    let mut child = spawn_engine_process(&path)?;
    let (mut stdin, mut stdout) = get_engine_io_handles(&mut child)?;

    let mut config = EngineConfig::default();
    
    // Send UCI command with timeout
    match timeout(ENGINE_INIT_TIMEOUT, get_uci_config(&mut stdin, &mut stdout, &mut config)).await {
        Ok(Ok(())) => {
            info!("Successfully retrieved engine config: name={}, options={}", 
                  config.name, config.options.len());
        }
        Ok(Err(e)) => {
            warn!("Failed to get engine config: {}", e);
        }
        Err(_) => {
            warn!("Timeout getting engine config from: {:?}", path);
        }
    }
    
    // Ensure child process is terminated
    let _ = child.kill().await;
    
    // Fallback name if not provided
    if config.name.is_empty() {
        config.name = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown Engine")
            .to_string();
    }
    
    debug!("Engine config result: name='{}', options={}", config.name, config.options.len());
    Ok(config)
}

fn spawn_engine_process(path: &PathBuf) -> Result<Child, Error> {
    debug!("Spawning engine process: {:?}", path);
    
    let mut command = Command::new(path);
    
    // Set working directory intelligently
    if let Some(parent) = path.parent() {
        command.current_dir(parent);
    } else if let Some(home_dir) = std::env::var_os("HOME") {
        // Fallback for Homebrew engines
        command.current_dir(home_dir);
    }
    
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("TERM", "dumb"); // Prevent terminal features

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn()
        .map_err(|e| {
            error!("Failed to spawn engine process {:?}: {}", path, e);
            Error::Io(e)
        })?;

    debug!("Engine process spawned successfully");
    Ok(child)
}

fn get_engine_io_handles(child: &mut Child) -> Result<(ChildStdin, Lines<BufReader<ChildStdout>>), Error> {
    let stdin = child.stdin.take().ok_or(Error::NoStdin)?;
    let stdout = child.stdout.take().ok_or(Error::NoStdout)?;
    // Use smaller buffer for more responsive reading
    let stdout = BufReader::with_capacity(1024, stdout).lines();
    Ok((stdin, stdout))
}

async fn send_engine_command(stdin: &mut ChildStdin, command: &str) -> Result<(), Error> {
    trace!("Sending command: {}", command.trim());
    stdin
        .write_all(command.as_bytes())
        .await
        .map_err(Error::Io)?;
    
    // Flush stdin immediately for real-time communication
    stdin
        .flush()
        .await
        .map_err(Error::Io)?;
        
    debug!("Command sent and flushed: {}", command.trim());
    Ok(())
}

async fn get_uci_config(
    stdin: &mut ChildStdin,
    stdout: &mut Lines<BufReader<ChildStdout>>,
    config: &mut EngineConfig
) -> Result<(), Error> {
    debug!("Requesting UCI configuration");
    send_engine_command(stdin, "uci\n").await?;

    while let Some(line) = stdout.next_line().await? {
        trace!("Config line: {}", line);
        
        match parse_one(&line) {
            UciMessage::Id { name: Some(name), .. } => {
                debug!("Engine name: {}", name);
                config.name = name;
            }
            UciMessage::Option(opt) => {
                trace!("Engine option: {:?}", opt);
                config.options.push(opt);
            }
            UciMessage::UciOk => {
                debug!("UCI configuration complete");
                break;
            }
            _ => {}
        }
    }
    
    Ok(())
}